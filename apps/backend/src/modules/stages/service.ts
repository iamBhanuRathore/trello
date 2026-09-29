import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { stageTemplates, stages } from '../../db/schema/index';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function listStageTemplates(db: Database, organizationId: string) {
  return db.select().from(stageTemplates).where(eq(stageTemplates.organizationId, organizationId));
}

export async function getStageTemplateWithStages(db: Database, templateId: string) {
  const [template] = await db
    .select()
    .from(stageTemplates)
    .where(eq(stageTemplates.id, templateId));

  if (!template) throw httpError(404, 'Stage template not found');

  const templateStages = await db
    .select()
    .from(stages)
    .where(eq(stages.templateId, templateId))
    .orderBy(stages.position);

  return { ...template, stages: templateStages };
}

export async function createStageTemplate(
  db: Database,
  organizationId: string,
  input: { name: string; isDefault?: boolean }
) {
  const [template] = await db
    .insert(stageTemplates)
    .values({
      organizationId,
      name: input.name,
      isDefault: input.isDefault ?? false,
    })
    .returning();
  return template;
}

export async function updateStageTemplate(
  db: Database,
  templateId: string,
  input: { name?: string; isDefault?: boolean }
) {
  const [template] = await db
    .update(stageTemplates)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      updatedAt: new Date(),
    })
    .where(eq(stageTemplates.id, templateId))
    .returning();

  if (!template) throw httpError(404, 'Stage template not found');
  return template;
}

export async function deleteStageTemplate(db: Database, templateId: string) {
  // Must delete stages first due to FK
  await db.delete(stages).where(eq(stages.templateId, templateId));
  const [deleted] = await db
    .delete(stageTemplates)
    .where(eq(stageTemplates.id, templateId))
    .returning();
  if (!deleted) throw httpError(404, 'Stage template not found');
  return deleted;
}

// ─── Stages ───────────────────────────────────────────────────────────────────

export async function createStage(
  db: Database,
  templateId: string,
  input: {
    name: string;
    color: string;
    position: number;
    category: 'not_started' | 'in_progress' | 'blocked' | 'done';
  }
) {
  const [stage] = await db
    .insert(stages)
    .values({
      templateId,
      name: input.name,
      color: input.color,
      position: input.position,
      category: input.category,
    })
    .returning();
  return stage;
}

export async function updateStage(
  db: Database,
  stageId: string,
  input: {
    name?: string;
    color?: string;
    position?: number;
    category?: 'not_started' | 'in_progress' | 'blocked' | 'done';
  }
) {
  const [stage] = await db
    .update(stages)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      updatedAt: new Date(),
    })
    .where(eq(stages.id, stageId))
    .returning();

  if (!stage) throw httpError(404, 'Stage not found');
  return stage;
}

export async function deleteStage(db: Database, stageId: string) {
  const [deleted] = await db.delete(stages).where(eq(stages.id, stageId)).returning();
  if (!deleted) throw httpError(404, 'Stage not found');
  return deleted;
}
