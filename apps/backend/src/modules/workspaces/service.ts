import { eq, and, isNull, or, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { workspaces, workspaceMembers } from '../../db/schema/index';
import { httpError } from '../organizations/service';

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
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId)
      )
    )
    .where(
      and(
        eq(workspaces.organizationId, organizationId),
        isNull(workspaces.deletedAt),
        or(
          eq(workspaces.visibility, 'org'),
          isNotNull(workspaceMembers.id)
        )
      )
    )
    .orderBy(workspaces.createdAt);
}

export async function getWorkspace(db: Database, id: string, organizationId: string) {
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
}

export async function updateWorkspace(db: Database, id: string, organizationId: string, input: { name?: string; description?: string }) {
  const [workspace] = await db
    .update(workspaces)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(workspaces.id, id),
        eq(workspaces.organizationId, organizationId),
        isNull(workspaces.deletedAt)
      )
    )
    .returning();

  if (!workspace) throw httpError(404, 'Workspace not found');
  return workspace;
}

import { deleteProject } from '../projects/service';
import { projects } from '../../db/schema/index';

export async function deleteWorkspace(db: Database, id: string, organizationId: string) {
  // 1. Find all projects in this workspace and cascade delete them
  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, id), eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));

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
  return workspace;
}
