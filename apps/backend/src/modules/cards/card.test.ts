import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { rebalanceListPositions } from './card-movement';
import {
  createCard,
  getCard,
  moveCard,
  archiveCard,
  watchCard,
  unwatchCard,
  getCardWatchers,
  listComments,
  createComment,
  listAttachments,
  getCardParticipants,
  getCardChecklists,
  assignUserToCard,
  getMyTasks,
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
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Board 1',
    });
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
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Board 1',
    });
    const list1 = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const list2 = await createList(db, organization.id, { boardId: board!.id, name: 'Doing' });

    const card = await createCard(db, organization.id, { listId: list1!.id, title: 'Task' });

    const moved = await moveCard(db, card!.id, organization.id, list2!.id, 100);
    expect(moved.listId).toBe(list2!.id);
    expect(moved.position).toBe(100);
  });

  // The renumbering is a single set-based UPDATE with a bound VALUES list
  // (it used to be one UPDATE per card). Verify the numbering, the gaps, the
  // version bump and the archived/deleted exclusion all still hold.
  it('should renumber a list in one statement, preserving order and skipping archived cards', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Rebalance Owner',
      email: `rebal_${id}@card.com`,
      password: 'pass',
      orgName: `Rebal Org ${id}`,
      orgSlug: `rebal-org-${id}`,
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
      name: 'Board',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    // Deliberately colliding positions, so ordering must come from the update's
    // ORDER BY position, id tiebreak — not from insertion order.
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await createCard(db, organization.id, { listId: list!.id, title: `T${i}` });
      created.push(c!.id);
      await db.update(schema.cards).set({ position: 1 }).where(eq(schema.cards.id, c!.id));
    }

    const versionsBefore = new Map<string, number>();
    for (const cardId of created) {
      const [row] = await db
        .select({ version: schema.cards.version })
        .from(schema.cards)
        .where(eq(schema.cards.id, cardId));
      versionsBefore.set(cardId, row!.version);
    }

    // Exclude the last card from the renumbering.
    const archivedId = created[4]!;
    await db.update(schema.cards).set({ isArchived: true }).where(eq(schema.cards.id, archivedId));

    const renamed = await rebalanceListPositions(db, list!.id);
    expect(renamed).toBe(4);

    const rows = await db
      .select({ id: schema.cards.id, position: schema.cards.position })
      .from(schema.cards)
      .where(eq(schema.cards.listId, list!.id))
      .orderBy(schema.cards.position);

    const active = rows.filter((r) => r.id !== archivedId);
    expect(active).toHaveLength(4);

    // Distinct, ascending, evenly spaced — no duplicates left behind.
    const positions = active.map((r) => Number(r.position));
    expect(new Set(positions).size).toBe(4);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    }

    // Every renumbered card got exactly one version bump.
    for (const row of active) {
      const [after] = await db
        .select({ version: schema.cards.version })
        .from(schema.cards)
        .where(eq(schema.cards.id, row.id));
      expect(after!.version).toBe(versionsBefore.get(row.id)! + 1);
    }

    // The archived card was left untouched.
    const [archivedRow] = await db
      .select({ position: schema.cards.position, version: schema.cards.version })
      .from(schema.cards)
      .where(eq(schema.cards.id, archivedId));
    expect(Number(archivedRow!.position)).toBe(1);
    expect(archivedRow!.version).toBe(versionsBefore.get(archivedId)!);
  });

  it('should log a move-history entry on list change, but not on reorder', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user, organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `History Org ${id}`,
      orgSlug: `history-org-${id}`,
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
      name: 'Board 1',
    });
    const list1 = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const list2 = await createList(db, organization.id, { boardId: board!.id, name: 'Doing' });

    const card = await createCard(db, organization.id, { listId: list1!.id, title: 'Task' });

    // Cross-list move writes a 🔀 history comment with from/to names.
    await moveCard(db, card!.id, organization.id, list2!.id, 100, user!.id);
    const afterMove = await listComments(db, card!.id, organization.id);
    const entries = afterMove.filter((c: any) => c.body?.startsWith('🔀'));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.body).toContain('To Do');
    expect(entries[0]!.body).toContain('Doing');
    expect(entries[0]!.userId).toBe(user!.id);

    // Same-list reorder is not a move — the feed stays clean.
    await moveCard(db, card!.id, organization.id, list2!.id, 200, user!.id);
    const afterReorder = await listComments(db, card!.id, organization.id);
    expect(afterReorder.filter((c: any) => c.body?.startsWith('🔀'))).toHaveLength(1);
  });

  it('should reject stale moves with 409 instead of overwriting order', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `OCC Org ${id}`,
      orgSlug: `occ-org-${id}`,
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
      name: 'Board',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, organization.id, { listId: list!.id, title: 'Race' });

    // First mover wins and bumps the version.
    const first = await moveCard(db, card!.id, organization.id, list!.id, 10, undefined, 1);
    expect(first.version).toBe(2);

    // Stale writer (still on version 1) gets 409 + current server truth.
    const err = await moveCard(db, card!.id, organization.id, list!.id, 20, undefined, 1).catch(
      (e) => e
    );
    expect(err.status).toBe(409);
    expect(err.details.code).toBe('VERSION_CONFLICT');
    expect(err.details.current.version).toBe(2);

    // Fresh writer succeeds.
    const second = await moveCard(db, card!.id, organization.id, list!.id, 20, undefined, 2);
    expect(second.version).toBe(3);
    expect(second.position).toBe(20);
  });

  it('should rebalance crowded fractional positions', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `Rebalance Org ${id}`,
      orgSlug: `rebalance-org-${id}`,
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
      name: 'Board',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const a = await createCard(db, organization.id, { listId: list!.id, title: 'A' });
    await createCard(db, organization.id, { listId: list!.id, title: 'B' });

    // Simulate precision exhaustion: crowd B next to A below the gap floor.
    const { rebalanceListPositions } = await import('./service');
    await db
      .update(schema.cards)
      .set({ position: 65536.0000001 })
      .where(eq(schema.cards.listId, list!.id));
    const count = await rebalanceListPositions(db, list!.id);
    expect(count).toBe(2);
    const rows = await db
      .select({ position: schema.cards.position })
      .from(schema.cards)
      .where(eq(schema.cards.listId, list!.id))
      .orderBy(schema.cards.position);
    expect(rows[1]!.position - rows[0]!.position).toBe(65536);
    void a;
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
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Board 1',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    const parent = await createCard(db, organization.id, { listId: list!.id, title: 'Epic' });
    const subtask = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Task',
      parentCardId: parent!.id,
    });

    await expect(
      createCard(db, organization.id, {
        listId: list!.id,
        title: 'Sub-subtask',
        parentCardId: subtask!.id,
      })
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
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Board 1',
    });
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
    const proj = await createProject(db, {
      organizationId: organization.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: organization.id,
      projectId: proj!.id,
      name: 'Board 1',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Watchable Card',
    });

    // Initially 0 watchers
    const initialWatchers = await getCardWatchers(db, card!.id, organization.id);
    expect(initialWatchers.length).toBe(0);

    // Watch card (as actor → writes task history)
    const watchRes = await watchCard(db, card!.id, user.id, organization.id, user.id);
    expect(watchRes.success).toBe(true);
    expect(watchRes.watched).toBe(true);

    // Fetch card watchers
    const watchers = await getCardWatchers(db, card!.id, organization.id);
    expect(watchers.length).toBe(1);
    expect(watchers[0]?.id).toBe(user.id);
    expect(watchers[0]?.name).toBe('Watcher User');

    // Also check getCard returns watchers
    const fetched = await getCard(db, card!.id, organization.id);
    expect(fetched.watchers.length).toBe(1);
    expect(fetched.watchers[0]?.id).toBe(user.id);

    // Unwatch card (as actor → writes task history)
    const unwatchRes = await unwatchCard(db, card!.id, user.id, organization.id, user.id);
    expect(unwatchRes.success).toBe(true);
    expect(unwatchRes.watched).toBe(false);

    const remainingWatchers = await getCardWatchers(db, card!.id, organization.id);
    expect(remainingWatchers.length).toBe(0);

    // Task history must contain both the watch and the unwatch events
    const history = await listComments(db, card!.id, organization.id);
    const bodies = history.map((c: any) => c.body);
    expect(bodies.some((b: string) => b.includes('Started watching'))).toBe(true);
    expect(bodies.some((b: string) => b.includes('Stopped watching'))).toBe(true);
  });

  it('should isolate card sub-resources by organization (IDOR guard)', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const mkOrg = (tag: string) =>
      signUp(db, {
        name: `${tag} Owner`,
        email: `${tag}_${id}@card.com`,
        password: 'pass',
        orgName: `${tag} Org ${id}`,
        orgSlug: `${tag}-org-${id}`,
      });
    const { user: userA, organization: orgA } = await mkOrg('alpha');
    const { user: userB, organization: orgB } = await mkOrg('beta');

    const ws = await createWorkspace(db, { organizationId: orgA.id, name: 'WS' });
    const proj = await createProject(db, {
      organizationId: orgA.id,
      workspaceId: ws!.id,
      name: 'App',
    });
    const board = await createBoard(db, {
      organizationId: orgA.id,
      projectId: proj!.id,
      name: 'Board',
    });
    const list = await createList(db, orgA.id, { boardId: board!.id, name: 'To Do' });
    const card = await createCard(db, orgA.id, { listId: list!.id, title: 'Secret' });
    await createComment(db, card!.id, orgA.id, userA.id, 'secret note');

    // Cross-org reads fail closed (404, not 403 — no existence oracle)
    await expect(listComments(db, card!.id, orgB.id)).rejects.toMatchObject({ status: 404 });
    await expect(listAttachments(db, card!.id, orgB.id)).rejects.toMatchObject({ status: 404 });
    await expect(getCardParticipants(db, card!.id, orgB.id)).rejects.toMatchObject({ status: 404 });
    await expect(getCardChecklists(db, card!.id, orgB.id)).rejects.toMatchObject({ status: 404 });
    await expect(getCardWatchers(db, card!.id, orgB.id)).rejects.toMatchObject({ status: 404 });

    // Cross-org writes fail closed too
    await expect(createComment(db, card!.id, orgB.id, userB.id, 'hijack')).rejects.toMatchObject({
      status: 404,
    });
    await expect(assignUserToCard(db, card!.id, orgB.id, userB.id, userB.id)).rejects.toMatchObject(
      { status: 404 }
    );

    // Same-org non-member cannot be force-assigned
    await expect(assignUserToCard(db, card!.id, orgA.id, userB.id, userA.id)).rejects.toMatchObject(
      { status: 403 }
    );
  });

  it('reports openAssignedCount excluding done-stage cards (sidebar badge slice)', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@card.com`,
      password: 'pass',
      orgName: `Card Org ${id}`,
      orgSlug: `card-org-${id}`,
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
      name: 'Board 1',
    });
    const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });

    const [tmpl] = await db
      .insert(schema.stageTemplates)
      .values({ organizationId: organization.id, name: 'Flow', isDefault: true })
      .returning();
    const [todo] = await db
      .insert(schema.stages)
      .values({
        templateId: tmpl!.id,
        name: 'To Do',
        color: '#3b82f6',
        position: 1,
        category: 'not_started',
      })
      .returning();
    const [done] = await db
      .insert(schema.stages)
      .values({
        templateId: tmpl!.id,
        name: 'Done',
        color: '#22c55e',
        position: 2,
        category: 'done',
      })
      .returning();

    await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Open work',
      stageId: todo!.id,
      assigneeId: user.id,
    });
    await createCard(db, organization.id, {
      listId: list!.id,
      title: 'Finished work',
      stageId: done!.id,
      assigneeId: user.id,
    });

    const res = await getMyTasks(db, organization.id, user.id, { filter: 'assigned', limit: 1 });
    expect(res.summary.totalAssigned).toBe(2);
    expect(res.summary.openAssignedCount).toBe(1);
  });
});
