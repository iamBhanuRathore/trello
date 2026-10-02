import { eq, and, isNull, max, desc, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
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
  timeLogs,
  priorities,
} from '../../db/schema/index';
import { resolvePriorityId, getDefaultPriorityId } from '../priorities/service';
import { requireCardAccess } from './access';
import { httpError } from '../organizations/service';
import { clampLimit } from '../../lib/pagination';
import { eventBus } from '../../lib/event-bus';
import { notifyProjectChannels } from '../chat/service';
import {
  cachedBoardRead,
  cachedCardRead,
  bumpBoardCache,
  bumpCardAndBoard,
  bumpCardCache,
  bumpOrgCache,
  rememberCardBoard,
} from '../../lib/cache';
import {
  type CreateCardInput,
  isValidUuid,
  verifyListAccess,
  linkCreateComponents,
  requireOrgMember,
  getBoardIdForCard,
  bumpForCard,
} from './card-helpers';
import { createChecklist } from './card-checklists';

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

  // Enforce 2-level nesting limit if parentCardId is provided.
  // P0: the parent must live in the SAME organization — a PK-only lookup let a
  // foreign-org parent id create a cross-tenant subtask link and corrupt the
  // foreign parent's subtasksTotal.
  if (input.parentCardId) {
    const [parentCard] = await db
      .select({ id: cards.id, parentCardId: cards.parentCardId })
      .from(cards)
      .where(and(eq(cards.id, input.parentCardId), eq(cards.organizationId, organizationId)))
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
      // Automation system actors (automation:{ruleId}) are not users rows —
      // coerce FK columns to NULL, the event payload below keeps provenance.
      createdBy: isValidUuid(input.actorId) ? input.actorId : undefined,
      sourceRuleId: isValidUuid(input.sourceRuleId) ? input.sourceRuleId : undefined,
      sourceActionId: isValidUuid(input.sourceActionId) ? input.sourceActionId : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      stageId: input.stageId,
      priorityId:
        (await resolvePriorityId(
          db,
          boardInfo?.organizationId || organizationId,
          input.priorityId ?? null
        )) ?? (await getDefaultPriorityId(db, boardInfo?.organizationId || organizationId)),
      storyPoints: input.storyPoints,
      estimateMinutes: input.estimateMinutes,
    })
    .returning();

  if (input.assigneeId && card) {
    // Explicit assignee wins over every rule — still must be an org member.
    await requireOrgMember(db, organizationId, input.assigneeId);
    await db
      .insert(cardAssignees)
      .values({
        cardId: card.id,
        userId: input.assigneeId,
        assignedBy: isValidUuid(input.actorId) ? input.actorId : undefined,
      })
      .onConflictDoNothing();
  } else if (card) {
    // Static default-assignee resolution (most-specific scope wins).
    const { resolveDefaultAssignee, getAssignmentPolicy } = await import('../components/service');
    const linkedComponentIds = await linkCreateComponents(
      db,
      organizationId,
      card.id,
      boardInfo?.boardId,
      input
    );
    const resolved = await resolveDefaultAssignee(db, organizationId, {
      projectId: boardInfo?.projectId ?? null,
      boardId: boardInfo?.boardId ?? null,
      componentIds: linkedComponentIds,
    });
    if (resolved.userId) {
      await db
        .insert(cardAssignees)
        .values({
          cardId: card.id,
          userId: resolved.userId,
          assignedBy: isValidUuid(input.actorId) ? input.actorId : undefined,
        })
        .onConflictDoNothing();
    } else {
      const policy = await getAssignmentPolicy(db, organizationId);
      if (!policy.allowUnassigned) {
        throw httpError(
          422,
          'An assignee is required by this organization — no default rule resolved one.'
        );
      }
    }
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
        organizationId,
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
    payload: {
      cardId: card!.id,
      listId: input.listId,
      boardId: boardInfo!.boardId,
      eventId: randomUUID(),
    },
    // Propagate the actor (automation:{ruleId} for rule-created subtasks) so
    // the project automation engine's never-retrigger layer actually holds.
    // Consumers only compare actorId (notifications) or forward it (webhooks).
    actorId: input.actorId || 'system',
    organizationId: boardInfo!.organizationId,
  });
  await bumpBoardCache(boardInfo!.boardId);
  await bumpOrgCache(boardInfo!.organizationId);
  // Linked-channel activity feed (best-effort, never breaks creation).
  if (boardInfo?.projectId && input.actorId && card) {
    const label = cardKey ? `**${cardKey}** ${card.title}` : `**${card.title}**`;
    notifyProjectChannels(
      db,
      boardInfo.organizationId,
      boardInfo.projectId,
      input.actorId,
      `🆕 ${label} created`
    ).catch(() => {});
  }
  // Subtask creation must invalidate the parent card modal (subtasksTotal/Done cached under cv).
  if (input.parentCardId) {
    await bumpForCard(db, input.parentCardId);
  }
  return card;
}

export async function listCards(
  db: Database,
  listId: string,
  organizationId: string,
  options: { limit?: number | string } = {}
) {
  const { boardId } = await verifyListAccess(db, listId, organizationId);
  // Safety valve (5.3): a single list can never stream an unbounded row set.
  const rowLimit = clampLimit(options.limit, { def: 500, max: 500 });
  // Hot board-loop read: 1 Redis RTT on hit, zero Neon queries.
  const { data } = await cachedBoardRead(
    boardId,
    `${organizationId}:cards:${listId}`,
    'cards',
    async () => {
      const cardRows = await db
        .select()
        .from(cards)
        .where(and(eq(cards.listId, listId), eq(cards.isArchived, false), isNull(cards.deletedAt)))
        .orderBy(cards.position)
        .limit(rowLimit);

      const cardIds = cardRows.map((c) => c.id);
      if (cardIds.length === 0) return [];

      // Enrichment queries are independent — fan out concurrently (was 6 sequential
      // round-trips; pool + Docker RTT made each list ~1s).
      const stageIds = cardRows.map((c) => c.stageId).filter(Boolean) as string[];
      const priorityIds = [
        ...new Set(cardRows.map((c) => c.priorityId).filter(Boolean)),
      ] as string[];
      const [
        assigneeRows,
        labelRows,
        stageRows,
        checklistItemsRows,
        commentRows,
        attachmentRows,
        priorityRows,
      ] = await Promise.all([
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
        // 7. Priorities (org-configured w/ colors)
        priorityIds.length > 0
          ? db
              .select({
                id: priorities.id,
                name: priorities.name,
                color: priorities.color,
              })
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

      const stagesByStageId = new Map<string, any>();
      stageRows.forEach((s) => stagesByStageId.set(s.id, s));

      const prioritiesById = new Map<string, any>();
      priorityRows.forEach((p) => prioritiesById.set(p.id, p));

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
          priority: card.priorityId ? prioritiesById.get(card.priorityId) || null : null,
          checklistTotal: clStats.total,
          checklistDone: clStats.done,
          commentsCount: commentsCountByCard.get(card.id) || 0,
          attachmentsCount: attachmentsCountByCard.get(card.id) || 0,
        };
      });
    }
  );
  return data;
}

export async function listSubtasks(
  db: Database,
  parentCardId: string,
  organizationId: string,
  options: { limit?: number | string } = {}
) {
  // First ensure the parent card belongs to the organization
  await getCard(db, parentCardId, organizationId);
  const rowLimit = clampLimit(options.limit);

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
    .orderBy(cards.position)
    .limit(rowLimit);

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

export async function getCard(
  db: Database,
  id: string,
  organizationId: string,
  actor?: { userId: string; isPlatformAdmin?: boolean }
) {
  // Hot modal read: 1 Redis RTT on hit, zero Neon queries.
  // 404s thrown by the loader are never cached (store happens only on success).
  const { data, hit } = await cachedCardRead(id, `${organizationId}:full`, 'card', async () => {
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
        isPrivate: cards.isPrivate,
        createdBy: cards.createdBy,
        priorityId: cards.priorityId,
        priorityName: priorities.name,
        priorityColor: priorities.color,
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
      .leftJoin(priorities, eq(priorities.id, cards.priorityId))
      .where(
        and(eq(cards.id, id), eq(cards.organizationId, organizationId), isNull(cards.deletedAt))
      )
      .limit(1);

    if (!card) throw httpError(404, 'Card not found');

    // Private tasks gate here — list paths filter instead (bulk-friendly).
    if (actor) {
      await requireCardAccess(
        db,
        {
          id: card.id,
          organizationId: card.organizationId,
          isPrivate: (card as any).isPrivate ?? false,
          createdBy: (card as any).createdBy ?? null,
        },
        actor.userId,
        actor.isPlatformAdmin
      );
    }

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
      priority: card.priorityId
        ? { id: card.priorityId, name: card.priorityName, color: card.priorityColor }
        : null,
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

/** Fields a caller may change via updateCard — everything else is rejected
 * (mass-assignment: organizationId/listId/isArchived/version must never be
 * settable through this path, even if a route schema ever passes them through). */
const UPDATE_CARD_FIELDS = [
  'title',
  'description',
  'dueDate',
  'stageId',
  'storyPoints',
  'estimateMinutes',
  'priorityId',
  'coverImage',
  // Written by the calendar module (scheduleCard), not by the PATCH /cards/:id route.
  'scheduledStart',
  'scheduledEnd',
] as const;

export async function updateCard(db: Database, id: string, organizationId: string, input: any) {
  const patch: any = { updatedAt: new Date() };
  for (const field of UPDATE_CARD_FIELDS) {
    if (input?.[field] !== undefined) patch[field] = input[field];
  }
  const resolvedPriority = await resolvePriorityId(db, organizationId, input?.priorityId);
  if (resolvedPriority !== undefined) patch.priorityId = resolvedPriority;
  const [card] = await db
    .update(cards)
    .set(patch)
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
