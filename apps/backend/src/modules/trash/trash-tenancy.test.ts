import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, cloneCard } from '../cards/service';
import { hardDeleteItem, restoreItem, listTrash, emptyTrash } from './service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';

/**
 * Cross-tenant regression tests (P0).
 *
 * Every test here is a NEGATIVE test: orgA reaches for an id that belongs to
 * orgB and must be rejected without touching orgB's rows. Before the fixes these
 * assertions failed — the card hard-delete path had no organizationId filter at
 * all, and the parent-card lookups were PK-only.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

interface Tenant {
  orgId: string;
  userId: string;
  email: string;
  boardId: string;
  listId: string;
  cardId: string;
}

let tenantA: Tenant;
let tenantB: Tenant;

async function makeTenant(prefix: string): Promise<Tenant> {
  const email = uniqueTestEmail(prefix);
  const { user, organization } = await signUp(db, {
    name: `${prefix} owner`,
    email,
    password: 'pass',
    orgName: `${prefix} Org`,
    orgSlug: uniqueTestSlug(prefix),
  });

  const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
  const proj = await createProject(db, {
    organizationId: organization.id,
    workspaceId: ws!.id,
    name: 'Project',
  });
  const board = await createBoard(db, {
    organizationId: organization.id,
    projectId: proj!.id,
    name: 'Board',
  });
  const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
  const card = await createCard(db, organization.id, { listId: list!.id, title: 'Secret work' });

  return {
    orgId: organization.id,
    userId: user.id,
    email,
    boardId: board!.id,
    listId: list!.id,
    cardId: card!.id,
  };
}

async function cardStillExists(cardId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(eq(schema.cards.id, cardId));
  return rows.length > 0;
}

async function teardownTenant(t: Tenant) {
  await db.delete(schema.cardPhase).where(eq(schema.cardPhase.cardId, t.cardId));
  await db.delete(schema.cards).where(eq(schema.cards.id, t.cardId));
  await db.delete(schema.cards).where(eq(schema.cards.organizationId, t.orgId));
  await db.delete(schema.lists).where(eq(schema.lists.id, t.listId));
  await db.delete(schema.boards).where(eq(schema.boards.id, t.boardId));
  await db.delete(schema.projects).where(eq(schema.projects.organizationId, t.orgId));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, t.orgId));
  await deleteTestOrg(db, t.orgId);
  await deleteTestUser(db, t.email);
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
  tenantA = await makeTenant('trash-a');
  tenantB = await makeTenant('trash-b');
});

afterAll(async () => {
  await teardownTenant(tenantA);
  await teardownTenant(tenantB);
  await client.end();
});

describe('Trash service — cross-tenant isolation', () => {
  it('hard-deleting a card id owned by another org returns 404 and deletes nothing', async () => {
    await expect(hardDeleteItem(db, tenantA.orgId, 'card', tenantB.cardId)).rejects.toMatchObject({
      status: 404,
    });
    expect(await cardStillExists(tenantB.cardId)).toBe(true);
  });

  it('hard-deleting a board id owned by another org returns 404 and deletes nothing', async () => {
    await expect(hardDeleteItem(db, tenantA.orgId, 'board', tenantB.boardId)).rejects.toMatchObject(
      {
        status: 404,
      }
    );
    const boards = await db
      .select({ id: schema.boards.id })
      .from(schema.boards)
      .where(eq(schema.boards.id, tenantB.boardId));
    expect(boards.length).toBe(1);
  });

  it('hard-deleting a workspace id owned by another org returns 404', async () => {
    const [wsRow] = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.organizationId, tenantB.orgId));
    await expect(hardDeleteItem(db, tenantA.orgId, 'workspace', wsRow!.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('restoring a card id owned by another org returns 404', async () => {
    await expect(restoreItem(db, tenantA.orgId, 'card', tenantB.cardId)).rejects.toMatchObject({
      status: 404,
    });
    expect(await cardStillExists(tenantB.cardId)).toBe(true);
  });

  it('listing trash never leaks another org items', async () => {
    const listed = await listTrash(db, tenantA.orgId);
    expect(listed.some((i) => i.id === tenantB.cardId || i.id === tenantB.boardId)).toBe(false);
  });

  it('emptyTrash only purges the caller org', async () => {
    // Mark B's card trashed so it would appear in a purge sweep.
    await db
      .update(schema.cards)
      .set({ deletedAt: new Date() })
      .where(eq(schema.cards.id, tenantB.cardId));

    const result = await emptyTrash(db, tenantA.orgId);

    expect(result.success).toBe(true);
    expect(await cardStillExists(tenantB.cardId)).toBe(true);

    // Leave B's card as we found it for the remaining assertions.
    await db
      .update(schema.cards)
      .set({ deletedAt: null })
      .where(eq(schema.cards.id, tenantB.cardId));
  });
});

describe('Cards — parent card cross-tenant isolation', () => {
  it('creating a subtask under another org parent returns 404', async () => {
    await expect(
      createCard(db, tenantA.orgId, {
        listId: tenantA.listId,
        title: 'Trojan subtask',
        parentCardId: tenantB.cardId,
      })
    ).rejects.toMatchObject({ status: 404 });

    const [parent] = await db
      .select({ subtasksTotal: schema.cards.subtasksTotal })
      .from(schema.cards)
      .where(eq(schema.cards.id, tenantB.cardId));
    expect(parent?.subtasksTotal ?? 0).toBe(0);
  });

  it('cloning under another org parent returns 404', async () => {
    await expect(
      cloneCard(db, tenantA.cardId, tenantA.orgId, { parentCardId: tenantB.cardId })
    ).rejects.toMatchObject({ status: 404 });

    const [parent] = await db
      .select({ subtasksTotal: schema.cards.subtasksTotal })
      .from(schema.cards)
      .where(eq(schema.cards.id, tenantB.cardId));
    expect(parent?.subtasksTotal ?? 0).toBe(0);
  });

  it('a parent that is itself a subtask returns 400 (2-level invariant)', async () => {
    const subtask = await createCard(db, tenantA.orgId, {
      listId: tenantA.listId,
      title: 'Level 1',
      parentCardId: tenantA.cardId,
    });
    await expect(
      createCard(db, tenantA.orgId, {
        listId: tenantA.listId,
        title: 'Level 3',
        parentCardId: subtask!.id,
      })
    ).rejects.toMatchObject({ status: 400 });

    await db.delete(schema.cards).where(eq(schema.cards.id, subtask!.id));
  });
});
