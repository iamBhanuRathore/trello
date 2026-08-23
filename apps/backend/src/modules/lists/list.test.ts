import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList, listLists, updateList, deleteList } from './service';

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

describe('Lists Service', () => {
  it('should create and get lists, auto-calculating position', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@list.com`,
      password: 'pass',
      orgName: `List Org ${id}`,
      orgSlug: `list-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'App' });
    const board = await createBoard(db, { organizationId: organization.id, projectId: proj!.id, name: 'Board 1' });

    const list1 = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const list2 = await createList(db, organization.id, { boardId: board!.id, name: 'Doing' });

    expect(list1!.name).toBe('To Do');
    expect(list2!.position).toBeGreaterThan(list1!.position);

    const all = await listLists(db, board!.id, organization.id);
    expect(all).toHaveLength(2);
    expect(all[0]!.id).toBe(list1!.id);
    expect(all[1]!.id).toBe(list2!.id);
  });

  it('should update and delete a list', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@list.com`,
      password: 'pass',
      orgName: `List Org ${id}`,
      orgSlug: `list-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'App' });
    const board = await createBoard(db, { organizationId: organization.id, projectId: proj!.id, name: 'Board 1' });

    const list1 = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    
    const updated = await updateList(db, list1!.id, organization.id, { name: 'Backlog', position: 100 });
    expect(updated!.name).toBe('Backlog');
    expect(updated!.position).toBe(100);

    await deleteList(db, list1!.id, organization.id);

    const all = await listLists(db, board!.id, organization.id);
    expect(all).toHaveLength(0);
  });
});
