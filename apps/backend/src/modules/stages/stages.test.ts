import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { listStageTemplates, createStageTemplate, getStageTemplateWithStages, createStage, updateStage, deleteStage } from './service';

const TEST_DB_URL = process.env['DATABASE_TEST_URL'] ?? 'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Stages Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let testTemplateId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Stages Admin',
      email: `stages_${id}@example.com`,
      password: 'pass',
      orgName: `Stages Org ${id}`,
      orgSlug: `stages-org-${id}`,
    });
    orgId = organization.id;
  });

  afterAll(async () => {
    await db.delete(schema.stages);
    await db.delete(schema.stageTemplates);
    await db.delete(schema.organizationMembers);
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await db.delete(schema.refreshTokens);
    await db.delete(schema.users).where(eq(schema.users.email, 'stages@example.com'));
    await client.end();
  });

  it('should create a stage template', async () => {
    const template = await createStageTemplate(db, orgId, { name: 'Software Dev', isDefault: true });
    expect(template?.name).toBe('Software Dev');
    expect(template?.isDefault).toBe(true);
    testTemplateId = template?.id ?? '';
  });

  it('should create stages for a template', async () => {
    const stage1 = await createStage(db, testTemplateId, { name: 'To Do', color: '#94a3b8', position: 65536, category: 'not_started' });
    const stage2 = await createStage(db, testTemplateId, { name: 'In Progress', color: '#3b82f6', position: 131072, category: 'in_progress' });
    
    expect(stage1?.name).toBe('To Do');
    expect(stage2?.name).toBe('In Progress');
  });

  it('should list stage templates', async () => {
    const templates = await listStageTemplates(db, orgId);
    expect(templates.length).toBe(1);
    expect(templates[0]?.name).toBe('Software Dev');
  });

  it('should get a template with stages', async () => {
    const template = await getStageTemplateWithStages(db, testTemplateId);
    expect(template?.name).toBe('Software Dev');
    expect(template?.stages.length).toBe(2);
    expect(template?.stages[0]?.name).toBe('To Do');
  });

  it('should update a stage', async () => {
    const template = await getStageTemplateWithStages(db, testTemplateId);
    const stage = template?.stages[0];

    const updated = await updateStage(db, stage!.id, { name: 'Backlog' });
    expect(updated.name).toBe('Backlog');
  });

  it('should delete a stage', async () => {
    const template = await getStageTemplateWithStages(db, testTemplateId);
    const stageId = template?.stages[1]?.id;

    await deleteStage(db, stageId!);
    const updatedTemplate = await getStageTemplateWithStages(db, testTemplateId);
    expect(updatedTemplate?.stages.length).toBe(1);
  });
});
