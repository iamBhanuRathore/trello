import { eq, or, ilike, and, desc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { savedSearches, cards, boards, projects, workspaces, lists } from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function performSearch(db: Database, organizationId: string, query: string) {
  const trimmed = query.trim();
  // Empty / wildcard-only queries would full-scan — return early.
  const literal = trimmed.replace(/[\\%_]/g, (m) => `\\${m}`);
  if (!literal) return [];
  const searchTerm = `%${literal}%`;

  // Three searches are independent — fan out concurrently (was 3 sequential).
  const [matchedCards, matchedBoards, matchedProjects] = await Promise.all([
    // Search Cards
    db
      .select({
        id: cards.id,
        key: cards.key,
        taskNumber: cards.taskNumber,
        title: cards.title,
        boardId: lists.boardId,
        boardName: boards.name,
        projectName: projects.name,
        projectKey: projects.key,
      })
      .from(cards)
      .innerJoin(lists, eq(lists.id, cards.listId))
      .innerJoin(boards, eq(boards.id, lists.boardId))
      .innerJoin(projects, eq(projects.id, boards.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(
        and(
          eq(workspaces.organizationId, organizationId),
          or(
            ilike(cards.title, searchTerm),
            ilike(cards.description, searchTerm),
            ilike(cards.key, searchTerm)
          )
        )
      )
      .limit(10),
    // Search Boards
    db
      .select({
        id: boards.id,
        title: boards.name,
      })
      .from(boards)
      .innerJoin(projects, eq(projects.id, boards.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(workspaces.organizationId, organizationId), ilike(boards.name, searchTerm)))
      .limit(5),
    // Search Projects
    db
      .select({
        id: projects.id,
        title: projects.name,
      })
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(workspaces.organizationId, organizationId), ilike(projects.name, searchTerm)))
      .limit(5),
  ]);

  return [
    ...matchedCards.map((c) => ({ ...c, type: 'card' })),
    ...matchedBoards.map((b) => ({ ...b, type: 'board' })),
    ...matchedProjects.map((p) => ({ ...p, type: 'project' })),
  ];
}

export async function listSavedSearches(db: Database, userId: string) {
  return db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
}

export async function createSavedSearch(
  db: Database,
  userId: string,
  input: {
    name: string;
    query: string;
    filters?: any;
  }
) {
  const [savedSearch] = await db
    .insert(savedSearches)
    .values({
      userId,
      name: input.name,
      query: input.query,
      filters: input.filters || {},
    })
    .returning();
  return savedSearch;
}

export async function deleteSavedSearch(db: Database, userId: string, id: string) {
  const [deleted] = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)))
    .returning();

  if (!deleted) throw httpError(404, 'Saved search not found');
  return deleted;
}
