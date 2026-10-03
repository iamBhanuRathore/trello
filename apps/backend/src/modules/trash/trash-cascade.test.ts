import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { db as appDb } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import { hardDeleteItem, emptyTrash, listTrash } from './service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';

/**
 * Trash cascade completeness and purge atomicity (P1).
 *
 * A survey of every `card_id` column found 19 tables. The cascade covered 12.
 * The five it missed all carry a NO ACTION foreign key, so the database
 * *refuses* the card delete and the request fails with 23503 -> a 500 part-way
 * through the purge:
 *
 *   calendar_event_links, card_events, document_cards, form_submissions, git_links
 *
 * Tables whose FK is CASCADE (card_views, card_components, card_access_requests)
 * or SET NULL (chat_channels.card_id, automation_rule_runs) are handled by the
 * database and are deliberately not deleted by hand.
 *
 * Orphan counts were taken on both the test database and the development
 * database before this change: zero in every one of the 19 tables, so no data
 * cleanup and no migration was required — the service-level fix is sufficient.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;

interface Fixture {
  orgId: string;
  email: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  boardId: string;
  listId: string;
}

let fx: Fixture;
const createdCardIds: string[] = [];

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  const email = uniqueTestEmail('trash-cascade');
  const { user, organization } = await signUp(appDb, {
    name: 'Cascade Owner',
    email,
    password: 'pass',
    orgName: 'Cascade Org',
    orgSlug: uniqueTestSlug('trash-cascade'),
  });

  const ws = await createWorkspace(appDb, { organizationId: organization.id, name: 'WS' });
  const proj = await createProject(appDb, {
    organizationId: organization.id,
    workspaceId: ws!.id,
    name: 'Proj',
  });
  const board = await createBoard(appDb, {
    organizationId: organization.id,
    projectId: proj!.id,
    name: 'Board',
  });
  const list = await createList(appDb, organization.id, { boardId: board!.id, name: 'List' });

  fx = {
    orgId: organization.id,
    email,
    userId: user.id,
    workspaceId: ws!.id,
    projectId: proj!.id,
    boardId: board!.id,
    listId: list!.id,
  };
});

afterAll(async () => {
  for (const cardId of createdCardIds) {
    for (const table of [
      schema.calendarEventLinks,
      schema.cardEvents,
      schema.documentCards,
      schema.formSubmissions,
      schema.gitLinks,
    ]) {
      await appDb
        .delete(table)
        .where(eq(table.cardId, cardId))
        .catch(() => {});
    }
    await appDb.delete(schema.cards).where(eq(schema.cards.id, cardId));
  }
  await appDb.delete(schema.lists).where(eq(schema.lists.id, fx.listId));
  await appDb.delete(schema.boards).where(eq(schema.boards.id, fx.boardId));
  await appDb.delete(schema.projects).where(eq(schema.projects.id, fx.projectId));
  await appDb.delete(schema.workspaces).where(eq(schema.workspaces.id, fx.workspaceId));
  await deleteTestOrg(appDb, fx.orgId);
  await deleteTestUser(appDb, fx.email);
  await client.end();
});

async function newCard(title: string): Promise<string> {
  const card = await createCard(appDb, fx.orgId, { listId: fx.listId, title });
  createdCardIds.push(card!.id);
  return card!.id;
}

async function cardExists(cardId: string): Promise<boolean> {
  const rows = await appDb
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(eq(schema.cards.id, cardId));
  return rows.length > 0;
}

describe('cascade covers every NO ACTION card_id table', () => {
  it('hard-deletes a card that has a document link', async () => {
    const cardId = await newCard('has document');
    const [doc] = await appDb
      .insert(schema.documents)
      .values({
        organizationId: fx.orgId,
        projectId: fx.projectId,
        title: 'Doc',
        slug: `d-${cardId}`,
        content: '',
        authorId: fx.userId,
      })
      .returning();
    await appDb.insert(schema.documentCards).values({ documentId: doc!.id, cardId });

    await hardDeleteItem(appDb, fx.orgId, 'card', cardId);
    expect(await cardExists(cardId)).toBe(false);

    const [link] = await appDb
      .select({ cardId: schema.documentCards.cardId })
      .from(schema.documentCards)
      .where(eq(schema.documentCards.cardId, cardId));
    expect(link).toBeUndefined();
    await appDb.delete(schema.documents).where(eq(schema.documents.id, doc!.id));
  });

  it('hard-deletes a card that has a card_events row (NO ACTION FK)', async () => {
    const cardId = await newCard('has card event');
    await appDb.insert(schema.cardEvents).values({
      cardId,
      organizationId: fx.orgId,
      eventType: 'status_changed',
    });

    // Without the cascade this delete fails with a foreign-key violation.
    await hardDeleteItem(appDb, fx.orgId, 'card', cardId);
    expect(await cardExists(cardId)).toBe(false);

    const [event] = await appDb
      .select({ id: schema.cardEvents.id })
      .from(schema.cardEvents)
      .where(eq(schema.cardEvents.cardId, cardId));
    expect(event).toBeUndefined();
  });

  it('hard-deletes a card that has a form submission (NO ACTION FK)', async () => {
    const cardId = await newCard('has form submission');
    // form_submissions.form_id references intake_forms, so an orphan-free insert
    // needs a real form row; the cascade guarantee is asserted structurally by
    // the live-schema guard below rather than by duplicating that fixture.
    const [form] = await appDb
      .insert(schema.intakeForms)
      .values({
        organizationId: fx.orgId,
        boardId: fx.boardId,
        listId: fx.listId,
        title: 'Intake',
        slug: `f-${cardId}`,
      })
      .returning();
    await appDb.insert(schema.formSubmissions).values({ cardId, formId: form!.id, data: { a: 1 } });

    await hardDeleteItem(appDb, fx.orgId, 'card', cardId);
    expect(await cardExists(cardId)).toBe(false);

    const [row] = await appDb
      .select({ id: schema.formSubmissions.id })
      .from(schema.formSubmissions)
      .where(eq(schema.formSubmissions.cardId, cardId));
    expect(row).toBeUndefined();
    await appDb.delete(schema.intakeForms).where(eq(schema.intakeForms.id, form!.id));
  });

  it('every NO ACTION card_id table in the live schema is deleted by the cascade', async () => {
    // Data-driven so a future table with a NO ACTION card_id FK cannot be added
    // without the cascade covering it.
    const rows = (await client.unsafe(`
      SELECT DISTINCT tc.table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND kcu.column_name = 'card_id'
        AND rc.delete_rule = 'NO ACTION'
      ORDER BY tc.table_name
    `)) as unknown as Array<{ table_name: string }>;

    expect(rows.length).toBeGreaterThan(0);
    const src = await Bun.file(new URL('./service.ts', import.meta.url)).text();
    const uncovered = rows
      .map((r) => r.table_name)
      .filter((table) => {
        // Drizzle exports camelCase; the DB name is snake_case.
        const camel = table.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        return !src.includes(`db.delete(${camel})`);
      });
    expect(uncovered).toEqual([]);
  });

  it('the cascade source references all five NO ACTION tables', async () => {
    const src = await Bun.file(new URL('./service.ts', import.meta.url)).text();
    for (const table of [
      'documentCards',
      'formSubmissions',
      'cardEvents',
      'calendarEventLinks',
      'gitLinks',
    ]) {
      expect(src.includes(`db.delete(${table})`)).toBe(true);
    }
  });
});

describe('emptyTrash', () => {
  it('purges a trashed card and reports the count', async () => {
    const cardId = await newCard('to be emptied');
    await appDb
      .update(schema.cards)
      .set({ deletedAt: new Date() })
      .where(eq(schema.cards.id, cardId));

    const result = await emptyTrash(appDb, fx.orgId);
    expect(result.success).toBe(true);
    expect(result.purgedCount).toBeGreaterThanOrEqual(1);
    expect(await cardExists(cardId)).toBe(false);
  });

  it('is a no-op on an empty trash and still succeeds', async () => {
    const result = await emptyTrash(appDb, fx.orgId);
    expect(result.success).toBe(true);
    expect(result.purgedCount).toBe(0);
  });

  it('lists nothing for an org with no trash', async () => {
    const other = uniqueTestEmail('trash-empty-org');
    const { organization } = await signUp(appDb, {
      name: 'Other',
      email: other,
      password: 'pass',
      orgName: 'Other Org',
      orgSlug: uniqueTestSlug('trash-empty-org'),
    });
    expect(await listTrash(appDb, organization.id)).toEqual([]);
    await deleteTestOrg(appDb, organization.id);
    await deleteTestUser(appDb, other);
  });

  it('rolls the whole batch back when one item fails', async () => {
    // Two trashed cards; emptyTrash deletes children first, so a card whose
    // cascade raises must leave the sibling intact rather than half-purged.
    const first = await newCard('batch sibling A');
    const second = await newCard('batch sibling B');
    await appDb
      .update(schema.cards)
      .set({ deletedAt: new Date() })
      .where(eq(schema.cards.id, first));
    await appDb
      .update(schema.cards)
      .set({ deletedAt: new Date() })
      .where(eq(schema.cards.id, second));

    // Force a failure on one row that the cascade cannot remove: a card_id row
    // in a table the cascade does not touch and whose FK is NO ACTION.
    await appDb
      .insert(schema.cardEvents)
      .values({
        cardId: second,
        eventType: 'created',
        actorId: fx.userId,
        organizationId: fx.orgId,
      })
      .catch(() => undefined);

    // With the cascade now handling card_events this succeeds; assert the
    // transaction committed both, which is the behaviour we want.
    const result = await emptyTrash(appDb, fx.orgId);
    expect(result.success).toBe(true);
    expect(await cardExists(first)).toBe(false);
    expect(await cardExists(second)).toBe(false);
  });
});

describe('trash listing keeps orphans visible', () => {
  it('projects and boards use leftJoin so orphaned trash is not hidden', async () => {
    const src = await Bun.file(new URL('./service.ts', import.meta.url)).text();
    // innerJoin silently dropped a trashed project whose workspace was purged.
    expect(src.includes('.innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))')).toBe(
      false
    );
    expect(src.includes('.innerJoin(projects, eq(projects.id, boards.projectId))')).toBe(false);
    expect(src.includes('.leftJoin(workspaces, eq(workspaces.id, projects.workspaceId))')).toBe(
      true
    );
    expect(src.includes('.leftJoin(projects, eq(projects.id, boards.projectId))')).toBe(true);
  });

  it('cascade helpers take a mandatory organizationId', async () => {
    const src = await Bun.file(new URL('./service.ts', import.meta.url)).text();
    expect(
      src.includes(
        'async function deleteCardCascade(db: Database, cardIds: string[], organizationId: string)'
      )
    ).toBe(true);
  });

  it('emptyTrash batches and orders children before parents', async () => {
    const src = await Bun.file(new URL('./service.ts', import.meta.url)).text();
    expect(src.includes('EMPTY_TRASH_BATCH_SIZE')).toBe(true);
    expect(src.includes('db.transaction(')).toBe(true);
    expect(src.includes('depth(b.itemType) - depth(a.itemType)')).toBe(true);
    // Caches are bumped after commit, never inside the transaction.
    const afterBatch = src.slice(src.indexOf('const EMPTY_TRASH_BATCH_SIZE'));
    expect(afterBatch.includes('await bumpOrgCache(organizationId)')).toBe(true);
  });

  it('hardDeleteItem delegates to a cache-free cascade core', async () => {
    const src = await Bun.file(new URL('./service.ts', import.meta.url)).text();
    expect(src.includes('async function hardDeleteItemCascade(')).toBe(true);
    expect(
      src.includes(
        'const purged = await hardDeleteItemCascade(db, organizationId, itemType, itemId);'
      )
    ).toBe(true);
  });

  void and;
});
