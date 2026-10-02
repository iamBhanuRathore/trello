import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq, inArray } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { deleteTestOrg, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import { createProject } from '../projects/service';
import { importTrelloBoard, importGenericTasks } from './service';
import { listLists } from '../lists/service';
import { listCards } from '../cards/service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Importers Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let projectId: string;
  let importedBoardId: string;
  let genericBoardId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const email = uniqueTestEmail('import');
    const slug = uniqueTestSlug('import-org');

    const { organization } = await signUp(db, {
      name: 'Import Admin',
      email,
      password: 'pass',
      orgName: 'Import Org',
      orgSlug: slug,
    });
    orgId = organization.id;

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId: orgId, name: 'Import WS' })
      .returning();

    const project = await createProject(db, {
      organizationId: orgId,
      workspaceId: workspace!.id,
      name: 'Import Project',
    });
    projectId = project!.id;
  });

  afterAll(async () => {
    const boardIds = [importedBoardId, genericBoardId].filter(Boolean);
    await db.delete(schema.cardLabels);
    await db.delete(schema.checklistItems);
    await db.delete(schema.checklists);
    await db.delete(schema.cards).where(eq(schema.cards.organizationId, orgId));
    if (boardIds.length > 0) {
      await db.delete(schema.lists).where(inArray(schema.lists.boardId, boardIds));
      await db.delete(schema.labels).where(inArray(schema.labels.boardId, boardIds));
      await db.delete(schema.boards).where(inArray(schema.boards.id, boardIds));
    }
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
    await deleteTestOrg(db, orgId);
    await client.end();
  });

  it('should import a Trello board JSON export', async () => {
    const mockTrelloExport = {
      name: 'Migrated Marketing Board',
      prefs: { backgroundColor: '#3b82f6' },
      labels: [
        { id: 't_lbl_1', name: 'Urgent', color: 'red' },
        { id: 't_lbl_2', name: 'Design', color: 'purple' },
      ],
      lists: [
        { id: 't_list_1', name: 'Backlog', pos: 1000, closed: false },
        { id: 't_list_2', name: 'Done', pos: 2000, closed: false },
        { id: 't_list_3', name: 'Archived List', pos: 3000, closed: true },
      ],
      cards: [
        {
          id: 't_card_1',
          idList: 't_list_1',
          name: 'Homepage Banner',
          desc: 'Create new Q3 marketing banner',
          pos: 1000,
          due: '2026-09-01T00:00:00.000Z',
          closed: false,
          idLabels: ['t_lbl_1', 't_lbl_2'],
        },
        {
          id: 't_card_2',
          idList: 't_list_2',
          name: 'Social Media Strategy',
          desc: 'Completed review',
          pos: 2000,
          closed: false,
          idLabels: ['t_lbl_2'],
        },
      ],
      checklists: [
        {
          id: 't_chk_1',
          idCard: 't_card_1',
          name: 'Design Deliverables',
          checkItems: [
            { id: 't_item_1', name: 'Desktop mockup', state: 'complete', pos: 1000 },
            { id: 't_item_2', name: 'Mobile version', state: 'incomplete', pos: 2000 },
          ],
        },
      ],
    };

    const result = await importTrelloBoard(db, orgId, projectId, mockTrelloExport);
    expect(result.board.name).toBe('Migrated Marketing Board');
    expect(result.stats.listsCount).toBe(2); // closed list excluded
    expect(result.stats.cardsCount).toBe(2);
    expect(result.stats.labelsCount).toBe(2);
    expect(result.stats.checklistsCount).toBe(1);

    importedBoardId = result.board.id;

    const lists = await listLists(db, importedBoardId, orgId);
    expect(lists.length).toBe(2);

    const cards = await listCards(db, lists[0]!.id, orgId);
    expect(cards.length).toBe(1);
    expect(cards[0]!.title).toBe('Homepage Banner');
  });

  it('should import structured task lists into a new board', async () => {
    const genericTasksData = {
      boardName: 'Quick Tasks Board',
      lists: [
        {
          name: 'To Do',
          tasks: [
            { title: 'Task Alpha', description: 'Alpha description', storyPoints: 2 },
            { title: 'Task Beta', description: 'Beta description', storyPoints: 3 },
          ],
        },
        {
          name: 'Done',
          tasks: [{ title: 'Task Gamma', storyPoints: 1 }],
        },
      ],
    };

    const result = await importGenericTasks(db, orgId, projectId, genericTasksData);
    expect(result.board.name).toBe('Quick Tasks Board');
    expect(result.stats.listsCount).toBe(2);
    expect(result.stats.cardsCount).toBe(3);
    genericBoardId = result.board.id;
  });

  it('should create and attach labels when task imports include label names', async () => {
    const result = await importGenericTasks(db, orgId, projectId, {
      boardName: 'Labeled Tasks Board',
      lists: [
        {
          name: 'To Do',
          tasks: [
            { title: 'Tagged Alpha', labels: ['Frontend', 'Feature'] },
            { title: 'Tagged Beta', labels: ['Frontend'] },
            { title: 'Untagged Gamma' },
          ],
        },
      ],
    });
    expect(result.stats.labelsCount).toBe(2);

    const boardLabels = await db
      .select()
      .from(schema.labels)
      .where(eq(schema.labels.boardId, result.board.id));
    expect(boardLabels.length).toBe(2);

    const boardCards = await db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.organizationId, orgId));
    const alpha = boardCards.find((c) => c.title === 'Tagged Alpha');
    const links = await db
      .select()
      .from(schema.cardLabels)
      .where(eq(schema.cardLabels.cardId, alpha!.id));
    expect(links.length).toBe(2);

    // Cleanup: this board is extra to the suite's tracked ids.
    await db.delete(schema.cardLabels).where(
      inArray(
        schema.cardLabels.cardId,
        boardCards
          .filter((c) => ['Tagged Alpha', 'Tagged Beta', 'Untagged Gamma'].includes(c.title))
          .map((c) => c.id)
      )
    );
    await db.delete(schema.cards).where(
      inArray(
        schema.cards.id,
        boardCards
          .filter((c) => ['Tagged Alpha', 'Tagged Beta', 'Untagged Gamma'].includes(c.title))
          .map((c) => c.id)
      )
    );
    await db.delete(schema.lists).where(eq(schema.lists.boardId, result.board.id));
    await db.delete(schema.labels).where(eq(schema.labels.boardId, result.board.id));
    await db.delete(schema.boards).where(eq(schema.boards.id, result.board.id));
  });
});
