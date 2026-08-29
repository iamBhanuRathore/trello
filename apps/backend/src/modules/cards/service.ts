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
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';

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
}

async function verifyListAccess(db: Database, listId: string, organizationId: string) {
  const [list] = await db
    .select({ listId: lists.id })
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

  eventBus.broadcast(`board:${boardInfo!.boardId}`, 'card.created', card);
  eventBus.emit('internal', {
    event: 'card.created',
    payload: { cardId: card!.id, listId: input.listId, boardId: boardInfo!.boardId },
    actorId: 'system',
    organizationId: boardInfo!.organizationId
  });
  return card;
}

export async function listCards(db: Database, listId: string, organizationId: string) {
  await verifyListAccess(db, listId, organizationId);
  const cardRows = await db
    .select()
    .from(cards)
    .where(and(eq(cards.listId, listId), eq(cards.isArchived, false), isNull(cards.deletedAt)))
    .orderBy(cards.position);

  const cardIds = cardRows.map((c) => c.id);
  if (cardIds.length === 0) return [];

  // 1. Assignees
  const assigneeRows = await db
    .select({
      cardId: cardAssignees.cardId,
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(cardAssignees)
    .innerJoin(users, eq(users.id, cardAssignees.userId))
    .where(inArray(cardAssignees.cardId, cardIds));

  const assigneesByCard = new Map<string, any>();
  assigneeRows.forEach((a) => {
    assigneesByCard.set(a.cardId, {
      id: a.id,
      name: a.name,
      email: a.email,
      avatarUrl: a.avatarUrl,
    });
  });

  // 2. Labels
  const labelRows = await db
    .select({
      cardId: cardLabels.cardId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .where(inArray(cardLabels.cardId, cardIds));

  const labelsByCard = new Map<string, any[]>();
  labelRows.forEach((l) => {
    if (!labelsByCard.has(l.cardId)) labelsByCard.set(l.cardId, []);
    labelsByCard.get(l.cardId)!.push({ id: l.id, name: l.name, color: l.color });
  });

  // 3. Stages
  const stageIds = cardRows.map((c) => c.stageId).filter(Boolean) as string[];
  const stagesByStageId = new Map<string, any>();
  if (stageIds.length > 0) {
    const stageRows = await db
      .select({
        id: stages.id,
        name: stages.name,
        color: stages.color,
        category: stages.category,
      })
      .from(stages)
      .where(inArray(stages.id, stageIds));
    stageRows.forEach((s) => stagesByStageId.set(s.id, s));
  }

  // 4. Checklist counts
  const checklistItemsRows = await db
    .select({
      cardId: checklists.cardId,
      itemId: checklistItems.id,
      isDone: checklistItems.isDone,
    })
    .from(checklists)
    .leftJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
    .where(inArray(checklists.cardId, cardIds));

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

  // 5. Comments counts
  const commentRows = await db
    .select({
      cardId: comments.cardId,
      id: comments.id,
    })
    .from(comments)
    .where(and(inArray(comments.cardId, cardIds), isNull(comments.deletedAt)));

  const commentsCountByCard = new Map<string, number>();
  commentRows.forEach((c) => {
    commentsCountByCard.set(c.cardId, (commentsCountByCard.get(c.cardId) || 0) + 1);
  });

  // 6. Attachments counts
  const attachmentRows = await db
    .select({
      cardId: attachments.cardId,
      id: attachments.id,
    })
    .from(attachments)
    .where(inArray(attachments.cardId, cardIds));

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
}

export async function listSubtasks(db: Database, parentCardId: string, organizationId: string) {
  // First ensure the parent card belongs to the organization
  await getCard(db, parentCardId, organizationId);

  const subtaskCards = await db
    .select()
    .from(cards)
    .where(and(eq(cards.parentCardId, parentCardId), eq(cards.isArchived, false), isNull(cards.deletedAt)))
    .orderBy(cards.position);

  const subtaskIds = subtaskCards.map((s) => s.id);
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
    ...s,
    assignee: assigneesBySubtask.get(s.id) || null,
    assignees: assigneesBySubtask.has(s.id) ? [assigneesBySubtask.get(s.id)] : [],
  }));
}

export async function getCard(db: Database, id: string, organizationId: string) {
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
    .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId), isNull(cards.deletedAt)))
    .limit(1);

  if (!card) throw httpError(404, 'Card not found');

  // Fetch assignees (single primary assignee model)
  const assignees = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(cardAssignees)
    .innerJoin(users, eq(users.id, cardAssignees.userId))
    .where(eq(cardAssignees.cardId, id));

  // Fetch participants (multiple collaborators)
  const participants = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      addedAt: cardParticipants.addedAt,
    })
    .from(cardParticipants)
    .innerJoin(users, eq(users.id, cardParticipants.userId))
    .where(eq(cardParticipants.cardId, id));

  // Fetch watchers (multiple observers)
  const watchers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      subscribedAt: cardWatchers.subscribedAt,
    })
    .from(cardWatchers)
    .innerJoin(users, eq(users.id, cardWatchers.userId))
    .where(eq(cardWatchers.cardId, id));

  // Fetch labels
  const cardLabelsList = await db
    .select({
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(cardLabels)
    .innerJoin(labels, eq(labels.id, cardLabels.labelId))
    .where(eq(cardLabels.cardId, id));

  // Fetch stage if stageId is present
  let stage = null;
  if (card.stageId) {
    const [s] = await db
      .select({
        id: stages.id,
        name: stages.name,
        color: stages.color,
        category: stages.category,
      })
      .from(stages)
      .where(eq(stages.id, card.stageId))
      .limit(1);
    stage = s || null;
  }

  // Fetch parent card if parentCardId is present
  let parentCard = null;
  if (card.parentCardId) {
    const [p] = await db
      .select({
        id: cards.id,
        title: cards.title,
      })
      .from(cards)
      .where(eq(cards.id, card.parentCardId))
      .limit(1);
    parentCard = p || null;
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
  };
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
  return { success: true, id };
}

export async function getBoardLabels(db: Database, boardId: string) {
  return db
    .select()
    .from(labels)
    .where(eq(labels.boardId, boardId))
    .orderBy(labels.name);
}

export async function createBoardLabel(db: Database, boardId: string, name: string, color: string) {
  const [newLabel] = await db
    .insert(labels)
    .values({ boardId, name, color })
    .returning();
  return newLabel;
}

export async function updateBoardLabel(db: Database, labelId: string, name?: string, color?: string) {
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
  return updated;
}

export async function deleteBoardLabel(db: Database, labelId: string) {
  // Remove from cards first (cascade FK)
  await db.delete(cardLabels).where(eq(cardLabels.labelId, labelId));
  await db.delete(labels).where(eq(labels.id, labelId));
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
  return card;
}

export async function moveCard(db: Database, id: string, organizationId: string, newListId: string, newPosition: number, actorId?: string) {
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
      organizationId
    });
  }
  return card;
}

export async function archiveCard(db: Database, id: string, organizationId: string, actorId?: string) {
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
      organizationId
    });
  }
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
  const [comment] = await db
    .insert(comments)
    .values({ cardId, userId, body })
    .returning();

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

  return comment;
}

// ─── Attachments ──────────────────────────────────────────────────────────────
export async function listAttachments(db: Database, cardId: string) {
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.cardId, cardId), isNull(attachments.deletedAt)))
    .orderBy(desc(attachments.createdAt));
}

export async function createAttachmentRecord(db: Database, cardId: string, userId: string, url: string, fileName: string, fileType?: string, sizeBytes?: number) {
  const [attachment] = await db
    .insert(attachments)
    .values({ cardId, uploadedBy: userId, url, fileName, fileType, sizeBytes })
    .returning();
  return attachment;
}

export async function deleteAttachment(db: Database, attachmentId: string, userId: string) {
  const [attachment] = await db
    .update(attachments)
    .set({ deletedAt: new Date() })
    .where(and(eq(attachments.id, attachmentId), eq(attachments.uploadedBy, userId)))
    .returning();
  if (!attachment) throw httpError(404, 'Attachment not found or not authorized to delete');
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

export async function attachLabelToCard(db: Database, cardId: string, labelId: string, actorId?: string) {
  if (!isValidUuid(cardId) || !isValidUuid(labelId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or labelId' };
  }
  await db.insert(cardLabels).values({ cardId, labelId }).onConflictDoNothing();
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    const [board] = await db.select({ organizationId: boards.organizationId }).from(boards).where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.labeled',
        payload: { cardId, labelId },
        actorId: actorId || 'system',
        organizationId: board.organizationId
      });
    }
  }
  return { success: true };
}

export async function removeLabelFromCard(db: Database, cardId: string, labelId: string) {
  if (!isValidUuid(cardId) || !isValidUuid(labelId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or labelId' };
  }
  await db.delete(cardLabels).where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, labelId)));
  return { success: true };
}

// ─── Assignees (Single Assignee Model) ─────────────────────────────────────────
export async function assignUserToCard(db: Database, cardId: string, userId: string, actorId: string) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  // Enforce single primary assignee: clear previous assignees first
  await db.delete(cardAssignees).where(eq(cardAssignees.cardId, cardId));
  await db.insert(cardAssignees).values({ cardId, userId, assignedBy: actorId }).onConflictDoNothing();
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.assigned', { cardId, assigneeId: userId });
    const [board] = await db.select({ organizationId: boards.organizationId }).from(boards).where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.assigned',
        payload: { cardId, assigneeId: userId },
        actorId,
        organizationId: board.organizationId
      });
    }
  }
  return { success: true };
}

export async function removeUserFromCard(db: Database, cardId: string, userId: string) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  await db.delete(cardAssignees).where(and(eq(cardAssignees.cardId, cardId), eq(cardAssignees.userId, userId)));
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.unassigned', { cardId, userId });
  }
  return { success: true };
}

// ─── Participants (Multiple Collaborators Model) ──────────────────────────────
export async function addParticipantToCard(db: Database, cardId: string, userId: string, actorId: string) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  await db.insert(cardParticipants).values({ cardId, userId, addedBy: actorId }).onConflictDoNothing();
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.participant_added', { cardId, userId });
    const [board] = await db.select({ organizationId: boards.organizationId }).from(boards).where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.participant_added',
        payload: { cardId, participantId: userId },
        actorId,
        organizationId: board.organizationId,
      });
    }
  }
  return { success: true };
}

export async function removeParticipantFromCard(db: Database, cardId: string, userId: string) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    return { success: false, error: 'Invalid UUID provided for cardId or userId' };
  }
  await db.delete(cardParticipants).where(and(eq(cardParticipants.cardId, cardId), eq(cardParticipants.userId, userId)));
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.participant_removed', { cardId, userId });
  }
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
    })
    .from(cardParticipants)
    .innerJoin(users, eq(users.id, cardParticipants.userId))
    .where(eq(cardParticipants.cardId, cardId));
}

// ─── Watchers ─────────────────────────────────────────────────────────────────
export async function watchCard(db: Database, cardId: string, userId: string, organizationId?: string) {
  if (organizationId) {
    await getCard(db, cardId, organizationId);
  }
  await db.insert(cardWatchers).values({ cardId, userId }).onConflictDoNothing();
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.watched', { cardId, userId });
    const [board] = await db.select({ organizationId: boards.organizationId }).from(boards).where(eq(boards.id, boardId));
    if (board?.organizationId) {
      eventBus.emit('internal', {
        event: 'card.watched',
        payload: { cardId, userId },
        actorId: userId,
        organizationId: board.organizationId
      });
    }
  }
  return { success: true, watched: true };
}

export async function unwatchCard(db: Database, cardId: string, userId: string, organizationId?: string) {
  if (organizationId) {
    await getCard(db, cardId, organizationId);
  }
  await db.delete(cardWatchers).where(and(eq(cardWatchers.cardId, cardId), eq(cardWatchers.userId, userId)));
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.unwatched', { cardId, userId });
    const [board] = await db.select({ organizationId: boards.organizationId }).from(boards).where(eq(boards.id, boardId));
    if (board?.organizationId) {
      eventBus.emit('internal', {
        event: 'card.unwatched',
        payload: { cardId, userId },
        actorId: userId,
        organizationId: board.organizationId
      });
    }
  }
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
    })
    .from(cardWatchers)
    .innerJoin(users, eq(users.id, cardWatchers.userId))
    .where(eq(cardWatchers.cardId, cardId));
}

// ─── Checklists ───────────────────────────────────────────────────────────────
export async function getCardChecklists(db: Database, cardId: string) {
  const allChecklists = await db
    .select()
    .from(checklists)
    .where(and(eq(checklists.cardId, cardId), isNull(checklists.deletedAt)))
    .orderBy(checklists.position);

  const allItems = await db
    .select()
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .where(and(eq(checklists.cardId, cardId), isNull(checklists.deletedAt), isNull(checklistItems.deletedAt)))
    .orderBy(checklistItems.position);

  return allChecklists.map(cl => ({
    ...cl,
    items: allItems.filter(item => item.checklist_items.checklistId === cl.id).map(i => i.checklist_items),
  }));
}

export async function createChecklist(db: Database, cardId: string, title: string, position: number) {
  const [checklist] = await db.insert(checklists).values({ cardId, title, position }).returning();
  return checklist;
}

export async function createChecklistItem(db: Database, checklistId: string, text: string, position: number, assignedTo?: string, dueDate?: Date) {
  const [item] = await db
    .insert(checklistItems)
    .values({ checklistId, text, position, assignedTo, dueDate })
    .returning();
  return item;
}

export async function updateChecklistItem(db: Database, itemId: string, input: any) {
  const [item] = await db
    .update(checklistItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(checklistItems.id, itemId))
    .returning();
  if (!item) throw httpError(404, 'Checklist item not found');
  return item;
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
  // 1. Fetch user's assigned, watching, participating, and created card IDs
  const assignedRows = await db
    .select({ cardId: cardAssignees.cardId })
    .from(cardAssignees)
    .where(eq(cardAssignees.userId, userId));
  const assignedCardIds = new Set(assignedRows.map((r) => r.cardId));

  const watchingRows = await db
    .select({ cardId: cardWatchers.cardId })
    .from(cardWatchers)
    .where(eq(cardWatchers.userId, userId));
  const watchingCardIds = new Set(watchingRows.map((r) => r.cardId));

  const participatingRows = await db
    .select({ cardId: comments.cardId })
    .from(comments)
    .where(and(eq(comments.userId, userId), isNull(comments.deletedAt)));
  const participatingCardIds = new Set(participatingRows.map((r) => r.cardId));

  const createdRows = await db
    .select({ cardId: cardAssignees.cardId })
    .from(cardAssignees)
    .where(eq(cardAssignees.assignedBy, userId));
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
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(cards.title, term),
        ilike(cards.description, term),
        ilike(cards.key, term)
      )
    );
  }

  if (options?.workspaceId) {
    conditions.push(eq(workspaces.id, options.workspaceId));
  }

  if (options?.projectId) {
    conditions.push(eq(projects.id, options.projectId));
  }

  if (options?.status) {
    conditions.push(or(eq(stages.category, options.status as any), eq(stages.name, options.status)));
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
    .orderBy(desc(cards.updatedAt));

  const cardIds = rawTasks.map((t) => t.id);

  // Fetch assignees for these cards
  const allAssignees = cardIds.length > 0
    ? await db
        .select({
          cardId: cardAssignees.cardId,
          userId: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(cardAssignees)
        .innerJoin(users, eq(users.id, cardAssignees.userId))
        .where(inArray(cardAssignees.cardId, cardIds))
    : [];

  const assigneesByCard = new Map<string, any[]>();
  allAssignees.forEach((a) => {
    const list = assigneesByCard.get(a.cardId) || [];
    list.push({ id: a.userId, name: a.name, email: a.email, avatarUrl: a.avatarUrl });
    assigneesByCard.set(a.cardId, list);
  });

  // Fetch watchers count for these cards
  const allWatchers = cardIds.length > 0
    ? await db
        .select({
          cardId: cardWatchers.cardId,
          userId: cardWatchers.userId,
        })
        .from(cardWatchers)
        .where(inArray(cardWatchers.cardId, cardIds))
    : [];

  const watchersCountByCard = new Map<string, number>();
  allWatchers.forEach((w) => {
    watchersCountByCard.set(w.cardId, (watchersCountByCard.get(w.cardId) || 0) + 1);
  });

  // Fetch comments count
  const allComments = cardIds.length > 0
    ? await db
        .select({
          cardId: comments.cardId,
          id: comments.id,
        })
        .from(comments)
        .where(and(inArray(comments.cardId, cardIds), isNull(comments.deletedAt)))
    : [];

  const commentsCountByCard = new Map<string, number>();
  allComments.forEach((c) => {
    commentsCountByCard.set(c.cardId, (commentsCountByCard.get(c.cardId) || 0) + 1);
  });

  // Fetch checklists progress
  const allChecklists = cardIds.length > 0
    ? await db
        .select({
          cardId: checklists.cardId,
          isCompleted: checklistItems.isDone,
        })
        .from(checklists)
        .innerJoin(checklistItems, eq(checklistItems.checklistId, checklists.id))
        .where(and(inArray(checklists.cardId, cardIds), isNull(checklists.deletedAt), isNull(checklistItems.deletedAt)))
    : [];

  const checklistsProgressByCard = new Map<string, { total: number; completed: number }>();
  allChecklists.forEach((item) => {
    const current = checklistsProgressByCard.get(item.cardId) || { total: 0, completed: 0 };
    current.total += 1;
    if (item.isCompleted) current.completed += 1;
    checklistsProgressByCard.set(item.cardId, current);
  });

  // Calculate overdue & dueSoon
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let overdueCount = 0;
  let dueSoonCount = 0;

  const tasks = rawTasks.map((t) => {
    const isAssignee = assignedCardIds.has(t.id);
    const isObserver = watchingCardIds.has(t.id);
    const isParticipant = participatingCardIds.has(t.id);
    const isCreator = createdCardIds.has(t.id);

    if (t.dueDate) {
      const d = new Date(t.dueDate);
      if (d < now) {
        overdueCount++;
      } else if (d <= sevenDaysFromNow) {
        dueSoonCount++;
      }
    }

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
      overdueCount,
      dueSoonCount,
    },
    total: tasks.length,
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
  const clonedTitle = input.title || (input.parentCardId ? `Subtask: ${original.title}` : `${original.title} (Copy)`);

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
  }

  return await getCard(db, cloned.id, organizationId);
}
