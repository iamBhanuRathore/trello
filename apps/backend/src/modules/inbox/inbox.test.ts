import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, assignUserToCard } from '../cards/service';
import { createDirectMessage, sendMessage } from '../chat/service';
import { connectRepository } from '../git/service';
import {
  getInbox,
  snoozeInboxItem,
  archiveInboxItem,
  undoInboxItem,
  decodeInboxCursor,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;
let orgId: string;
let userId: string;
let otherId: string;
let cardId: string;
let channelId: string;
let listId: string;
async function firstListId(): Promise<string> {
  return listId;
}
let linkId: string;

async function seedNotification(
  eventType: string,
  payload: Record<string, unknown>,
  createdAt?: Date
) {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId,
      organizationId: orgId,
      eventType,
      payload,
      searchText: `${eventType} test`.toLowerCase(),
      ...(createdAt ? { createdAt } : {}),
    })
    .returning({ id: schema.notifications.id });
  return row!.id;
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
  const suffix = `${Date.now()}_inbox`;
  const { user, organization } = await signUp(db, {
    name: 'Inbox Owner',
    email: `inbox_${suffix}@example.com`,
    password: 'pass',
    orgName: `Inbox Org ${suffix}`,
    orgSlug: `inbox-org-${suffix}`,
  });
  orgId = organization.id;
  userId = user.id;
  const peer = await signUp(db, {
    name: 'Inbox Peer',
    email: `inboxpeer_${suffix}@example.com`,
    password: 'pass',
    orgName: `Inbox Peer Org ${suffix}`,
    orgSlug: `inbox-peer-org-${suffix}`,
  });
  otherId = peer.user.id;
  await db
    .insert(schema.organizationMembers)
    .values({ userId: otherId, organizationId: orgId, role: 'member', status: 'active' });

  const ws = await createWorkspace(db, { organizationId: orgId, name: 'WS' });
  const proj = await createProject(db, { organizationId: orgId, workspaceId: ws!.id, name: 'P' });
  const board = await createBoard(db, { organizationId: orgId, projectId: proj!.id, name: 'B' });
  const list = await createList(db, orgId, { boardId: board!.id, name: 'To Do' });
  listId = list!.id;
  const card = await createCard(db, orgId, { listId: list!.id, title: 'Due task' });
  cardId = card!.id;
  await assignUserToCard(db, cardId, orgId, userId, userId);

  // Inbox DMs come from direct channels only; group traffic stays in Chat.
  const channel = await createDirectMessage(db, orgId, userId, otherId);
  channelId = (channel as { id: string }).id;

  const repo = (await connectRepository(db, orgId, { owner: 'acme', repo: `inbox-${suffix}` })) as {
    id: string;
  };
  const [link] = await db
    .insert(schema.gitLinks)
    .values({
      organizationId: orgId,
      repositoryId: repo.id,
      cardId,
      kind: 'pr',
      ref: '42',
      title: 'Fix flaky test',
      state: 'open',
    })
    .returning({ id: schema.gitLinks.id });
  linkId = link!.id;
});

afterAll(async () => {
  await client.end();
});

describe('Federated inbox (4.6a)', () => {
  it('merges all four sources newest-first with stable composite cursors', async () => {
    await seedNotification('card.commented', {
      cardId,
      cardTitle: 'Due task',
      commentText: 'hello',
    });
    await sendMessage(db, channelId, orgId, otherId, { body: 'hey, review this' });
    const first = await getInbox(db, userId, orgId, { limit: 30 });
    const sources = new Set(first.items.map((i) => i.source));
    expect(sources.has('notification')).toBe(true);
    expect(sources.has('dm')).toBe(true);
    expect(sources.has('task')).toBe(true);
    expect(sources.has('git')).toBe(true);
    // Newest-first on creation time.
    const ts = first.items.map((i) => i.eventTs);
    expect([...ts].sort().reverse()).toEqual(ts);
    // Full page walk has no dupes and ends with a null cursor.
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let n = 0; n < 5; n++) {
      const page = await getInbox(db, userId, orgId, { limit: 2, cursor });
      for (const item of page.items) {
        expect(seen.has(item.key)).toBe(false);
        seen.add(item.key);
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(cursor).toBeNull();
  });

  it('caps each source at ~50 rows', async () => {
    const base = Date.now();
    for (let i = 0; i < 55; i++) {
      await seedNotification(
        'card.commented',
        { cardId, cardTitle: `Bulk ${i}`, commentText: `m${i}` },
        new Date(base - i * 1000)
      );
    }
    const page = await getInbox(db, userId, orgId, { limit: 100 });
    const notifs = page.items.filter((i) => i.source === 'notification');
    expect(notifs.length).toBeLessThanOrEqual(50);
  });

  it('groups DMs per channel with unread counts and keeps mentions separate', async () => {
    await sendMessage(db, channelId, orgId, otherId, { body: 'second ping' });
    const mentionId = await seedNotification('chat.mentioned', {
      channelId,
      messagePreview: '@you look here',
      actorName: 'Peer',
    });
    const page = await getInbox(db, userId, orgId, { limit: 30 });
    const dms = page.items.filter((i) => i.source === 'dm' && i.refId === channelId);
    expect(dms.length).toBe(1);
    expect(dms[0]!.unreadCount).toBeGreaterThanOrEqual(2);
    // The @mention is its own notification item, not folded into the group.
    expect(page.items.some((i) => i.source === 'notification' && i.refId === mentionId)).toBe(true);
  });

  it('dedups card.commented + card.mentioned for the same card within a minute', async () => {
    const at = new Date();
    const commentedId = await seedNotification(
      'card.commented',
      { cardId, cardTitle: 'Due task', commentText: 'note' },
      at
    );
    const mentionedId = await seedNotification(
      'card.mentioned',
      { cardId, cardTitle: 'Due task', commentText: '@you note' },
      new Date(at.getTime() + 30_000)
    );
    const page = await getInbox(db, userId, orgId, { limit: 100 });
    const refs = page.items.filter((i) => i.source === 'notification').map((i) => i.refId);
    expect(refs).toContain(mentionedId);
    expect(refs).not.toContain(commentedId);
  });

  it('snoozes and resurfaces on schedule', async () => {
    const notifId = await seedNotification('card.assigned', { cardId, cardTitle: 'Due task' });
    // Task snooze is rejected (dismiss-only).
    await expect(snoozeInboxItem(db, userId, orgId, 'task', cardId, '1h')).rejects.toThrow();
    // DM snooze hides, then resurfaces once the time passes.
    await snoozeInboxItem(db, userId, orgId, 'dm', channelId, '1h');
    let page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.source === 'dm' && i.refId === channelId)).toBe(false);
    await db
      .update(schema.inboxItemState)
      .set({ snoozedUntil: new Date(Date.now() - 1000) })
      .where(
        and(
          eq(schema.inboxItemState.userId, userId),
          eq(schema.inboxItemState.source, 'dm'),
          eq(schema.inboxItemState.refId, channelId)
        )
      );
    page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.source === 'dm' && i.refId === channelId)).toBe(true);
    // Notification snooze hides from the inbox too.
    await snoozeInboxItem(db, userId, orgId, 'notification', notifId, '1h');
    page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.refId === notifId)).toBe(false);
  });

  it('delegates archive per source and supports undo', async () => {
    const notifId = await seedNotification('card.assigned', { cardId, cardTitle: 'Due task' });
    await archiveInboxItem(db, userId, orgId, 'notification', notifId);
    await archiveInboxItem(db, userId, orgId, 'dm', channelId);
    await archiveInboxItem(db, userId, orgId, 'task', cardId);
    await archiveInboxItem(db, userId, orgId, 'git', linkId);
    let page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.refId === notifId)).toBe(false);
    expect(page.items.some((i) => i.source === 'dm' && i.refId === channelId)).toBe(false);
    expect(page.items.some((i) => i.source === 'task' && i.refId === cardId)).toBe(false);
    expect(page.items.some((i) => i.source === 'git' && i.refId === linkId)).toBe(false);
    // Undo restores every facet.
    await undoInboxItem(db, userId, orgId, 'notification', notifId);
    await undoInboxItem(db, userId, orgId, 'dm', channelId);
    await undoInboxItem(db, userId, orgId, 'task', cardId);
    await undoInboxItem(db, userId, orgId, 'git', linkId);
    page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.refId === notifId)).toBe(true);
    expect(page.items.some((i) => i.source === 'task' && i.refId === cardId)).toBe(true);
    expect(page.items.some((i) => i.source === 'git' && i.refId === linkId)).toBe(true);
  });

  it('resurfaces git items on state change after dismiss', async () => {
    await archiveInboxItem(db, userId, orgId, 'git', linkId);
    let page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.source === 'git' && i.refId === linkId)).toBe(false);
    // A link update (review state change) invalidates the dismissal.
    await db
      .update(schema.gitLinks)
      .set({ state: 'changes_requested', updatedAt: new Date(Date.now() + 1000) })
      .where(eq(schema.gitLinks.id, linkId));
    page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.source === 'git' && i.refId === linkId)).toBe(true);
  });

  it('round-trips composite cursors without loss', async () => {
    const page = await getInbox(db, userId, orgId, { limit: 2 });
    if (page.nextCursor) {
      const decoded = decodeInboxCursor(page.nextCursor);
      expect(typeof decoded).toBe('object');
      const again = await getInbox(db, userId, orgId, { limit: 2, cursor: page.nextCursor });
      const keys = new Set(page.items.map((i) => i.key));
      for (const item of again.items) expect(keys.has(item.key)).toBe(false);
    }
  });
  it('scopes git review items to the reader and DMs to direct channels', async () => {
    // A PR on a card owned by someone else is not in the reader's triage queue.
    const strangerCard = await createCard(db, orgId, {
      listId: await firstListId(),
      title: 'Not mine',
    });
    const strangerRepo = (await connectRepository(db, orgId, {
      owner: 'acme',
      repo: `inbox-scope-${cardId.slice(0, 8)}`,
    })) as {
      id: string;
    };
    const [strangerLink] = await db
      .insert(schema.gitLinks)
      .values({
        organizationId: orgId,
        repositoryId: strangerRepo.id,
        cardId: strangerCard!.id,
        kind: 'pr',
        ref: '99',
        title: 'Someone else is waiting',
        state: 'open',
      })
      .returning({ id: schema.gitLinks.id });
    const page = await getInbox(db, userId, orgId, { limit: 100 });
    expect(page.items.some((i) => i.source === 'git' && i.refId === strangerLink!.id)).toBe(false);
    // The reader's own assigned card is still surfaced.
    expect(page.items.some((i) => i.source === 'git' && i.refId === linkId)).toBe(true);
  });
});
