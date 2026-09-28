import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import {
  createBoard,
  listBoards,
  getBoard,
  getBoardChanges,
  getBoardFull,
  updateBoard,
  archiveBoard,
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

beforeEach(async () => {
  const existingOrg = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, 'board-org'))
    .then((r) => r[0]);
  if (existingOrg) {
    const orgBoards = await db
      .select()
      .from(schema.boards)
      .where(eq(schema.boards.organizationId, existingOrg.id));
    for (const b of orgBoards) {
      await db.delete(schema.cardLabels);
      await db.delete(schema.labels).where(eq(schema.labels.boardId, b.id));
      await db.delete(schema.automations).where(eq(schema.automations.boardId, b.id));
      await db.delete(schema.intakeForms).where(eq(schema.intakeForms.boardId, b.id));
    }
    await db
      .delete(schema.subscriptions)
      .where(eq(schema.subscriptions.organizationId, existingOrg.id));
    const orgRoles = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.organizationId, existingOrg.id));
    for (const r of orgRoles) {
      await db
        .delete(schema.organizationRoleMembers)
        .where(eq(schema.organizationRoleMembers.roleId, r.id));
      await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, r.id));
    }
    await db.delete(schema.roles).where(eq(schema.roles.organizationId, existingOrg.id));
    await db.delete(schema.boards).where(eq(schema.boards.organizationId, existingOrg.id));
    await db.delete(schema.projects).where(eq(schema.projects.organizationId, existingOrg.id));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, existingOrg.id));
    await db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, existingOrg.id));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, existingOrg.id));
  }
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'owner@board.com'))
    .then((r) => r[0]);
  if (user) {
    await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, user.id));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  }
});

describe('Boards Service', () => {
  it('should create and list boards', async () => {
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: 'owner@board.com',
      password: 'pass',
      orgName: 'Board Org',
      orgSlug: 'board-org',
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });

    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Sprint 1',
    });

    expect(board!.name).toBe('Sprint 1');

    const list = await listBoards(db, proj!.id, organization.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(board!.id);
  });

  it('should update and archive a board', async () => {
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: 'owner@board.com',
      password: 'pass',
      orgName: 'Board Org',
      orgSlug: 'board-org',
    });

    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'Eng WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Sprint 1',
    });

    const updated = await updateBoard(db, board!.id, organization.id, { name: 'Sprint 2' });
    expect(updated.name).toBe('Sprint 2');

    await archiveBoard(db, board!.id, organization.id);

    const fetched = await getBoard(db, board!.id, organization.id);
    expect(fetched.isArchived).toBe(true);

    const list = await listBoards(db, proj!.id, organization.id);
    expect(list).toHaveLength(0); // Excludes archived
  });

  it('should return incremental changes since a cursor for reconnect gap-fill', async () => {
    const { createList } = await import('../lists/service');
    const { createCard, moveCard } = await import('../cards/service');
    const uid = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `changes_${uid}@board.com`,
      password: 'pass',
      orgName: `Changes Org ${uid}`,
      orgSlug: `changes-org-${uid}`,
    });
    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Feed',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, organization.id, { listId: list!.id, title: 'Gap' });

    // Cursor is the shared board_change_seq integer, not a timestamp.
    const cursor = (await getBoardFull(db, board!.id, organization.id)).changeCursor;
    await moveCard(db, card!.id, organization.id, list!.id, 1);

    const feed = await getBoardChanges(db, board!.id, organization.id, String(cursor));
    expect(feed.cards.some((c) => c.id === card!.id)).toBe(true);
    expect(feed.hasMore).toBe(false);
    expect(feed.nextCursor).toBeGreaterThan(cursor);
    expect(feed.serverTime).toBeDefined();

    // Paging is exact: the returned cursor is a resume point with no gaps.
    const resumed = await getBoardChanges(db, board!.id, organization.id, String(feed.nextCursor));
    expect(resumed.cards).toHaveLength(0);
    expect(resumed.lists).toHaveLength(0);

    // Non-numeric cursors (e.g. a stale ISO timestamp) fail loudly.
    await expect(
      getBoardChanges(db, board!.id, organization.id, '2026-01-01T00:00:00.000Z')
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      getBoardChanges(db, board!.id, '00000000-0000-0000-0000-000000000000', String(cursor))
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns every row of a same-millisecond batch (rebalance) without gaps', async () => {
    const { createList } = await import('../lists/service');
    const { createCard, rebalanceListPositions } = await import('../cards/service');
    const uid = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `batch_${uid}@board.com`,
      password: 'pass',
      orgName: `Batch Org ${uid}`,
      orgSlug: `batch-org-${uid}`,
    });
    const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Batch',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(await createCard(db, organization.id, { listId: list!.id, title: `C${i}` }));
    }

    const cursor = (await getBoardFull(db, board!.id, organization.id)).changeCursor;
    // Rewrites every row in one pass — all share the same millisecond.
    await rebalanceListPositions(db, list!.id);

    const feed = await getBoardChanges(db, board!.id, organization.id, String(cursor));
    // A timestamp cursor would have dropped the tail of this batch.
    expect(feed.cards).toHaveLength(created.length);

    const after = await getBoardChanges(db, board!.id, organization.id, String(feed.nextCursor));
    expect(after.cards).toHaveLength(0);
  });
});
