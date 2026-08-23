import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { phases, cardPhase, projects } from '../../db/schema/index';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── Phases ───────────────────────────────────────────────────────────────────

export async function listPhases(db: Database, projectId: string) {
  return db
    .select()
    .from(phases)
    .where(eq(phases.projectId, projectId))
    .orderBy(phases.position);
}

export async function getPhase(db: Database, phaseId: string) {
  const [phase] = await db
    .select()
    .from(phases)
    .where(eq(phases.id, phaseId));

  if (!phase) throw httpError(404, 'Phase not found');
  return phase;
}

export async function createPhase(
  db: Database,
  projectId: string,
  input: {
    name: string;
    position: number;
    startDate?: string;
    endDate?: string;
  }
) {
  // verify project exists
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw httpError(404, 'Project not found');

  const [phase] = await db
    .insert(phases)
    .values({
      projectId,
      name: input.name,
      position: input.position,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'not_started'
    })
    .returning();
  return phase;
}

export async function updatePhase(
  db: Database,
  phaseId: string,
  input: {
    name?: string;
    position?: number;
    startDate?: string;
    endDate?: string;
    status?: 'not_started' | 'active' | 'completed' | 'blocked';
  }
) {
  const [phase] = await db
    .update(phases)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(phases.id, phaseId))
    .returning();

  if (!phase) throw httpError(404, 'Phase not found');
  return phase;
}

export async function deletePhase(db: Database, phaseId: string) {
  await db.delete(cardPhase).where(eq(cardPhase.phaseId, phaseId));
  const [deleted] = await db.delete(phases).where(eq(phases.id, phaseId)).returning();
  if (!deleted) throw httpError(404, 'Phase not found');
  return deleted;
}

// ─── Phase Cards ──────────────────────────────────────────────────────────────

export async function addCardToPhase(db: Database, phaseId: string, cardId: string) {
  // In our schema, it's a many-to-many join table for cards and phases.
  // Actually, a card might only belong to one phase at a time logically, but DB allows many.
  // We'll just insert/do nothing on conflict.
  const [cp] = await db
    .insert(cardPhase)
    .values({ phaseId, cardId })
    .onConflictDoNothing({ target: [cardPhase.cardId, cardPhase.phaseId] })
    .returning();
  return cp || { phaseId, cardId }; // Return existing if conflict
}

export async function removeCardFromPhase(db: Database, phaseId: string, cardId: string) {
  const [deleted] = await db
    .delete(cardPhase)
    .where(and(eq(cardPhase.phaseId, phaseId), eq(cardPhase.cardId, cardId)))
    .returning();
  if (!deleted) throw httpError(404, 'Card not in phase');
  return deleted;
}

export async function listPhaseCards(db: Database, phaseId: string) {
  const items = await db
    .select()
    .from(cardPhase)
    .where(eq(cardPhase.phaseId, phaseId));
  return items;
}
