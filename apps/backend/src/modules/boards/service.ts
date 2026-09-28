import { eq, and, isNull, inArray, gt } from 'drizzle-orm';
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
  users,
  stages,
  priorities,
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

export interface BoardFullList {
  id: string;
  boardId: string;
  name: string;
  position: number;
  cards: any[];
}

export interface BoardFull {
  board: typeof boards.$inferSelect;
  lists: BoardFullList[];
}

/**
 * Incremental change feed for reconnect gap-fill: rows in this board with
 * updatedAt after `since` (capped). Clients upsert by id instead of
 * refetching the whole board. Never cached — it is per-cursor by definition.
 */
const CHANGES_LIMIT = 500;

export async function getBoardChanges(
  db: Database,
  boardId: string,
  organizationId: string,
  since: string
) {
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) throw httpError(400, 'Invalid since cursor');

  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(
      and(
        eq(boards.id, boardId),
        eq(boards.organizationId, organizationId),
        isNull(boards.deletedAt)
      )
    )
    .limit(1);
  if (!board) throw httpError(404, 'Board not found or access denied');

  const changedLists = await db
    .select({
      id: lists.id,
      boardId: lists.boardId,
      name: lists.name,
      position: lists.position,
      version: lists.version,
      isArchived: lists.isArchived,
      updatedAt: lists.updatedAt,
    })
    .from(lists)
    .where(and(eq(lists.boardId, boardId), gt(lists.updatedAt, sinceDate)))
    .limit(CHANGES_LIMIT);

  const changedCards = await db
    .select({
      id: cards.id,
      listId: cards.listId,
      title: cards.title,
      position: cards.position,
      version: cards.version,
      isArchived: cards.isArchived,
      updatedAt: cards.updatedAt,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(
      and(
        eq(lists.boardId, boardId),
        eq(cards.organizationId, organizationId),
        gt(cards.updatedAt, sinceDate)
      )
    )
    .limit(CHANGES_LIMIT);

  return { lists: changedLists, cards: changedCards, serverTime: new Date().toISOString() };
}

/**
 * Aggregate board + lists + enriched cards in ~8 Neon queries, cached as one
 * payload under the board version. Replaces board-page N+1
 * (1× board + 1× lists + N× cards?listId, each with 6 enrichment queries).
 * Same `bv:{board}` version key as listLists/listCards — existing bumps
 * invalidate this payload automatically.
 */
export async function getBoardFull(
  db: Database,
  boardId: string,
  organizationId: string
): Promise<BoardFull> {
  const { data } = await cachedBoardRead(boardId, `${organizationId}:full`, 'boardfull', () =>
    loadBoardFull(db, boardId, organizationId)
  );
  return data;
}

async function loadBoardFull(
  db: Database,
  boardId: string,
  organizationId: string
): Promise<BoardFull> {
  const [board] = await db
    .select()
    .from(boards)
    .where(
      and(
        eq(boards.id, boardId),
        eq(boards.organizationId, organizationId),
        isNull(boards.deletedAt)
      )
    )
    .limit(1);
  if (!board) throw httpError(404, 'Board not found');

  const listRows = await db
    .select()
    .from(lists)
    .where(and(eq(lists.boardId, boardId), eq(lists.isArchived, false), isNull(lists.deletedAt)))
    .orderBy(lists.position);

  if (listRows.length === 0) return { board, lists: [] };
  const listIds = listRows.map((l) => l.id);

  const cardRows = await db
    .select()
    .from(cards)
    .where(
      and(inArray(cards.listId, listIds), eq(cards.isArchived, false), isNull(cards.deletedAt))
    )
    .orderBy(cards.position);

  const cardIds = cardRows.map((c) => c.id);
  if (cardIds.length === 0) {
    return { board, lists: listRows.map((l) => ({ ...l, cards: [] })) };
  }

  const stageIds = cardRows.map((c) => c.stageId).filter(Boolean) as string[];
  const priorityIds = [...new Set(cardRows.map((c) => c.priorityId).filter(Boolean))] as string[];
  const [
    assigneeRows,
    labelRows,
    stageRows,
    checklistItemsRows,
    commentRows,
    attachmentRows,
    priorityRows,
  ] = await Promise.all([
    db
      .select({
        cardId: cardAssignees.cardId,
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(cardAssignees)
      .innerJoin(users, eq(users.id, cardAssignees.userId))
      .where(inArray(cardAssignees.cardId, cardIds)),
    db
      .select({
        cardId: cardLabels.cardId,
        id: labels.id,
        name: labels.name,
        color: labels.color,
      })
      .from(cardLabels)
      .innerJoin(labels, eq(labels.id, cardLabels.labelId))
      .where(inArray(cardLabels.cardId, cardIds)),
    stageIds.length > 0
      ? db
          .select({
            id: stages.id,
            name: stages.name,
            color: stages.color,
            category: stages.category,
          })
          .from(stages)
          .where(inArray(stages.id, stageIds))
      : Promise.resolve([] as { id: string; name: string; color: string; category: unknown }[]),
    db
      .select({
        cardId: checklists.cardId,
        itemId: checklistItems.id,
        isDone: checklistItems.isDone,
      })
      .from(checklists)
      .leftJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
      .where(inArray(checklists.cardId, cardIds)),
    db
      .select({ cardId: comments.cardId, id: comments.id })
      .from(comments)
      .where(and(inArray(comments.cardId, cardIds), isNull(comments.deletedAt))),
    db
      .select({ cardId: attachments.cardId, id: attachments.id })
      .from(attachments)
      .where(inArray(attachments.cardId, cardIds)),
    priorityIds.length > 0
      ? db
          .select({ id: priorities.id, name: priorities.name, color: priorities.color })
          .from(priorities)
          .where(inArray(priorities.id, priorityIds))
      : Promise.resolve([] as { id: string; name: string; color: string }[]),
  ]);

  const assigneesByCard = new Map<string, any>();
  assigneeRows.forEach((a) => {
    assigneesByCard.set(a.cardId, {
      id: a.id,
      name: a.name,
      email: a.email,
      avatarUrl: a.avatarUrl,
    });
  });
  const labelsByCard = new Map<string, any[]>();
  labelRows.forEach((l) => {
    if (!labelsByCard.has(l.cardId)) labelsByCard.set(l.cardId, []);
    labelsByCard.get(l.cardId)!.push({ id: l.id, name: l.name, color: l.color });
  });
  const stagesById = new Map<string, any>();
  stageRows.forEach((s) => stagesById.set(s.id, s));
  const prioritiesById = new Map<string, any>();
  priorityRows.forEach((p) => prioritiesById.set(p.id, p));
  const checklistStats = new Map<string, { total: number; done: number }>();
  checklistItemsRows.forEach((row) => {
    if (!checklistStats.has(row.cardId)) checklistStats.set(row.cardId, { total: 0, done: 0 });
    if (row.itemId) {
      const s = checklistStats.get(row.cardId)!;
      s.total += 1;
      if (row.isDone) s.done += 1;
    }
  });
  const commentsCount = new Map<string, number>();
  commentRows.forEach((c) => commentsCount.set(c.cardId, (commentsCount.get(c.cardId) || 0) + 1));
  const attachmentsCount = new Map<string, number>();
  attachmentRows.forEach((a) =>
    attachmentsCount.set(a.cardId, (attachmentsCount.get(a.cardId) || 0) + 1)
  );

  const enrichedByList = new Map<string, any[]>();
  for (const card of cardRows) {
    const stats = checklistStats.get(card.id) || { total: 0, done: 0 };
    const assignee = assigneesByCard.get(card.id) || null;
    const enriched = {
      ...card,
      assignee,
      assignees: assignee ? [assignee] : [],
      labels: labelsByCard.get(card.id) || [],
      stage: card.stageId ? stagesById.get(card.stageId) || null : null,
      priority: card.priorityId ? prioritiesById.get(card.priorityId) || null : null,
      checklistTotal: stats.total,
      checklistDone: stats.done,
      commentsCount: commentsCount.get(card.id) || 0,
      attachmentsCount: attachmentsCount.get(card.id) || 0,
    };
    const arr = enrichedByList.get(card.listId) ?? [];
    arr.push(enriched);
    enrichedByList.set(card.listId, arr);
  }

  return {
    board,
    lists: listRows.map((l) => ({ ...l, cards: enrichedByList.get(l.id) ?? [] })),
  };
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
