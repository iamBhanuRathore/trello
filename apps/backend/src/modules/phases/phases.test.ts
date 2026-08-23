import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { createProject } from '../projects/service';
import { listPhases, createPhase, getPhase, updatePhase, deletePhase } from './service';

const TEST_DB_URL = process.env['DATABASE_TEST_URL'] ?? 'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Phases Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let projectId: string;
  let testPhaseId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const { organization } = await signUp(db, {
      name: 'Phases Admin',
      email: 'phases@example.com',
      password: 'pass',
      orgName: 'Phases Org',
      orgSlug: 'phases-org',
    });
    orgId = organization.id;

    // We need a workspace and a project
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId: orgId, name: 'Phases WS' }).returning();
    const project = await createProject(db, { organizationId: orgId, workspaceId: workspace!.id, name: 'Phases Project' });
    projectId = project!.id;
  });

  afterAll(async () => {
    await db.delete(schema.cardPhase);
    await db.delete(schema.phases);
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
    await db.delete(schema.organizationMembers);
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await db.delete(schema.refreshTokens);
    await db.delete(schema.users).where(eq(schema.users.email, 'phases@example.com'));
    await client.end();
  });

  it('should create a phase', async () => {
    const phase = await createPhase(db, projectId, {
      name: 'Discovery',
      position: 1,
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });
    expect(phase?.name).toBe('Discovery');
    expect(phase?.status).toBe('not_started');
    testPhaseId = phase?.id ?? '';
  });

  it('should list phases for a project', async () => {
    const phases = await listPhases(db, projectId);
    expect(phases.length).toBe(1);
    expect(phases[0]?.name).toBe('Discovery');
  });

  it('should update a phase', async () => {
    const updated = await updatePhase(db, testPhaseId, { status: 'active' });
    expect(updated.status).toBe('active');
  });

  it('should get a specific phase', async () => {
    const phase = await getPhase(db, testPhaseId);
    expect(phase.name).toBe('Discovery');
  });

  it('should delete a phase', async () => {
    await deletePhase(db, testPhaseId);
    const phases = await listPhases(db, projectId);
    expect(phases.length).toBe(0);
  });
});
