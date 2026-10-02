import { eq, and, or, desc, lt, lte, inArray, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  notifications,
  inboxItemState,
  chatChannels,
  chatChannelMembers,
  chatMessages,
  cards,
  cardAssignees,
  cardWatchers,
  gitLinks,
} from '../../db/schema/index';
import { decodeCursor, encodeCursor } from '../notifications/service';
import { bulkArchive, bulkUnarchive } from '../notifications/service';
import { markChannelRead } from '../chat/service';
import { httpError } from '../organizations/service';
import { GitLinkState } from '@boardly/shared-types';

// ─── Federated triage inbox (4.6a) ───────────────────────────────────────────
// Four sources, no materialized table (see Decisions.md for the trigger that
// would force one): notifications + unread-DM channel groups + assigned-task
// due slice + open/changes_requested git links. Each source pages under its
// own keyset cursor (creation-time ordered — edits never reorder); the page
// merges in memory on (event_ts, id) and returns a composite cursor.
//
// Triage state for DM/task/git lives in inbox_item_state (those rows have no
// per-user column): DM snooze/dismiss = watermark, task = dismiss-only,
// git = dismiss-until-state-change. Notification triage delegates to the
// notifications table (snoozed_until / archivedAt).

export type InboxSource = 'notification' | 'dm' | 'task' | 'git';

export interface InboxItem {
  key: string;
  source: InboxSource;
  /** Creation time — never moves on edit, so cursors stay stable. */
  eventTs: string;
  refId: string;
  title: string;
  snippet?: string;
  unreadCount?: number;
  eventType?: string;
  cardId?: string;
  cardKey?: string;
  channelId?: string;
  linkState?: string;
}

export interface InboxCursor {
  n?: string | null;
  d?: string | null;
  t?: string | null;
  g?: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  nextCursor: string | null;
}

const PER_SOURCE_CAP = 50;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function clampPageLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT);
}

export function encodeInboxCursor(c: InboxCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeInboxCursor(raw?: string | null): InboxCursor {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as InboxCursor;
    if (parsed && typeof parsed === 'object') {
      return {
        n: typeof parsed.n === 'string' ? parsed.n : null,
        d: typeof parsed.d === 'string' ? parsed.d : null,
        t: typeof parsed.t === 'string' ? parsed.t : null,
        g: typeof parsed.g === 'string' ? parsed.g : null,
      };
    }
  } catch {}
  return {};
}

type StateMap = Map<string, { snoozedUntil: Date | null; dismissedAt: Date | null }>;

async function loadStates(db: Database, userId: string): Promise<StateMap> {
  const rows = await db.select().from(inboxItemState).where(eq(inboxItemState.userId, userId));
  const map: StateMap = new Map();
  for (const r of rows)
    map.set(`${r.source}:${r.refId}`, { snoozedUntil: r.snoozedUntil, dismissedAt: r.dismissedAt });
  return map;
}

function snoozed(state: { snoozedUntil: Date | null } | undefined, now: Date): boolean {
  return Boolean(state?.snoozedUntil && state.snoozedUntil.getTime() > now.getTime());
}

function keyset(cursor: string | null | undefined, tsCol: any, idCol: any): SQL | undefined {
  if (!cursor) return undefined;
  const decoded = decodeCursor(cursor);
  if (!decoded) return undefined;
  // date_trunc: Postgres stores microseconds but JS Dates (and our eventTs
  // ISO strings) only carry milliseconds. Without truncation a row stamped
  // 12:00:00.123456 sorts AFTER a resume cursor of 12:00:00.123 and gets
  // re-emitted forever. Truncating both sides to ms keeps the keyset exact.
  const iso = decoded.createdAt.toISOString();
  return or(
    sql`date_trunc('milliseconds', ${tsCol}) < ${iso}::timestamptz`,
    and(sql`date_trunc('milliseconds', ${tsCol}) = ${iso}::timestamptz`, lt(idCol, decoded.id))
  )!;
}

// ─── Source: notifications (mentions stay separate items here) ───────────────

async function fetchNotifications(
  db: Database,
  userId: string,
  orgId: string,
  cursor: string | null | undefined,
  now: Date
): Promise<{ items: InboxItem[]; nextScan: string | null | undefined; exhausted: boolean }> {
  const conds: SQL[] = [
    eq(notifications.userId, userId),
    eq(notifications.organizationId, orgId),
    sql`${notifications.archivedAt} IS NULL`,
    or(
      isNull(notifications.snoozedUntil),
      sql`${notifications.snoozedUntil} <= ${now.toISOString()}`
    )!,
  ];
  const ks = keyset(cursor, notifications.createdAt, notifications.id);
  if (ks) conds.push(ks);
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(PER_SOURCE_CAP + 1);
  const exhausted = rows.length <= PER_SOURCE_CAP;
  const page = exhausted ? rows : rows.slice(0, PER_SOURCE_CAP);
  const nextScan =
    page.length > 0
      ? encodeCursor(page[page.length - 1]!.createdAt, page[page.length - 1]!.id)
      : cursor;

  // Dedup: card.commented + card.mentioned for the same card within 1 minute
  // collapse to the mention (the actionable one).
  const byCard = new Map<string, typeof page>();
  for (const r of page) {
    const cardId = (r.payload as Record<string, unknown>)?.['cardId'];
    if (
      typeof cardId === 'string' &&
      (r.eventType === 'card.commented' || r.eventType === 'card.mentioned')
    ) {
      const list = byCard.get(cardId) ?? [];
      list.push(r);
      byCard.set(cardId, list);
    }
  }
  const dropIds = new Set<string>();
  for (const list of byCard.values()) {
    const mentioned = list.filter((r) => r.eventType === 'card.mentioned');
    const commented = list.filter((r) => r.eventType === 'card.commented');
    for (const c of commented) {
      const ct = new Date(c.createdAt).getTime();
      if (mentioned.some((m) => Math.abs(new Date(m.createdAt).getTime() - ct) <= 60_000))
        dropIds.add(c.id);
    }
  }

  const items: InboxItem[] = page
    .filter((r) => !dropIds.has(r.id))
    .map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
      return {
        key: `notification:${r.id}`,
        source: 'notification' as const,
        eventTs: new Date(r.createdAt).toISOString(),
        refId: r.id,
        title: str(p['cardTitle']) || str(p['cardKey']) || str(p['actorName']) || r.eventType,
        snippet:
          str(p['commentSnippet']) ||
          str(p['commentText']) ||
          str(p['messagePreview']) ||
          undefined,
        eventType: r.eventType,
        cardId: str(p['cardId']),
        cardKey: str(p['cardKey']),
      };
    });
  return { items, nextScan, exhausted };
}

// ─── Source: unread DMs grouped per channel ──────────────────────────────────
// eventTs is the channel's lastMessageAt (bumped alongside each message), so
// the merge order and the keyset cursor share one column — cursors can't dup
// or skip when the two clocks disagree by a millisecond.

async function fetchDMs(
  db: Database,
  userId: string,
  orgId: string,
  cursorIn: string | null | undefined,
  states: StateMap,
  now: Date
): Promise<{ items: InboxItem[]; nextScan: string | null | undefined; exhausted: boolean }> {
  const items: InboxItem[] = [];
  let cur = cursorIn;
  let exhausted = false;
  // Refill loop: state/unread filters apply after the fetch, so scan past
  // filtered rows (bounded) — a page that emits nothing must still report
  // exhausted (or a progressed cursor), never a standstill.
  for (let iter = 0; iter < 10 && items.length < PER_SOURCE_CAP && !exhausted; iter++) {
    const conds: SQL[] = [
      eq(chatChannels.organizationId, orgId),
      eq(chatChannelMembers.userId, userId),
      eq(chatChannels.isArchived, false),
      // DMs only — group/public/task-thread traffic belongs to Chat, not Inbox.
      eq(chatChannels.type, 'direct'),
      // Only channels with traffic newer than the reader's watermark.
      sql`EXISTS (SELECT 1 FROM "chat_messages" "m" WHERE "m"."channel_id" = "chat_channels"."id" AND "m"."user_id" != ${userId} AND "m"."deleted_at" IS NULL AND "m"."created_at" > "chat_channel_members"."last_read_at")`,
    ];
    const ks = keyset(cur, chatChannels.lastMessageAt, chatChannels.id);
    if (ks) conds.push(ks);
    const chunk = await db
      .select({ channel: chatChannels })
      .from(chatChannelMembers)
      .innerJoin(chatChannels, eq(chatChannels.id, chatChannelMembers.channelId))
      .where(and(...conds))
      .orderBy(desc(chatChannels.lastMessageAt), desc(chatChannels.id))
      .limit(PER_SOURCE_CAP + 1);
    exhausted = chunk.length <= PER_SOURCE_CAP;
    const rows = exhausted ? chunk : chunk.slice(0, PER_SOURCE_CAP);
    if (rows.length > 0) {
      const last = rows[rows.length - 1]!.channel;
      cur = encodeCursor(last.lastMessageAt, last.id);
    }
    for (const m of rows) {
      if (items.length >= PER_SOURCE_CAP) break;
      const ch = m.channel;
      const state = states.get(`dm:${ch.id}`);
      if (snoozed(state, now)) continue;
      // Watermark: dismiss hides everything up to dismissed_at.
      if (state?.dismissedAt && new Date(ch.lastMessageAt).getTime() <= state.dismissedAt.getTime())
        continue;
      const unread = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .innerJoin(
          chatChannelMembers,
          and(
            eq(chatChannelMembers.channelId, chatMessages.channelId),
            eq(chatChannelMembers.userId, userId)
          )
        )
        .where(
          and(
            eq(chatMessages.channelId, ch.id),
            sql`${chatMessages.userId} != ${userId}`,
            isNull(chatMessages.deletedAt),
            sql`${chatMessages.createdAt} > "chat_channel_members"."last_read_at"`
          )
        )
        .limit(500);
      if (unread.length === 0) continue;
      items.push({
        key: `dm:${ch.id}`,
        source: 'dm',
        eventTs: new Date(ch.lastMessageAt).toISOString(),
        refId: ch.id,
        title: ch.type === 'direct' ? ch.name || 'Direct message' : `#${ch.name}`,
        snippet: ch.lastMessagePreview?.slice(0, 200) || undefined,
        unreadCount: unread.length,
        channelId: ch.id,
      });
    }
  }
  return { items, nextScan: cur, exhausted };
}

// ─── Source: my-tasks due slice ─────────────────────────────────────────────

async function fetchTasks(
  db: Database,
  userId: string,
  orgId: string,
  cursorIn: string | null | undefined,
  states: StateMap,
  now: Date
): Promise<{ items: InboxItem[]; nextScan: string | null | undefined; exhausted: boolean }> {
  const horizon = new Date(now.getTime() + 7 * 86_400_000);
  const recent = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const items: InboxItem[] = [];
  let cur = cursorIn;
  let exhausted = false;
  for (let iter = 0; iter < 10 && items.length < PER_SOURCE_CAP && !exhausted; iter++) {
    const conds: SQL[] = [
      eq(cards.organizationId, orgId),
      eq(cardAssignees.userId, userId),
      eq(cards.isArchived, false),
      isNull(cards.deletedAt),
      or(
        and(sql`${cards.dueDate} IS NOT NULL`, lte(cards.dueDate, horizon)),
        sql`${cards.createdAt} >= ${recent}`
      )!,
    ];
    const ks = keyset(cur, cards.createdAt, cards.id);
    if (ks) conds.push(ks);
    const chunk = await db
      .select({
        id: cards.id,
        key: cards.key,
        title: cards.title,
        dueDate: cards.dueDate,
        createdAt: cards.createdAt,
      })
      .from(cards)
      .innerJoin(cardAssignees, eq(cardAssignees.cardId, cards.id))
      .where(and(...conds))
      .orderBy(desc(cards.createdAt), desc(cards.id))
      .limit(PER_SOURCE_CAP + 1);
    exhausted = chunk.length <= PER_SOURCE_CAP;
    const rows = exhausted ? chunk : chunk.slice(0, PER_SOURCE_CAP);
    if (rows.length > 0) {
      const last = rows[rows.length - 1]!;
      cur = encodeCursor(last.createdAt, last.id);
    }
    for (const r of rows) {
      if (items.length >= PER_SOURCE_CAP) break;
      const state = states.get(`task:${r.id}`);
      // Tasks are dismiss-only: snooze rows never exist (POST rejects), but a
      // stray snooze must not hide either — only dismissal applies.
      if (state?.dismissedAt) continue;
      items.push({
        key: `task:${r.id}`,
        source: 'task',
        eventTs: new Date(r.createdAt).toISOString(),
        refId: r.id,
        title: r.key ? `${r.key} ${r.title}` : r.title,
        snippet: r.dueDate ? `Due ${new Date(r.dueDate).toLocaleDateString()}` : undefined,
        cardId: r.id,
        cardKey: r.key ?? undefined,
      });
    }
  }
  return { items, nextScan: cur, exhausted };
}

// ─── Source: git links open / changes_requested ──────────────────────────────

async function fetchGit(
  db: Database,
  userId: string,
  orgId: string,
  cursorIn: string | null | undefined,
  states: StateMap,
  now: Date
): Promise<{ items: InboxItem[]; nextScan: string | null | undefined; exhausted: boolean }> {
  const items: InboxItem[] = [];
  let cur = cursorIn;
  let exhausted = false;
  for (let iter = 0; iter < 10 && items.length < PER_SOURCE_CAP && !exhausted; iter++) {
    const conds: SQL[] = [
      eq(gitLinks.organizationId, orgId),
      inArray(gitLinks.state, [GitLinkState.Open, GitLinkState.ChangesRequested]),
      // Triage scope: only PRs linked to a card the reader is assigned to or
      // watching — never another member's personal queue.
      or(
        inArray(
          gitLinks.cardId,
          db
            .select({ cardId: cardAssignees.cardId })
            .from(cardAssignees)
            .where(eq(cardAssignees.userId, userId))
        ),
        inArray(
          gitLinks.cardId,
          db
            .select({ cardId: cardWatchers.cardId })
            .from(cardWatchers)
            .where(eq(cardWatchers.userId, userId))
        )
      ) as SQL,
    ];
    const ks = keyset(cur, gitLinks.createdAt, gitLinks.id);
    if (ks) conds.push(ks);
    const chunk = await db
      .select({
        id: gitLinks.id,
        kind: gitLinks.kind,
        ref: gitLinks.ref,
        title: gitLinks.title,
        state: gitLinks.state,
        author: gitLinks.author,
        cardId: gitLinks.cardId,
        createdAt: gitLinks.createdAt,
        updatedAt: gitLinks.updatedAt,
      })
      .from(gitLinks)
      .where(and(...conds))
      .orderBy(desc(gitLinks.createdAt), desc(gitLinks.id))
      .limit(PER_SOURCE_CAP + 1);
    exhausted = chunk.length <= PER_SOURCE_CAP;
    const rows = exhausted ? chunk : chunk.slice(0, PER_SOURCE_CAP);
    if (rows.length > 0) {
      const last = rows[rows.length - 1]!;
      cur = encodeCursor(last.createdAt, last.id);
    }
    for (const r of rows) {
      if (items.length >= PER_SOURCE_CAP) break;
      const state = states.get(`git:${r.id}`);
      if (snoozed(state, now)) continue;
      // Dismiss-until-state-change: any link update after dismissal resurfaces.
      if (state?.dismissedAt && new Date(r.updatedAt).getTime() <= state.dismissedAt.getTime())
        continue;
      items.push({
        key: `git:${r.id}`,
        source: 'git',
        eventTs: new Date(r.createdAt).toISOString(),
        refId: r.id,
        title: r.title || `${r.kind} ${r.ref}`,
        snippet: `${r.state.replace('_', ' ')}${r.author ? ` · ${r.author}` : ''}`,
        cardId: r.cardId,
        linkState: r.state,
      });
    }
  }
  return { items, nextScan: cur, exhausted };
}

// ─── Merge + composite cursor ────────────────────────────────────────────────

export async function getInbox(
  db: Database,
  userId: string,
  orgId: string,
  opts: { limit?: unknown; cursor?: string | null } = {}
): Promise<InboxPage> {
  const limit = clampPageLimit(opts.limit);
  const cursors = decodeInboxCursor(opts.cursor);
  const now = new Date();
  const states = await loadStates(db, userId);
  const [n, d, t, g] = await Promise.all([
    fetchNotifications(db, userId, orgId, cursors.n, now),
    fetchDMs(db, userId, orgId, cursors.d, states, now),
    fetchTasks(db, userId, orgId, cursors.t, states, now),
    fetchGit(db, userId, orgId, cursors.g, states, now),
  ]);
  const merged = [...n.items, ...d.items, ...t.items, ...g.items].sort(
    (a, b) => b.eventTs.localeCompare(a.eventTs) || b.refId.localeCompare(a.refId)
  );
  const page = merged.slice(0, limit);

  // Per-source resume cursors: after the last EMITTED item of that source, so
  // a page cut mid-source refetches only the remainder (keyset-stable). A
  // source that emitted nothing resumes from its scan position (or reports
  // exhausted) — the cursor always progresses, never standstills.
  const SOURCE_CURSOR_KEY: Record<InboxSource, keyof InboxCursor> = {
    notification: 'n',
    dm: 'd',
    task: 't',
    git: 'g',
  };
  const lastEmitted: Partial<Record<keyof InboxCursor, InboxItem>> = {};
  for (const item of page) lastEmitted[SOURCE_CURSOR_KEY[item.source]] = item;
  const next: InboxCursor = {};
  const consumedMore = merged.length > limit;
  const advance = (
    key: keyof InboxCursor,
    fetched: { exhausted: boolean; nextScan: string | null | undefined },
    incoming: string | null | undefined
  ) => {
    const last = lastEmitted[key];
    if (last) {
      next[key] = encodeCursor(last.eventTs, last.refId);
    } else if (!fetched.exhausted) {
      if (fetched.nextScan && fetched.nextScan !== incoming) next[key] = fetched.nextScan;
      else if (incoming) next[key] = incoming;
    }
  };
  advance('n', n, cursors.n);
  advance('d', d, cursors.d);
  advance('t', t, cursors.t);
  advance('g', g, cursors.g);
  const hasMore = consumedMore || !n.exhausted || !d.exhausted || !t.exhausted || !g.exhausted;
  return { items: page, nextCursor: hasMore ? encodeInboxCursor(next) : null };
}

// ─── Triage mutations (archive delegates per source) ─────────────────────────

async function upsertState(
  db: Database,
  userId: string,
  source: string,
  refId: string,
  patch: { snoozedUntil?: Date | null; dismissedAt?: Date | null }
): Promise<void> {
  await db
    .insert(inboxItemState)
    .values({
      userId,
      source,
      refId,
      snoozedUntil: patch.snoozedUntil ?? null,
      dismissedAt: patch.dismissedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [inboxItemState.userId, inboxItemState.source, inboxItemState.refId],
      set: {
        ...(patch.snoozedUntil !== undefined ? { snoozedUntil: patch.snoozedUntil } : {}),
        ...(patch.dismissedAt !== undefined ? { dismissedAt: patch.dismissedAt } : {}),
      },
    });
}

async function verifyNotification(
  db: Database,
  refId: string,
  userId: string,
  orgId: string
): Promise<void> {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, refId),
        eq(notifications.userId, userId),
        eq(notifications.organizationId, orgId)
      )
    )
    .limit(1);
  if (!row) throw httpError(404, 'Inbox item not found');
}

async function verifyChannelMembership(
  db: Database,
  refId: string,
  userId: string,
  orgId: string
): Promise<void> {
  const [row] = await db
    .select({ id: chatChannels.id })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannels.id, chatChannelMembers.channelId))
    .where(
      and(
        eq(chatChannelMembers.channelId, refId),
        eq(chatChannelMembers.userId, userId),
        eq(chatChannels.organizationId, orgId)
      )
    )
    .limit(1);
  if (!row) throw httpError(404, 'Inbox item not found');
}

async function verifyCardOrg(db: Database, refId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, refId), eq(cards.organizationId, orgId)))
    .limit(1);
  if (!row) throw httpError(404, 'Inbox item not found');
}

async function verifyLinkOrg(db: Database, refId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: gitLinks.id })
    .from(gitLinks)
    .where(and(eq(gitLinks.id, refId), eq(gitLinks.organizationId, orgId)))
    .limit(1);
  if (!row) throw httpError(404, 'Inbox item not found');
}

export function resolveSnoozeUntil(raw: string): Date {
  const now = Date.now();
  if (raw === '1h') return new Date(now + 3_600_000);
  if (raw === '3h') return new Date(now + 3 * 3_600_000);
  if (raw === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now)
    throw httpError(400, 'Snooze target must be a future time');
  return parsed;
}

export async function snoozeInboxItem(
  db: Database,
  userId: string,
  orgId: string,
  source: InboxSource,
  refId: string,
  untilRaw: string
): Promise<{ snoozedUntil: string }> {
  if (source === 'task') throw httpError(400, 'Tasks are dismiss-only (no snooze)');
  const until = resolveSnoozeUntil(untilRaw);
  if (source === 'notification') {
    await verifyNotification(db, refId, userId, orgId);
    await db.update(notifications).set({ snoozedUntil: until }).where(eq(notifications.id, refId));
  } else if (source === 'dm') {
    await verifyChannelMembership(db, refId, userId, orgId);
    await upsertState(db, userId, 'dm', refId, { snoozedUntil: until });
  } else {
    await verifyLinkOrg(db, refId, orgId);
    await upsertState(db, userId, 'git', refId, { snoozedUntil: until });
  }
  return { snoozedUntil: until.toISOString() };
}

export async function archiveInboxItem(
  db: Database,
  userId: string,
  orgId: string,
  source: InboxSource,
  refId: string
): Promise<{ archived: true }> {
  const now = new Date();
  if (source === 'notification') {
    await verifyNotification(db, refId, userId, orgId);
    await bulkArchive(db, [refId], userId, orgId);
  } else if (source === 'dm') {
    await verifyChannelMembership(db, refId, userId, orgId);
    await markChannelRead(db, refId, orgId, userId);
    await upsertState(db, userId, 'dm', refId, { dismissedAt: now });
  } else if (source === 'task') {
    await verifyCardOrg(db, refId, orgId);
    await upsertState(db, userId, 'task', refId, { dismissedAt: now });
  } else {
    await verifyLinkOrg(db, refId, orgId);
    await upsertState(db, userId, 'git', refId, { dismissedAt: now });
  }
  return { archived: true };
}

export async function undoInboxItem(
  db: Database,
  userId: string,
  orgId: string,
  source: InboxSource,
  refId: string
): Promise<{ undone: true }> {
  if (source === 'notification') {
    await verifyNotification(db, refId, userId, orgId);
    await bulkUnarchive(db, [refId], userId, orgId);
  } else {
    if (source === 'dm') await verifyChannelMembership(db, refId, userId, orgId);
    else if (source === 'task') await verifyCardOrg(db, refId, orgId);
    else await verifyLinkOrg(db, refId, orgId);
    await db
      .delete(inboxItemState)
      .where(
        and(
          eq(inboxItemState.userId, userId),
          eq(inboxItemState.source, source),
          eq(inboxItemState.refId, refId)
        )
      );
  }
  return { undone: true };
}
