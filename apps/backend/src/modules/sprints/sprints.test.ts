import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import { createProject } from '../projects/service';
import { listSprints, createSprint, getSprint, updateSprint, deleteSprint } from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Sprints Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let projectId: string;
  let testSprintId: string;
  let testEmail: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    testEmail = uniqueTestEmail('sprints');
    const { organization } = await signUp(db, {
      name: 'Sprints Admin',
      email: testEmail,
      password: 'pass',
      orgName: 'Sprints Org',
      orgSlug: uniqueTestSlug('sprints-org'),
    });
    orgId = organization.id;

    // We need a workspace and a project
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgId, name: 'Sprints WS' })
      .returning();
    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'Sprints Project',
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    if (testSprintId) {
      await db.delete(schema.cardSprints).where(eq(schema.cardSprints.sprintId, testSprintId));
    }
    await db.delete(schema.sprints).where(eq(schema.sprints.projectId, projectId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
    await deleteTestOrg(db, orgId);
    await deleteTestUser(db, testEmail);
    await client.end();
  });

  it('should create a sprint', async () => {
    const sprint = await createSprint(db, projectId, {
      name: 'Sprint 1',
      type: 'biweekly',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      goal: 'First sprint goal',
    });
    expect(sprint?.name).toBe('Sprint 1');
    expect(sprint?.status).toBe('planned');
    testSprintId = sprint?.id ?? '';
  });

  it('should list sprints for a project', async () => {
    const sprints = await listSprints(db, projectId);
    expect(sprints.length).toBe(1);
    expect(sprints[0]?.name).toBe('Sprint 1');
  });

  it('should update a sprint', async () => {
    const updated = await updateSprint(db, testSprintId, {
      status: 'active',
      goal: 'Updated goal',
    });
    expect(updated.status).toBe('active');
    expect(updated.goal).toBe('Updated goal');
  });

  it('should get a specific sprint', async () => {
    const sprint = await getSprint(db, testSprintId);
    expect(sprint.name).toBe('Sprint 1');
  });

  it('should delete a sprint', async () => {
    await deleteSprint(db, testSprintId);
    const sprints = await listSprints(db, projectId);
    expect(sprints.length).toBe(0);
  });
});
