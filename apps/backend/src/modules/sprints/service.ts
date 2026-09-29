import { eq, and } from 'drizzle-orm';
import { clampLimit } from '../../lib/pagination';
import type { Database } from '../../db/index';
import { sprints, cardSprints, projects } from '../../db/schema/index';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── Sprints ──────────────────────────────────────────────────────────────────

/**
 * Tenant guard: sprints hang off projects, which hang off orgs. Every entry
 * point that accepts a raw sprint/project id must prove org ownership —
 * otherwise any authenticated user could read/mutate any org's sprints.
 * organizationId is optional only so unit tests can call without tenant ctx;
 * all HTTP routes pass it.
 */
async function assertProjectInOrg(db: Database, projectId: string, organizationId?: string) {
  if (!organizationId) return;
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!project) throw httpError(404, 'Project not found');
}

async function assertSprintInOrg(db: Database, sprintId: string, organizationId?: string) {
  if (!organizationId) return;
  const [row] = await db
    .select({ id: sprints.id, projectId: sprints.projectId })
    .from(sprints)
    .where(eq(sprints.id, sprintId))
    .limit(1);
  if (!row) throw httpError(404, 'Sprint not found');
  await assertProjectInOrg(db, row.projectId, organizationId);
}

export async function listSprints(db: Database, projectId: string, organizationId?: string) {
  await assertProjectInOrg(db, projectId, organizationId);
  return db
    .select()
    .from(sprints)
    .where(eq(sprints.projectId, projectId))
    .orderBy(sprints.startDate);
}

export async function getSprint(db: Database, sprintId: string, organizationId?: string) {
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, sprintId));

  if (!sprint) throw httpError(404, 'Sprint not found');
  await assertProjectInOrg(db, sprint.projectId, organizationId);
  return sprint;
}

export async function createSprint(
  db: Database,
  projectId: string,
  input: {
    name: string;
    type: 'weekly' | 'biweekly' | 'monthly' | 'custom';
    startDate: string;
    endDate: string;
    goal?: string;
  },
  organizationId?: string
) {
  // verify project exists (and belongs to the caller's org)
  await assertProjectInOrg(db, projectId, organizationId);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw httpError(404, 'Project not found');

  const [sprint] = await db
    .insert(sprints)
    .values({
      projectId,
      name: input.name,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      goal: input.goal,
      status: 'planned',
    })
    .returning();
  return sprint;
}

export async function updateSprint(
  db: Database,
  sprintId: string,
  input: {
    name?: string;
    type?: 'weekly' | 'biweekly' | 'monthly' | 'custom';
    startDate?: string;
    endDate?: string;
    goal?: string;
    status?: 'planned' | 'active' | 'completed';
  },
  organizationId?: string
) {
  await assertSprintInOrg(db, sprintId, organizationId);
  const [sprint] = await db
    .update(sprints)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(sprints.id, sprintId))
    .returning();

  if (!sprint) throw httpError(404, 'Sprint not found');
  return sprint;
}

export async function deleteSprint(db: Database, sprintId: string, organizationId?: string) {
  await assertSprintInOrg(db, sprintId, organizationId);
  await db.delete(cardSprints).where(eq(cardSprints.sprintId, sprintId));
  const [deleted] = await db.delete(sprints).where(eq(sprints.id, sprintId)).returning();
  if (!deleted) throw httpError(404, 'Sprint not found');
  return deleted;
}

// ─── Sprint Cards ─────────────────────────────────────────────────────────────

export async function addCardToSprint(
  db: Database,
  sprintId: string,
  cardId: string,
  organizationId?: string
) {
  await assertSprintInOrg(db, sprintId, organizationId);
  const [cs] = await db
    .insert(cardSprints)
    .values({ sprintId, cardId, isActive: true })
    .onConflictDoUpdate({
      target: [cardSprints.cardId, cardSprints.sprintId],
      set: { isActive: true },
    })
    .returning();
  return cs;
}

export async function removeCardFromSprint(
  db: Database,
  sprintId: string,
  cardId: string,
  organizationId?: string
) {
  await assertSprintInOrg(db, sprintId, organizationId);
  const [deleted] = await db
    .delete(cardSprints)
    .where(and(eq(cardSprints.sprintId, sprintId), eq(cardSprints.cardId, cardId)))
    .returning();
  if (!deleted) throw httpError(404, 'Card not in sprint');
  return deleted;
}

export async function listSprintCards(
  db: Database,
  sprintId: string,
  options: { limit?: number | string } = {},
  organizationId?: string
) {
  await assertSprintInOrg(db, sprintId, organizationId);
  const items = await db
    .select()
    .from(cardSprints)
    .where(and(eq(cardSprints.sprintId, sprintId), eq(cardSprints.isActive, true)))
    .limit(clampLimit(options.limit, { def: 500, max: 500 }));
  return items;
}
