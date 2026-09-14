import { eq, and, isNull, max, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  lists,
  boards,
  cards,
  cardAssignees,
  cardParticipants,
  cardWatchers,
  cardLabels,
  cardSprints,
  cardPhase,
  timeLogs,
  comments,
  attachments,
  checklists,
  checklistItems,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { cachedBoardRead, bumpBoardCache, bumpCardCache } from '../../lib/cache';

export interface CreateListInput {
  boardId: string;
  name: string;
  position?: number;
}

async function verifyBoardAccess(db: Database, boardId: string, organizationId: string) {
  // Existence check only — fetch minimal columns (callers ignore the row).
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.organizationId, organizationId)))
    .limit(1);

  if (!board) throw httpError(404, 'Board not found or access denied');
  return board;
}

export async function createList(db: Database, organizationId: string, input: CreateListInput) {
  await verifyBoardAccess(db, input.boardId, organizationId);

  let position = input.position;

  if (position === undefined) {
    // Append to end: max position + 65536
    const [result] = await db
      .select({ maxPos: max(lists.position) })
      .from(lists)
      .where(eq(lists.boardId, input.boardId));

    position = (result?.maxPos ?? 0) + 65536;
  }

  const [list] = await db
    .insert(lists)
    .values({
      boardId: input.boardId,
      name: input.name,
      position,
    })
    .returning();

  if (!list) throw httpError(500, 'Failed to create list');
  eventBus.broadcast(`board:${list.boardId}`, 'list.created', list);
  await bumpBoardCache(list.boardId);
  return list;
}

export async function listLists(db: Database, boardId: string, organizationId: string) {
  await verifyBoardAccess(db, boardId, organizationId);

  const { data } = await cachedBoardRead(boardId, 'lists', 'lists', () =>
    db
      .select()
      .from(lists)
      .where(and(eq(lists.boardId, boardId), eq(lists.isArchived, false), isNull(lists.deletedAt)))
      .orderBy(lists.position)
  );
  return data;
}

export async function updateList(
  db: Database,
  id: string,
  organizationId: string,
  input: { name?: string; position?: number; isArchived?: boolean }
) {
  // We need to verify that this list belongs to a board in the user's org
  const [existingList] = await db
    .select({ listId: lists.id, boardId: lists.boardId })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(lists.id, id), eq(boards.organizationId, organizationId)))
    .limit(1);

  if (!existingList) throw httpError(404, 'List not found');

  const [updatedList] = await db
    .update(lists)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(lists.id, id))
    .returning();

  eventBus.broadcast(`board:${existingList.boardId}`, 'list.updated', updatedList);
  await bumpBoardCache(existingList.boardId);
  // getCard caches listName under cv — rename must bump member cards.
  if (input.name !== undefined && input.name !== undefined) {
    const memberCards = await db.select({ id: cards.id }).from(cards).where(eq(cards.listId, id));
    await Promise.all(memberCards.map((c) => bumpCardCache(c.id)));
  }
  return updatedList;
}

export async function deleteList(db: Database, id: string, organizationId: string) {
  const [existingList] = await db
    .select({ listId: lists.id, boardId: lists.boardId })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(lists.id, id), eq(boards.organizationId, organizationId)))
    .limit(1);

  if (!existingList) throw httpError(404, 'List not found');

  // Find all cards inside this list
  const cardRows = await db.select({ id: cards.id }).from(cards).where(eq(cards.listId, id));
  const cardIds = cardRows.map((c) => c.id);

  if (cardIds.length > 0) {
    // Delete all child card associations — independent tables, run concurrently.
    await Promise.all([
      db.delete(cardAssignees).where(inArray(cardAssignees.cardId, cardIds)),
      db.delete(cardParticipants).where(inArray(cardParticipants.cardId, cardIds)),
      db.delete(cardWatchers).where(inArray(cardWatchers.cardId, cardIds)),
      db.delete(cardLabels).where(inArray(cardLabels.cardId, cardIds)),
      db.delete(cardSprints).where(inArray(cardSprints.cardId, cardIds)),
      db.delete(cardPhase).where(inArray(cardPhase.cardId, cardIds)),
      db.delete(timeLogs).where(inArray(timeLogs.cardId, cardIds)),
      db.delete(comments).where(inArray(comments.cardId, cardIds)),
      db.delete(attachments).where(inArray(attachments.cardId, cardIds)),
    ]);

    // Checklists & Checklist Items
    const checklistRows = await db
      .select({ id: checklists.id })
      .from(checklists)
      .where(inArray(checklists.cardId, cardIds));
    const checklistIds = checklistRows.map((cl) => cl.id);
    if (checklistIds.length > 0) {
      // Sequential: items reference checklists via FK — parent must go last.
      await db.delete(checklistItems).where(inArray(checklistItems.checklistId, checklistIds));
      await db.delete(checklists).where(inArray(checklists.id, checklistIds));
    }

    // Delete subtasks and parent cards
    await db.delete(cards).where(inArray(cards.id, cardIds));
  }

  const [deletedList] = await db.delete(lists).where(eq(lists.id, id)).returning();

  eventBus.broadcast(`board:${existingList.boardId}`, 'list.deleted', deletedList);
  await bumpBoardCache(existingList.boardId);
  // Cascaded card deletes leave cv payloads stale — bump them (TTL bounds the rest).
  if (cardIds.length > 0) {
    await Promise.all(cardIds.map((cid) => bumpCardCache(cid)));
  }
  return deletedList;
}
