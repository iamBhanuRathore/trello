import type { Database } from '../../db';
import {
  notifications,
  notificationPreferences,
  organizationMembers,
  pushDevices,
  users,
  cards,
  lists,
  boards,
  chatChannels,
} from '../../db/schema';
import { eq, and, or, desc, inArray, count, lt, lte, sql, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { eventBus } from '../../lib/event-bus';
import { logger } from '../../lib/logger';
import { cachedTTL, invalidateTTL } from '../../lib/cache';
import { sendThreadedCardEmail } from '../inbound/threading';

// ─── Notification Center: filter vocabulary ──────────────────────────────────

/** Event types that auto-qualify an unread row as important (hybrid rule). */
export const IMPORTANT_EVENT_TYPES = [
  'card.mentioned',
  'card.assigned',
  'card.due_soon',
  'card.overdue',
  'chat.mentioned',
  'review.requested',
] as const;

/** Event types accepted by the `types[]` list filter. */
export const FILTERABLE_EVENT_TYPES = [
  'card.mentioned',
  'card.assigned',
  'card.commented',
  'card.due_soon',
  'card.overdue',
  'chat.mentioned',
  'review.requested',
] as const;

export type NotificationArchivedFilter = 'exclude' | 'only' | 'include';

export interface ListNotificationsOptions {
  limit?: number;
  /** Opaque keyset cursor from a previous page (`createdAt|id`, base64url). */
  cursor?: string | null;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  importantOnly?: boolean;
  archived?: NotificationArchivedFilter;
  types?: string[];
  /** Substring search over the precomputed search_text column. */
  q?: string;
}

export interface NotificationPage {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
}

/** Server-computed hybrid importance: starred, or unread + actionable type. */
export function computeIsImportant(row: {
  isStarred?: boolean | null;
  isRead?: boolean | null;
  eventType?: string | null;
}): boolean {
  if (row.isStarred) return true;
  if (row.isRead) return false;
  return (IMPORTANT_EVENT_TYPES as readonly string[]).includes(row.eventType ?? '');
}

function withImportance<
  T extends { isStarred?: boolean | null; isRead?: boolean | null; eventType?: string | null },
>(row: T): T & { isImportant: boolean } {
  return { ...row, isImportant: computeIsImportant(row) };
}

/** Escape LIKE wildcards so user search text matches literally. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(`${iso}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('|');
    if (sep < 0) return null;
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Strip markdown formatting down to plain readable text. */
export function stripMarkdown(input: string): string {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(`{1,3})([^`]*)\1/g, '$2')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lowercased search blob mirroring the `search_text` column (and the 0034
 * backfill). Keep the field list in sync in both places.
 */
export function buildSearchText(payload: Record<string, unknown>, eventType: string): string {
  const pick = (v: unknown) => (typeof v === 'string' ? v : '');
  return [
    pick(payload['cardTitle']),
    pick(payload['cardKey']),
    pick(payload['boardTitle']),
    pick(payload['actorName']),
    pick(payload['commentText']),
    pick(payload['commentSnippet']),
    pick(payload['messagePreview']),
    eventType,
  ]
    .join(' ')
    .toLowerCase();
}

/** Plain-text snippet for list rows — truncated server-side. */
export function buildSnippet(payload: Record<string, unknown>, maxLen = 200): string {
  const raw =
    (typeof payload['commentText'] === 'string' && payload['commentText']) ||
    (typeof payload['commentSnippet'] === 'string' && payload['commentSnippet']) ||
    (typeof payload['messagePreview'] === 'string' && payload['messagePreview']) ||
    (typeof payload['cardTitle'] === 'string' && payload['cardTitle']) ||
    '';
  const plain = stripMarkdown(raw);
  return plain.length > maxLen ? `${plain.slice(0, maxLen - 1).trimEnd()}…` : plain;
}

// ─── Service Functions ───────────────────────────────────────────────────────

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 30;

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIST_LIMIT);
}

async function invalidateInbox(userId: string, organizationId: string): Promise<void> {
  await invalidateTTL(`n:${userId}:${organizationId}`);
  await invalidateTTL(unreadCountKey(userId, organizationId));
}

/**
 * Paginated, filterable inbox list. Keyset on (createdAt, id) so inserts
 * during scrolling neither duplicate nor skip rows.
 */
export async function listNotifications(
  db: Database,
  userId: string,
  organizationId: string,
  opts: ListNotificationsOptions = {}
): Promise<NotificationPage> {
  const limit = clampLimit(opts.limit);
  const archived = opts.archived ?? 'exclude';

  const conditions: SQL[] = [
    eq(notifications.userId, userId),
    eq(notifications.organizationId, organizationId),
  ];
  if (archived === 'exclude') conditions.push(sql`${notifications.archivedAt} IS NULL`);
  else if (archived === 'only') conditions.push(sql`${notifications.archivedAt} IS NOT NULL`);
  // Snoozed rows hide until they resurface (4.6a).
  conditions.push(
    or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, new Date()))!
  );
  if (opts.unreadOnly) conditions.push(eq(notifications.isRead, false));
  if (opts.starredOnly) conditions.push(eq(notifications.isStarred, true));
  if (opts.importantOnly) {
    conditions.push(
      or(
        eq(notifications.isStarred, true),
        and(
          eq(notifications.isRead, false),
          inArray(notifications.eventType, [...IMPORTANT_EVENT_TYPES])
        )
      )!
    );
  }
  if (opts.types && opts.types.length > 0) {
    const valid = opts.types.filter((t) =>
      (FILTERABLE_EVENT_TYPES as readonly string[]).includes(t)
    );
    if (valid.length === 0) return { items: [], nextCursor: null };
    conditions.push(inArray(notifications.eventType, valid));
  }
  const q = typeof opts.q === 'string' ? opts.q.trim().slice(0, 100) : '';
  if (q.length >= 2) {
    conditions.push(
      sql`${notifications.searchText} LIKE ${`%${escapeLikeTerm(q.toLowerCase())}%`} ESCAPE '\\'`
    );
  }
  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      conditions.push(
        or(
          lt(notifications.createdAt, decoded.createdAt),
          and(eq(notifications.createdAt, decoded.createdAt), lt(notifications.id, decoded.id))
        )!
      );
    }
  }

  // Filters are user-controlled — bypass the short-TTL list cache.
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1] as { createdAt?: Date; id?: string } | undefined;
  const nextCursor =
    hasMore && last?.createdAt && last?.id ? encodeCursor(last.createdAt, last.id) : null;
  return { items: page.map((r) => withImportance(r as Record<string, unknown>)), nextCursor };
}

/**
 * Needs-action strip: newest unread important rows + total count, independent
 * of the list query so it spans all pages.
 */
export async function getNeedsAction(
  db: Database,
  userId: string,
  organizationId: string,
  limit = 5
): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  const safeLimit = clampLimit(limit);
  const important = or(
    eq(notifications.isStarred, true),
    and(
      eq(notifications.isRead, false),
      inArray(notifications.eventType, [...IMPORTANT_EVENT_TYPES])
    )
  )!;
  const base = and(
    eq(notifications.userId, userId),
    eq(notifications.organizationId, organizationId),
    sql`${notifications.archivedAt} IS NULL`,
    important
  );
  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(base)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(safeLimit),
    db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
          sql`${notifications.archivedAt} IS NULL`,
          eq(notifications.isRead, false),
          inArray(notifications.eventType, [...IMPORTANT_EVENT_TYPES])
        )
      ),
  ]);
  return {
    items: items.map((r) => withImportance(r as Record<string, unknown>)),
    total: totalRows[0]?.n ?? 0,
  };
}

export function unreadCountKey(userId: string, organizationId: string): string {
  return `n:unread:${userId}:${organizationId}`;
}

/** Cheap badge count — excludes archived rows the user can't see. */
export async function getUnreadCount(
  db: Database,
  userId: string,
  organizationId: string
): Promise<number> {
  const { data } = await cachedTTL(unreadCountKey(userId, organizationId), 15, async () => {
    const [row] = await db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
          eq(notifications.isRead, false),
          sql`${notifications.archivedAt} IS NULL`
        )
      );
    return { n: row?.n ?? 0 };
  });
  return (data as { n: number }).n;
}

/**
 * Payload enrichment for rich inbox rows (actor, task, board, channel names).
 * Read-only lookups, best-effort — a miss returns what it has, never throws,
 * so enrichment can never break fan-out. Shared by the event listener and the
 * direct-insert mention path in cards/service.ts.
 */
export async function enrichNotificationPayload(
  db: Database,
  input: { actorId?: string | null; cardId?: string | null; channelId?: string | null }
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  try {
    if (input.actorId) {
      const [actor] = await db
        .select({ name: users.name, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, input.actorId))
        .limit(1);
      out.actorName = actor?.name ?? null;
      out.actorAvatarUrl = actor?.avatarUrl ?? null;
    }
    if (input.cardId) {
      const [card] = await db
        .select({
          title: cards.title,
          key: cards.key,
          boardId: lists.boardId,
          boardName: boards.name,
        })
        .from(cards)
        .innerJoin(lists, eq(lists.id, cards.listId))
        .innerJoin(boards, eq(boards.id, lists.boardId))
        .where(eq(cards.id, input.cardId))
        .limit(1);
      out.cardTitle = card?.title ?? null;
      out.cardKey = card?.key ?? null;
      out.boardId = card?.boardId ?? null;
      out.boardTitle = card?.boardName ?? null;
    }
    if (input.channelId) {
      const [channel] = await db
        .select({ name: chatChannels.name, type: chatChannels.type })
        .from(chatChannels)
        .where(eq(chatChannels.id, input.channelId))
        .limit(1);
      out.channelName = channel?.name ?? null;
      out.channelType = channel?.type ?? null;
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'Notification payload enrichment failed');
  }
  return out;
}

export async function markAsRead(
  db: Database,
  notificationId: string,
  userId: string,
  organizationId?: string
) {
  const conditions: SQL[] = [
    eq(notifications.id, notificationId),
    eq(notifications.userId, userId),
  ];
  if (organizationId) conditions.push(eq(notifications.organizationId, organizationId));
  const res = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(...conditions))
    .returning();
  if (res.length > 0) {
    const orgId = organizationId ?? (res[0] as { organizationId?: string })?.organizationId;
    if (orgId) await invalidateInbox(userId, orgId);
  }
  return res;
}

export async function markUnread(
  db: Database,
  notificationId: string,
  userId: string,
  organizationId?: string
) {
  const conditions: SQL[] = [
    eq(notifications.id, notificationId),
    eq(notifications.userId, userId),
  ];
  if (organizationId) conditions.push(eq(notifications.organizationId, organizationId));
  const res = await db
    .update(notifications)
    .set({ isRead: false, readAt: null })
    .where(and(...conditions))
    .returning();
  if (res.length > 0) {
    const orgId = organizationId ?? (res[0] as { organizationId?: string })?.organizationId;
    if (orgId) await invalidateInbox(userId, orgId);
  }
  return res;
}

export async function setStarred(
  db: Database,
  notificationId: string,
  userId: string,
  organizationId: string,
  starred: boolean
) {
  const res = await db
    .update(notifications)
    .set({ isStarred: starred })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        eq(notifications.organizationId, organizationId)
      )
    )
    .returning();
  if (res.length > 0) await invalidateInbox(userId, organizationId);
  return res;
}

const BULK_CAP = 100;

function capIds(ids: string[]): string[] {
  return [...new Set(ids)].slice(0, BULK_CAP);
}

export async function bulkMarkRead(
  db: Database,
  ids: string[],
  userId: string,
  organizationId: string
): Promise<{ affected: number }> {
  const capped = capIds(ids);
  if (capped.length === 0) return { affected: 0 };
  const res = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        inArray(notifications.id, capped),
        eq(notifications.userId, userId),
        eq(notifications.organizationId, organizationId)
      )
    )
    .returning({ id: notifications.id });
  await invalidateInbox(userId, organizationId);
  return { affected: res.length };
}

/** Archiving also marks read so archived rows never inflate the badge. */
export async function bulkArchive(
  db: Database,
  ids: string[],
  userId: string,
  organizationId: string
): Promise<{ affected: number }> {
  const capped = capIds(ids);
  if (capped.length === 0) return { affected: 0 };
  const res = await db
    .update(notifications)
    .set({ archivedAt: new Date(), isRead: true, readAt: new Date() })
    .where(
      and(
        inArray(notifications.id, capped),
        eq(notifications.userId, userId),
        eq(notifications.organizationId, organizationId),
        sql`${notifications.archivedAt} IS NULL`
      )
    )
    .returning({ id: notifications.id });
  await invalidateInbox(userId, organizationId);
  return { affected: res.length };
}

export async function bulkUnarchive(
  db: Database,
  ids: string[],
  userId: string,
  organizationId: string
): Promise<{ affected: number }> {
  const capped = capIds(ids);
  if (capped.length === 0) return { affected: 0 };
  const res = await db
    .update(notifications)
    .set({ archivedAt: null })
    .where(
      and(
        inArray(notifications.id, capped),
        eq(notifications.userId, userId),
        eq(notifications.organizationId, organizationId),
        sql`${notifications.archivedAt} IS NOT NULL`
      )
    )
    .returning({ id: notifications.id });
  await invalidateInbox(userId, organizationId);
  return { affected: res.length };
}

export async function markAllAsRead(db: Database, userId: string, organizationId: string) {
  const res = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.organizationId, organizationId),
        eq(notifications.isRead, false),
        sql`${notifications.archivedAt} IS NULL`
      )
    )
    .returning();
  await invalidateInbox(userId, organizationId);
  return res;
}

export async function getPreferences(db: Database, userId: string, organizationId: string) {
  const { data } = await cachedTTL(`npref:${userId}:${organizationId}`, 60, () =>
    db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.organizationId, organizationId)
        )
      )
  );
  return data;
}

export async function updatePreferences(
  db: Database,
  userId: string,
  organizationId: string,
  preferences: Array<{
    eventType: string;
    channel: 'in_app' | 'email' | 'push';
    frequency: 'instant' | 'digest_daily' | 'digest_weekly' | 'off';
    quietHoursStart?: number | null;
    quietHoursEnd?: number | null;
  }>
) {
  // Each upsert is independent — run concurrently, preserve input order.
  // (Was sequential N round-trips for N preferences.)
  const results = await Promise.all(
    preferences.map((pref) =>
      db
        .insert(notificationPreferences)
        .values({
          userId,
          organizationId,
          eventType: pref.eventType,
          channel: pref.channel,
          frequency: pref.frequency,
          quietHoursStart: pref.quietHoursStart,
          quietHoursEnd: pref.quietHoursEnd,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.userId,
            notificationPreferences.organizationId,
            notificationPreferences.eventType,
            notificationPreferences.channel,
          ],
          set: {
            frequency: pref.frequency,
            quietHoursStart: pref.quietHoursStart,
            quietHoursEnd: pref.quietHoursEnd,
          },
        })
        .returning()
        .then(([updated]) => updated)
    )
  );
  await invalidateTTL(`npref:${userId}:${organizationId}`);
  return results;
}

// ─── Event Handling ──────────────────────────────────────────────────────────

export function setupNotificationListeners(db: Database) {
  eventBus.on(
    'internal',
    async (data: { event: string; payload: unknown; actorId: string; organizationId: string }) => {
      const { event, actorId, organizationId } = data;
      const payload = data.payload as {
        cardId?: string;
        commentText?: string;
        assigneeId?: string;
      };
      try {
        if (event === 'card.commented' || event === 'card.assigned' || event === 'chat.mentioned') {
          const { cardId, commentText } = payload;

          // For card.assigned, only notify the assignee — not the entire org
          let usersToNotify: string[];
          if (event === 'card.assigned') {
            usersToNotify =
              payload.assigneeId && payload.assigneeId !== actorId ? [payload.assigneeId] : [];
          } else if (event === 'chat.mentioned') {
            // Chat @mentions: only the tagged members — never the author
            const ids = (payload as any).mentionedUserIds;
            usersToNotify = Array.isArray(ids) ? ids.filter((id) => id !== actorId) : [];
          } else {
            // card.commented: notify all org members except actor
            const members = await db
              .select({ userId: organizationMembers.userId })
              .from(organizationMembers)
              .where(eq(organizationMembers.organizationId, organizationId));
            usersToNotify = members.map((m) => m.userId).filter((id) => id !== actorId);
          }

          if (usersToNotify.length === 0) return;

          // Enrich once per fan-out (actor/task/board/channel names) so inbox
          // rows render richly without per-row lookups. Best-effort.
          const enriched = await enrichNotificationPayload(db, {
            actorId,
            cardId,
            channelId: (payload as any).channelId,
          });

          // Fetch preferences for these users
          const prefs = await db
            .select()
            .from(notificationPreferences)
            .where(
              and(
                inArray(notificationPreferences.userId, usersToNotify),
                eq(notificationPreferences.organizationId, organizationId),
                eq(notificationPreferences.eventType, event)
              )
            );

          const prefMap = new Map();
          for (const p of prefs) {
            prefMap.set(`${p.userId}-${p.channel}`, p);
          }

          const notifData = [];
          const currentHour = new Date().getHours();

          for (const userId of usersToNotify) {
            // Check DND for Email
            const emailPref = prefMap.get(`${userId}-email`);
            let isDispatched = false;
            let suppressInstantEmail = false;

            if (emailPref) {
              if (emailPref.frequency === 'off') {
                suppressInstantEmail = true;
                isDispatched = true; // Technically handled
              } else if (
                emailPref.frequency === 'digest_daily' ||
                emailPref.frequency === 'digest_weekly'
              ) {
                suppressInstantEmail = true;
                isDispatched = false; // Let the cron handle it
              } else if (emailPref.frequency === 'instant') {
                // Check DND
                const start = emailPref.quietHoursStart;
                const end = emailPref.quietHoursEnd;
                if (start !== null && end !== null && start !== undefined && end !== undefined) {
                  // If current time falls in DND window
                  if (start <= end && currentHour >= start && currentHour < end)
                    suppressInstantEmail = true;
                  if (start > end && (currentHour >= start || currentHour < end))
                    suppressInstantEmail = true;
                }
                if (!suppressInstantEmail) {
                  isDispatched = true; // We will send it right now
                  logger.info({ event, userId }, 'Sending instant email');
                  // Card mail is the entry point of the email->comment loop: it
                  // replies through the card's inbound capability (4.6b). Best
                  // effort — a mail failure must not break the fan-out.
                  if (cardId && event === 'card.commented') {
                    void sendThreadedCardEmail(db, {
                      organizationId,
                      cardId,
                      recipientUserId: userId,
                      actorId,
                      commentText,
                      event: 'card.commented',
                    }).catch((err: unknown) =>
                      logger.warn(
                        { err: err instanceof Error ? err.message : String(err), userId },
                        'Threaded card email failed'
                      )
                    );
                  }
                } else {
                  isDispatched = false; // Queue it because of DND
                }
              }
            } else {
              // Default behavior if no pref: instant, no DND
              isDispatched = true;
              logger.info({ event, userId }, 'Sending instant email (default prefs)');
            }

            const payloadOut = {
              cardId,
              commentText,
              actorId,
              channelId: (payload as any).channelId,
              messageId: (payload as any).messageId,
              messagePreview: (payload as any).messagePreview,
              ...enriched,
            };
            notifData.push({
              userId,
              organizationId,
              eventType: event,
              payload: payloadOut,
              searchText: buildSearchText(payloadOut as Record<string, unknown>, event),
              isDispatched,
            });
          }

          if (notifData.length > 0) {
            const inserted = await db.insert(notifications).values(notifData).returning({
              id: notifications.id,
              userId: notifications.userId,
            });
            // Live inbox bump per recipient (fire-and-forget; broadcast never rejects).
            // The TTL drops were awaited one recipient at a time, so a fan-out to
            // N members cost N serial Redis round trips before this event could
            // finish. Broadcast stays fire-and-forget; the drops go together.
            for (const row of inserted) {
              void eventBus.broadcast(`user:inbox:${row.userId}`, 'notifications:new', {
                id: row.id,
                eventType: event,
              });
            }
            await Promise.all(
              inserted.map((row) => invalidateTTL(unreadCountKey(row.userId, organizationId)))
            );
          }
        }
      } catch (err) {
        logger.error({ err, event }, 'Error processing notification event');
      }
    }
  );
}

// ─── Mobile Push Devices ─────────────────────────────────────────────────────

export async function registerPushDevice(
  db: Database,
  userId: string,
  organizationId: string,
  input: {
    platform?: string;
    token: string;
    deviceName?: string;
  }
) {
  const [existing] = await db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.token, input.token))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(pushDevices)
      .set({
        userId,
        organizationId,
        platform: input.platform || existing.platform,
        deviceName: input.deviceName || existing.deviceName,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(pushDevices.id, existing.id))
      .returning();
    await invalidateTTL(`push:${userId}`);
    return updated!;
  }

  const [created] = await db
    .insert(pushDevices)
    .values({
      userId,
      organizationId,
      platform: input.platform || 'ios',
      token: input.token,
      deviceName: input.deviceName || null,
      isActive: true,
    })
    .returning();

  await invalidateTTL(`push:${userId}`);
  return created!;
}

export async function unregisterPushDevice(db: Database, userId: string, token: string) {
  const [deleted] = await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)))
    .returning();

  await invalidateTTL(`push:${userId}`);
  return { success: !!deleted };
}

export async function getUserPushDevices(db: Database, userId: string) {
  const { data } = await cachedTTL(`push:${userId}`, 60, () =>
    db
      .select()
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)))
  );
  return data;
}

export async function dispatchPushNotification(
  db: Database,
  userId: string,
  title: string,
  body: string,
  _data?: Record<string, unknown>
) {
  const devices = await getUserPushDevices(db, userId);
  const results = [];

  for (const dev of devices) {
    // Simulated Expo / FCM push dispatch
    logger.info(
      { platform: dev.platform, deviceId: dev.id, title, body },
      'Push notification dispatched'
    );
    results.push({
      deviceId: dev.id,
      platform: dev.platform,
      status: 'sent',
    });
  }

  return results;
}
