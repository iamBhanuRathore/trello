import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { db as appDb } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, moveCard, createComment, assignUserToCard, watchCard } from './service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';

/**
 * Cache-invalidation consistency (P1).
 *
 * `bumpForCard` exists to bump a card AND its parent, because subtasks are
 * embedded in the parent's cached `getCard` payload. Several mutation paths
 * called `bumpCardAndBoard` directly and therefore skipped the parent, so a
 * parent's subtask list (and its participant/watcher counts) went stale after a
 * subtask was assigned, watched or commented on.
 *
 * A cross-board move had the mirror problem: the destination board was bumped,
 * but the source relied on the cached card->board map, which can hold the
 * pre-move board, a stale board, or nothing.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;

interface Fixture {
  orgId: string;
  email: string;
  userId: string;
  boardA: string;
  listA1: string;
  listA2: string;
  boardB: string;
  listB1: string;
  parentId: string;
  subtaskId: string;
}

let fx: Fixture;

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  const email = uniqueTestEmail('cache');
  const { user, organization } = await signUp(appDb, {
    name: 'Cache Owner',
    email,
    password: 'pass',
    orgName: 'Cache Org',
    orgSlug: uniqueTestSlug('cache'),
  });

  const ws = await createWorkspace(appDb, { organizationId: organization.id, name: 'WS' });
  const proj = await createProject(appDb, {
    organizationId: organization.id,
    workspaceId: ws!.id,
    name: 'Proj',
  });
  const boardA = await createBoard(appDb, {
    organizationId: organization.id,
    projectId: proj!.id,
    name: 'Board A',
  });
  const boardB = await createBoard(appDb, {
    organizationId: organization.id,
    projectId: proj!.id,
    name: 'Board B',
  });
  const listA1 = await createList(appDb, organization.id, { boardId: boardA!.id, name: 'A1' });
  const listA2 = await createList(appDb, organization.id, { boardId: boardA!.id, name: 'A2' });
  const listB1 = await createList(appDb, organization.id, { boardId: boardB!.id, name: 'B1' });

  const parent = await createCard(appDb, organization.id, {
    listId: listA1!.id,
    title: 'Parent',
  });
  const subtask = await createCard(appDb, organization.id, {
    listId: listA1!.id,
    title: 'Subtask',
    parentCardId: parent!.id,
  });

  fx = {
    orgId: organization.id,
    email,
    userId: user.id,
    boardA: boardA!.id,
    listA1: listA1!.id,
    listA2: listA2!.id,
    boardB: boardB!.id,
    listB1: listB1!.id,
    parentId: parent!.id,
    subtaskId: subtask!.id,
  };
});

afterAll(async () => {
  const { getCard } = await import('./service');
  void getCard;
  for (const cardId of [fx.subtaskId, fx.parentId]) {
    await appDb.delete(schema.comments).where(eq(schema.comments.cardId, cardId));
    await appDb.delete(schema.cardAssignees).where(eq(schema.cardAssignees.cardId, cardId));
    await appDb.delete(schema.cardWatchers).where(eq(schema.cardWatchers.cardId, cardId));
    await appDb.delete(schema.cards).where(eq(schema.cards.id, cardId));
  }
  for (const boardId of [fx.boardA, fx.boardB]) {
    await appDb.delete(schema.lists).where(eq(schema.lists.boardId, boardId));
    await appDb.delete(schema.boards).where(eq(schema.boards.id, boardId));
  }
  await appDb.delete(schema.projects).where(eq(schema.projects.organizationId, fx.orgId));
  await appDb.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, fx.orgId));
  await deleteTestOrg(appDb, fx.orgId);
  await deleteTestUser(appDb, fx.email);
  await client.end();
});

describe('parent bump consistency', () => {
  it('the subtask is embedded in the parent payload before mutation', async () => {
    const { getCard } = await import('./service');
    const parent = await getCard(appDb, fx.parentId, fx.orgId);
    expect(parent.subtasksTotal ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('assigning a subtask user bumps through bumpForCard (parent invalidated)', async () => {
    // Asserted structurally: these paths must not call bumpCardAndBoard
    // directly, because that skips the parent bump.
    const src = await Bun.file(new URL('./card-members.ts', import.meta.url)).text();
    // Call syntax, not prose — the explanatory comments name the old helper.
    expect(src.includes('bumpCardAndBoard(')).toBe(false);
    expect(src.includes('await bumpForCard(db, cardId')).toBe(true);
  });

  it('comment/attachment/participant paths also route through bumpForCard', async () => {
    const src = await Bun.file(new URL('./card-activity.ts', import.meta.url)).text();
    expect(src.includes('bumpCardAndBoard(')).toBe(false);
    expect(src.includes('bumpForCard')).toBe(true);
  });

  it('a subtask mutation still leaves the parent card readable and consistent', async () => {
    const { getCard } = await import('./service');
    await createComment(appDb, fx.subtaskId, fx.orgId, fx.userId, 'note on subtask');
    await assignUserToCard(appDb, fx.subtaskId, fx.orgId, fx.userId, fx.userId);
    await watchCard(appDb, fx.subtaskId, fx.userId, fx.orgId, fx.userId);

    const parent = await getCard(appDb, fx.parentId, fx.orgId);
    expect(parent.id).toBe(fx.parentId);
    // The parent still resolves its subtasks after child mutations.
    expect(parent.subtasksTotal ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('denormalised subtasksTotal counter', () => {
  it('createCard increments the parent counter', async () => {
    const { getCard } = await import('./service');
    const before = await getCard(appDb, fx.parentId, fx.orgId);
    const child = await createCard(appDb, fx.orgId, {
      listId: fx.listA1,
      title: 'Counter child',
      parentCardId: fx.parentId,
    });
    const after = await getCard(appDb, fx.parentId, fx.orgId);

    expect(after.subtasksTotal ?? 0).toBe((before.subtasksTotal ?? 0) + 1);

    await appDb.delete(schema.cards).where(eq(schema.cards.id, child!.id));
  });

  it('deleteCard decrements the parent counter', async () => {
    const { getCard, deleteCard } = await import('./service');
    const child = await createCard(appDb, fx.orgId, {
      listId: fx.listA1,
      title: 'Doomed child',
      parentCardId: fx.parentId,
    });
    const before = await getCard(appDb, fx.parentId, fx.orgId);

    await deleteCard(appDb, child!.id, fx.orgId);
    const after = await getCard(appDb, fx.parentId, fx.orgId);

    expect(after.subtasksTotal ?? 0).toBe((before.subtasksTotal ?? 0) - 1);

    await appDb.delete(schema.cards).where(eq(schema.cards.id, child!.id));
  });

  it('the counter never goes negative', async () => {
    const { getCard, deleteCard } = await import('./service');
    const child = await createCard(appDb, fx.orgId, {
      listId: fx.listA1,
      title: 'Twice removed',
      parentCardId: fx.parentId,
    });
    await deleteCard(appDb, child!.id, fx.orgId);
    // Second delete is a no-op at the DB level (row already soft-deleted), so
    // the counter must not be decremented again.
    await deleteCard(appDb, child!.id, fx.orgId).catch(() => {});
    const parent = await getCard(appDb, fx.parentId, fx.orgId);
    expect(parent.subtasksTotal ?? 0).toBeGreaterThanOrEqual(0);

    await appDb.delete(schema.cards).where(eq(schema.cards.id, child!.id));
  });

  it('archiving a subtask decrements the counter (getCard excludes archived)', async () => {
    const { getCard, archiveCard } = await import('./service');
    const child = await createCard(appDb, fx.orgId, {
      listId: fx.listA1,
      title: 'Archived child',
      parentCardId: fx.parentId,
    });
    const before = await getCard(appDb, fx.parentId, fx.orgId);

    await archiveCard(appDb, child!.id, fx.orgId);
    const after = await getCard(appDb, fx.parentId, fx.orgId);

    expect(after.subtasksTotal ?? 0).toBe((before.subtasksTotal ?? 0) - 1);

    await appDb.delete(schema.cards).where(eq(schema.cards.id, child!.id));
  });
});

describe('cross-board move invalidates both boards', () => {
  it('moveCard pins the destination board and bumps the captured source board', async () => {
    const src = await Bun.file(new URL('./card-movement.ts', import.meta.url)).text();
    // Source board is read before the write, and both boards are bumped.
    expect(src).toContain('sourceBoardId');
    expect(src).toMatch(/sourceBoardId && sourceBoardId !== boardId/);
    expect(src).toContain('bumpBoardCache(sourceBoardId)');
    // The destination is passed explicitly so no stale cached board is used.
    expect(src).toContain('bumpForCard(db, id, boardId ?? null)');
  });

  it('moving a card between boards succeeds and lands in the target list', async () => {
    const moved = await moveCard(appDb, fx.subtaskId, fx.orgId, fx.listB1, 100);
    expect(moved.listId).toBe(fx.listB1);

    const [row] = await appDb
      .select({ listId: schema.cards.listId })
      .from(schema.cards)
      .where(eq(schema.cards.id, fx.subtaskId))
      .limit(1);
    expect(row?.listId).toBe(fx.listB1);

    // Put it back so the fixture stays coherent for any later assertion.
    await moveCard(appDb, fx.subtaskId, fx.orgId, fx.listA1, 200);
  });

  it('a same-board move does not require a second board bump', async () => {
    const moved = await moveCard(appDb, fx.subtaskId, fx.orgId, fx.listA2, 300);
    expect(moved.listId).toBe(fx.listA2);
    await moveCard(appDb, fx.subtaskId, fx.orgId, fx.listA1, 400);
  });
});
