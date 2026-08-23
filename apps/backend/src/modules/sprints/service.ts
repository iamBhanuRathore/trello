import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { sprints, cardSprints, projects } from '../../db/schema/index';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── Sprints ──────────────────────────────────────────────────────────────────

export async function listSprints(db: Database, projectId: string) {
  return db
    .select()
    .from(sprints)
    .where(eq(sprints.projectId, projectId))
    .orderBy(sprints.startDate);
}

export async function getSprint(db: Database, sprintId: string) {
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId));

  if (!sprint) throw httpError(404, 'Sprint not found');
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
  }
) {
  // verify project exists
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
      status: 'planned'
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
  }
) {
  const [sprint] = await db
    .update(sprints)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(sprints.id, sprintId))
    .returning();

  if (!sprint) throw httpError(404, 'Sprint not found');
  return sprint;
}

export async function deleteSprint(db: Database, sprintId: string) {
  await db.delete(cardSprints).where(eq(cardSprints.sprintId, sprintId));
  const [deleted] = await db.delete(sprints).where(eq(sprints.id, sprintId)).returning();
  if (!deleted) throw httpError(404, 'Sprint not found');
  return deleted;
}

// ─── Sprint Cards ─────────────────────────────────────────────────────────────

export async function addCardToSprint(db: Database, sprintId: string, cardId: string) {
  const [cs] = await db
    .insert(cardSprints)
    .values({ sprintId, cardId, isActive: true })
    .onConflictDoUpdate({
      target: [cardSprints.cardId, cardSprints.sprintId],
      set: { isActive: true }
    })
    .returning();
  return cs;
}

export async function removeCardFromSprint(db: Database, sprintId: string, cardId: string) {
  const [deleted] = await db
    .delete(cardSprints)
    .where(and(eq(cardSprints.sprintId, sprintId), eq(cardSprints.cardId, cardId)))
    .returning();
  if (!deleted) throw httpError(404, 'Card not in sprint');
  return deleted;
}

export async function listSprintCards(db: Database, sprintId: string) {
  const items = await db
    .select()
    .from(cardSprints)
    .where(and(eq(cardSprints.sprintId, sprintId), eq(cardSprints.isActive, true)));
  return items;
}
