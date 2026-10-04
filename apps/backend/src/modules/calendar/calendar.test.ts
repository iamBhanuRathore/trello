import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import { signState, verifyState, encryptToken, decryptToken } from './google';
import {
  buildEventBody,
  scheduleCard,
  getCalendarFeed,
  pullExternalEvents,
  getAuthUrlForUser,
  createExternalEvent,
  updateExternalEvent,
  deleteExternalEvent,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

describe('Calendar OAuth state & token crypto', () => {
  it('round-trips signed state', () => {
    const state = signState({ userId: 'u-1', organizationId: 'o-1' });
    const parsed = verifyState(state);
    expect(parsed.userId).toBe('u-1');
    expect(parsed.organizationId).toBe('o-1');
  });

  it('rejects tampered state', () => {
    const state = signState({ userId: 'u-1', organizationId: 'o-1' });
    const [data] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ userId: 'victim', organizationId: 'o-1', nonce: 'x' })
    ).toString('base64url');
    expect(() => verifyState(`${forged}.${state.split('.')[1]}`)).toThrow('signature');
    expect(() => verifyState(data!)).toThrow('Invalid OAuth state');
    expect(() => verifyState('')).toThrow('Invalid OAuth state');
  });

  it('round-trips AES-GCM token encryption', () => {
    const enc = encryptToken('ya29.refresh-token-secret');
    expect(enc).not.toContain('ya29.refresh-token-secret');
    expect(decryptToken(enc)).toBe('ya29.refresh-token-secret');
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decryptToken('not-a-token')).toThrow('Malformed');
  });

  it('builds a Google auth URL embedding state when configured', () => {
    // Runs against real env: configured locally, unconfigured in CI.
    try {
      const url = getAuthUrlForUser('u-1', 'o-1');
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('calendar.events');
      expect(url).toContain('state=');
    } catch (err: unknown) {
      expect(String((err as { message?: unknown }).message)).toContain('not configured');
    }
  });
});

describe('Google event body builder', () => {
  it('builds a timed block from schedule', () => {
    const body = buildEventBody({
      key: 'ENG-3',
      title: 'Write tests',
      scheduledStart: '2026-09-25T10:00:00Z',
      scheduledEnd: '2026-09-25T11:30:00Z',
    });
    expect(body?.summary).toBe('[ENG-3] Write tests');
    expect(body?.start.dateTime).toBe('2026-09-25T10:00:00.000Z');
    expect(body?.end.dateTime).toBe('2026-09-25T11:30:00.000Z');
  });

  it('normalizes end-before-start to a 1h block', () => {
    const body = buildEventBody({
      title: 'Fix bug',
      scheduledStart: '2026-09-25T10:00:00Z',
      scheduledEnd: '2026-09-25T09:00:00Z',
    });
    expect(body?.end.dateTime).toBe('2026-09-25T11:00:00.000Z');
  });

  it('falls back to a 1h block ending at due date', () => {
    const body = buildEventBody({ title: 'Release', dueDate: '2026-09-26T17:00:00Z' });
    expect(body?.end.dateTime).toBe('2026-09-26T17:00:00.000Z');
    expect(body?.start.dateTime).toBe('2026-09-26T16:00:00.000Z');
  });

  it('returns null with neither schedule nor due date', () => {
    expect(buildEventBody({ title: 'Backlog idea' })).toBeNull();
  });
});

describe('scheduleCard validation', () => {
  async function setupCard() {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user, organization } = await signUp(db, {
      name: 'Cal Owner',
      email: `cal_${id}@cal.com`,
      password: 'pass',
      orgName: `Cal Org ${id}`,
      orgSlug: `cal-org-${id}`,
    });
    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'B1',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Time-block me',
      assigneeId: user.id,
      actorId: user.id,
    });
    return { user, organization, card: card! };
  }

  it('rejects invalid date formats', async () => {
    const { user, organization, card } = await setupCard();
    expect(
      scheduleCard(db, card.id, organization.id, user.id, { start: 'not-a-date' })
    ).rejects.toThrow('Invalid date format');
  });

  it('rejects end before start and end without start', async () => {
    const { user, organization, card } = await setupCard();
    expect(
      scheduleCard(db, card.id, organization.id, user.id, {
        start: '2026-09-25T11:00:00Z',
        end: '2026-09-25T10:00:00Z',
      })
    ).rejects.toThrow('after scheduled start');
    expect(
      scheduleCard(db, card.id, organization.id, user.id, { end: '2026-09-25T10:00:00Z' })
    ).rejects.toThrow('requires a scheduled start');
  });

  it('rejects unknown cards', async () => {
    const { user, organization } = await setupCard();
    expect(
      scheduleCard(db, '00000000-0000-0000-0000-000000000000', organization.id, user.id, {
        start: '2026-09-25T10:00:00Z',
      })
    ).rejects.toThrow('Card not found');
  });

  it('schedules and unschedules a card', async () => {
    const { user, organization, card } = await setupCard();
    const scheduled: any = await scheduleCard(db, card.id, organization.id, user.id, {
      start: '2026-09-25T10:00:00Z',
      end: '2026-09-25T11:00:00Z',
    });
    expect(new Date(scheduled.scheduledStart).toISOString()).toBe('2026-09-25T10:00:00.000Z');

    const cleared: any = await scheduleCard(db, card.id, organization.id, user.id, {
      start: null,
      end: null,
    });
    expect(cleared.scheduledStart).toBeNull();
  });

  it('returns feed with blocks, sprints overlay, and empty external without connection', async () => {
    const { user, organization, card } = await setupCard();
    await scheduleCard(db, card.id, organization.id, user.id, {
      start: '2026-09-25T10:00:00Z',
      end: '2026-09-25T11:00:00Z',
    });

    const feed = await getCalendarFeed(db, organization.id, user.id, {
      from: '2026-09-01T00:00:00Z',
      to: '2026-10-31T00:00:00Z',
    });
    expect(feed.blocks.some((b) => b.id === card.id)).toBe(true);
    expect(feed.external).toEqual([]);
    expect(feed.externalError).toBeNull();
    expect(Array.isArray(feed.sprints)).toBe(true);
    expect(Array.isArray(feed.unscheduled)).toBe(true);
  });

  it('pull without connection throws 409', async () => {
    const { user } = await setupCard();
    expect(pullExternalEvents(db, user.id)).rejects.toThrow('not connected');
  });
});

describe('Google event writes (fake client)', () => {
  const seenPatches: any[] = [];
  const fakeClient: any = {
    events: {
      insert: async ({ requestBody }: any) => ({
        data: { id: 'g-ev-1', summary: requestBody.summary, htmlLink: 'https://cal/g-ev-1' },
      }),
      patch: async (args: any) => {
        seenPatches.push(args);
        if (args.requestBody?.conferenceData) {
          return { data: { hangoutLink: 'https://meet.google.com/abc-defg-hij' } };
        }
        return { data: {} };
      },
      delete: async () => ({ data: {} }),
      list: async () => ({
        data: {
          items: [
            {
              id: 'g-ext-1',
              summary: 'Team sync',
              start: { dateTime: '2026-09-25T10:00:00Z' },
              end: { dateTime: '2026-09-25T10:30:00Z' },
              description: 'Weekly alignment meeting notes here',
              attendees: [{ email: 'a@x.co' }, { displayName: 'NoMail' }],
              location: 'Room 3B, HQ',
              hangoutLink: 'https://meet.google.com/abc-defg-hij',
              organizer: { email: 'boss@x.co' },
              recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
              htmlLink: 'https://cal/g-ext-1',
              status: 'confirmed',
            },
            { id: 'g-gone', status: 'cancelled', summary: 'Gone' },
          ],
        },
      }),
    },
  };

  async function setupConnected() {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user, organization } = await signUp(db, {
      name: 'GCal Writer',
      email: `gcalw_${id}@cal.com`,
      password: 'pass',
      orgName: `GCalW Org ${id}`,
      orgSlug: `gcalw-org-${id}`,
    });
    await db.insert(schema.calendarConnections).values({
      organizationId: organization.id,
      userId: user.id,
      provider: 'google',
      email: 'writer@gmail.com',
      refreshToken: 'dummy-encrypted',
    });
    return { user, organization };
  }

  it('validates title and dates before touching Google', async () => {
    const { user } = await setupConnected();
    expect(createExternalEvent(db, user.id, { title: '   ' }, fakeClient)).rejects.toThrow(
      'title is required'
    );
    expect(
      createExternalEvent(db, user.id, { title: 'M', start: 'nope' }, fakeClient)
    ).rejects.toThrow('Invalid date format');
    expect(updateExternalEvent(db, user.id, 'g-ev-1', {}, fakeClient)).rejects.toThrow(
      'Nothing to update'
    );
  });

  it('reports an actionable reason when Google refuses to create the event', async () => {
    // A dead OAuth refresh token (Google deactivates them for apps left in
    // "Testing" publishing status after 7 days) used to surface as the same
    // opaque "Google Calendar event creation failed" as a timeout or a 404. These
    // are not equally recoverable, so each must say what the user should do.
    const { user } = await setupConnected();

    // Validation runs before Google is touched, so a valid range is required to
    // reach the call we are actually asserting on.
    const WHEN = { start: '2026-09-25T10:00:00Z', end: '2026-09-25T10:30:00Z' };

    /** A client whose insert throws the given Google-shaped error. */
    const failing = (err: unknown): any => ({
      events: {
        insert: async () => {
          throw err;
        },
        patch: async () => ({ data: {} }),
        delete: async () => ({ data: {} }),
        list: async () => ({ data: { items: [] } }),
      },
    });

    // 1. invalid_grant — the refresh token is dead; only a reconnect helps.
    const grant = createExternalEvent(
      db,
      user.id,
      { title: 'M', ...WHEN },
      failing({ response: { status: 400, data: { error: 'invalid_grant' } } })
    );
    expect(grant).rejects.toThrow(/connection has expired/i);
    await expect(grant).rejects.toMatchObject({
      status: 502,
      details: { code: 'GOOGLE_REAUTH_REQUIRED' },
    });

    // 2. 403 insufficient scope — only a fresh consent screen fixes it.
    const forbidden = createExternalEvent(
      db,
      user.id,
      { title: 'M', ...WHEN },
      failing({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: 'insufficientPermissions' }] } },
        },
      })
    );
    expect(forbidden).rejects.toThrow(/permissions are no longer sufficient/i);
    await expect(forbidden).rejects.toMatchObject({
      details: { code: 'GOOGLE_REAUTH_REQUIRED' },
    });

    // 3. 404 — the connected calendarId is gone.
    const gone = createExternalEvent(
      db,
      user.id,
      { title: 'M', ...WHEN },
      failing({ response: { status: 404, data: {} } })
    );
    expect(gone).rejects.toThrow(/no longer exists/i);
    await expect(gone).rejects.toMatchObject({
      details: { code: 'GOOGLE_CALENDAR_NOT_FOUND' },
    });

    // 4. Our own 15s guard — transient, so retry is genuinely reasonable.
    const slow = createExternalEvent(
      db,
      user.id,
      { title: 'M', ...WHEN },
      failing(new Error('Google API timeout after 15000ms (events.insert)'))
    );
    expect(slow).rejects.toThrow(/did not respond in time/i);
    await expect(slow).rejects.toMatchObject({ details: { code: 'GOOGLE_TIMEOUT' } });

    // Status must stay 502 for ALL of them: lib/api.ts turns any 401 into a
    // Boardly session refresh and any 403 into a permission re-fetch, so echoing
    // Google's status would log the user out over a dead Google token.
    for (const p of [grant, forbidden, gone, slow]) {
      await expect(p).rejects.toMatchObject({ status: 502 });
    }
  });

  it('creates, reschedules, and deletes through the fake client', async () => {
    const { user } = await setupConnected();
    const created = await createExternalEvent(
      db,
      user.id,
      { title: 'Standup', start: '2026-09-25T10:00:00Z', end: '2026-09-25T10:30:00Z' },
      fakeClient
    );
    expect(created.id).toBe('g-ev-1');
    expect(created.start).toBe('2026-09-25T10:00:00.000Z');

    const updated = await updateExternalEvent(
      db,
      user.id,
      'g-ev-1',
      { start: '2026-09-25T11:00:00Z', end: '2026-09-25T11:30:00Z' },
      fakeClient
    );
    expect(updated.success).toBe(true);

    const deleted = await deleteExternalEvent(db, user.id, 'g-ev-1', fakeClient);
    expect(deleted.success).toBe(true);
  });

  it('requires a connection for writes', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user } = await signUp(db, {
      name: 'No GCal',
      email: `nogcal_${id}@cal.com`,
      password: 'pass',
      orgName: `NoGCal Org ${id}`,
      orgSlug: `nogcal-org-${id}`,
    });
    expect(createExternalEvent(db, user.id, { title: 'M' }, fakeClient)).rejects.toThrow(
      'not connected'
    );
    expect(updateExternalEvent(db, user.id, 'x', { title: 'M' }, fakeClient)).rejects.toThrow(
      'not connected'
    );
    expect(deleteExternalEvent(db, user.id, 'x', fakeClient)).rejects.toThrow('not connected');
  });

  it('maps attendees and descriptions on pull, stores htmlLink on push', async () => {
    const { user, organization } = await setupConnected();
    const { events } = await pullExternalEvents(db, user.id, {}, fakeClient);
    expect(events.length).toBe(1);
    expect(events[0]!.summary).toBe('Team sync');
    expect(events[0]!.description).toContain('Weekly alignment');
    expect(events[0]!.attendees).toContain('a@x.co');
    expect(events[0]!.location).toBe('Room 3B, HQ');
    expect(events[0]!.hangoutLink).toBe('https://meet.google.com/abc-defg-hij');
    expect(events[0]!.organizer).toBe('boss@x.co');
    expect(events[0]!.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);

    // Push a scheduled card and verify the htmlLink round-trips into the feed.
    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS2' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App2',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'B2',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Push me',
      assigneeId: user.id,
      actorId: user.id,
    });
    await scheduleCard(db, card!.id, organization.id, user.id, {
      start: '2026-09-25T10:00:00Z',
      end: '2026-09-25T11:00:00Z',
    });
    const { pushCardToGoogle } = await import('./service');
    const [conn] = await db
      .select()
      .from(schema.calendarConnections)
      .where(eq(schema.calendarConnections.userId, user.id))
      .limit(1);
    await pushCardToGoogle(
      db,
      conn!.id,
      organization.id,
      {
        id: card!.id,
        key: card!.key,
        title: 'Push me',
        scheduledStart: '2026-09-25T10:00:00Z',
        scheduledEnd: '2026-09-25T11:00:00Z',
      },
      fakeClient
    );

    const feed = await getCalendarFeed(
      db,
      organization.id,
      user.id,
      { from: '2026-09-01T00:00:00Z', to: '2026-10-31T00:00:00Z' },
      fakeClient
    );
    const block = feed.blocks.find((b) => b.id === card!.id);
    expect(block?.googleUrl).toBe('https://cal/g-ev-1');
  });

  it('attaches a Meet conference on addConference', async () => {
    const { user } = await setupConnected();
    seenPatches.length = 0;
    const res = await updateExternalEvent(
      db,
      user.id,
      'g-ext-1',
      { addConference: true },
      fakeClient
    );
    expect(res.success).toBe(true);
    expect(res.hangoutLink).toBe('https://meet.google.com/abc-defg-hij');
    const last = seenPatches[seenPatches.length - 1];
    expect(last.conferenceDataVersion).toBe(1);
    expect(last.requestBody.conferenceData.createRequest.conferenceSolutionKey.type).toBe(
      'hangoutsMeet'
    );
  });
});
