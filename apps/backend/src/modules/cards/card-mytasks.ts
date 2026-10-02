import { eq, and, isNull, desc, ne, or, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  cards,
  lists,
  boards,
  comments,
  checklists,
  checklistItems,
  users,
  stages,
  cardAssignees,
  cardWatchers,
  projects,
  workspaces,
  priorities,
} from '../../db/schema/index';

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
        openAssignedCount: 0,
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

  if (options?.priority && options.priority !== 'all') {
    const p = options.priority.trim();
    // New clients send the priority id; legacy hardcoded names still resolve.
    const isUuid = /^[0-9a-fA-F-]{36}$/.test(p);
    conditions.push(
      isUuid ? eq(cards.priorityId, p) : eq(sql`lower(${priorities.name})`, p.toLowerCase())
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
      priorityId: cards.priorityId,
      priorityName: priorities.name,
      priorityColor: priorities.color,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .leftJoin(stages, eq(stages.id, cards.stageId))
    .leftJoin(priorities, eq(priorities.id, cards.priorityId))
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
    .leftJoin(priorities, eq(priorities.id, cards.priorityId))
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
      priority: t.priorityId
        ? { id: t.priorityId, name: t.priorityName, color: t.priorityColor }
        : null,
      isAssignee,
      isObserver,
      isParticipant,
      isCreator,
    };
  });

  // Open assigned: the sidebar badge slice. Assigned to me, not
  // archived/deleted, stage not done (or unstaged). Separate aggregate from
  // the counts above, which are scoped to the active filter union — the badge
  // needs the assigned slice on every tab.
  let openAssignedCount = 0;
  if (assignedCardIds.size > 0) {
    const [openRow] = await db
      .select({ n: sql<number>`count(distinct ${cards.id})::int` })
      .from(cards)
      .innerJoin(lists, eq(lists.id, cards.listId))
      .innerJoin(boards, eq(boards.id, lists.boardId))
      .innerJoin(projects, eq(projects.id, boards.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .leftJoin(stages, eq(stages.id, cards.stageId))
      .where(
        and(
          inArray(cards.id, Array.from(assignedCardIds)),
          eq(workspaces.organizationId, organizationId),
          isNull(cards.deletedAt),
          eq(cards.isArchived, false),
          or(isNull(stages.category), ne(stages.category, 'done'))
        )
      );
    openAssignedCount = openRow?.n ?? 0;
  }

  return {
    tasks,
    summary: {
      totalAssigned: assignedCardIds.size,
      totalObserving: watchingCardIds.size,
      totalParticipating: participatingCardIds.size,
      totalCreated: createdCardIds.size,
      openAssignedCount,
      overdueCount: counts?.overdue ?? 0,
      dueSoonCount: counts?.dueSoon ?? 0,
    },
    total: counts?.total ?? 0,
    hasMore: offset + tasks.length < (counts?.total ?? 0),
    limit,
    offset,
  };
}
