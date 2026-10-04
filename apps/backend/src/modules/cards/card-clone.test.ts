import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, updateCard } from './card-crud';
import { createBoardLabel, attachLabelToCard } from './card-labels';
import { assignUserToCard } from './card-members';
import { cloneCard } from './card-clone';

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

async function setup() {
  const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const { user, organization } = await signUp(db, {
    name: 'Clone Owner',
    email: `clone_${id}@clone.com`,
    password: 'pass',
    orgName: `Clone Org ${id}`,
    orgSlug: `clone-org-${id}`,
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
    name: 'B1',
  });
  const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
  const other = await createList(db, organization.id, { boardId: board!.id, name: 'Done' });
  const card = await createCard(db, organization.id, {
    listId: list!.id,
    title: 'Original task',
    description: 'Original description',
    actorId: user.id,
  });
  return { user, organization, board: board!, list: list!, otherList: other!, card: card! };
}

describe('cloneCard field overrides (review-before-clone dialog)', () => {
  it('applies the supplied overrides', async () => {
    const { organization, card, otherList, user } = await setup();

    const cloned = await cloneCard(
      db,
      card.id,
      organization.id,
      {
        title: 'Edited title',
        description: 'Edited description',
        listId: otherList.id,
        dueDate: '2030-01-02T03:04:05.000Z',
        storyPoints: 8,
      },
      { userId: user.id }
    );

    expect(cloned.title).toBe('Edited title');
    expect(cloned.description).toBe('Edited description');
    expect(cloned.listId).toBe(otherList.id);
    expect(cloned.storyPoints).toBe(8);
    expect(new Date(cloned.dueDate!).toISOString()).toBe('2030-01-02T03:04:05.000Z');
  });

  it('falls back to the original for every field the caller omits', async () => {
    // The whole point of the optional overrides: a caller that sends only a
    // title (the pre-existing behaviour) must clone exactly as it used to.
    const { organization, card, user } = await setup();
    await updateCard(db, card.id, organization.id, { description: 'Keep me' });

    const cloned = await cloneCard(
      db,
      card.id,
      organization.id,
      { title: 'Only the title changed' },
      { userId: user.id }
    );

    expect(cloned.title).toBe('Only the title changed');
    expect(cloned.description).toBe('Keep me');
    expect(cloned.listId).toBe(card.listId);
  });

  it('treats an explicit null as a deliberate clear, distinct from omitting', async () => {
    const { organization, card, user } = await setup();
    await updateCard(db, card.id, organization.id, { storyPoints: 13 });

    const cleared = await cloneCard(
      db,
      card.id,
      organization.id,
      { title: 'T', storyPoints: null, dueDate: null },
      { userId: user.id }
    );

    expect(cleared.storyPoints).toBeNull();
    expect(cleared.dueDate).toBeNull();
  });

  it('replaces the copied label set when labelIds is supplied', async () => {
    const { organization, card, board, user } = await setup();
    const keep = (await createBoardLabel(db, board.id, organization.id, 'keep', '#111111'))!;
    const drop = (await createBoardLabel(db, board.id, organization.id, 'drop', '#222222'))!;
    await attachLabelToCard(db, card.id, organization.id, keep.id);
    await attachLabelToCard(db, card.id, organization.id, drop.id);

    const withOverride = await cloneCard(
      db,
      card.id,
      organization.id,
      { title: 'T', labelIds: [keep.id] },
      { userId: user.id }
    );
    expect(withOverride.labels.map((l: any) => l.id)).toEqual([keep.id]);

    // An empty array means "no labels" — it must not silently fall back to copy.
    const emptied = await cloneCard(
      db,
      card.id,
      organization.id,
      { title: 'T', labelIds: [] },
      { userId: user.id }
    );
    expect(emptied.labels).toEqual([]);

    // Omitting labelIds keeps the original copy-all behaviour.
    const copied = await cloneCard(
      db,
      card.id,
      organization.id,
      { title: 'T' },
      { userId: user.id }
    );
    expect(copied.labels.map((l: any) => l.id).sort()).toEqual([keep.id, drop.id].sort());
  });

  it('replaces the copied assignees when assigneeId is supplied', async () => {
    const { organization, card, user } = await setup();
    // createCard's actorId records authorship only — it does not assign anyone,
    // so the copy-all path has something to copy only after an explicit assign.
    await assignUserToCard(db, card.id, organization.id, user.id, user.id);

    const reassigned = await cloneCard(
      db,
      card.id,
      organization.id,
      { title: 'T', assigneeId: null },
      { userId: user.id }
    );
    expect(reassigned.assignees).toEqual([]);

    const copied = await cloneCard(
      db,
      card.id,
      organization.id,
      { title: 'T' },
      { userId: user.id }
    );
    expect(copied.assignees.map((a: any) => a.id)).toEqual([user.id]);
  });

  it('refuses to clone a private card for a member who cannot see it', async () => {
    // Regression: cloneCard called getCard with no `actor`, and getCard only
    // runs requireCardAccess `if (actor)` — so the private-task gate was
    // silently skipped and a private card could be cloned by anyone in the org
    // who knew its id.
    const { organization, card, user } = await setup();
    await db.update(schema.cards).set({ isPrivate: true }).where(eq(schema.cards.id, card.id));

    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user: outsider } = await signUp(db, {
      name: 'Clone Outsider',
      email: `clone_out_${id}@clone.com`,
      password: 'pass',
      orgName: `Clone Out Org ${id}`,
      orgSlug: `clone-out-org-${id}`,
    });
    await db.insert(schema.organizationMembers).values({
      organizationId: organization.id,
      userId: outsider.id,
      role: 'member',
      status: 'active',
    });

    expect(
      cloneCard(db, card.id, organization.id, { title: 'T' }, { userId: outsider.id })
    ).rejects.toThrow();

    // The creator still can — the gate is not simply closed.
    const ok = await cloneCard(db, card.id, organization.id, { title: 'T' }, { userId: user.id });
    expect(ok.id).toBeDefined();
  });
});
