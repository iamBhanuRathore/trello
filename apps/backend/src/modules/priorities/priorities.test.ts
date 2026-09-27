import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, getCard, getMyTasks, updateCard } from '../cards/service';
import {
  listPriorities,
  createPriority,
  updatePriority,
  deletePriority,
  setDefaultPriority,
  getDefaultPriorityId,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

async function setupOrg() {
  const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const { organization, user } = await signUp(db, {
    name: 'Owner',
    email: `owner_${id}@prio.com`,
    password: 'pass',
    orgName: `Prio Org ${id}`,
    orgSlug: `prio-org-${id}`,
  });
  return { organization, user };
}

describe('Priorities Service', () => {
  it('lazy-seeds the 4 defaults with colors on first list', async () => {
    const { organization } = await setupOrg();
    const list = await listPriorities(db, organization.id);
    expect(list.map((p) => p.name)).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(list.find((p) => p.name === 'Urgent')?.color).toBe('#ef4444');
    expect(list.filter((p) => p.isDefault).map((p) => p.name)).toEqual(['Medium']);
  });

  it('creates, renames, recolors, and enforces unique names', async () => {
    const { organization } = await setupOrg();
    const created = await createPriority(db, organization.id, {
      name: 'Critical',
      color: '#7c3aed',
    });
    expect(created!.color).toBe('#7c3aed');

    await expect(createPriority(db, organization.id, { name: 'Critical' })).rejects.toThrow(
      'already exists'
    );
    await expect(
      createPriority(db, organization.id, { name: 'Bad', color: 'red' })
    ).rejects.toThrow('hex');

    const updated = await updatePriority(db, organization.id, created!.id, {
      name: 'Blocker',
      color: '#dc2626',
    });
    expect(updated!.name).toBe('Blocker');
  });

  it('reassigns cards to the default on delete and promotes default', async () => {
    const { organization } = await setupOrg();
    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Board',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    const urgent = (await listPriorities(db, organization.id)).find((p) => p.name === 'Urgent')!;
    const card = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Fix prod',
      priorityId: urgent.id,
    });
    expect(card!.priorityId).toBe(urgent.id);

    await setDefaultPriority(db, organization.id, urgent.id);
    // Deleting the default reassigns its cards to the lowest-rank survivor (High)
    // and promotes it to default.
    const res = await deletePriority(db, organization.id, urgent.id);
    const high = (await listPriorities(db, organization.id)).find((p) => p.name === 'High')!;
    expect(res.reassignedTo).toBe(high.id);

    const fetched = await getCard(db, card!.id, organization.id);
    expect((fetched as any).priority?.name).toBe('High');

    // Cannot delete the last remaining priority
    const remaining = await listPriorities(db, organization.id);
    for (const p of remaining.slice(0, -1)) await deletePriority(db, organization.id, p.id);
    const last = (await listPriorities(db, organization.id))[0]!;
    await expect(deletePriority(db, organization.id, last.id)).rejects.toThrow('at least one');
  });

  it('defaults new cards, updates via updateCard, and filters my-tasks', async () => {
    const { organization, user } = await setupOrg();
    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Board',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    const defaultId = await getDefaultPriorityId(db, organization.id);
    const plain = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Plain',
      assigneeId: user.id,
    });
    expect(plain!.priorityId).toBe(defaultId);

    const lows = (await listPriorities(db, organization.id)).find((p) => p.name === 'Low')!;
    await updateCard(db, plain!.id, organization.id, { priorityId: lows.id });
    await expect(
      updateCard(db, plain!.id, organization.id, {
        priorityId: '00000000-0000-0000-0000-000000000000',
      })
    ).rejects.toThrow('Priority not found');

    const filtered = await getMyTasks(db, organization.id, user.id, {
      filter: 'all',
      priority: lows.id,
    });
    expect(filtered.tasks.some((t) => t.id === plain!.id)).toBe(true);
    expect(filtered.tasks.every((t) => (t as any).priority?.id === lows.id)).toBe(true);

    // Legacy hardcoded names still resolve
    const byName = await getMyTasks(db, organization.id, user.id, {
      filter: 'all',
      priority: 'low',
    });
    expect(byName.tasks.some((t) => t.id === plain!.id)).toBe(true);
  });
});
