import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, getCard, moveCard, archiveCard, watchCard, unwatchCard, getCardWatchers } from './service';

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


beforeEach(async () => {
  // isolated per-test tenant creation
});

describe('Cards Service', () => {
  it('should create and get a card with board and list details', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `Card Org ${id}`,
      orgSlug: `card-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'App' });
    const board = await createBoard(db, { organizationId: organization.id, projectId: proj!.id, name: 'Board 1' });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    const card = await createCard(db, organization.id, { listId: list!.id, title: 'Write tests' });
    expect(card!.title).toBe('Write tests');

    const fetched = await getCard(db, card!.id, organization.id);
    expect(fetched.id).toBe(card!.id);
    expect(fetched.boardName).toBe('Board 1');
    expect(fetched.listName).toBe('To Do');
  });

  it('should move a card between lists and update position', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `Card Org ${id}`,
      orgSlug: `card-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'App' });
    const board = await createBoard(db, { organizationId: organization.id, projectId: proj!.id, name: 'Board 1' });
    const list1 = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const list2 = await createList(db, organization.id, { boardId: board!.id, name: 'Doing' });

    const card = await createCard(db, organization.id, { listId: list1!.id, title: 'Task' });
    
    const moved = await moveCard(db, card!.id, organization.id, list2!.id, 100);
    expect(moved.listId).toBe(list2!.id);
    expect(moved.position).toBe(100);
  });

  it('should prevent 3-level nesting of subtasks', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `Card Org ${id}`,
      orgSlug: `card-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'App' });
    const board = await createBoard(db, { organizationId: organization.id, projectId: proj!.id, name: 'Board 1' });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    const parent = await createCard(db, organization.id, { listId: list!.id, title: 'Epic' });
    const subtask = await createCard(db, organization.id, { listId: list!.id, title: 'Task', parentCardId: parent!.id });
    
    await expect(
      createCard(db, organization.id, { listId: list!.id, title: 'Sub-subtask', parentCardId: subtask!.id })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('should archive a card', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `Card Org ${id}`,
      orgSlug: `card-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'App' });
    const board = await createBoard(db, { organizationId: organization.id, projectId: proj!.id, name: 'Board 1' });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    const card = await createCard(db, organization.id, { listId: list!.id, title: 'Archive me' });
    const archived = await archiveCard(db, card!.id, organization.id);

    expect(archived.isArchived).toBe(true);
  });

  it('should allow users to watch, list watchers, and unwatch a card', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user, organization } = await signUp(db, {
      name: 'Watcher User',
      email: `watcher_${id}@card.com`,
      password: 'pass',
      orgName: `Watcher Org ${id}`,
      orgSlug: `watcher-org-${id}`,
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, { organizationId: organization.id, workspaceId: ws!.id, name: 'App' });
    const board = await createBoard(db, { organizationId: organization.id, projectId: proj!.id, name: 'Board 1' });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, organization.id, { listId: list!.id, title: 'Watchable Card' });

    // Initially 0 watchers
    const initialWatchers = await getCardWatchers(db, card!.id);
    expect(initialWatchers.length).toBe(0);

    // Watch card
    const watchRes = await watchCard(db, card!.id, user.id, organization.id);
    expect(watchRes.success).toBe(true);
    expect(watchRes.watched).toBe(true);

    // Fetch card watchers
    const watchers = await getCardWatchers(db, card!.id);
    expect(watchers.length).toBe(1);
    expect(watchers[0]?.id).toBe(user.id);
    expect(watchers[0]?.name).toBe('Watcher User');

    // Also check getCard returns watchers
    const fetched = await getCard(db, card!.id, organization.id);
    expect(fetched.watchers.length).toBe(1);
    expect(fetched.watchers[0]?.id).toBe(user.id);

    // Unwatch card
    const unwatchRes = await unwatchCard(db, card!.id, user.id, organization.id);
    expect(unwatchRes.success).toBe(true);
    expect(unwatchRes.watched).toBe(false);

    const remainingWatchers = await getCardWatchers(db, card!.id);
    expect(remainingWatchers.length).toBe(0);
  });
});
