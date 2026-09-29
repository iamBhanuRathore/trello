import { eq, and, isNull, or, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { workspaces, workspaceMembers, projects, boards } from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { cachedOrgRead, bumpOrgCache, bumpWorkspaceCache } from '../../lib/cache';

export interface CreateWorkspaceInput {
  organizationId: string;
  name: string;
  description?: string | undefined;
  visibility?: 'private' | 'org' | undefined;
  creatorId?: string | undefined;
}

export async function createWorkspace(db: Database, input: CreateWorkspaceInput) {
  const [workspace] = await db
    .insert(workspaces)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      visibility: input.visibility || 'org',
    })
    .returning();

  if (workspace && input.creatorId) {
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: workspace.id,
        userId: input.creatorId,
        role: 'admin',
      })
      .onConflictDoNothing();
  }

  await bumpOrgCache(input.organizationId);
  return workspace;
}

export async function listWorkspaces(
  db: Database,
  organizationId: string,
  userId?: string,
  isPlatformAdmin?: boolean
) {
  if (!organizationId) {
    if (isPlatformAdmin) {
      return db
        .select()
        .from(workspaces)
        .where(isNull(workspaces.deletedAt))
        .orderBy(workspaces.createdAt);
    }
    return [];
  }

  // Hot sidebar/app-load read: 1 Redis RTT on hit, zero Neon queries.
  const cacheRest = `workspaces:${userId ?? 'all'}:${isPlatformAdmin ? 'admin' : 'user'}`;
  const { data } = await cachedOrgRead(organizationId, cacheRest, 'workspaces', () =>
    loadWorkspaces(db, organizationId, userId, isPlatformAdmin)
  );
  return data;
}

async function loadWorkspaces(
  db: Database,
  organizationId: string,
  userId?: string,
  isPlatformAdmin?: boolean
) {
  if (isPlatformAdmin || !userId) {
    return db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.organizationId, organizationId), isNull(workspaces.deletedAt)))
      .orderBy(workspaces.createdAt);
  }

  return db
    .select({
      id: workspaces.id,
      organizationId: workspaces.organizationId,
      name: workspaces.name,
      description: workspaces.description,
      visibility: workspaces.visibility,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
      deletedAt: workspaces.deletedAt,
    })
    .from(workspaces)
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId))
    )
    .where(
      and(
        eq(workspaces.organizationId, organizationId),
        isNull(workspaces.deletedAt),
        or(eq(workspaces.visibility, 'org'), isNotNull(workspaceMembers.id))
      )
    )
    .orderBy(workspaces.createdAt);
}

export async function getWorkspace(db: Database, id: string, organizationId: string) {
  const { data } = await cachedOrgRead(organizationId, `ws:${id}`, 'workspace', async () => {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.id, id),
          eq(workspaces.organizationId, organizationId),
          isNull(workspaces.deletedAt)
        )
      )
      .limit(1);

    if (!workspace) throw httpError(404, 'Workspace not found');
    return workspace;
  });
  return data;
}

export interface TreeBoard {
  id: string;
  name: string;
  background: string | null;
  projectId: string;
}

export interface TreeProject {
  id: string;
  name: string;
  key: string | null;
  workspaceId: string;
  boards: TreeBoard[];
}

export interface TreeWorkspace {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  projects: TreeProject[];
}

/**
 * Aggregate workspaces → projects → boards in 3 Neon queries, cached as one
 * payload. Replaces N+1 fan-out (1× workspaces + N× projects + M× boards).
 */
export async function getWorkspaceTree(
  db: Database,
  organizationId: string,
  userId?: string,
  isPlatformAdmin?: boolean
): Promise<TreeWorkspace[]> {
  if (!organizationId) return [];
  const { data } = await cachedOrgRead(
    organizationId,
    `tree:${userId ?? 'all'}:${isPlatformAdmin ? 'admin' : 'user'}`,
    'tree',
    () => loadWorkspaceTree(db, organizationId, userId, isPlatformAdmin),
    60
  );
  return data;
}

async function loadWorkspaceTree(
  db: Database,
  organizationId: string,
  userId?: string,
  isPlatformAdmin?: boolean
): Promise<TreeWorkspace[]> {
  const wsRows = (await loadWorkspaces(db, organizationId, userId, isPlatformAdmin)) as any[];
  if (wsRows.length === 0) return [];
  const wsIds = new Set(wsRows.map((w) => w.id));

  const [projectRows, boardRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        key: projects.key,
        workspaceId: projects.workspaceId,
      })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt))),
    db
      .select({
        id: boards.id,
        name: boards.name,
        background: boards.background,
        projectId: boards.projectId,
      })
      .from(boards)
      .where(
        and(
          eq(boards.organizationId, organizationId),
          eq(boards.isArchived, false),
          isNull(boards.deletedAt)
        )
      ),
  ]);

  const boardsByProject = new Map<string, TreeBoard[]>();
  for (const b of boardRows) {
    const list = boardsByProject.get(b.projectId) ?? [];
    list.push(b as TreeBoard);
    boardsByProject.set(b.projectId, list);
  }

  const projectsByWs = new Map<string, TreeProject[]>();
  for (const p of projectRows) {
    if (!wsIds.has(p.workspaceId)) continue;
    const list = projectsByWs.get(p.workspaceId) ?? [];
    list.push({ ...p, boards: boardsByProject.get(p.id) ?? [] });
    projectsByWs.set(p.workspaceId, list);
  }

  return wsRows.map((w) => ({ ...w, projects: projectsByWs.get(w.id) ?? [] }));
}

export async function updateWorkspace(
  db: Database,
  id: string,
  organizationId: string,
  input: { name?: string; description?: string }
) {
  const [workspace] = await db
    .update(workspaces)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, organizationId),
        isNull(workspaces.deletedAt)
      )
    )
    .returning();

  if (!workspace) throw httpError(404, 'Workspace not found');
  await bumpOrgCache(organizationId);
  return workspace;
}

import { deleteProject } from '../projects/service';

export async function deleteWorkspace(db: Database, id: string, organizationId: string) {
  // 1. Find all projects in this workspace and cascade delete them
  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, id),
        eq(projects.organizationId, organizationId),
        isNull(projects.deletedAt)
      )
    );

  for (const p of projectRows) {
    await deleteProject(db, p.id, organizationId);
  }

  // 2. Delete workspace members
  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, id));

  // 3. Mark workspace as deleted
  const [workspace] = await db
    .update(workspaces)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, organizationId),
        isNull(workspaces.deletedAt)
      )
    )
    .returning();

  if (!workspace) throw httpError(404, 'Workspace not found');
  await bumpOrgCache(organizationId);
  await bumpWorkspaceCache(id);
  return workspace;
}
