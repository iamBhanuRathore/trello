import { eq, and, isNull, gte, lte, desc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { timeLogs, cards, users, lists, boards, projects } from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { bumpCardCache } from '../../lib/cache';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export interface LogTimeInput {
  cardId: string;
  minutes: number;
  description?: string;
  loggedDate?: string;
  isBillable?: boolean;
}

export async function logTime(
  db: Database,
  organizationId: string,
  userId: string,
  input: LogTimeInput
) {
  if (input.minutes <= 0) {
    throw httpError(400, 'Minutes must be greater than 0');
  }

  const [card] = await db
    .select({
      id: cards.id,
      organizationId: cards.organizationId,
      title: cards.title,
      listId: cards.listId,
    })
    .from(cards)
    .where(and(eq(cards.id, input.cardId), eq(cards.organizationId, organizationId)))
    .limit(1);

  if (!card) throw httpError(404, 'Card not found');

  const todayStr = new Date().toISOString().split('T')[0]!;
  const loggedDate = input.loggedDate || todayStr;

  const [timeLog] = await db
    .insert(timeLogs)
    .values({
      cardId: input.cardId,
      userId,
      minutes: input.minutes,
      description: input.description,
      loggedDate,
      isBillable: input.isBillable ?? false,
    })
    .returning();

  const [user] = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId));

  eventBus.emit('internal', {
    event: 'card.time_logged',
    payload: {
      cardId: input.cardId,
      minutes: input.minutes,
      timeLogId: timeLog!.id,
    },
    actorId: userId,
    organizationId,
  });

  // Time logs are embedded in the cached getCard payload — bump it.
  await bumpCardCache(input.cardId);

  return {
    ...timeLog!,
    user: user || { id: userId, name: 'User', avatarUrl: null },
  };
}

export async function getCardTimeLogs(db: Database, organizationId: string, cardId: string) {
  const [card] = await db
    .select({
      id: cards.id,
      title: cards.title,
      estimateMinutes: cards.estimateMinutes,
    })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);

  if (!card) throw httpError(404, 'Card not found');

  const logs = await db
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
    .where(and(eq(timeLogs.cardId, cardId), isNull(timeLogs.deletedAt)))
    .orderBy(desc(timeLogs.loggedDate), desc(timeLogs.createdAt));

  let totalMinutes = 0;
  let billableMinutes = 0;
  let nonBillableMinutes = 0;

  for (const log of logs) {
    totalMinutes += log.minutes;
    if (log.isBillable) {
      billableMinutes += log.minutes;
    } else {
      nonBillableMinutes += log.minutes;
    }
  }

  return {
    cardId: card.id,
    cardTitle: card.title,
    estimateMinutes: card.estimateMinutes || 0,
    totalMinutes,
    billableMinutes,
    nonBillableMinutes,
    timeLogs: logs,
  };
}

export async function deleteTimeLog(
  db: Database,
  organizationId: string,
  userId: string,
  timeLogId: string
) {
  const [log] = await db
    .select({
      id: timeLogs.id,
      userId: timeLogs.userId,
      cardId: timeLogs.cardId,
      organizationId: cards.organizationId,
    })
    .from(timeLogs)
    .innerJoin(cards, eq(timeLogs.cardId, cards.id))
    .where(and(eq(timeLogs.id, timeLogId), eq(cards.organizationId, organizationId)))
    .limit(1);

  if (!log) throw httpError(404, 'Time log not found');
  if (log.userId !== userId) {
    throw httpError(403, 'Forbidden — you can only delete your own time logs');
  }

  const [deleted] = await db.delete(timeLogs).where(eq(timeLogs.id, timeLogId)).returning();

  // Time logs are embedded in the cached getCard payload — bump it.
  if (deleted) await bumpCardCache(deleted.cardId);

  return deleted;
}

export async function getTimesheet(
  db: Database,
  organizationId: string,
  filter?: {
    userId?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
  }
) {
  const conditions = [eq(cards.organizationId, organizationId), isNull(timeLogs.deletedAt)];

  if (filter?.userId) {
    conditions.push(eq(timeLogs.userId, filter.userId));
  }

  if (filter?.startDate) {
    conditions.push(gte(timeLogs.loggedDate, filter.startDate));
  }

  if (filter?.endDate) {
    conditions.push(lte(timeLogs.loggedDate, filter.endDate));
  }

  if (filter?.projectId) {
    conditions.push(eq(boards.projectId, filter.projectId));
  }

  const entries = await db
    .select({
      id: timeLogs.id,
      minutes: timeLogs.minutes,
      description: timeLogs.description,
      loggedDate: timeLogs.loggedDate,
      isBillable: timeLogs.isBillable,
      createdAt: timeLogs.createdAt,
      card: {
        id: cards.id,
        title: cards.title,
      },
      board: {
        id: boards.id,
        name: boards.name,
      },
      project: {
        id: projects.id,
        name: projects.name,
      },
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(timeLogs)
    .innerJoin(cards, eq(timeLogs.cardId, cards.id))
    .innerJoin(lists, eq(cards.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .innerJoin(projects, eq(boards.projectId, projects.id))
    .innerJoin(users, eq(timeLogs.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(timeLogs.loggedDate), desc(timeLogs.createdAt));

  let totalMinutes = 0;
  let billableMinutes = 0;
  const userSummary: Record<
    string,
    {
      userId: string;
      name: string;
      avatarUrl: string | null;
      totalMinutes: number;
      billableMinutes: number;
    }
  > = {};

  const projectSummary: Record<
    string,
    { projectId: string; name: string; totalMinutes: number; billableMinutes: number }
  > = {};

  for (const entry of entries) {
    totalMinutes += entry.minutes;
    if (entry.isBillable) billableMinutes += entry.minutes;

    // User aggregation
    if (!userSummary[entry.user.id]) {
      userSummary[entry.user.id] = {
        userId: entry.user.id,
        name: entry.user.name,
        avatarUrl: entry.user.avatarUrl,
        totalMinutes: 0,
        billableMinutes: 0,
      };
    }
    userSummary[entry.user.id]!.totalMinutes += entry.minutes;
    if (entry.isBillable) userSummary[entry.user.id]!.billableMinutes += entry.minutes;

    // Project aggregation
    if (!projectSummary[entry.project.id]) {
      projectSummary[entry.project.id] = {
        projectId: entry.project.id,
        name: entry.project.name,
        totalMinutes: 0,
        billableMinutes: 0,
      };
    }
    projectSummary[entry.project.id]!.totalMinutes += entry.minutes;
    if (entry.isBillable) projectSummary[entry.project.id]!.billableMinutes += entry.minutes;
  }

  const billableRate = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;

  return {
    totalMinutes,
    totalHours: Number((totalMinutes / 60).toFixed(1)),
    billableMinutes,
    billableHours: Number((billableMinutes / 60).toFixed(1)),
    nonBillableHours: Number(((totalMinutes - billableMinutes) / 60).toFixed(1)),
    billableRate,
    entriesCount: entries.length,
    usersCount: Object.keys(userSummary).length,
    userSummary: Object.values(userSummary),
    projectSummary: Object.values(projectSummary),
    entries,
  };
}
