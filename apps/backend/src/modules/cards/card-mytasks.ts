import { eq, and, isNull, desc, ne, or, ilike, inArray, exists, sql, type SQL } from 'drizzle-orm';
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
  // The relationship to the user is expressed as EXISTS predicates instead of
  // `WHERE cards.id IN (<every card id this user ever touched>)`.
  //
  // The previous shape read every assigned/watched/commented/assigned-by card id
  // for the user with four unbounded queries and bound the union back into the
  // page, count and badge queries. For a long-tenured user that is thousands of
  // ids bound as query parameters — past Postgres' 65535-parameter ceiling, and a
  // seq-scan-sized IN list even well before that. Each predicate below is an
  // index seek, and the per-card flags are resolved only for the returned page.
  const isAssigned = () =>
    exists(
      db
        .select({ one: sql`1` })
        .from(cardAssignees)
        .where(and(eq(cardAssignees.cardId, cards.id), eq(cardAssignees.userId, userId)))
    );
  const isObserving = () =>
    exists(
      db
        .select({ one: sql`1` })
        .from(cardWatchers)
        .where(and(eq(cardWatchers.cardId, cards.id), eq(cardWatchers.userId, userId)))
    );
  const isParticipant = () =>
    exists(
      db
        .select({ one: sql`1` })
        .from(comments)
        .where(
          and(
            eq(comments.cardId, cards.id),
            eq(comments.userId, userId),
            isNull(comments.deletedAt)
          )
        )
    );
  // 'created' has always meant "cards this user assigned someone on", not
  // "cards whose created_by is this user" — preserved deliberately.
  const isCreator = () =>
    exists(
      db
        .select({ one: sql`1` })
        .from(cardAssignees)
        .where(and(eq(cardAssignees.cardId, cards.id), eq(cardAssignees.assignedBy, userId)))
    );

  // One row, four scalar subqueries: the sidebar tab totals. These are global to
  // the user (not org-scoped), exactly as the previous in-memory Set sizes were.
  // Expressed via db.execute because drizzle's builder needs a FROM clause.
  const summaryResult = await db.execute(sql`
    SELECT
      (SELECT count(distinct ${cardAssignees.cardId})::int FROM ${cardAssignees}
        WHERE ${cardAssignees.userId} = ${userId}) AS "totalAssigned",
      (SELECT count(distinct ${cardWatchers.cardId})::int FROM ${cardWatchers}
        WHERE ${cardWatchers.userId} = ${userId}) AS "totalObserving",
      (SELECT count(distinct ${comments.cardId})::int FROM ${comments}
        WHERE ${comments.userId} = ${userId} AND ${comments.deletedAt} IS NULL)
        AS "totalParticipating",
      (SELECT count(distinct ${cardAssignees.cardId})::int FROM ${cardAssignees}
        WHERE ${cardAssignees.assignedBy} = ${userId}) AS "totalCreated"
  `);
  const summaryRow = (summaryResult as unknown as Array<Record<string, number | null>>)[0] ?? {};
  const summaryTotals = {
    totalAssigned: Number(summaryRow.totalAssigned ?? 0),
    totalObserving: Number(summaryRow.totalObserving ?? 0),
    totalParticipating: Number(summaryRow.totalParticipating ?? 0),
    totalCreated: Number(summaryRow.totalCreated ?? 0),
  };

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  const filter = options?.filter || 'all';
  const relationshipFilter: Record<string, SQL | undefined> = {
    assigned: isAssigned(),
    observing: isObserving(),
    participating: isParticipant(),
    created: isCreator(),
    all: or(isAssigned(), isObserving(), isParticipant(), isCreator()),
  };

  // Fast path: no relationship of any kind means no page and no badge, so skip
  // the four aggregate queries entirely (this is what the old empty-IN guard did).
  const hasAnyRelationship =
    summaryTotals.totalAssigned +
      summaryTotals.totalObserving +
      summaryTotals.totalParticipating +
      summaryTotals.totalCreated >
    0;

  if (!hasAnyRelationship) {
    return {
      tasks: [],
      summary: { ...summaryTotals, openAssignedCount: 0, overdueCount: 0, dueSoonCount: 0 },
      total: 0,
      hasMore: false,
      limit,
      offset,
    };
  }

  // Build query
  const conditions: (SQL | undefined)[] = [
    relationshipFilter[filter],
    eq(workspaces.organizationId, organizationId),
    isNull(cards.deletedAt),
    eq(cards.isArchived, false),
  ].filter((c): c is SQL => c !== undefined);

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

  // Full-set counts (summary + pagination) — same joins/filters, no limit/offset.
  // The badge aggregate is independent of the page, so all three run together.
  const [rawTasks, [counts], [openAssignedRow]] = await Promise.all([
    db
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
      .offset(offset),
    db
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
      .where(and(...conditions)),
    // Open assigned: the sidebar badge slice. Assigned to me, not
    // archived/deleted, stage not done (or unstaged). Scoped by EXISTS rather
    // than by binding every assigned card id.
    db
      .select({ n: sql<number>`count(distinct ${cards.id})::int` })
      .from(cards)
      .innerJoin(lists, eq(lists.id, cards.listId))
      .innerJoin(boards, eq(boards.id, lists.boardId))
      .innerJoin(projects, eq(projects.id, boards.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .leftJoin(stages, eq(stages.id, cards.stageId))
      .where(
        and(
          isAssigned(),
          eq(workspaces.organizationId, organizationId),
          isNull(cards.deletedAt),
          eq(cards.isArchived, false),
          or(isNull(stages.category), ne(stages.category, 'done'))
        )
      ),
  ]);

  const cardIds = rawTasks.map((t) => t.id);

  // Per-card relationship flags, resolved ONLY for the returned page (≤100 ids)
  // instead of from the user's entire history. These join the enrichment batch
  // below, which was already concurrent.
  const [pageAssigned, pageWatching, pageParticipating, pageCreated, allAssignees, allWatchers] =
    await Promise.all([
      cardIds.length > 0
        ? db
            .select({ cardId: cardAssignees.cardId })
            .from(cardAssignees)
            .where(and(inArray(cardAssignees.cardId, cardIds), eq(cardAssignees.userId, userId)))
        : Promise.resolve([]),
      cardIds.length > 0
        ? db
            .select({ cardId: cardWatchers.cardId })
            .from(cardWatchers)
            .where(and(inArray(cardWatchers.cardId, cardIds), eq(cardWatchers.userId, userId)))
        : Promise.resolve([]),
      cardIds.length > 0
        ? db
            .select({ cardId: comments.cardId })
            .from(comments)
            .where(
              and(
                inArray(comments.cardId, cardIds),
                eq(comments.userId, userId),
                isNull(comments.deletedAt)
              )
            )
        : Promise.resolve([]),
      cardIds.length > 0
        ? db
            .select({ cardId: cardAssignees.cardId })
            .from(cardAssignees)
            .where(
              and(inArray(cardAssignees.cardId, cardIds), eq(cardAssignees.assignedBy, userId))
            )
        : Promise.resolve([]),
      cardIds.length > 0
        ? db
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
        : Promise.resolve([]),
      cardIds.length > 0
        ? db
            .select({
              cardId: cardWatchers.cardId,
              userId: cardWatchers.userId,
            })
            .from(cardWatchers)
            .where(inArray(cardWatchers.cardId, cardIds))
        : Promise.resolve([]),
    ]);

  const assignedCardIds = new Set(pageAssigned.map((r) => r.cardId));
  const watchingCardIds = new Set(pageWatching.map((r) => r.cardId));
  const participatingCardIds = new Set(pageParticipating.map((r) => r.cardId));
  const createdCardIds = new Set(pageCreated.map((r) => r.cardId));

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

  // Open assigned was resolved above, concurrently with the page and counts.
  const openAssignedCount = Number(openAssignedRow?.n ?? 0);

  return {
    tasks,
    summary: {
      ...summaryTotals,
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
