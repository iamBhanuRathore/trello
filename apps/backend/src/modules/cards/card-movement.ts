import { eq, and, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../db/index';
import { cards, lists } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { bumpBoardCache, bumpCardAndBoard, bumpCardCache } from '../../lib/cache';
import { notifyProjectChannels } from '../chat/service';
import {
  verifyListAccess,
  getBoardIdForCard,
  getProjectIdForCard,
  bumpForCard,
  logCardHistory,
} from './card-helpers';

/** Minimum fractional gap before a list is rewritten (precision safety). */
const MIN_POSITION_GAP = 0.001;
const REBALANCE_SPACING = 65536;

export async function rebalanceListPositions(db: Database, listId: string): Promise<number> {
  // Single transaction: snapshot + renumber + bump versions so concurrent
  // movers conflict loudly (409) instead of interleaving with the rewrite.
  type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
  return await db.transaction(async (tx: Tx) => {
    const rows = await (tx as unknown as Database)
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.listId, listId), eq(cards.isArchived, false), isNull(cards.deletedAt)))
      .orderBy(cards.position, cards.id);
    const client = tx as unknown as Database;
    let pos = REBALANCE_SPACING;
    for (const row of rows) {
      await client
        .update(cards)
        .set({ position: pos, version: sql`${cards.version} + 1`, updatedAt: new Date() })
        .where(eq(cards.id, row.id));
      pos += REBALANCE_SPACING;
    }
    return rows.length;
  });
}

async function maybeRebalanceList(db: Database, listId: string): Promise<void> {
  const result = await db
    .execute(
      sql`SELECT MIN(next_pos - pos) AS "minGap" FROM (
        SELECT position AS pos, LEAD(position) OVER (ORDER BY position) AS next_pos
        FROM cards WHERE list_id = ${listId} AND is_archived = false AND deleted_at IS NULL
      ) gaps WHERE next_pos IS NOT NULL`
    )
    .catch(() => null);
  const rows = (result ?? []) as unknown as Array<Record<string, unknown>>;
  const minGap = Number(rows[0]?.['minGap'] ?? Infinity);
  if (Number.isFinite(minGap) && minGap < MIN_POSITION_GAP) {
    await rebalanceListPositions(db, listId);
  }
}

export async function moveCard(
  db: Database,
  id: string,
  organizationId: string,
  newListId: string,
  newPosition: number,
  actorId?: string,
  expectedVersion?: number
) {
  await verifyListAccess(db, newListId, organizationId);

  // Source list for the move-history entry. Best-effort provenance: the read
  // and the guarded write below aren't atomic, but a lost race surfaces as
  // 409/404 (no history written), and only the winning writer logs — so the
  // recorded "from" is always a list the card actually left.
  const [previous] = await db
    .select({ listId: cards.listId, listName: lists.name })
    .from(cards)
    .leftJoin(lists, eq(lists.id, cards.listId))
    .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId)))
    .limit(1)
    .catch(() => [undefined] as any);

  // Optimistic concurrency: when the client sends the version it rendered,
  // the write only lands if nothing moved the card since. Stale writers get
  // 409 + current server truth instead of silently overwriting order.
  const conditions = [eq(cards.id, id), eq(cards.organizationId, organizationId)];
  if (expectedVersion !== undefined) conditions.push(eq(cards.version, expectedVersion));

  const [card] = await db
    .update(cards)
    .set({
      listId: newListId,
      position: newPosition,
      version: sql`${cards.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning();

  if (!card) {
    if (expectedVersion !== undefined) {
      const [current] = await db
        .select({
          id: cards.id,
          listId: cards.listId,
          position: cards.position,
          version: cards.version,
        })
        .from(cards)
        .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId)))
        .limit(1);
      if (!current) throw httpError(404, 'Card not found');
      throw Object.assign(httpError(409, 'Card moved by another session — refetch and retry'), {
        details: { code: 'VERSION_CONFLICT', current },
      });
    }
    throw httpError(404, 'Card not found');
  }
  const boardId = await getBoardIdForCard(db, id);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.moved', card);
    eventBus.emit('internal', {
      event: 'card.moved',
      payload: { cardId: id, listId: newListId, boardId, eventId: randomUUID() },
      actorId: actorId || 'system',
      organizationId,
    });
    // New board always bumped; old board (if different) via cached card->board map.
    await bumpBoardCache(boardId);
  }
  await bumpForCard(db, id);
  // Fractional positions lose precision after ~20 repeated midpoint inserts.
  // One cheap aggregate per move detects crowding; rewrite is transactional.
  await maybeRebalanceList(db, newListId).catch(() => {});
  if (actorId) {
    const [targetList] = await db
      .select({ name: lists.name })
      .from(lists)
      .where(eq(lists.id, newListId))
      .limit(1)
      .catch(() => [null] as any);
    const projectId = await getProjectIdForCard(db, id, organizationId).catch(() => null);
    if (projectId) {
      const label = card.key ? `**${card.key}** ${card.title}` : `**${card.title}**`;
      notifyProjectChannels(
        db,
        organizationId,
        projectId,
        actorId,
        `🔀 ${label} moved to **${targetList?.name || 'another column'}**`
      ).catch(() => {});
    }
    // Persistent per-card move history, rendered as a system pill in the task
    // chat (same convention as the label/assignee/watcher loggers). Only
    // list changes are logged — same-list reorders would drown the feed.
    if (previous?.listId && previous.listId !== newListId) {
      await logCardHistory(
        db,
        id,
        actorId,
        `🔀 Moved from **${previous.listName || 'a column'}** to **${targetList?.name || 'another column'}**`
      );
    }
  }
  return card;
}

export async function archiveCard(
  db: Database,
  id: string,
  organizationId: string,
  actorId?: string
) {
  const [card] = await db
    .update(cards)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId)))
    .returning();

  if (!card) throw httpError(404, 'Card not found');
  const boardId = await getBoardIdForCard(db, id);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.archived', card);
    eventBus.emit('internal', {
      event: 'card.archived',
      payload: { cardId: id, boardId },
      actorId: actorId || 'system',
      organizationId,
    });
  }
  await bumpCardAndBoard(id, boardId ?? null);
  // Subtasks are embedded in the parent's cached payload — bump it too.
  if (card.parentCardId) await bumpCardCache(card.parentCardId);
  if (actorId) {
    const projectId = await getProjectIdForCard(db, id, organizationId).catch(() => null);
    if (projectId) {
      const label = card.key ? `**${card.key}** ${card.title}` : `**${card.title}**`;
      notifyProjectChannels(db, organizationId, projectId, actorId, `🗃️ ${label} archived`).catch(
        () => {}
      );
    }
  }
  return card;
}
