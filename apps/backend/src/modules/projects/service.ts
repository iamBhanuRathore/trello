import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { projects } from '../../db/schema/index';
import { httpError } from '../organizations/service';

export interface CreateProjectInput {
  organizationId: string;
  workspaceId: string;
  name: string;
  key?: string | undefined;
  description?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export function generateProjectKey(name: string): string {
  const cleanWords = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (cleanWords.length >= 2) {
    return cleanWords
      .slice(0, 3)
      .map((w) => (w.charAt(0) || '').toUpperCase())
      .join('');
  }
  const firstWord = cleanWords[0];
  if (firstWord && firstWord.length >= 2) {
    return firstWord.slice(0, 3).toUpperCase();
  }
  return 'PRJ';
}

export async function createProject(db: Database, input: CreateProjectInput) {
  const projectKey = input.key?.trim().toUpperCase() || generateProjectKey(input.name);

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      name: input.name,
      key: projectKey,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
    })
    .returning();

  return project;
}

export async function listProjects(db: Database, workspaceId: string, organizationId: string) {
  return db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.organizationId, organizationId),
        isNull(projects.deletedAt)
      )
    )
    .orderBy(projects.createdAt);
}

export async function getProject(db: Database, id: string, organizationId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.organizationId, organizationId),
        isNull(projects.deletedAt)
      )
    )
    .limit(1);

  if (!project) throw httpError(404, 'Project not found');
  return project;
}

export async function updateProject(
  db: Database,
  id: string,
  organizationId: string,
  input: {
    name?: string;
    status?: 'active' | 'on_hold' | 'completed' | 'archived';
    description?: string;
  }
) {
  const [project] = await db
    .update(projects)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, id),
        eq(projects.organizationId, organizationId),
        isNull(projects.deletedAt)
      )
    )
    .returning();

  if (!project) throw httpError(404, 'Project not found');
  return project;
}

import { deleteBoard } from '../boards/service';
import { boards, phases, sprints, documents } from '../../db/schema/index';

export async function deleteProject(db: Database, id: string, organizationId: string) {
  // 1. Find all boards in this project and cascade delete them
  const boardRows = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.projectId, id), eq(boards.organizationId, organizationId)));

  for (const b of boardRows) {
    await deleteBoard(db, b.id, organizationId);
  }

  // 2. Delete project phases, sprints, documents if any — independent tables.
  await Promise.all([
    db.delete(phases).where(eq(phases.projectId, id)),
    db.delete(sprints).where(eq(sprints.projectId, id)),
    db.delete(documents).where(eq(documents.projectId, id)),
  ]);

  // 3. Mark project as deleted
  const [project] = await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, id),
        eq(projects.organizationId, organizationId),
        isNull(projects.deletedAt)
      )
    )
    .returning();

  if (!project) throw httpError(404, 'Project not found');
  return project;
}
