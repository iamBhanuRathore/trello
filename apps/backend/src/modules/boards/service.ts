import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  boards,
  lists,
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
  labels,
  boardMembers,
  automations,
  intakeForms,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import {
  cachedBoardRead,
  cachedProjectRead,
  bumpBoardCache,
  bumpProjectCache,
  bumpOrgCache,
} from '../../lib/cache';

export interface CreateBoardInput {
  organizationId: string;
  projectId: string;
  name: string;
  background?: string;
}

export async function createBoard(db: Database, input: CreateBoardInput) {
  const [board] = await db
    .insert(boards)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      name: input.name,
      background: input.background,
    })
    .returning();

  await bumpProjectCache(input.projectId);
  await bumpOrgCache(input.organizationId);
  return board;
}

export async function listBoards(db: Database, projectId: string, organizationId: string) {
  const { data } = await cachedProjectRead(
    projectId,
    `boards:${organizationId}`,
    'boards',
    () =>
      db
        .select()
        .from(boards)
        .where(
          and(
            eq(boards.projectId, projectId),
            eq(boards.organizationId, organizationId),
            eq(boards.isArchived, false),
            isNull(boards.deletedAt)
          )
        )
        .orderBy(boards.createdAt),
    60
  );
  return data;
}

export async function getBoard(db: Database, id: string, organizationId: string) {
  const { data } = await cachedBoardRead(id, `board:${organizationId}`, 'board', async () => {
    const [board] = await db
      .select()
      .from(boards)
      .where(
        and(eq(boards.id, id), eq(boards.organizationId, organizationId), isNull(boards.deletedAt))
      )
      .limit(1);

    if (!board) throw httpError(404, 'Board not found');
    return board;
  });
  return data;
}

export async function updateBoard(
  db: Database,
  id: string,
  organizationId: string,
  input: { name?: string; background?: string }
) {
  const [board] = await db
    .update(boards)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(eq(boards.id, id), eq(boards.organizationId, organizationId), isNull(boards.deletedAt))
    )
    .returning();

  if (!board) throw httpError(404, 'Board not found');
  await bumpBoardCache(id);
  await bumpProjectCache(board.projectId);
  await bumpOrgCache(organizationId);
  return board;
}

export async function archiveBoard(db: Database, id: string, organizationId: string) {
  const [board] = await db
    .update(boards)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(
      and(eq(boards.id, id), eq(boards.organizationId, organizationId), isNull(boards.deletedAt))
    )
    .returning();

  if (!board) throw httpError(404, 'Board not found');
  await bumpBoardCache(id);
  await bumpProjectCache(board.projectId);
  await bumpOrgCache(organizationId);
  return board;
}

// Soft delete to 30-day Trash
export async function deleteBoard(db: Database, id: string, organizationId: string) {
  const [board] = await db
    .update(boards)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(boards.id, id), eq(boards.organizationId, organizationId), isNull(boards.deletedAt))
    )
    .returning();

  if (!board) throw httpError(404, 'Board not found');
  await bumpBoardCache(id);
  await bumpProjectCache(board.projectId);
  await bumpOrgCache(organizationId);
  return board;
}

// Hard delete for permanent purge
export async function hardDeleteBoard(db: Database, id: string, organizationId: string) {
  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, id), eq(boards.organizationId, organizationId)))
    .limit(1);

  if (!board) throw httpError(404, 'Board not found');

  // 1. Find all lists in this board
  const listRows = await db.select({ id: lists.id }).from(lists).where(eq(lists.boardId, id));
  const listIds = listRows.map((l) => l.id);

  if (listIds.length > 0) {
    // Find all cards across all lists in this board
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inArray(cards.listId, listIds));
    const cardIds = cardRows.map((c) => c.id);

    if (cardIds.length > 0) {
      // Delete all card associations — independent tables, run concurrently.
      // (cards themselves are deleted after, sequentially, due to FK.)
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

      // Checklists & Items
      const checklistRows = await db
        .select({ id: checklists.id })
        .from(checklists)
        .where(inArray(checklists.cardId, cardIds));
      const checklistIds = checklistRows.map((cl) => cl.id);
      if (checklistIds.length > 0) {
        await db.delete(checklistItems).where(inArray(checklistItems.checklistId, checklistIds));
        await db.delete(checklists).where(inArray(checklists.id, checklistIds));
      }

      // Delete subtasks and parent cards
      await db.delete(cards).where(inArray(cards.id, cardIds));
    }

    // Delete lists
    await db.delete(lists).where(inArray(lists.id, listIds));
  }

  // 2. Delete board-level modules: labels, members, automations, intake forms.
  // Independent tables — run concurrently (board record goes last).
  await Promise.all([
    db.delete(labels).where(eq(labels.boardId, id)),
    db.delete(boardMembers).where(eq(boardMembers.boardId, id)),
    db.delete(automations).where(eq(automations.boardId, id)),
    db.delete(intakeForms).where(eq(intakeForms.boardId, id)),
  ]);

  // 3. Delete the board record
  const [deletedBoard] = await db
    .delete(boards)
    .where(and(eq(boards.id, id), eq(boards.organizationId, organizationId)))
    .returning();

  await bumpBoardCache(id);
  if (board.projectId) await bumpProjectCache(board.projectId);
  await bumpOrgCache(organizationId);
  return deletedBoard;
}
