import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import {
  listStageTemplates,
  createStageTemplate,
  getStageTemplateWithStages,
  createStage,
  updateStage,
  deleteStage,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Stages Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let testTemplateId: string;
  let testEmail: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    testEmail = uniqueTestEmail('stages');
    const slug = uniqueTestSlug('stages-org');
    const { organization } = await signUp(db, {
      name: 'Stages Admin',
      email: testEmail,
      password: 'pass',
      orgName: 'Stages Org',
      orgSlug: slug,
    });
    orgId = organization.id;
  });

  afterAll(async () => {
    if (testTemplateId) {
      await db.delete(schema.stages).where(eq(schema.stages.templateId, testTemplateId));
      await db.delete(schema.stageTemplates).where(eq(schema.stageTemplates.id, testTemplateId));
    }
    await deleteTestOrg(db, orgId);
    await deleteTestUser(db, testEmail);
    await client.end();
  });

  it('should create a stage template', async () => {
    const template = await createStageTemplate(db, orgId, {
      name: 'Software Dev',
      isDefault: true,
    });
    expect(template?.name).toBe('Software Dev');
    expect(template?.isDefault).toBe(true);
    testTemplateId = template?.id ?? '';
  });

  it('should create stages for a template', async () => {
    const stage1 = await createStage(db, testTemplateId, {
      name: 'To Do',
      color: '#94a3b8',
      position: 65536,
      category: 'not_started',
    });
    const stage2 = await createStage(db, testTemplateId, {
      name: 'In Progress',
      color: '#3b82f6',
      position: 131072,
      category: 'in_progress',
    });

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
