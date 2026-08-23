import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject, listProjects, getProject, updateProject, deleteProject } from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ?? 'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

describe('Projects Service', () => {
  it('should create and list projects', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@proj.com`,
      password: 'pass',
      orgName: `Proj Org ${id}`,
      orgSlug: `proj-org-${id}`,
    });

    const ws = await createWorkspace(db, {
      organizationId: organization.id,
      name: 'Eng WS',
    });

    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'Mobile App',
    });

    expect(proj!.name).toBe('Mobile App');

    const list = await listProjects(db, ws!.id, organization.id);
    expect(list.some((p) => p.id === proj!.id)).toBe(true);
  });

  it('should update and soft-delete a project', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@proj.com`,
      password: 'pass',
      orgName: `Proj Org ${id}`,
      orgSlug: `proj-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'Web App' });
    
    const updated = await updateProject(db, proj!.id, organization.id, { name: 'Web Portal' });
    expect(updated.name).toBe('Web Portal');

    await deleteProject(db, proj!.id, organization.id);

    await expect(getProject(db, proj!.id, organization.id)).rejects.toMatchObject({ status: 404 });
  });
});
