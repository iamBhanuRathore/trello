import { eq, and, sql, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  calendarConnections,
  calendarEventLinks,
  cards,
  cardAssignees,
  sprints,
  phases,
  projects,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { errorMessage, errorCode, errorResponseStatus, errorStatus } from '../../lib/errors';
import { updateCard } from '../cards/service';
import {
  isGoogleConfigured,
  oauthClient,
  buildAuthUrl,
  signState,
  verifyState,
  encryptToken,
  calendarClient,
  fetchGoogleEmail,
  type CalendarApi,
} from './google';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// Google has no client-side default timeout — one stalled call used to hang
// the request (and pile up on every client refetch) until it wedged the
// server. Every outbound call below goes through this 15s bound.
const GOOGLE_TIMEOUT_MS = 15000;

async function withGoogleTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Google API timeout after ${GOOGLE_TIMEOUT_MS}ms (${label})`)),
          GOOGLE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface NormalizedExternalEvent {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  htmlLink?: string | null;
  description?: string | null;
  attendees?: string[];
  location?: string | null;
  hangoutLink?: string | null;
  organizer?: string | null;
  recurrence?: string[];
}

// ─── Connection lifecycle ────────────────────────────────────────────────────

export async function connectionStatus(db: Database, userId: string) {
  const [conn] = await db
    .select({
      id: calendarConnections.id,
      provider: calendarConnections.provider,
      email: calendarConnections.email,
      calendarId: calendarConnections.calendarId,
      lastSyncAt: calendarConnections.lastSyncAt,
      lastError: calendarConnections.lastError,
    })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))
    .limit(1);

  return {
    configured: isGoogleConfigured(),
    connected: !!conn,
    connection: conn || null,
  };
}

export function getAuthUrlForUser(userId: string, organizationId: string): string {
  if (!isGoogleConfigured()) {
    throw httpError(503, 'Google Calendar sync is not configured on this server');
  }
  return buildAuthUrl(signState({ userId, organizationId }));
}

export async function handleGoogleCallback(db: Database, code: string, state: string) {
  if (!isGoogleConfigured()) throw httpError(503, 'Google Calendar sync is not configured');
  if (!code) throw httpError(400, 'Missing OAuth code');

  let identity: { userId: string; organizationId: string };
  try {
    identity = verifyState(state);
  } catch {
    throw httpError(400, 'Invalid OAuth state');
  }

  const client = oauthClient();
  let tokens: any;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    throw httpError(502, 'Google OAuth code exchange failed');
  }
  if (!tokens?.refresh_token) {
    throw httpError(502, 'Google did not return a refresh token — please reconnect');
  }

  client.setCredentials(tokens);
  let googleSub = '';
  let email = '';
  try {
    ({ sub: googleSub, email } = await fetchGoogleEmail(client));
  } catch {
    // Identity is best-effort; the calendar sync itself uses the refresh token.
  }

  const existing = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, identity.userId))
    .limit(1);

  const values = {
    organizationId: identity.organizationId,
    userId: identity.userId,
    provider: 'google',
    googleSub: googleSub || null,
    email: email || null,
    refreshToken: encryptToken(tokens.refresh_token),
    scope: tokens.scope || null,
    lastError: null as string | null,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const [updated] = await db
      .update(calendarConnections)
      .set({ ...values, syncToken: null })
      .where(eq(calendarConnections.id, existing[0]!.id))
      .returning({ id: calendarConnections.id, email: calendarConnections.email });
    return updated;
  }

  const [created] = await db
    .insert(calendarConnections)
    .values(values)
    .returning({ id: calendarConnections.id, email: calendarConnections.email });
  return created;
}

export async function disconnectCalendar(db: Database, userId: string) {
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))
    .limit(1);
  if (!conn) return { success: true };

  await db.delete(calendarEventLinks).where(eq(calendarEventLinks.connectionId, conn.id));
  await db.delete(calendarConnections).where(eq(calendarConnections.id, conn.id));
  return { success: true };
}

async function requireConnection(db: Database, userId: string) {
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))
    .limit(1);
  if (!conn) throw httpError(409, 'Google Calendar is not connected');
  return conn;
}

// ─── Pull (Google → Boardly overlay) ─────────────────────────────────────────

export async function pullExternalEvents(
  db: Database,
  userId: string,
  opts: { from?: string; to?: string } = {},
  clientOverride?: CalendarApi
): Promise<{ events: NormalizedExternalEvent[]; incremental: boolean }> {
  const conn = await requireConnection(db, userId);

  let calendar: CalendarApi;
  try {
    calendar = clientOverride || calendarClient(conn.refreshToken);
  } catch {
    throw httpError(502, 'Could not decrypt stored Google credentials — please reconnect');
  }

  // Incremental sync tokens only work without an explicit range.
  const useIncremental = !opts.from && !opts.to && !!conn.syncToken;
  const params: any = {
    calendarId: conn.calendarId,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
    conferenceDataVersion: 1,
  };
  if (useIncremental) {
    params.syncToken = conn.syncToken;
  } else {
    const now = new Date();
    params.timeMin = opts.from || new Date(now.getTime() - 30 * 86400_000).toISOString();
    params.timeMax = opts.to || new Date(now.getTime() + 60 * 86400_000).toISOString();
  }

  let data: any;
  try {
    ({ data } = await withGoogleTimeout<any>('events.list', () =>
      (calendar as any).events.list(params)
    ));
  } catch (err: unknown) {
    // Sync token expired/invalidated → fall back to a full pull once.
    if (useIncremental && (errorCode(err) === 410 || errorResponseStatus(err) === 410)) {
      return pullExternalEvents(db, userId, {}, clientOverride);
    }
    await db
      .update(calendarConnections)
      .set({ lastError: errorMessage(err).slice(0, 500), updatedAt: new Date() })
      .where(eq(calendarConnections.id, conn.id));
    throw httpError(502, 'Google Calendar pull failed');
  }

  if (data.nextSyncToken && !opts.from && !opts.to) {
    await db
      .update(calendarConnections)
      .set({ syncToken: data.nextSyncToken, updatedAt: new Date() })
      .where(eq(calendarConnections.id, conn.id));
  }
  await db
    .update(calendarConnections)
    .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(calendarConnections.id, conn.id));

  const events: NormalizedExternalEvent[] = (data.items || [])
    .filter((e: any) => e.status !== 'cancelled')
    .map((e: any) => ({
      id: String(e.id),
      summary: String(e.summary || '(No title)'),
      start: e.start?.dateTime || e.start?.date || null,
      end: e.end?.dateTime || e.end?.date || null,
      allDay: !e.start?.dateTime,
      htmlLink: e.htmlLink || null,
      description: typeof e.description === 'string' ? e.description.slice(0, 500) : null,
      attendees: Array.isArray(e.attendees)
        ? e.attendees
            .map((a: any) => a?.email || a?.displayName)
            .filter(Boolean)
            .slice(0, 10)
        : [],
      location: typeof e.location === 'string' && e.location ? e.location.slice(0, 200) : null,
      hangoutLink:
        e.hangoutLink || e.conferenceData?.entryPoints?.find?.((p: any) => p?.uri)?.uri || null,
      organizer: e.organizer?.email || e.organizer?.displayName || null,
      recurrence: Array.isArray(e.recurrence) ? e.recurrence.slice(0, 5) : [],
    }));

  return { events, incremental: useIncremental };
}

// ─── Push (Boardly schedule → Google) ────────────────────────────────────────

export function buildEventBody(card: {
  key?: string | null;
  title: string;
  description?: string | null;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  dueDate?: Date | string | null;
}): { summary: string; description: string; start: any; end: any } | null {
  const start = card.scheduledStart ? new Date(card.scheduledStart) : null;
  let end = card.scheduledEnd ? new Date(card.scheduledEnd) : null;
  if (!start && card.dueDate) {
    const due = new Date(card.dueDate);
    return {
      summary: `${card.key ? `[${card.key}] ` : ''}${card.title}`,
      description: (card.description || '').slice(0, 2000),
      start: { dateTime: new Date(due.getTime() - 60 * 60_000).toISOString() },
      end: { dateTime: due.toISOString() },
    };
  }
  if (!start) return null;
  if (!end || end <= start) end = new Date(start.getTime() + 60 * 60_000);
  return {
    summary: `${card.key ? `[${card.key}] ` : ''}${card.title}`,
    description: (card.description || '').slice(0, 2000),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

export async function pushCardToGoogle(
  db: Database,
  connectionId: string,
  organizationId: string,
  card: {
    id: string;
    key?: string | null;
    title: string;
    description?: string | null;
    scheduledStart?: Date | string | null;
    scheduledEnd?: Date | string | null;
    dueDate?: Date | string | null;
  },
  clientOverride?: CalendarApi
): Promise<{ pushed: boolean; eventId?: string }> {
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.id, connectionId))
    .limit(1);
  if (!conn) throw httpError(404, 'Calendar connection not found');

  const body = buildEventBody(card);
  // No schedule and no due date → remove any previously pushed event.
  const [existing] = await db
    .select()
    .from(calendarEventLinks)
    .where(
      and(eq(calendarEventLinks.cardId, card.id), eq(calendarEventLinks.connectionId, connectionId))
    )
    .limit(1);

  const calendar = clientOverride || calendarClient(conn.refreshToken);

  if (!body) {
    if (existing) {
      await withGoogleTimeout<any>('events.delete', () =>
        (calendar as any).events.delete({
          calendarId: conn.calendarId,
          eventId: existing.providerEventId,
        })
      ).catch(() => {});
      await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, existing.id));
    }
    return { pushed: false };
  }

  let eventId = existing?.providerEventId;
  let htmlUrl: string | null = existing?.htmlUrl || null;
  try {
    if (eventId) {
      await withGoogleTimeout<any>('events.patch', () =>
        (calendar as any).events.patch({
          calendarId: conn.calendarId,
          eventId,
          requestBody: body,
        })
      );
    } else {
      const { data } = await withGoogleTimeout<any>('events.insert', () =>
        (calendar as any).events.insert({
          calendarId: conn.calendarId,
          requestBody: { ...body, extendedProperties: { private: { boardlyCardId: card.id } } },
        })
      );
      eventId = data.id;
      htmlUrl = data.htmlLink || null;
      await db
        .insert(calendarEventLinks)
        .values({
          organizationId,
          connectionId,
          cardId: card.id,
          providerEventId: String(eventId),
          providerCalendarId: conn.calendarId,
          htmlUrl,
        })
        .onConflictDoNothing();
    }
  } catch {
    throw httpError(502, 'Google Calendar push failed');
  }

  await db
    .update(calendarEventLinks)
    .set({ lastPushedAt: new Date(), htmlUrl })
    .where(
      and(eq(calendarEventLinks.cardId, card.id), eq(calendarEventLinks.connectionId, connectionId))
    );
  return { pushed: true, eventId };
}

export async function pushAllScheduled(
  db: Database,
  userId: string,
  organizationId: string,
  clientOverride?: CalendarApi
): Promise<{ pushed: number; failed: number }> {
  const conn = await requireConnection(db, userId);

  const rows = await db
    .select({
      id: cards.id,
      key: cards.key,
      title: cards.title,
      description: cards.description,
      scheduledStart: cards.scheduledStart,
      scheduledEnd: cards.scheduledEnd,
      dueDate: cards.dueDate,
    })
    .from(cards)
    .innerJoin(cardAssignees, eq(cardAssignees.cardId, cards.id))
    .where(
      and(
        eq(cards.organizationId, organizationId),
        eq(cardAssignees.userId, userId),
        eq(cards.isArchived, false),
        sql`${cards.scheduledStart} IS NOT NULL`
      )
    )
    .limit(200);

  let pushed = 0;
  let failed = 0;
  for (const card of rows) {
    try {
      const res = await pushCardToGoogle(db, conn.id, organizationId, card, clientOverride);
      if (res.pushed) pushed++;
    } catch {
      failed++;
    }
  }
  return { pushed, failed };
}

// ─── Scheduling (Boardly-side time blocks) ───────────────────────────────────

export async function scheduleCard(
  db: Database,
  cardId: string,
  organizationId: string,
  actorId: string,
  input: { start?: string | null; end?: string | null }
) {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!card) throw httpError(404, 'Card not found');

  const start = input.start ? new Date(input.start) : null;
  const end = input.end ? new Date(input.end) : null;
  if ((input.start && isNaN(start!.getTime())) || (input.end && isNaN(end!.getTime()))) {
    throw httpError(400, 'Invalid date format — expected ISO 8601');
  }
  if (start && end && end <= start) {
    throw httpError(400, 'Scheduled end must be after scheduled start');
  }
  if (end && !start) {
    throw httpError(400, 'Scheduled end requires a scheduled start');
  }

  const updated = await updateCard(db, cardId, organizationId, {
    scheduledStart: start,
    scheduledEnd: end,
  } as any);

  // Best-effort push to the actor's own Google calendar.
  const [conn] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, actorId))
    .limit(1)
    .catch(() => [null] as any);
  if (conn) {
    await pushCardToGoogle(db, conn.id, organizationId, {
      ...updated,
      scheduledStart: start,
      scheduledEnd: end,
    }).catch(() => {});
  }

  await eventBus.broadcast(`board:${(updated as any).listId || ''}`, 'card.scheduled', updated);
  return updated;
}

// ─── Google event writes (quick-create / reschedule / cancel) ───────────────

function parseRange(start?: string | null, end?: string | null): { start: string; end: string } {
  if (!start) throw httpError(400, 'Event start is required');
  const s = new Date(start);
  if (isNaN(s.getTime())) throw httpError(400, 'Invalid date format — expected ISO 8601');
  let e = end ? new Date(end) : new Date(s.getTime() + 60 * 60_000);
  if (end && isNaN(e.getTime())) throw httpError(400, 'Invalid date format — expected ISO 8601');
  if (e <= s) e = new Date(s.getTime() + 60 * 60_000);
  return { start: s.toISOString(), end: e.toISOString() };
}

export async function createExternalEvent(
  db: Database,
  userId: string,
  input: { title: string; start?: string | null; end?: string | null; description?: string },
  clientOverride?: CalendarApi
) {
  if (!input.title?.trim()) throw httpError(400, 'Event title is required');
  const conn = await requireConnection(db, userId);
  const { start, end } = parseRange(input.start, input.end);
  const calendar = clientOverride || calendarClient(conn.refreshToken);

  let data: any;
  try {
    ({ data } = await withGoogleTimeout<any>('events.insert', () =>
      (calendar as any).events.insert({
        calendarId: conn.calendarId,
        requestBody: {
          summary: input.title.trim(),
          description: (input.description || '').slice(0, 2000),
          start: { dateTime: start },
          end: { dateTime: end },
        },
      })
    ));
  } catch {
    throw httpError(502, 'Google Calendar event creation failed');
  }

  await db
    .update(calendarConnections)
    .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(calendarConnections.id, conn.id));
  return {
    id: String(data.id),
    summary: String(data.summary || input.title),
    start,
    end,
    allDay: false,
    htmlLink: data.htmlLink || null,
  };
}

export async function updateExternalEvent(
  db: Database,
  userId: string,
  eventId: string,
  input: { title?: string; start?: string | null; end?: string | null; addConference?: boolean },
  clientOverride?: CalendarApi
) {
  const conn = await requireConnection(db, userId);
  const patch: any = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw httpError(400, 'Event title cannot be empty');
    patch.summary = input.title.trim();
  }
  if (input.start !== undefined || input.end !== undefined) {
    const { start, end } = parseRange(input.start, input.end);
    patch.start = { dateTime: start };
    patch.end = { dateTime: end };
  }
  if (input.addConference) {
    patch.conferenceData = {
      createRequest: {
        requestId: `${eventId}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  if (Object.keys(patch).length === 0) throw httpError(400, 'Nothing to update');
  const calendar = clientOverride || calendarClient(conn.refreshToken);

  try {
    const { data } = await withGoogleTimeout<any>('events.patch', () =>
      (calendar as any).events.patch({
        calendarId: conn.calendarId,
        eventId,
        conferenceDataVersion: 1,
        requestBody: patch,
      })
    );
    const hangoutLink =
      (data as any)?.hangoutLink ||
      (data as any)?.conferenceData?.entryPoints?.find?.((p: any) => p?.uri)?.uri ||
      null;
    return { success: true as const, hangoutLink };
  } catch {
    throw httpError(502, 'Google Calendar event update failed');
  }
}

export async function deleteExternalEvent(
  db: Database,
  userId: string,
  eventId: string,
  clientOverride?: CalendarApi
) {
  const conn = await requireConnection(db, userId);
  const calendar = clientOverride || calendarClient(conn.refreshToken);
  try {
    await withGoogleTimeout<any>('events.delete', () =>
      (calendar as any).events.delete({ calendarId: conn.calendarId, eventId })
    );
  } catch {
    throw httpError(502, 'Google Calendar event deletion failed');
  }
  return { success: true };
}

// ─── Merged feed (tasks + sprints + phases + Google) ─────────────────────────

export async function getCalendarFeed(
  db: Database,
  organizationId: string,
  userId: string,
  opts: { from?: string; to?: string } = {},
  clientOverride?: CalendarApi
) {
  const now = new Date();
  const from = opts.from ? new Date(opts.from) : new Date(now.getTime() - 30 * 86400_000);
  const to = opts.to ? new Date(opts.to) : new Date(now.getTime() + 60 * 86400_000);

  const myCards = await db
    .select({
      id: cards.id,
      key: cards.key,
      title: cards.title,
      dueDate: cards.dueDate,
      scheduledStart: cards.scheduledStart,
      scheduledEnd: cards.scheduledEnd,
      stageId: cards.stageId,
      listId: cards.listId,
    })
    .from(cards)
    .innerJoin(cardAssignees, eq(cardAssignees.cardId, cards.id))
    .where(
      and(
        eq(cards.organizationId, organizationId),
        eq(cardAssignees.userId, userId),
        eq(cards.isArchived, false)
      )
    )
    .limit(500);

  // Pushed-event URLs for the user's own connections (Open-in-Google).
  const userConns = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId));
  const connIds = userConns.map((c) => c.id);
  let pushedUrls = new Map<string, string>();
  if (connIds.length > 0) {
    const linkRows = await db
      .select({
        cardId: calendarEventLinks.cardId,
        htmlUrl: calendarEventLinks.htmlUrl,
      })
      .from(calendarEventLinks)
      .where(inArray(calendarEventLinks.connectionId, connIds));
    pushedUrls = new Map(
      linkRows.filter((r) => r.htmlUrl).map((r) => [r.cardId, r.htmlUrl as string])
    );
  }

  const blocks = myCards
    .filter((c) => c.scheduledStart)
    .map((c) => ({
      kind: 'task' as const,
      id: c.id,
      key: c.key,
      title: c.title,
      start: c.scheduledStart,
      end: c.scheduledEnd,
      stageId: c.stageId,
      listId: c.listId,
      googleUrl: pushedUrls.get(c.id) || null,
    }));

  const dueDates = myCards
    .filter((c) => c.dueDate && new Date(c.dueDate) >= from && new Date(c.dueDate) <= to)
    .map((c) => ({
      kind: 'due' as const,
      id: c.id,
      key: c.key,
      title: c.title,
      start: c.dueDate,
    }));

  const unscheduled = myCards
    .filter((c) => !c.scheduledStart)
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 50)
    .map((c) => ({ id: c.id, key: c.key, title: c.title, dueDate: c.dueDate }));

  const orgProjectIds = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));

  const sprintRows = await db
    .select({
      id: sprints.id,
      name: sprints.name,
      status: sprints.status,
      startDate: sprints.startDate,
      endDate: sprints.endDate,
      projectId: sprints.projectId,
    })
    .from(sprints)
    .where(sql`${sprints.projectId} IN ${orgProjectIds}`);

  const sprintsOverlay = sprintRows
    .filter((s) => new Date(s.endDate) >= from && new Date(s.startDate) <= to)
    .map((s) => ({
      kind: 'sprint' as const,
      id: s.id,
      name: s.name,
      status: s.status,
      start: s.startDate,
      end: s.endDate,
      projectId: s.projectId,
    }));

  const phaseRows = await db
    .select({
      id: phases.id,
      name: phases.name,
      status: phases.status,
      startDate: phases.startDate,
      endDate: phases.endDate,
      projectId: phases.projectId,
    })
    .from(phases)
    .where(sql`${phases.projectId} IN ${orgProjectIds}`);

  const milestones = phaseRows
    .filter(
      (p) => p.startDate && p.endDate && new Date(p.endDate) >= from && new Date(p.startDate) <= to
    )
    .map((p) => ({
      kind: 'milestone' as const,
      id: p.id,
      name: p.name,
      status: p.status,
      start: p.startDate,
      end: p.endDate,
      projectId: p.projectId,
    }));

  let external: NormalizedExternalEvent[] = [];
  let externalError: string | null = null;
  try {
    ({ events: external } = await pullExternalEvents(
      db,
      userId,
      { from: from.toISOString(), to: to.toISOString() },
      clientOverride
    ));
  } catch (err: unknown) {
    // No connection (409) simply means Google overlay is off; other errors surface.
    if (errorStatus(err) !== 409) externalError = errorMessage(err, 'Google pull failed');
  }

  return {
    blocks,
    dueDates,
    unscheduled,
    sprints: sprintsOverlay,
    milestones,
    external,
    externalError,
  };
}
