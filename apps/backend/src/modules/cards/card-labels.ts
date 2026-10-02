import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../db/index';
import { labels, boards, cardLabels } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { cachedBoardRead, bumpBoardCache, bumpCardCache } from '../../lib/cache';
import { eventBus } from '../../lib/event-bus';
import {
  isValidUuid,
  verifyCardAccess,
  getBoardIdForCard,
  bumpForCard,
  logCardHistory,
} from './card-helpers';

/** Tenant gate for board-scoped label reads/writes. */
export async function verifyBoardOrg(db: Database, boardId: string, organizationId: string) {
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.organizationId, organizationId)))
    .limit(1);
  if (!board) throw httpError(404, 'Board not found or access denied');
  return board;
}

/** Tenant gate for labelId-keyed routes (labels → board → org join). */
export async function verifyLabelAccess(db: Database, labelId: string, organizationId: string) {
  const [row] = await db
    .select({ boardId: labels.boardId })
    .from(labels)
    .innerJoin(boards, eq(boards.id, labels.boardId))
    .where(and(eq(labels.id, labelId), eq(boards.organizationId, organizationId)))
    .limit(1);
  if (!row) throw httpError(404, 'Label not found or access denied');
  return row;
}

export async function getBoardLabels(db: Database, boardId: string, organizationId: string) {
  await verifyBoardOrg(db, boardId, organizationId);
  const { data } = await cachedBoardRead(boardId, `${organizationId}:labels`, 'labels', () =>
    db.select().from(labels).where(eq(labels.boardId, boardId)).orderBy(labels.name)
  );
  return data;
}

export async function createBoardLabel(
  db: Database,
  boardId: string,
  organizationId: string,
  name: string,
  color: string
) {
  await verifyBoardOrg(db, boardId, organizationId);
  const [newLabel] = await db.insert(labels).values({ boardId, name, color }).returning();
  await bumpBoardCache(boardId);
  return newLabel;
}

export async function updateBoardLabel(
  db: Database,
  labelId: string,
  organizationId: string,
  name?: string,
  color?: string
) {
  await verifyLabelAccess(db, labelId, organizationId);
  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (color !== undefined) updateData.color = color;
  if (Object.keys(updateData).length === 0) throw httpError(400, 'Nothing to update');
  const [updated] = await db
    .update(labels)
    .set(updateData)
    .where(eq(labels.id, labelId))
    .returning();
  if (!updated) throw httpError(404, 'Label not found');
  // Label rename/recolor is embedded in listCards (bv) and getCard (cv) — bump both.
  await bumpBoardCache(updated.boardId);
  const attached = await db
    .select({ cardId: cardLabels.cardId })
    .from(cardLabels)
    .where(eq(cardLabels.labelId, labelId));
  await Promise.all(attached.map((r) => bumpCardCache(r.cardId)));
  return updated;
}

export async function deleteBoardLabel(db: Database, labelId: string, organizationId: string) {
  await verifyLabelAccess(db, labelId, organizationId);
  const [existing] = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
  const attached = await db
    .select({ cardId: cardLabels.cardId })
    .from(cardLabels)
    .where(eq(cardLabels.labelId, labelId));
  // Remove from cards first (cascade FK)
  await db.delete(cardLabels).where(eq(cardLabels.labelId, labelId));
  await db.delete(labels).where(eq(labels.id, labelId));
  if (existing) await bumpBoardCache(existing.boardId);
  await Promise.all(attached.map((r) => bumpCardCache(r.cardId)));
}

export async function getCardLabels(db: Database, cardId: string, organizationId: string) {
  if (!isValidUuid(cardId)) return [];
  await verifyCardAccess(db, cardId, organizationId);
  return db
    .select({ label: labels })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .where(eq(cardLabels.cardId, cardId));
}

export async function attachLabelToCard(
  db: Database,
  cardId: string,
  organizationId: string,
  labelId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(labelId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or labelId' };
  }
  await verifyCardAccess(db, cardId, organizationId);
  await db.insert(cardLabels).values({ cardId, labelId }).onConflictDoNothing();
  const boardId = await getBoardIdForCard(db, cardId);
  if (actorId) {
    const [label] = await db
      .select({ name: labels.name })
      .from(labels)
      .where(eq(labels.id, labelId))
      .limit(1);
    await logCardHistory(db, cardId, actorId, `🏷️ Added label **${label?.name || 'label'}**`);
  }
  if (boardId) {
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.labeled',
        payload: { cardId, labelId, boardId, eventId: randomUUID() },
        actorId: actorId || 'system',
        organizationId: board.organizationId,
      });
    }
  }
  await bumpForCard(db, cardId);
  return { success: true };
}

export async function removeLabelFromCard(
  db: Database,
  cardId: string,
  organizationId: string,
  labelId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(labelId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or labelId' };
  }
  await verifyCardAccess(db, cardId, organizationId);
  const [label] = actorId
    ? await db.select({ name: labels.name }).from(labels).where(eq(labels.id, labelId)).limit(1)
    : [];
  await db
    .delete(cardLabels)
    .where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, labelId)));
  if (actorId) {
    await logCardHistory(db, cardId, actorId, `🏷️ Removed label **${label?.name || 'label'}**`);
  }
  await bumpForCard(db, cardId);
  return { success: true };
}
