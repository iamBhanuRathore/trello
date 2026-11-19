import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  boards,
  cards,
  lists,
  organizationMembers,
  projects,
  users,
  workspaces,
} from '../../db/schema/index';
import { httpError } from '../../lib/errors';
import { createCard } from '../cards/card-crud';
import { updateCard } from '../cards/card-crud';
import { moveCard } from '../cards/card-movement';
import { listComments, createComment } from '../cards/card-activity';
import { createBoard, updateBoard } from '../boards/service';
import { createProject, updateProject } from '../projects/service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function pageOptions(query: { limit?: string; offset?: string }) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

// ─── Cards ────────────────────────────────────────────────────────────────────
const cardColumns = {
  id: cards.id,
  key: cards.key,
  title: cards.title,
  description: cards.description,
  listId: cards.listId,
  boardId: boards.id,
  projectId: boards.projectId,
  dueDate: cards.dueDate,
  stageId: cards.stageId,
  priorityId: cards.priorityId,
  storyPoints: cards.storyPoints,
  estimateMinutes: cards.estimateMinutes,
  isArchived: cards.isArchived,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
};

export async function publicListCards(
  db: Database,
  organizationId: string,
  query: {
    boardId?: string;
    listId?: string;
    updatedSince?: string;
    limit?: string;
    offset?: string;
  }
) {
  const { limit, offset } = pageOptions(query);
  const conditions = [
    eq(cards.organizationId, organizationId),
    eq(boards.organizationId, organizationId),
    isNull(cards.deletedAt),
  ];
  if (query.boardId) conditions.push(eq(boards.id, query.boardId));
  if (query.listId) conditions.push(eq(cards.listId, query.listId));
  if (query.updatedSince) {
    const since = new Date(query.updatedSince);
    if (Number.isNaN(since.getTime())) throw httpError(422, 'updatedSince must be a valid date');
    conditions.push(gte(cards.updatedAt, since));
  }

  return db
    .select(cardColumns)
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(...conditions))
    .orderBy(desc(cards.updatedAt))
    .limit(limit)
    .offset(offset);
}

export async function publicGetCard(db: Database, organizationId: string, id: string) {
  const [row] = await db
    .select(cardColumns)
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(cards.id, id), eq(cards.organizationId, organizationId), isNull(cards.deletedAt)))
    .limit(1);
  if (!row) throw httpError(404, 'Card not found');
  return row;
}

export async function publicCreateCard(
  db: Database,
  organizationId: string,
  input: Record<string, unknown>,
  actorId?: string
) {
  return createCard(db, organizationId, {
    listId: input.listId as string,
    title: input.title as string,
    description: input.description as string | undefined,
    dueDate: input.dueDate instanceof Date ? input.dueDate.toISOString() : undefined,
    stageId: input.stageId as string | undefined,
    priorityId: (input.priorityId as string | undefined) ?? undefined,
    storyPoints: input.storyPoints as number | undefined,
    estimateMinutes: input.estimateMinutes as number | undefined,
    actorId,
  });
}

export async function publicUpdateCard(
  db: Database,
  organizationId: string,
  id: string,
  input: Record<string, unknown>,
  actorId?: string
) {
  const current = await publicGetCard(db, organizationId, id);
  if (input.listId && input.listId !== current.listId) {
    // Move through the canonical path so positions, versions, caches, history
    // and automations all fire exactly as they do from the UI.
    await moveCard(db, id, organizationId, input.listId as string, 65536, actorId);
  }
  const rest = { ...input };
  delete rest.listId;
  if (Object.keys(rest).length === 0) return publicGetCard(db, organizationId, id);
  await updateCard(db, id, organizationId, rest);
  return publicGetCard(db, organizationId, id);
}

// ─── Boards ───────────────────────────────────────────────────────────────────
const boardColumns = {
  id: boards.id,
  name: boards.name,
  projectId: boards.projectId,
  background: boards.background,
  isArchived: boards.isArchived,
  isTemplate: boards.isTemplate,
  createdAt: boards.createdAt,
  updatedAt: boards.updatedAt,
};

export async function publicListBoards(
  db: Database,
  organizationId: string,
  query: { projectId?: string }
) {
  const conditions = [
    eq(boards.organizationId, organizationId),
    eq(boards.isArchived, false),
    isNull(boards.deletedAt),
  ];
  if (query.projectId) conditions.push(eq(boards.projectId, query.projectId));
  return db
    .select(boardColumns)
    .from(boards)
    .where(and(...conditions))
    .orderBy(boards.createdAt);
}

export async function publicGetBoard(db: Database, organizationId: string, id: string) {
  const [row] = await db
    .select(boardColumns)
    .from(boards)
    .where(
      and(eq(boards.id, id), eq(boards.organizationId, organizationId), isNull(boards.deletedAt))
    )
    .limit(1);
  if (!row) throw httpError(404, 'Board not found');
  return row;
}

export async function publicCreateBoard(
  db: Database,
  organizationId: string,
  input: Record<string, unknown>
) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId as string),
        eq(projects.organizationId, organizationId),
        isNull(projects.deletedAt)
      )
    )
    .limit(1);
  if (!project) throw httpError(404, 'Project not found');
  return createBoard(db, {
    organizationId,
    projectId: input.projectId as string,
    name: input.name as string,
    background: input.background as string | undefined,
  });
}

export async function publicUpdateBoard(
  db: Database,
  organizationId: string,
  id: string,
  input: Record<string, unknown>
) {
  const current = await publicGetBoard(db, organizationId, id);
  // Moving a board to another project is a structural change, not a PATCH.
  // Silently ignoring it would let a client believe the move happened.
  if (input.projectId !== undefined && input.projectId !== current.projectId) {
    throw httpError(422, 'projectId cannot be changed; create the board in the target project');
  }
  await updateBoard(db, id, organizationId, {
    name: input.name as string | undefined,
    background: input.background as string | undefined,
  });
  return publicGetBoard(db, organizationId, id);
}

export async function publicBoardLists(db: Database, organizationId: string, boardId: string) {
  await publicGetBoard(db, organizationId, boardId);
  return db
    .select({
      id: lists.id,
      boardId: lists.boardId,
      name: lists.name,
      position: lists.position,
      isArchived: lists.isArchived,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
    })
    .from(lists)
    .where(and(eq(lists.boardId, boardId), isNull(lists.deletedAt)))
    .orderBy(lists.position);
}

// ─── Projects ─────────────────────────────────────────────────────────────────
const projectColumns = {
  id: projects.id,
  name: projects.name,
  key: projects.key,
  description: projects.description,
  status: projects.status,
  workspaceId: projects.workspaceId,
  startDate: projects.startDate,
  endDate: projects.endDate,
  isArchived: projects.isArchived,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

export async function publicListProjects(
  db: Database,
  organizationId: string,
  query: { workspaceId?: string }
) {
  const conditions = [eq(projects.organizationId, organizationId), isNull(projects.deletedAt)];
  if (query.workspaceId) conditions.push(eq(projects.workspaceId, query.workspaceId));
  return db
    .select(projectColumns)
    .from(projects)
    .where(and(...conditions))
    .orderBy(projects.createdAt);
}

export async function publicGetProject(db: Database, organizationId: string, id: string) {
  const [row] = await db
    .select(projectColumns)
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.organizationId, organizationId),
        isNull(projects.deletedAt)
      )
    )
    .limit(1);
  if (!row) throw httpError(404, 'Project not found');
  return row;
}

const PROJECT_STATUSES = new Set(['active', 'on_hold', 'completed', 'archived']);

export async function publicCreateProject(
  db: Database,
  organizationId: string,
  input: Record<string, unknown>
) {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, input.workspaceId as string),
        eq(workspaces.organizationId, organizationId),
        isNull(workspaces.deletedAt)
      )
    )
    .limit(1);
  if (!workspace) throw httpError(404, 'Workspace not found');
  return createProject(db, {
    organizationId,
    workspaceId: input.workspaceId as string,
    name: input.name as string,
    key: input.key as string | undefined,
    description: input.description as string | undefined,
    startDate: input.startDate as string | undefined,
    endDate: input.endDate as string | undefined,
  });
}

export async function publicUpdateProject(
  db: Database,
  organizationId: string,
  id: string,
  input: Record<string, unknown>
) {
  const current = await publicGetProject(db, organizationId, id);
  if (input.workspaceId !== undefined && input.workspaceId !== current.workspaceId) {
    throw httpError(
      422,
      'workspaceId cannot be changed; create the project in the target workspace'
    );
  }
  if (input.key !== undefined && input.key !== current.key) {
    throw httpError(422, 'Project key is immutable once set');
  }
  if (input.status !== undefined && !PROJECT_STATUSES.has(input.status as string)) {
    throw httpError(422, 'Invalid project status');
  }
  await updateProject(db, id, organizationId, {
    name: input.name as string | undefined,
    description: input.description as string | undefined,
    status: input.status as 'active' | 'on_hold' | 'completed' | 'archived' | undefined,
    startDate: input.startDate as string | null | undefined,
    endDate: input.endDate as string | null | undefined,
  });
  return publicGetProject(db, organizationId, id);
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export async function publicListComments(
  db: Database,
  organizationId: string,
  cardId: string,
  query: { limit?: string; offset?: string }
) {
  await publicGetCard(db, organizationId, cardId);
  const { limit, offset } = pageOptions(query);
  // Offset must reach SQL: slicing a limited page always returned an empty
  // second page once offset >= limit.
  return listComments(db, cardId, organizationId, { limit, offset });
}

/** Public API keys have no user; comments are attributed to the org owner. */
export async function resolveApiActor(db: Database, organizationId: string): Promise<string> {
  const [member] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, 'active'),
        isNull(organizationMembers.deletedAt)
      )
    )
    .orderBy(sql`CASE WHEN ${organizationMembers.role}::text = 'org_owner' THEN 0 ELSE 1 END`)
    .limit(1);
  if (!member) throw httpError(409, 'Organization has no active member to attribute writes to');
  return member.userId;
}

export async function publicCreateComment(
  db: Database,
  organizationId: string,
  cardId: string,
  body: string
) {
  await publicGetCard(db, organizationId, cardId);
  const authorId = await resolveApiActor(db, organizationId);
  const comment = await createComment(db, cardId, organizationId, authorId, body);
  const [author] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, authorId))
    .limit(1);
  return { ...comment, authorName: author?.name ?? null };
}
