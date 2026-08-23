import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import { performSearch, listSavedSearches, createSavedSearch, deleteSavedSearch } from './service';

const TEST_DB_URL = process.env['DATABASE_TEST_URL'] ?? 'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Search Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userId: string;
  let savedSearchId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { user, organization } = await signUp(db, {
      name: 'Search Admin',
      email: `search_${id}@example.com`,
      password: 'pass',
      orgName: `Search Org ${id}`,
      orgSlug: `search-org-${id}`,
    });
    orgId = organization.id;
    userId = user.id;

    const [workspace] = await db.insert(schema.workspaces).values({ organizationId: orgId, name: 'Search WS' }).returning();
    const project = await createProject(db, { organizationId: orgId, workspaceId: workspace!.id, name: 'Search Project' });
    const board = await createBoard(db, { organizationId: orgId, projectId: project!.id, name: 'Global Search Board' });
    const list = await createList(db, orgId, { boardId: board!.id, name: 'To Do', position: 1 });
    
    await createCard(db, orgId, { listId: list!.id, title: 'Fix search bug', position: 1, description: 'Elasticsearch' });
    await createCard(db, orgId, { listId: list!.id, title: 'Update Postgres FTS', position: 2 });
  });

  afterAll(async () => {
    if (!orgId) return;
    try {
      await db.delete(schema.savedSearches);
      await db.delete(schema.cards).where(eq(schema.cards.organizationId, orgId));
      const orgBoards = await db.select().from(schema.boards).where(eq(schema.boards.organizationId, orgId));
      for (const b of orgBoards) {
        await db.delete(schema.lists).where(eq(schema.lists.boardId, b.id));
      }
      await db.delete(schema.boards).where(eq(schema.boards.organizationId, orgId));
      await db.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
      await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
      await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, orgId));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
      if (userId) {
        await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, userId));
        await db.delete(schema.users).where(eq(schema.users.id, userId));
      }
    } catch {}
    await client.end();
  });

  it('should search for cards by title', async () => {
    const results = await performSearch(db, orgId, 'Postgres');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.type).toBe('card');
    expect(results[0]?.title).toBe('Update Postgres FTS');
  });

  it('should search for cards by description', async () => {
    const results = await performSearch(db, orgId, 'Elasticsearch');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title).toBe('Fix search bug');
  });

  it('should search for boards by name', async () => {
    const results = await performSearch(db, orgId, 'Global Search');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.type === 'board' && r.title === 'Global Search Board')).toBe(true);
  });

  it('should create a saved search', async () => {
    const saved = await createSavedSearch(db, userId, { name: 'My Bugs', query: 'bug' });
    expect(saved?.name).toBe('My Bugs');
    savedSearchId = saved?.id ?? '';
  });

  it('should list saved searches', async () => {
    const searches = await listSavedSearches(db, userId);
    expect(searches.length).toBe(1);
    expect(searches[0]?.name).toBe('My Bugs');
  });

  it('should delete a saved search', async () => {
    await deleteSavedSearch(db, userId, savedSearchId);
    const searches = await listSavedSearches(db, userId);
    expect(searches.length).toBe(0);
  });
});
