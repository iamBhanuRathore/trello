import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
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
  //
  // The renumbering is ONE set-based UPDATE. It used to issue a separate UPDATE
  // per card inside the open transaction, so a large list meant thousands of
  // round trips while holding the transaction (and a pooled connection) open for
  // all of them. The id→position mapping travels as a bound VALUES list, so the
  // numbering, the version bumps and the single-writer snapshot are unchanged.
  type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
  return await db.transaction(async (tx: Tx) => {
    const rows = await (tx as unknown as Database)
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.listId, listId), eq(cards.isArchived, false), isNull(cards.deletedAt)))
      .orderBy(cards.position, cards.id);
    if (rows.length === 0) return 0;

    const client = tx as unknown as Database;
    const values = rows.map(
      (row, i) => sql`(${row.id}::uuid, ${(i + 1) * REBALANCE_SPACING}::float8)`
    );

    await client
      .update(cards)
      .set({
        position: sql`(SELECT v.pos FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, pos) WHERE v.id = ${cards.id})`,
        version: sql`${cards.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          cards.id,
          rows.map((r) => r.id)
        )
      );

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
  // verifyListAccess already resolves the destination board; its return value was
  // discarded and the same board was re-queried later via cards ⋈ lists.
  const destination = await verifyListAccess(db, newListId, organizationId);
  const destinationBoardId = destination.boardId;

  // Source list for the move-history entry. Best-effort provenance: the read
  // and the guarded write below aren't atomic, but a lost race surfaces as
  // 409/404 (no history written), and only the winning writer logs — so the
  // recorded "from" is always a list the card actually left.
  const [previous] = await db
    .select({
      listId: cards.listId,
      listName: lists.name,
      // Source board, captured BEFORE the write. After the move the card's board
      // resolves to the destination, so reading it later cannot tell us which
      // board needs invalidating.
      sourceBoardId: lists.boardId,
    })
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
  // Post-move the card's board IS the destination board, so reuse what
  // verifyListAccess already returned instead of re-joining cards ⋈ lists.
  const boardId = destinationBoardId;
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.moved', card);
    eventBus.emit('internal', {
      event: 'card.moved',
      payload: { cardId: id, listId: newListId, boardId, eventId: randomUUID() },
      actorId: actorId || 'system',
      organizationId,
    });
    await bumpBoardCache(boardId);
  }

  // A cross-board move must invalidate BOTH boards. The destination is known
  // now; the source was captured before the write. Previously the source relied
  // on the cached card->board map, which may hold the pre-move board, a stale
  // board, or nothing at all — leaving the source board's list stale for viewers.
  const sourceBoardId = previous?.sourceBoardId ?? null;
  if (sourceBoardId && sourceBoardId !== boardId) {
    await bumpBoardCache(sourceBoardId);
  }

  // Pin the destination board so bumpForCard cannot resolve a stale one.
  await bumpForCard(db, id, boardId ?? null);
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
  // Subtasks are embedded in the parent's cached payload — bump it too, and keep
  // the parent's denormalised counter in step: getCard's subtask query excludes
  // archived cards, so archiving a subtask decrements subtasksTotal.
  if (card.parentCardId) {
    await db
      .update(cards)
      .set({ subtasksTotal: sql`GREATEST(0, ${cards.subtasksTotal} - 1)` })
      .where(and(eq(cards.id, card.parentCardId), eq(cards.organizationId, organizationId)));
    await bumpCardCache(card.parentCardId);
  }
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
