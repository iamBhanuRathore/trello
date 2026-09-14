import { eq, and, isNull, max, desc, or, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  cards,
  lists,
  boards,
  comments,
  attachments,
  cardLabels,
  labels,
  checklists,
  checklistItems,
  users,
  stages,
  cardAssignees,
  cardParticipants,
  cardWatchers,
  projects,
  workspaces,
  notifications,
  organizationMembers,
  timeLogs,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import {
  cachedBoardRead,
  cachedCardRead,
  bumpBoardCache,
  bumpCardAndBoard,
  bumpCardCache,
  bumpOrgCache,
  cachedBoardIdForCard,
  cachedCardIdForChecklist,
  rememberCardBoard,
  rememberChecklistCard,
} from '../../lib/cache';

export interface CreateCardInput {
  listId: string;
  title: string;
  description?: string;
  position?: number;
  parentCardId?: string;
  dueDate?: string;
  stageId?: string;
  storyPoints?: number;
  estimateMinutes?: number;
  assigneeId?: string;
  /** Applied at creation so the full composer can set everything in one call. */
  labelIds?: string[];
  participantIds?: string[];
  watcherIds?: string[];
  checklist?: { title?: string; items?: string[] };
  actorId?: string;
}

async function verifyListAccess(db: Database, listId: string, organizationId: string) {
  const [list] = await db
    .select({ listId: lists.id, boardId: boards.id })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(lists.id, listId), eq(boards.organizationId, organizationId)))
    .limit(1);

  if (!list) throw httpError(404, 'List not found or access denied');
  return list;
}

async function getBoardIdForCard(db: Database, cardId: string) {
  const [result] = await db
    .select({ boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(eq(cards.id, cardId))
    .limit(1);
  return result?.boardId;
}

/** Bump card + board versions after a card mutation (cached cb map first, DB fallback). */
async function bumpForCard(db: Database, cardId: string, knownBoardId?: string | null) {
  let boardId = knownBoardId ?? (await cachedBoardIdForCard(cardId));
  if (!boardId) boardId = (await getBoardIdForCard(db, cardId)) ?? null;
  await bumpCardAndBoard(cardId, boardId);
  // Subtasks are embedded in the parent's cached getCard payload — a subtask
  // mutation must also bump the parent. Single indexed PK lookup.
  const [row] = await db
    .select({ parentCardId: cards.parentCardId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  if (row?.parentCardId) await bumpCardCache(row.parentCardId);
}

/** Bump versions after a checklist-level mutation (resolves card via map, then DB). */
async function bumpForChecklist(db: Database, checklistId: string, knownCardId?: string | null) {
  let cardId = knownCardId ?? (await cachedCardIdForChecklist(checklistId));
  if (!cardId) {
    const [row] = await db
      .select({ cardId: checklists.cardId })
      .from(checklists)
      .where(eq(checklists.id, checklistId))
      .limit(1);
    cardId = row?.cardId ?? null;
    if (!cardId) return;
  }
  await rememberChecklistCard(checklistId, cardId);
  await bumpForCard(db, cardId);
}

// ─── Task history (persistent activity feed) ────────────────────────────────
// Every card mutation writes a `comments` row in the same emoji-prefixed style
// as the checklist loggers below, so the task history is event-sourced and
// complete. Fire-and-forget: history must never break the mutation itself.
async function logCardHistory(db: Database, cardId: string, userId: string, body: string) {
  await db
    .insert(comments)
    .values({ cardId, userId, body })
    .catch(() => {});
}

async function getUserDisplayName(db: Database, userId: string): Promise<string> {
  const [u] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.name || u?.email || 'Someone';
}

export async function createCard(db: Database, organizationId: string, input: CreateCardInput) {
  await verifyListAccess(db, input.listId, organizationId);

  let position = input.position;
  if (position === undefined) {
    const [result] = await db
      .select({ maxPos: max(cards.position) })
      .from(cards)
      .where(eq(cards.listId, input.listId));

    position = (result?.maxPos ?? 0) + 65536;
  }

  // Enforce 2-level nesting limit if parentCardId is provided
  if (input.parentCardId) {
    const [parentCard] = await db
      .select({ id: cards.id, parentCardId: cards.parentCardId })
      .from(cards)
      .where(eq(cards.id, input.parentCardId))
      .limit(1);

    if (!parentCard) throw httpError(404, 'Parent card not found');
    if (parentCard.parentCardId) {
      throw httpError(400, 'Subtasks cannot have their own subtasks (max 2 levels of nesting)');
    }
  }

  // Get board ID and project info for organizationId and ticket number generation
  const [boardInfo] = await db
    .select({
      organizationId: boards.organizationId,
      boardId: boards.id,
      projectId: boards.projectId,
      boardName: boards.name,
    })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(eq(lists.id, input.listId))
    .limit(1);

  let taskNumber: number | null = null;
  let cardKey: string | null = null;

  if (boardInfo?.projectId) {
    const [updatedProj] = await db
      .update(projects)
      .set({
        taskCounter: sql`${projects.taskCounter} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, boardInfo.projectId))
      .returning({ key: projects.key, taskCounter: projects.taskCounter });

    if (updatedProj) {
      taskNumber = updatedProj.taskCounter;
      const projKey = updatedProj.key || 'TASK';
      cardKey = `${projKey}-${taskNumber}`;
    }
  }

  if (!cardKey) {
    const [maxRes] = await db
      .select({ maxNum: max(cards.taskNumber) })
      .from(cards)
      .where(eq(cards.organizationId, boardInfo?.organizationId || organizationId));
    taskNumber = (maxRes?.maxNum ?? 0) + 1;
    cardKey = `TASK-${taskNumber}`;
  }

  const [card] = await db
    .insert(cards)
    .values({
      organizationId: boardInfo!.organizationId,
      listId: input.listId,
      taskNumber,
      key: cardKey,
      title: input.title,
      description: input.description,
      position,
      parentCardId: input.parentCardId,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      stageId: input.stageId,
      storyPoints: input.storyPoints,
      estimateMinutes: input.estimateMinutes,
    })
    .returning();

  if (input.assigneeId && card) {
    await db
      .insert(cardAssignees)
      .values({
        cardId: card.id,
        userId: input.assigneeId,
        assignedBy: input.assigneeId,
      })
      .onConflictDoNothing();
  }

  // Full-composer relations: labels, participants, observers + initial checklist.
  // Best-effort per row so one bad id never fails the creation.
  if (card) {
    const validIds = (ids?: string[]) => (ids || []).filter((id) => isValidUuid(id));
    for (const labelId of validIds(input.labelIds)) {
      await db
        .insert(cardLabels)
        .values({ cardId: card.id, labelId })
        .onConflictDoNothing()
        .catch(() => {});
    }
    for (const participantId of validIds(input.participantIds)) {
      await db
        .insert(cardParticipants)
        .values({
          cardId: card.id,
          userId: participantId,
          addedBy: input.actorId,
          addedAt: new Date(),
        })
        .onConflictDoNothing()
        .catch(() => {});
    }
    for (const watcherId of validIds(input.watcherIds)) {
      await db
        .insert(cardWatchers)
        .values({ cardId: card.id, userId: watcherId, subscribedAt: new Date() })
        .onConflictDoNothing()
        .catch(() => {});
    }
    const checklistItems = (input.checklist?.items || []).map((t) => t.trim()).filter(Boolean);
    if (checklistItems.length > 0) {
      await createChecklist(
        db,
        card.id,
        input.checklist?.title?.trim() || 'Checklist #1',
        0,
        input.actorId,
        checklistItems
      ).catch(() => {});
    }
  }

  eventBus.broadcast(`board:${boardInfo!.boardId}`, 'card.created', card);
  eventBus.emit('internal', {
    event: 'card.created',
    payload: { cardId: card!.id, listId: input.listId, boardId: boardInfo!.boardId },
    actorId: 'system',
    organizationId: boardInfo!.organizationId,
  });
  await bumpBoardCache(boardInfo!.boardId);
  await bumpOrgCache(boardInfo!.organizationId);
  // Subtask creation must invalidate the parent card modal (subtasksTotal/Done cached under cv).
  if (input.parentCardId) {
    await bumpForCard(db, input.parentCardId);
  }
  return card;
}

export async function listCards(db: Database, listId: string, organizationId: string) {
  const { boardId } = await verifyListAccess(db, listId, organizationId);
  // Hot board-loop read: 1 Redis RTT on hit, zero Neon queries.
  const { data } = await cachedBoardRead(boardId, `cards:${listId}`, 'cards', async () => {
    const cardRows = await db
      .select()
      .from(cards)
      .where(and(eq(cards.listId, listId), eq(cards.isArchived, false), isNull(cards.deletedAt)))
      .orderBy(cards.position);

    const cardIds = cardRows.map((c) => c.id);
    if (cardIds.length === 0) return [];

    // Enrichment queries are independent — fan out concurrently (was 6 sequential
    // round-trips; pool + Docker RTT made each list ~1s).
    const stageIds = cardRows.map((c) => c.stageId).filter(Boolean) as string[];
    const [assigneeRows, labelRows, stageRows, checklistItemsRows, commentRows, attachmentRows] =
      await Promise.all([
        // 1. Assignees
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
        // 2. Labels
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
        // 3. Stages
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
        // 4. Checklist counts
        db
          .select({
            cardId: checklists.cardId,
            itemId: checklistItems.id,
            isDone: checklistItems.isDone,
          })
          .from(checklists)
          .leftJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
          .where(inArray(checklists.cardId, cardIds)),
        // 5. Comments counts
        db
          .select({
            cardId: comments.cardId,
            id: comments.id,
          })
          .from(comments)
          .where(and(inArray(comments.cardId, cardIds), isNull(comments.deletedAt))),
        // 6. Attachments counts
        db
          .select({
            cardId: attachments.cardId,
            id: attachments.id,
          })
          .from(attachments)
          .where(inArray(attachments.cardId, cardIds)),
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

    const stagesByStageId = new Map<string, any>();
    stageRows.forEach((s) => stagesByStageId.set(s.id, s));

    const checklistStatsByCard = new Map<string, { total: number; done: number }>();
    checklistItemsRows.forEach((row) => {
      if (!checklistStatsByCard.has(row.cardId)) {
        checklistStatsByCard.set(row.cardId, { total: 0, done: 0 });
      }
      if (row.itemId) {
        const stats = checklistStatsByCard.get(row.cardId)!;
        stats.total += 1;
        if (row.isDone) stats.done += 1;
      }
    });

    const commentsCountByCard = new Map<string, number>();
    commentRows.forEach((c) => {
      commentsCountByCard.set(c.cardId, (commentsCountByCard.get(c.cardId) || 0) + 1);
    });

    const attachmentsCountByCard = new Map<string, number>();
    attachmentRows.forEach((a) => {
      attachmentsCountByCard.set(a.cardId, (attachmentsCountByCard.get(a.cardId) || 0) + 1);
    });

    return cardRows.map((card) => {
      const clStats = checklistStatsByCard.get(card.id) || { total: 0, done: 0 };
      const assignee = assigneesByCard.get(card.id) || null;
      return {
        ...card,
        assignee,
        assignees: assignee ? [assignee] : [],
        labels: labelsByCard.get(card.id) || [],
        stage: card.stageId ? stagesByStageId.get(card.stageId) || null : null,
        checklistTotal: clStats.total,
        checklistDone: clStats.done,
        commentsCount: commentsCountByCard.get(card.id) || 0,
        attachmentsCount: attachmentsCountByCard.get(card.id) || 0,
      };
    });
  });
  return data;
}

export async function listSubtasks(db: Database, parentCardId: string, organizationId: string) {
  // First ensure the parent card belongs to the organization
  await getCard(db, parentCardId, organizationId);

  const subtaskCards = await db
    .select({ card: cards, listName: lists.name })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(
      and(
        eq(cards.parentCardId, parentCardId),
        eq(cards.isArchived, false),
        isNull(cards.deletedAt)
      )
    )
    .orderBy(cards.position);

  const subtaskIds = subtaskCards.map((s) => s.card.id);
  if (subtaskIds.length === 0) return [];

  const subtaskAssignees = await db
    .select({
      cardId: cardAssignees.cardId,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(cardAssignees)
    .innerJoin(users, eq(users.id, cardAssignees.userId))
    .where(inArray(cardAssignees.cardId, subtaskIds));

  const assigneesBySubtask = new Map<string, any>();
  subtaskAssignees.forEach((a) => {
    assigneesBySubtask.set(a.cardId, {
      id: a.userId,
      name: a.name,
      email: a.email,
      avatarUrl: a.avatarUrl,
    });
  });

  return subtaskCards.map((s) => ({
    ...s.card,
    listName: s.listName,
    assignee: assigneesBySubtask.get(s.card.id) || null,
    assignees: assigneesBySubtask.has(s.card.id) ? [assigneesBySubtask.get(s.card.id)] : [],
  }));
}

export async function getCard(db: Database, id: string, organizationId: string) {
  // Hot modal read: 1 Redis RTT on hit, zero Neon queries.
  // 404s thrown by the loader are never cached (store happens only on success).
  const { data, hit } = await cachedCardRead(id, 'full', 'card', async () => {
    const [card] = await db
      .select({
        id: cards.id,
        taskNumber: cards.taskNumber,
        key: cards.key,
        organizationId: cards.organizationId,
        listId: cards.listId,
        listName: lists.name,
        boardId: boards.id,
        boardName: boards.name,
        projectId: boards.projectId,
        projectKey: projects.key,
        projectName: projects.name,
        parentCardId: cards.parentCardId,
        title: cards.title,
        description: cards.description,
        position: cards.position,
        dueDate: cards.dueDate,
        stageId: cards.stageId,
        coverImage: cards.coverImage,
        storyPoints: cards.storyPoints,
        estimateMinutes: cards.estimateMinutes,
        subtasksTotal: cards.subtasksTotal,
        subtasksDone: cards.subtasksDone,
        isArchived: cards.isArchived,
        createdAt: cards.createdAt,
        updatedAt: cards.updatedAt,
      })
      .from(cards)
      .innerJoin(lists, eq(lists.id, cards.listId))
      .innerJoin(boards, eq(boards.id, lists.boardId))
      .leftJoin(projects, eq(projects.id, boards.projectId))
      .where(
        and(eq(cards.id, id), eq(cards.organizationId, organizationId), isNull(cards.deletedAt))
      )
      .limit(1);

    if (!card) throw httpError(404, 'Card not found');

    // Independent sub-fetches — fan out concurrently (was 6 sequential round-trips).
    // Comments / checklists / attachments / subtasks / time-logs ride along so
    // opening a task is 1 request (Redis hit) instead of 6 sequential ones.
    const [
      assignees,
      participants,
      watchers,
      cardLabelsList,
      stageRows,
      parentRows,
      commentRows,
      checklistRows,
      checklistItemRows,
      attachmentRows,
      subtaskRows,
      subtaskAssigneeRows,
      timeLogRows,
    ] = await Promise.all([
      // Assignees (single primary assignee model)
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(cardAssignees)
        .innerJoin(users, eq(users.id, cardAssignees.userId))
        .where(eq(cardAssignees.cardId, id)),
      // Participants (multiple collaborators)
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          addedAt: cardParticipants.addedAt,
          createdAt: cardParticipants.addedAt,
        })
        .from(cardParticipants)
        .innerJoin(users, eq(users.id, cardParticipants.userId))
        .where(eq(cardParticipants.cardId, id)),
      // Watchers (multiple observers)
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          subscribedAt: cardWatchers.subscribedAt,
          createdAt: cardWatchers.subscribedAt,
        })
        .from(cardWatchers)
        .innerJoin(users, eq(users.id, cardWatchers.userId))
        .where(eq(cardWatchers.cardId, id)),
      // Labels
      db
        .select({
          id: labels.id,
          name: labels.name,
          color: labels.color,
        })
        .from(cardLabels)
        .innerJoin(labels, eq(labels.id, cardLabels.labelId))
        .where(eq(cardLabels.cardId, id)),
      // Stage (skip query when no stageId)
      card.stageId
        ? db
            .select({
              id: stages.id,
              name: stages.name,
              color: stages.color,
              category: stages.category,
            })
            .from(stages)
            .where(eq(stages.id, card.stageId))
            .limit(1)
        : Promise.resolve([]),
      // Parent card (skip query when no parentCardId)
      card.parentCardId
        ? db
            .select({
              id: cards.id,
              title: cards.title,
            })
            .from(cards)
            .where(eq(cards.id, card.parentCardId))
            .limit(1)
        : Promise.resolve([]),
      // Comments (same shape as listComments)
      db
        .select({
          id: comments.id,
          cardId: comments.cardId,
          userId: comments.userId,
          body: comments.body,
          isEdited: comments.isEdited,
          createdAt: comments.createdAt,
          updatedAt: comments.updatedAt,
          authorName: users.name,
          authorAvatarUrl: users.avatarUrl,
          authorEmail: users.email,
        })
        .from(comments)
        .leftJoin(users, eq(users.id, comments.userId))
        .where(and(eq(comments.cardId, id), isNull(comments.deletedAt)))
        .orderBy(desc(comments.createdAt)),
      // Checklists + items (same shape as getCardChecklists)
      db
        .select()
        .from(checklists)
        .where(and(eq(checklists.cardId, id), isNull(checklists.deletedAt)))
        .orderBy(checklists.position),
      db
        .select()
        .from(checklistItems)
        .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
        .where(
          and(
            eq(checklists.cardId, id),
            isNull(checklists.deletedAt),
            isNull(checklistItems.deletedAt)
          )
        )
        .orderBy(checklistItems.position),
      // Attachments (same shape as listAttachments)
      db
        .select()
        .from(attachments)
        .where(and(eq(attachments.cardId, id), isNull(attachments.deletedAt)))
        .orderBy(desc(attachments.createdAt)),
      // Subtasks (same shape as listSubtasks, minus its getCard org-check —
      // the outer query already verified org access)
      db
        .select({ card: cards, listName: lists.name })
        .from(cards)
        .innerJoin(lists, eq(lists.id, cards.listId))
        .where(
          and(eq(cards.parentCardId, id), eq(cards.isArchived, false), isNull(cards.deletedAt))
        )
        .orderBy(cards.position),
      db
        .select({
          cardId: cardAssignees.cardId,
          userId: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(cardAssignees)
        .innerJoin(users, eq(users.id, cardAssignees.userId))
        .where(
          inArray(
            cardAssignees.cardId,
            db
              .select({ id: cards.id })
              .from(cards)
              .where(and(eq(cards.parentCardId, id), isNull(cards.deletedAt)))
          )
        ),
      // Time logs (same shape as getCardTimeLogs)
      db
        .select({
          id: timeLogs.id,
          cardId: timeLogs.cardId,
          userId: timeLogs.userId,
          minutes: timeLogs.minutes,
          description: timeLogs.description,
          loggedDate: timeLogs.loggedDate,
          isBillable: timeLogs.isBillable,
          createdAt: timeLogs.createdAt,
          user: {
            id: users.id,
            name: users.name,
            avatarUrl: users.avatarUrl,
            email: users.email,
          },
        })
        .from(timeLogs)
        .innerJoin(users, eq(timeLogs.userId, users.id))
        .where(and(eq(timeLogs.cardId, id), isNull(timeLogs.deletedAt)))
        .orderBy(desc(timeLogs.loggedDate), desc(timeLogs.createdAt)),
    ]);

    const stage = stageRows[0] || null;
    const parentCard = parentRows[0] || null;

    const checklistsWithItems = checklistRows.map((cl) => ({
      ...cl,
      items: checklistItemRows
        .filter((item) => item.checklist_items.checklistId === cl.id)
        .map((i) => i.checklist_items),
    }));

    const subtaskAssigneesByCard = new Map<string, any>();
    subtaskAssigneeRows.forEach((a) => {
      subtaskAssigneesByCard.set(a.cardId, {
        id: a.userId,
        name: a.name,
        email: a.email,
        avatarUrl: a.avatarUrl,
      });
    });
    const subtasks = subtaskRows.map((s) => ({
      ...s.card,
      listName: s.listName,
      assignee: subtaskAssigneesByCard.get(s.card.id) || null,
      assignees: subtaskAssigneesByCard.has(s.card.id)
        ? [subtaskAssigneesByCard.get(s.card.id)]
        : [],
    }));

    let totalMinutes = 0;
    let billableMinutes = 0;
    for (const log of timeLogRows) {
      totalMinutes += log.minutes;
      if (log.isBillable) billableMinutes += log.minutes;
    }

    return {
      ...card,
      assignee: assignees[0] || null,
      assignees: assignees.slice(0, 1),
      participants,
      watchers,
      labels: cardLabelsList,
      stage,
      parentCard,
      comments: commentRows,
      checklists: checklistsWithItems,
      attachments: attachmentRows,
      subtasks,
      timeTracking: {
        cardId: id,
        totalMinutes,
        billableMinutes,
        nonBillableMinutes: totalMinutes - billableMinutes,
        timeLogs: timeLogRows,
      },
    };
  });
  if (!hit && (data as { boardId?: string })?.boardId) {
    await rememberCardBoard(id, (data as { boardId: string }).boardId);
  }
  return data;
}

export async function deleteCard(db: Database, id: string, organizationId: string) {
  const boardId = await getBoardIdForCard(db, id);
  const [card] = await db
    .update(cards)
    .set({ deletedAt: new Date() })
    .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId)))
    .returning();

  if (!card) throw httpError(404, 'Card not found');
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.deleted', { cardId: id });
  }
  await bumpCardAndBoard(id, boardId ?? null);
  return { success: true, id };
}

export async function getBoardLabels(db: Database, boardId: string) {
  const { data } = await cachedBoardRead(boardId, 'labels', 'labels', () =>
    db.select().from(labels).where(eq(labels.boardId, boardId)).orderBy(labels.name)
  );
  return data;
}

export async function createBoardLabel(db: Database, boardId: string, name: string, color: string) {
  const [newLabel] = await db.insert(labels).values({ boardId, name, color }).returning();
  await bumpBoardCache(boardId);
  return newLabel;
}

export async function updateBoardLabel(
  db: Database,
  labelId: string,
  name?: string,
  color?: string
) {
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

export async function deleteBoardLabel(db: Database, labelId: string) {
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

export async function updateCard(db: Database, id: string, organizationId: string, input: any) {
  const [card] = await db
    .update(cards)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId)))
    .returning();

  if (!card) throw httpError(404, 'Card not found');
  const boardId = await getBoardIdForCard(db, id);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.updated', card);
  }
  await bumpCardAndBoard(id, boardId ?? null);
  // Subtasks are embedded in the parent's cached payload — bump it too.
  if (card.parentCardId) await bumpCardCache(card.parentCardId);
  return card;
}

export async function moveCard(
  db: Database,
  id: string,
  organizationId: string,
  newListId: string,
  newPosition: number,
  actorId?: string
) {
  await verifyListAccess(db, newListId, organizationId);

  const [card] = await db
    .update(cards)
    .set({ listId: newListId, position: newPosition, updatedAt: new Date() })
    .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId)))
    .returning();

  if (!card) throw httpError(404, 'Card not found');
  const boardId = await getBoardIdForCard(db, id);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.moved', card);
    eventBus.emit('internal', {
      event: 'card.moved',
      payload: { cardId: id, listId: newListId, boardId },
      actorId: actorId || 'system',
      organizationId,
    });
    // New board always bumped; old board (if different) via cached card->board map.
    await bumpBoardCache(boardId);
  }
  await bumpForCard(db, id);
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
  return card;
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export async function listComments(db: Database, cardId: string) {
  return db
    .select({
      id: comments.id,
      cardId: comments.cardId,
      userId: comments.userId,
      body: comments.body,
      isEdited: comments.isEdited,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorEmail: users.email,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.cardId, cardId), isNull(comments.deletedAt)))
    .orderBy(desc(comments.createdAt));
}

export async function createComment(
  db: Database,
  cardId: string,
  userId: string,
  body: string,
  mentionedUserIds?: string[]
) {
  const [comment] = await db.insert(comments).values({ cardId, userId, body }).returning();

  // Find board and org
  const boardId = await getBoardIdForCard(db, cardId);
  let orgId = '';
  if (boardId) {
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    orgId = board?.organizationId || '';
  }

  // Handle mentioned users
  const targetMentionIds = new Set<string>(mentionedUserIds || []);

  // Also auto-extract mentions from markdown tags: @[Name](uuid) or @uuid
  const mentionMatches = body.match(/@\[([^\]]+)\]\(([a-f0-9-]+)\)/g);
  if (mentionMatches) {
    for (const m of mentionMatches) {
      const matchId = m.match(/@\[([^\]]+)\]\(([a-f0-9-]+)\)/);
      if (matchId && matchId[2]) {
        targetMentionIds.add(matchId[2]);
      }
    }
  }

  // Auto-add mentioned users as observers / watchers if not already watching
  for (const mentionedId of targetMentionIds) {
    if (mentionedId && mentionedId !== userId) {
      // 1. Add as card watcher
      await db.insert(cardWatchers).values({ cardId, userId: mentionedId }).onConflictDoNothing();

      // 2. Broadcast realtime watcher update
      if (boardId) {
        eventBus.broadcast(`board:${boardId}`, 'card.watched', { cardId, userId: mentionedId });
      }

      // 3. Create notification for mentioned user
      if (orgId) {
        await db
          .insert(notifications)
          .values({
            userId: mentionedId,
            organizationId: orgId,
            eventType: 'card.mentioned',
            payload: {
              cardId,
              commentId: comment?.id,
              actorId: userId,
              commentSnippet: body.slice(0, 150),
            },
          })
          .catch(() => {});
      }
    }
  }

  // Notify others via internal event bus
  if (boardId && orgId) {
    eventBus.emit('internal', {
      event: 'card.commented',
      payload: {
        cardId,
        commentText: body,
        mentionedUserIds: Array.from(targetMentionIds),
      },
      actorId: userId,
      organizationId: orgId,
    });
  }

  await bumpForCard(db, cardId);
  return comment;
}

export async function updateComment(
  db: Database,
  commentId: string,
  userId: string,
  organizationId: string,
  body: string,
  isPlatformAdmin: boolean = false
) {
  const [comment] = await db
    .select({
      id: comments.id,
      cardId: comments.cardId,
      userId: comments.userId,
      organizationId: cards.organizationId,
    })
    .from(comments)
    .innerJoin(cards, eq(cards.id, comments.cardId))
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
    .limit(1);

  if (!comment) {
    throw httpError(404, 'Comment not found');
  }

  if (comment.organizationId !== organizationId && !isPlatformAdmin) {
    throw httpError(403, 'Forbidden');
  }

  let canEdit = comment.userId === userId || isPlatformAdmin;

  if (!canEdit) {
    const [membership] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);

    if (
      membership &&
      ['org_owner', 'org_admin', 'workspace_admin', 'admin'].includes(membership.role)
    ) {
      canEdit = true;
    }
  }

  if (!canEdit) {
    throw httpError(403, 'You do not have permission to edit this comment');
  }

  const [updated] = await db
    .update(comments)
    .set({
      body,
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId))
    .returning();

  const boardId = await getBoardIdForCard(db, comment.cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'comment.updated', {
      cardId: comment.cardId,
      commentId,
      body,
    });
  }

  await bumpCardAndBoard(comment.cardId, boardId ?? null);
  return updated;
}

export async function deleteComment(
  db: Database,
  commentId: string,
  userId: string,
  organizationId: string,
  isPlatformAdmin: boolean = false
) {
  const [comment] = await db
    .select({
      id: comments.id,
      cardId: comments.cardId,
      userId: comments.userId,
      organizationId: cards.organizationId,
    })
    .from(comments)
    .innerJoin(cards, eq(cards.id, comments.cardId))
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
    .limit(1);

  if (!comment) {
    throw httpError(404, 'Comment not found');
  }

  if (comment.organizationId !== organizationId && !isPlatformAdmin) {
    throw httpError(403, 'Forbidden');
  }

  let canDelete = comment.userId === userId || isPlatformAdmin;

  if (!canDelete) {
    const [membership] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);

    if (
      membership &&
      ['org_owner', 'org_admin', 'workspace_admin', 'admin'].includes(membership.role)
    ) {
      canDelete = true;
    }
  }

  if (!canDelete) {
    throw httpError(403, 'You do not have permission to delete this comment');
  }

  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));

  const boardId = await getBoardIdForCard(db, comment.cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'comment.deleted', {
      cardId: comment.cardId,
      commentId,
    });
  }

  await bumpCardAndBoard(comment.cardId, boardId ?? null);
  return { success: true, id: commentId };
}

// ─── Attachments ──────────────────────────────────────────────────────────────
export async function listAttachments(db: Database, cardId: string) {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.cardId, cardId), isNull(attachments.deletedAt)))
    .orderBy(desc(attachments.createdAt));
}

export async function createAttachmentRecord(
  db: Database,
  cardId: string,
  userId: string,
  url: string,
  fileName: string,
  fileType?: string,
  sizeBytes?: number
) {
  const [attachment] = await db
    .insert(attachments)
    .values({ cardId, uploadedBy: userId, url, fileName, fileType, sizeBytes })
    .returning();
  await bumpForCard(db, cardId);
  return attachment;
}

export async function deleteAttachment(db: Database, attachmentId: string, userId: string) {
  const [attachment] = await db
    .update(attachments)
    .set({ deletedAt: new Date() })
    .where(and(eq(attachments.id, attachmentId), eq(attachments.uploadedBy, userId)))
    .returning();
  if (!attachment) throw httpError(404, 'Attachment not found or not authorized to delete');
  await bumpForCard(db, attachment.cardId);
  return attachment;
}

// ─── UUID Validation Helper ──────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id);
}

// ─── Labels ───────────────────────────────────────────────────────────────────
export async function getCardLabels(db: Database, cardId: string) {
  if (!isValidUuid(cardId)) return [];
  return db
    .select({ label: labels })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .where(eq(cardLabels.cardId, cardId));
}

export async function attachLabelToCard(
  db: Database,
  cardId: string,
  labelId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(labelId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or labelId' };
  }
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
        payload: { cardId, labelId },
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
  labelId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(labelId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or labelId' };
  }
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

// ─── Assignees (Single Assignee Model) ─────────────────────────────────────────
export async function assignUserToCard(
  db: Database,
  cardId: string,
  userId: string,
  actorId: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  // Enforce single primary assignee: clear previous assignees first
  await db.delete(cardAssignees).where(eq(cardAssignees.cardId, cardId));
  await db
    .insert(cardAssignees)
    .values({ cardId, userId, assignedBy: actorId })
    .onConflictDoNothing();
  await logCardHistory(
    db,
    cardId,
    actorId,
    `👤 Assigned **${await getUserDisplayName(db, userId)}**`
  );
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.assigned', { cardId, assigneeId: userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.assigned',
        payload: { cardId, assigneeId: userId },
        actorId,
        organizationId: board.organizationId,
      });
    }
  }
  await bumpCardAndBoard(cardId, boardId ?? null);
  return { success: true };
}

export async function removeUserFromCard(
  db: Database,
  cardId: string,
  userId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  const name = actorId ? await getUserDisplayName(db, userId) : null;
  await db
    .delete(cardAssignees)
    .where(and(eq(cardAssignees.cardId, cardId), eq(cardAssignees.userId, userId)));
  if (actorId) {
    await logCardHistory(db, cardId, actorId, `👤 Unassigned **${name}**`);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.unassigned', { cardId, userId });
  }
  await bumpCardAndBoard(cardId, boardId ?? null);
  return { success: true };
}

// ─── Participants (Multiple Collaborators Model) ──────────────────────────────
export async function addParticipantToCard(
  db: Database,
  cardId: string,
  userId: string,
  actorId: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  await db
    .insert(cardParticipants)
    .values({ cardId, userId, addedBy: actorId, addedAt: new Date() })
    .onConflictDoUpdate({
      target: [cardParticipants.cardId, cardParticipants.userId],
      set: { addedAt: new Date(), addedBy: actorId },
    });
  await logCardHistory(
    db,
    cardId,
    actorId,
    `🤝 Added **${await getUserDisplayName(db, userId)}** as a participant`
  );
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.participant_added', { cardId, userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.participant_added',
        payload: { cardId, participantId: userId },
        actorId,
        organizationId: board.organizationId,
      });
    }
  }
  await bumpCardAndBoard(cardId, boardId ?? null);
  return { success: true };
}

export async function removeParticipantFromCard(
  db: Database,
  cardId: string,
  userId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  const name = actorId ? await getUserDisplayName(db, userId) : null;
  await db
    .delete(cardParticipants)
    .where(and(eq(cardParticipants.cardId, cardId), eq(cardParticipants.userId, userId)));
  if (actorId) {
    await logCardHistory(db, cardId, actorId, `🤝 Removed **${name}** from participants`);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.participant_removed', { cardId, userId });
  }
  await bumpCardAndBoard(cardId, boardId ?? null);
  return { success: true };
}

export async function getCardParticipants(db: Database, cardId: string) {
  if (!isValidUuid(cardId)) return [];
  return await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      addedAt: cardParticipants.addedAt,
      createdAt: cardParticipants.addedAt,
    })
    .from(cardParticipants)
    .innerJoin(users, eq(users.id, cardParticipants.userId))
    .where(eq(cardParticipants.cardId, cardId));
}

// ─── Watchers ─────────────────────────────────────────────────────────────────
export async function watchCard(
  db: Database,
  cardId: string,
  userId: string,
  organizationId?: string,
  actorUserId?: string
) {
  if (organizationId) {
    await getCard(db, cardId, organizationId);
  }
  await db
    .insert(cardWatchers)
    .values({ cardId, userId, subscribedAt: new Date() })
    .onConflictDoUpdate({
      target: [cardWatchers.cardId, cardWatchers.userId],
      set: { subscribedAt: new Date() },
    });
  if (actorUserId) {
    const body =
      actorUserId === userId
        ? '👀 Started watching this task'
        : `👀 Added **${await getUserDisplayName(db, userId)}** as an observer`;
    await logCardHistory(db, cardId, actorUserId, body);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.watched', { cardId, userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board?.organizationId) {
      eventBus.emit('internal', {
        event: 'card.watched',
        payload: { cardId, userId },
        actorId: userId,
        organizationId: board.organizationId,
      });
    }
  }
  await bumpCardAndBoard(cardId, boardId ?? null);
  return { success: true, watched: true };
}

export async function unwatchCard(
  db: Database,
  cardId: string,
  userId: string,
  organizationId?: string,
  actorUserId?: string
) {
  if (organizationId) {
    await getCard(db, cardId, organizationId);
  }
  await db
    .delete(cardWatchers)
    .where(and(eq(cardWatchers.cardId, cardId), eq(cardWatchers.userId, userId)));
  if (actorUserId) {
    const body =
      actorUserId === userId
        ? '👀 Stopped watching this task'
        : `👀 Removed **${await getUserDisplayName(db, userId)}** from observers`;
    await logCardHistory(db, cardId, actorUserId, body);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.unwatched', { cardId, userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board?.organizationId) {
      eventBus.emit('internal', {
        event: 'card.unwatched',
        payload: { cardId, userId },
        actorId: userId,
        organizationId: board.organizationId,
      });
    }
  }
  await bumpCardAndBoard(cardId, boardId ?? null);
  return { success: true, watched: false };
}

export async function getCardWatchers(db: Database, cardId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      subscribedAt: cardWatchers.subscribedAt,
      createdAt: cardWatchers.subscribedAt,
    })
    .from(cardWatchers)
    .innerJoin(users, eq(users.id, cardWatchers.userId))
    .where(eq(cardWatchers.cardId, cardId));
}

// ─── Checklists ───────────────────────────────────────────────────────────────
export async function getCardChecklists(db: Database, cardId: string) {
  // Independent queries (items re-derive cardId via join) — run concurrently.
  const [allChecklists, allItems] = await Promise.all([
    db
      .select()
      .from(checklists)
      .where(and(eq(checklists.cardId, cardId), isNull(checklists.deletedAt)))
      .orderBy(checklists.position),
    db
      .select()
      .from(checklistItems)
      .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
      .where(
        and(
          eq(checklists.cardId, cardId),
          isNull(checklists.deletedAt),
          isNull(checklistItems.deletedAt)
        )
      )
      .orderBy(checklistItems.position),
  ]);

  return allChecklists.map((cl) => ({
    ...cl,
    items: allItems
      .filter((item) => item.checklist_items.checklistId === cl.id)
      .map((i) => i.checklist_items),
  }));
}

export async function createChecklist(
  db: Database,
  cardId: string,
  title: string,
  position: number,
  actorUserId?: string,
  items?: string[]
) {
  const [checklist] = await db.insert(checklists).values({ cardId, title, position }).returning();
  if (!checklist) throw httpError(500, 'Failed to create checklist');

  let insertedItems: any[] = [];
  const validItems = (items || []).map((t) => t.trim()).filter(Boolean);
  if (validItems.length > 0) {
    insertedItems = await db
      .insert(checklistItems)
      .values(
        validItems.map((text, idx) => ({
          checklistId: checklist.id,
          text,
          position: idx,
        }))
      )
      .returning();
  }

  if (actorUserId) {
    let bodyText = `📋 Added checklist: **${title}**`;
    if (validItems.length > 0) {
      bodyText += `\n` + validItems.map((t) => `- [ ] ${t}`).join('\n');
    }
    await db
      .insert(comments)
      .values({
        cardId,
        userId: actorUserId,
        body: bodyText,
      })
      .catch(() => {});
  }
  await bumpForChecklist(db, checklist.id, cardId);
  return { ...checklist, items: insertedItems };
}

export async function createBulkChecklistItems(
  db: Database,
  checklistId: string,
  items: string[],
  actorUserId?: string
) {
  const [cl] = await db
    .select({ cardId: checklists.cardId, title: checklists.title })
    .from(checklists)
    .where(eq(checklists.id, checklistId));
  if (!cl) throw httpError(404, 'Checklist not found');

  const validItems = items.map((t) => t.trim()).filter(Boolean);
  if (validItems.length === 0) return [];

  const existingItems = await db
    .select({ position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.checklistId, checklistId));

  const maxPos = existingItems.reduce((max, it) => Math.max(max, it.position), -1);

  const inserted = await db
    .insert(checklistItems)
    .values(
      validItems.map((text, idx) => ({
        checklistId,
        text,
        position: maxPos + 1 + idx,
      }))
    )
    .returning();

  if (actorUserId && cl.cardId) {
    let bodyText: string;
    if (validItems.length === 1) {
      bodyText = `➕ Added checklist item: **${validItems[0]}**`;
    } else {
      bodyText =
        `➕ Added ${validItems.length} checklist items to **${cl.title}**:\n` +
        validItems.map((t) => `- [ ] ${t}`).join('\n');
    }
    await db
      .insert(comments)
      .values({
        cardId: cl.cardId,
        userId: actorUserId,
        body: bodyText,
      })
      .catch(() => {});
  }

  await bumpForChecklist(db, checklistId, cl.cardId);
  return inserted;
}

export async function createChecklistItem(
  db: Database,
  checklistId: string,
  text: string,
  position: number,
  assignedTo?: string,
  dueDate?: Date,
  actorUserId?: string
) {
  if (text.includes('\n')) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      const items = await createBulkChecklistItems(db, checklistId, lines, actorUserId);
      return items[0] || null;
    }
    text = lines[0] || text.trim();
  }

  const [item] = await db
    .insert(checklistItems)
    .values({ checklistId, text, position, assignedTo, dueDate })
    .returning();

  if (actorUserId && item) {
    const [cl] = await db
      .select({ cardId: checklists.cardId })
      .from(checklists)
      .where(eq(checklists.id, checklistId));
    if (cl?.cardId) {
      await db
        .insert(comments)
        .values({
          cardId: cl.cardId,
          userId: actorUserId,
          body: `➕ Added checklist item: **${text}**`,
        })
        .catch(() => {});
    }
  }

  await bumpForChecklist(db, checklistId);
  return item;
}

export async function updateChecklistItem(
  db: Database,
  itemId: string,
  input: any,
  actorUserId?: string
) {
  const [existing] = await db
    .select({
      id: checklistItems.id,
      text: checklistItems.text,
      isDone: checklistItems.isDone,
      cardId: checklists.cardId,
    })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .where(eq(checklistItems.id, itemId));

  const [item] = await db
    .update(checklistItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId))
    .returning();
  if (!item) throw httpError(404, 'Checklist item not found');

  if (
    existing?.cardId &&
    actorUserId &&
    input.isDone !== undefined &&
    input.isDone !== existing.isDone
  ) {
    const actionText = input.isDone
      ? `☑️ Completed checklist item: **${existing.text}**`
      : `⬜ Marked checklist item incomplete: **${existing.text}**`;
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: actionText,
      })
      .catch(() => {});
  }

  if (existing?.cardId) {
    await bumpForCard(db, existing.cardId);
  }
  return item;
}

export async function deleteChecklistItem(db: Database, itemId: string, actorUserId?: string) {
  const [existing] = await db
    .select({
      text: checklistItems.text,
      cardId: checklists.cardId,
    })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .where(eq(checklistItems.id, itemId));

  const [deleted] = await db
    .delete(checklistItems)
    .where(eq(checklistItems.id, itemId))
    .returning();
  if (!deleted) throw httpError(404, 'Checklist item not found');

  if (existing?.cardId && actorUserId) {
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: `🗑️ Removed checklist item: **${existing.text}**`,
      })
      .catch(() => {});
  }

  if (existing?.cardId) {
    await bumpForCard(db, existing.cardId);
  }
  return { success: true, deletedId: itemId };
}

export async function updateChecklist(
  db: Database,
  checklistId: string,
  title: string,
  actorUserId?: string
) {
  const [existing] = await db
    .select({ cardId: checklists.cardId, title: checklists.title })
    .from(checklists)
    .where(eq(checklists.id, checklistId));

  const [updated] = await db
    .update(checklists)
    .set({ title, updatedAt: new Date() })
    .where(eq(checklists.id, checklistId))
    .returning();
  if (!updated) throw httpError(404, 'Checklist not found');

  if (existing?.cardId && actorUserId && existing.title !== title) {
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: `📋 Renamed checklist to: **${title}**`,
      })
      .catch(() => {});
  }

  await bumpForChecklist(db, checklistId, existing?.cardId ?? null);
  return updated;
}

export async function deleteChecklist(db: Database, checklistId: string, actorUserId?: string) {
  const [existing] = await db
    .select({ cardId: checklists.cardId, title: checklists.title })
    .from(checklists)
    .where(eq(checklists.id, checklistId));

  await db.delete(checklistItems).where(eq(checklistItems.checklistId, checklistId));
  const [deleted] = await db.delete(checklists).where(eq(checklists.id, checklistId)).returning();
  if (!deleted) throw httpError(404, 'Checklist not found');

  if (existing?.cardId && actorUserId) {
    await db
      .insert(comments)
      .values({
        cardId: existing.cardId,
        userId: actorUserId,
        body: `🗑️ Removed checklist: **${existing.title}**`,
      })
      .catch(() => {});
  }

  await bumpForChecklist(db, checklistId, existing?.cardId ?? null);
  return { success: true, deletedId: checklistId };
}

// ─── My Tasks Hub ─────────────────────────────────────────────────────────────
export interface GetMyTasksOptions {
  filter?: string;
  search?: string;
  workspaceId?: string;
  projectId?: string;
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export async function getMyTasks(
  db: Database,
  organizationId: string,
  userId: string,
  options?: GetMyTasksOptions
) {
  // 1. Fetch user's assigned, watching, participating, and created card IDs.
  // Independent lookups — fan out concurrently (was 4 sequential round-trips).
  const [assignedRows, watchingRows, participatingRows, createdRows] = await Promise.all([
    db
      .select({ cardId: cardAssignees.cardId })
      .from(cardAssignees)
      .where(eq(cardAssignees.userId, userId)),
    db
      .select({ cardId: cardWatchers.cardId })
      .from(cardWatchers)
      .where(eq(cardWatchers.userId, userId)),
    db
      .select({ cardId: comments.cardId })
      .from(comments)
      .where(and(eq(comments.userId, userId), isNull(comments.deletedAt))),
    db
      .select({ cardId: cardAssignees.cardId })
      .from(cardAssignees)
      .where(eq(cardAssignees.assignedBy, userId)),
  ]);
  const assignedCardIds = new Set(assignedRows.map((r) => r.cardId));

  const watchingCardIds = new Set(watchingRows.map((r) => r.cardId));

  const participatingCardIds = new Set(participatingRows.map((r) => r.cardId));

  const createdCardIds = new Set(createdRows.map((r) => r.cardId));

  // Determine target card IDs based on filter
  const filter = options?.filter || 'all';
  let targetCardIds: Set<string>;

  if (filter === 'assigned') {
    targetCardIds = assignedCardIds;
  } else if (filter === 'observing') {
    targetCardIds = watchingCardIds;
  } else if (filter === 'participating') {
    targetCardIds = participatingCardIds;
  } else if (filter === 'created') {
    targetCardIds = createdCardIds;
  } else {
    // 'all' = union of all
    targetCardIds = new Set([
      ...assignedCardIds,
      ...watchingCardIds,
      ...participatingCardIds,
      ...createdCardIds,
    ]);
  }

  const targetIdsArray = Array.from(targetCardIds);

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  if (targetIdsArray.length === 0) {
    return {
      tasks: [],
      summary: {
        totalAssigned: assignedCardIds.size,
        totalObserving: watchingCardIds.size,
        totalParticipating: participatingCardIds.size,
        totalCreated: createdCardIds.size,
        overdueCount: 0,
        dueSoonCount: 0,
      },
      total: 0,
      hasMore: false,
      limit,
      offset,
    };
  }

  // Build query
  const conditions: (SQL<unknown> | undefined)[] = [
    inArray(cards.id, targetIdsArray),
    eq(workspaces.organizationId, organizationId),
    isNull(cards.deletedAt),
    eq(cards.isArchived, false),
  ];

  if (options?.search && options.search.trim()) {
    // Escape LIKE wildcards so a literal `%`/`_` can't turn into a full scan.
    const term = `%${options.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      or(ilike(cards.title, term), ilike(cards.description, term), ilike(cards.key, term))
    );
  }

  if (options?.workspaceId) {
    conditions.push(eq(workspaces.id, options.workspaceId));
  }

  if (options?.projectId) {
    conditions.push(eq(projects.id, options.projectId));
  }

  if (options?.status) {
    conditions.push(
      or(eq(stages.category, options.status as any), eq(stages.name, options.status))
    );
  }

  const rawTasks = await db
    .select({
      id: cards.id,
      taskNumber: cards.taskNumber,
      key: cards.key,
      title: cards.title,
      description: cards.description,
      dueDate: cards.dueDate,
      storyPoints: cards.storyPoints,
      estimateMinutes: cards.estimateMinutes,
      createdAt: cards.createdAt,
      updatedAt: cards.updatedAt,
      listId: cards.listId,
      listName: lists.name,
      boardId: lists.boardId,
      boardName: boards.name,
      projectId: boards.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      workspaceId: projects.workspaceId,
      workspaceName: workspaces.name,
      stageId: cards.stageId,
      stageName: stages.name,
      stageColor: stages.color,
      stageCategory: stages.category,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .leftJoin(stages, eq(stages.id, cards.stageId))
    .where(and(...conditions))
    .orderBy(desc(cards.updatedAt))
    .limit(limit)
    .offset(offset);

  // Full-set counts (summary + pagination) — same joins/filters, no limit/offset.
  const [counts] = await db
    .select({
      total: sql<number>`count(distinct ${cards.id})::int`,
      overdue: sql<number>`count(distinct ${cards.id}) filter (where ${cards.dueDate} < now())::int`,
      dueSoon: sql<number>`count(distinct ${cards.id}) filter (where ${cards.dueDate} >= now() and ${cards.dueDate} <= now() + interval '7 days')::int`,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .leftJoin(stages, eq(stages.id, cards.stageId))
    .where(and(...conditions));

  const cardIds = rawTasks.map((t) => t.id);

  // Assignees + watchers are independent — fetch concurrently.
  const [allAssignees, allWatchers] =
    cardIds.length > 0
      ? await Promise.all([
          db
            .select({
              cardId: cardAssignees.cardId,
              userId: users.id,
              name: users.name,
              email: users.email,
              avatarUrl: users.avatarUrl,
            })
            .from(cardAssignees)
            .innerJoin(users, eq(users.id, cardAssignees.userId))
            .where(inArray(cardAssignees.cardId, cardIds)),
          db
            .select({
              cardId: cardWatchers.cardId,
              userId: cardWatchers.userId,
            })
            .from(cardWatchers)
            .where(inArray(cardWatchers.cardId, cardIds)),
        ])
      : [[], []];

  const assigneesByCard = new Map<string, any[]>();
  allAssignees.forEach((a) => {
    const list = assigneesByCard.get(a.cardId) || [];
    list.push({ id: a.userId, name: a.name, email: a.email, avatarUrl: a.avatarUrl });
    assigneesByCard.set(a.cardId, list);
  });

  const watchersCountByCard = new Map<string, number>();
  allWatchers.forEach((w) => {
    watchersCountByCard.set(w.cardId, (watchersCountByCard.get(w.cardId) || 0) + 1);
  });

  // Comments + checklists are independent — fetch concurrently.
  const [allComments, allChecklists] =
    cardIds.length > 0
      ? await Promise.all([
          db
            .select({
              cardId: comments.cardId,
              id: comments.id,
            })
            .from(comments)
            .where(and(inArray(comments.cardId, cardIds), isNull(comments.deletedAt))),
          db
            .select({
              cardId: checklists.cardId,
              isCompleted: checklistItems.isDone,
            })
            .from(checklists)
            .innerJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
            .where(
              and(
                inArray(checklists.cardId, cardIds),
                isNull(checklists.deletedAt),
                isNull(checklistItems.deletedAt)
              )
            ),
        ])
      : [[], []];

  const commentsCountByCard = new Map<string, number>();
  allComments.forEach((c) => {
    commentsCountByCard.set(c.cardId, (commentsCountByCard.get(c.cardId) || 0) + 1);
  });

  const checklistsProgressByCard = new Map<string, { total: number; completed: number }>();
  allChecklists.forEach((item) => {
    const current = checklistsProgressByCard.get(item.cardId) || { total: 0, completed: 0 };
    current.total += 1;
    if (item.isCompleted) current.completed += 1;
    checklistsProgressByCard.set(item.cardId, current);
  });

  // Calculate overdue & dueSoon

  const tasks = rawTasks.map((t) => {
    const isAssignee = assignedCardIds.has(t.id);
    const isObserver = watchingCardIds.has(t.id);
    const isParticipant = participatingCardIds.has(t.id);
    const isCreator = createdCardIds.has(t.id);

    return {
      ...t,
      assignees: assigneesByCard.get(t.id) || [],
      watchersCount: watchersCountByCard.get(t.id) || 0,
      commentsCount: commentsCountByCard.get(t.id) || 0,
      checklistsProgress: checklistsProgressByCard.get(t.id) || { total: 0, completed: 0 },
      isAssignee,
      isObserver,
      isParticipant,
      isCreator,
    };
  });

  return {
    tasks,
    summary: {
      totalAssigned: assignedCardIds.size,
      totalObserving: watchingCardIds.size,
      totalParticipating: participatingCardIds.size,
      totalCreated: createdCardIds.size,
      overdueCount: counts?.overdue ?? 0,
      dueSoonCount: counts?.dueSoon ?? 0,
    },
    total: counts?.total ?? 0,
    hasMore: offset + tasks.length < (counts?.total ?? 0),
    limit,
    offset,
  };
}

export interface CloneCardInput {
  listId?: string;
  title?: string;
  parentCardId?: string;
  cloneChecklists?: boolean;
  cloneLabels?: boolean;
  cloneAssignees?: boolean;
}

export async function cloneCard(
  db: Database,
  cardId: string,
  organizationId: string,
  input: CloneCardInput = {}
) {
  // 1. Fetch original card
  const original = await getCard(db, cardId, organizationId);
  if (!original) throw httpError(404, 'Card not found');

  const targetListId = input.listId || original.listId;
  await verifyListAccess(db, targetListId, organizationId);

  // Position: get max position in the target list
  const [result] = await db
    .select({ maxPos: max(cards.position) })
    .from(cards)
    .where(eq(cards.listId, targetListId));

  const newPosition = (result?.maxPos ?? 0) + 65536;
  const clonedTitle =
    input.title || (input.parentCardId ? `Subtask: ${original.title}` : `${original.title} (Copy)`);

  // If cloning as a subtask, verify parentCard
  if (input.parentCardId) {
    const [parent] = await db
      .select({ id: cards.id, parentCardId: cards.parentCardId })
      .from(cards)
      .where(eq(cards.id, input.parentCardId))
      .limit(1);

    if (!parent) throw httpError(404, 'Parent card not found');
    if (parent.parentCardId) {
      throw httpError(400, 'Subtasks cannot have their own subtasks (max 2 levels of nesting)');
    }
  }

  // 2. Insert cloned card
  const [cloned] = await db
    .insert(cards)
    .values({
      organizationId,
      listId: targetListId,
      parentCardId: input.parentCardId || null,
      title: clonedTitle,
      description: original.description,
      position: newPosition,
      dueDate: original.dueDate ? new Date(original.dueDate) : null,
      stageId: original.stageId || null,
      storyPoints: original.storyPoints || null,
      estimateMinutes: original.estimateMinutes || null,
      coverImage: original.coverImage || null,
    })
    .returning();

  if (!cloned) throw httpError(500, 'Failed to clone card');

  // If parentCardId, update parent's subtasksTotal
  if (input.parentCardId) {
    await db
      .update(cards)
      .set({ subtasksTotal: sql`${cards.subtasksTotal} + 1` })
      .where(eq(cards.id, input.parentCardId));
  }

  // 3. Clone Checklists & Items
  if (input.cloneChecklists !== false) {
    const originalChecklists = await db
      .select()
      .from(checklists)
      .where(eq(checklists.cardId, cardId))
      .orderBy(checklists.position);

    for (const cl of originalChecklists) {
      const [newCl] = await db
        .insert(checklists)
        .values({
          cardId: cloned.id,
          title: cl.title,
          position: cl.position,
        })
        .returning();

      if (!newCl) continue;

      const originalItems = await db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.checklistId, cl.id))
        .orderBy(checklistItems.position);

      if (originalItems.length > 0) {
        await db.insert(checklistItems).values(
          originalItems.map((item) => ({
            checklistId: newCl.id,
            text: item.text,
            isDone: false,
            position: item.position,
            assignedTo: item.assignedTo,
            dueDate: item.dueDate,
          }))
        );
      }
    }
  }

  // 4. Clone Labels
  if (input.cloneLabels !== false) {
    const originalLabels = await db
      .select({ labelId: cardLabels.labelId })
      .from(cardLabels)
      .where(eq(cardLabels.cardId, cardId));

    if (originalLabels.length > 0) {
      await db.insert(cardLabels).values(
        originalLabels.map((l) => ({
          cardId: cloned.id,
          labelId: l.labelId,
        }))
      );
    }
  }

  // 5. Clone Assignees
  if (input.cloneAssignees !== false) {
    const originalAssignees = await db
      .select({ userId: cardAssignees.userId, assignedBy: cardAssignees.assignedBy })
      .from(cardAssignees)
      .where(eq(cardAssignees.cardId, cardId));

    if (originalAssignees.length > 0) {
      await db.insert(cardAssignees).values(
        originalAssignees.map((a) => ({
          cardId: cloned.id,
          userId: a.userId,
          assignedBy: a.assignedBy,
        }))
      );
    }
  }

  const [boardInfo] = await db
    .select({ boardId: lists.boardId })
    .from(lists)
    .where(eq(lists.id, targetListId))
    .limit(1);

  if (boardInfo) {
    eventBus.broadcast(`board:${boardInfo.boardId}`, 'card.created', cloned);
    await bumpBoardCache(boardInfo.boardId);
  }
  if (input.parentCardId) {
    // Parent's subtask counters changed — its caches are stale.
    await bumpForCard(db, input.parentCardId);
  }

  return await getCard(db, cloned.id, organizationId);
}
