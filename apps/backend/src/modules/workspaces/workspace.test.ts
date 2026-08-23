import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace, listWorkspaces, getWorkspace, updateWorkspace, deleteWorkspace } from './service';

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

describe('Workspaces Service', () => {
  it('should create and list workspaces', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@ws.com`,
      password: 'pass',
      orgName: `WS Org ${id}`,
      orgSlug: `ws-org-${id}`,
    });

    const ws = await createWorkspace(db, {
      organizationId: organization.id,
      name: 'Engineering',
    });

    expect(ws!.name).toBe('Engineering');

    const list = await listWorkspaces(db, organization.id);
    expect(list.some((w) => w.id === ws!.id)).toBe(true);
  });

  it('should get a workspace', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@ws.com`,
      password: 'pass',
      orgName: `WS Org ${id}`,
      orgSlug: `ws-org-${id}`,
    });

    const created = await createWorkspace(db, { organizationId: organization.id, name: 'Design' });
    const fetched = await getWorkspace(db, created!.id, organization.id);
    
    expect(fetched.id).toBe(created!.id);
    expect(fetched.name).toBe('Design');
  });

  it('should update and soft-delete a workspace', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@ws.com`,
      password: 'pass',
      orgName: `WS Org ${id}`,
      orgSlug: `ws-org-${id}`,
    });

    const created = await createWorkspace(db, { organizationId: organization.id, name: 'Design' });
    
    const updated = await updateWorkspace(db, created!.id, organization.id, { name: 'UX' });
    expect(updated.name).toBe('UX');

    await deleteWorkspace(db, created!.id, organization.id);

    await expect(getWorkspace(db, created!.id, organization.id)).rejects.toMatchObject({ status: 404 });
  });
});
