import { eq, and, isNotNull, isNull, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  workspaces,
  projects,
  boards,
  cards,
  lists,
  // Tables with a card_id whose FK is NO ACTION, so the database refuses the card
  // delete unless these rows go first (Postgres 23503 -> a 500 mid-cascade).
  // Tables whose FK is CASCADE or SET NULL are handled by the database.
  documentCards,
  formSubmissions,
  cardEvents,
  calendarEventLinks,
  gitLinks,
  cardAssignees,
  cardParticipants,
  cardWatchers,
  cardLabels,
  cardSprints,
  cardPhase,
  timeLogs,
  comments,
  attachments,
  checklists,
  checklistItems,
  labels,
  boardMembers,
  automations,
  intakeForms,
  phases,
  sprints,
  documents,
  workspaceMembers,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import {
  bumpOrgCache,
  bumpWorkspaceCache,
  bumpProjectCache,
  bumpBoardCache,
  bumpCardCache,
} from '../../lib/cache';

export interface TrashedItem {
  id: string;
  name: string;
  itemType: 'workspace' | 'project' | 'board' | 'card';
  deletedAt: string;
  daysRemaining: number;
  locationInfo?: string;
}

const RETENTION_DAYS = 30;

function calculateDaysRemaining(deletedAt: Date): number {
  const elapsedMs = Date.now() - new Date(deletedAt).getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, RETENTION_DAYS - elapsedDays);
}

// ─── List All Trashed Items ──────────────────────────────────────────────────
export async function listTrash(db: Database, organizationId: string): Promise<TrashedItem[]> {
  const trashedItems: TrashedItem[] = [];

  // 1. Trashed Workspaces
  const trashedWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      deletedAt: workspaces.deletedAt,
    })
    .from(workspaces)
    .where(and(eq(workspaces.organizationId, organizationId), isNotNull(workspaces.deletedAt)));

  trashedWorkspaces.forEach((ws) => {
    if (ws.deletedAt) {
      trashedItems.push({
        id: ws.id,
        name: ws.name,
        itemType: 'workspace',
        deletedAt: ws.deletedAt.toISOString(),
        daysRemaining: calculateDaysRemaining(ws.deletedAt),
        locationInfo: 'Organization Workspace',
      });
    }
  });

  // 2. Trashed Projects
  const trashedProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      deletedAt: projects.deletedAt,
      workspaceName: workspaces.name,
    })
    .from(projects)
    // leftJoin, not innerJoin: a trashed project must stay listed (and purgeable)
    // even if its workspace was hard-deleted. innerJoin silently hid it.
    .leftJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .where(and(eq(projects.organizationId, organizationId), isNotNull(projects.deletedAt)));

  trashedProjects.forEach((p) => {
    if (p.deletedAt) {
      trashedItems.push({
        id: p.id,
        name: p.name,
        itemType: 'project',
        deletedAt: p.deletedAt.toISOString(),
        daysRemaining: calculateDaysRemaining(p.deletedAt),
        locationInfo: `Workspace: ${p.workspaceName}`,
      });
    }
  });

  // 3. Trashed Boards
  const trashedBoards = await db
    .select({
      id: boards.id,
      name: boards.name,
      deletedAt: boards.deletedAt,
      projectName: projects.name,
    })
    .from(boards)
    // Same reasoning as projects: keep orphaned trashed boards visible.
    .leftJoin(projects, eq(projects.id, boards.projectId))
    .where(and(eq(boards.organizationId, organizationId), isNotNull(boards.deletedAt)));

  trashedBoards.forEach((b) => {
    if (b.deletedAt) {
      trashedItems.push({
        id: b.id,
        name: b.name,
        itemType: 'board',
        deletedAt: b.deletedAt.toISOString(),
        daysRemaining: calculateDaysRemaining(b.deletedAt),
        locationInfo: `Project: ${pProjectName(b.projectName ?? undefined)}`,
      });
    }
  });

  // 4. Trashed Cards
  const trashedCards = await db
    .select({
      id: cards.id,
      title: cards.title,
      deletedAt: cards.deletedAt,
      listName: lists.name,
      boardName: boards.name,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(
      and(
        eq(boards.organizationId, organizationId),
        isNotNull(cards.deletedAt),
        isNull(boards.deletedAt)
      )
    );

  trashedCards.forEach((c) => {
    if (c.deletedAt) {
      trashedItems.push({
        id: c.id,
        name: c.title,
        itemType: 'card',
        deletedAt: c.deletedAt.toISOString(),
        daysRemaining: calculateDaysRemaining(c.deletedAt),
        locationInfo: `Board: ${c.boardName} > ${c.listName}`,
      });
    }
  });

  // Sort descending by deletedAt
  return trashedItems.sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
  );
}

function pProjectName(name?: string) {
  return name || 'Unknown Project';
}

// ─── Restore a Trashed Item ──────────────────────────────────────────────────
export async function restoreItem(
  db: Database,
  organizationId: string,
  itemType: 'workspace' | 'project' | 'board' | 'card',
  itemId: string
) {
  if (itemType === 'workspace') {
    const [restored] = await db
      .update(workspaces)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(workspaces.id, itemId), eq(workspaces.organizationId, organizationId)))
      .returning();
    if (!restored) throw httpError(404, 'Workspace not found in trash');
    await bumpOrgCache(organizationId);
    await bumpWorkspaceCache(itemId);
    return restored;
  }

  if (itemType === 'project') {
    const [restored] = await db
      .update(projects)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(projects.id, itemId), eq(projects.organizationId, organizationId)))
      .returning();
    if (!restored) throw httpError(404, 'Project not found in trash');

    // Also ensure parent workspace is active — only if it belongs to this org and is deleted
    await db
      .update(workspaces)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(workspaces.id, restored.workspaceId),
          eq(workspaces.organizationId, organizationId),
          isNotNull(workspaces.deletedAt)
        )
      );

    await bumpOrgCache(organizationId);
    await bumpWorkspaceCache(restored.workspaceId);
    await bumpProjectCache(itemId);
    return restored;
  }

  if (itemType === 'board') {
    const [restored] = await db
      .update(boards)
      .set({ deletedAt: null, isArchived: false, updatedAt: new Date() })
      .where(and(eq(boards.id, itemId), eq(boards.organizationId, organizationId)))
      .returning();
    if (!restored) throw httpError(404, 'Board not found in trash');

    // Also restore parent project if deleted — only if it belongs to this org and is deleted
    await db
      .update(projects)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(projects.id, restored.projectId),
          eq(projects.organizationId, organizationId),
          isNotNull(projects.deletedAt)
        )
      );

    await bumpOrgCache(organizationId);
    await bumpProjectCache(restored.projectId);
    await bumpBoardCache(itemId);
    return restored;
  }

  if (itemType === 'card') {
    const [restored] = await db
      .update(cards)
      .set({ deletedAt: null, isArchived: false, updatedAt: new Date() })
      .where(and(eq(cards.id, itemId), eq(cards.organizationId, organizationId)))
      .returning();
    if (!restored) throw httpError(404, 'Card not found in trash');
    await bumpCardCache(itemId);
    await bumpOrgCache(organizationId);
    return restored;
  }

  throw httpError(400, 'Invalid item type');
}

// ─── Hard Delete a Single Trashed Item ─────────────────────────────────────────
export async function hardDeleteItem(
  db: Database,
  organizationId: string,
  itemType: 'workspace' | 'project' | 'board' | 'card',
  itemId: string
) {
  const purged = await hardDeleteItemCascade(db, organizationId, itemType, itemId);
  await bumpOrgCache(organizationId);
  return purged;
}

/**
 * Destructive part only — no cache invalidation — so `emptyTrash` can run it
 * inside a transaction and bump caches once, after commit.
 */
async function hardDeleteItemCascade(
  db: Database,
  organizationId: string,
  itemType: 'workspace' | 'project' | 'board' | 'card',
  itemId: string
) {
  if (itemType === 'card') {
    // P0: verify card belongs to this org (via list->board) before any destructive write.
    // Without this, a guessed UUID from another org would cascade-delete foreign rows.
    const [owned] = await db
      .select({ id: cards.id })
      .from(cards)
      .innerJoin(lists, eq(lists.id, cards.listId))
      .innerJoin(boards, eq(boards.id, lists.boardId))
      .where(and(eq(cards.id, itemId), eq(boards.organizationId, organizationId)))
      .limit(1);
    if (!owned) throw httpError(404, 'Card not found in trash');
    await deleteCardCascade(db, [itemId], organizationId);
    await bumpCardCache(itemId);
    return { success: true, id: itemId };
  }

  if (itemType === 'board') {
    await deleteBoardCascade(db, itemId, organizationId);
    await bumpBoardCache(itemId);
    return { success: true, id: itemId };
  }

  if (itemType === 'project') {
    await deleteProjectCascade(db, itemId, organizationId);
    await bumpProjectCache(itemId);
    return { success: true, id: itemId };
  }

  if (itemType === 'workspace') {
    await deleteWorkspaceCascade(db, itemId, organizationId);
    await bumpWorkspaceCache(itemId);
    return { success: true, id: itemId };
  }

  throw httpError(400, 'Invalid item type');
}

// ─── Empty Entire Organization Trash ──────────────────────────────────────────

/**
 * How many items one `emptyTrash` transaction purges before committing.
 *
 * A single transaction over the whole trash would hold locks for the length of
 * the purge; chunking keeps each transaction short. The tradeoff is that a
 * failure part-way leaves earlier chunks purged, so `purgedCount` reports what
 * was actually removed and a partial failure surfaces as an error rather than a
 * silent success.
 */
const EMPTY_TRASH_BATCH_SIZE = 50;

export async function emptyTrash(db: Database, organizationId: string) {
  const trashed = await listTrash(db, organizationId);
  let purgedCount = 0;

  // Deepest-first: purging a workspace/project/board also purges its children,
  // so walking the list in reverse means the child entries are already gone by
  // the time their parent is processed and we never 404 on an item we just
  // deleted as part of a parent's cascade.
  const ordered = [...trashed].sort((a, b) => depth(b.itemType) - depth(a.itemType));

  for (let i = 0; i < ordered.length; i += EMPTY_TRASH_BATCH_SIZE) {
    const batch = ordered.slice(i, i + EMPTY_TRASH_BATCH_SIZE);
    await db.transaction(async (tx) => {
      for (const item of batch) {
        await hardDeleteItemCascade(
          tx as unknown as Database,
          organizationId,
          item.itemType,
          item.id
        );
        purgedCount++;
      }
    });
  }

  // Caches are bumped once, after every chunk has committed.
  await bumpOrgCache(organizationId);
  return { success: true, purgedCount };
}

/** workspace > project > board > card, so a parent's cascade clears its children. */
function depth(itemType: TrashedItem['itemType']): number {
  switch (itemType) {
    case 'workspace':
      return 0;
    case 'project':
      return 1;
    case 'board':
      return 2;
    default:
      return 3;
  }
}

// ─── Cascade Helpers ──────────────────────────────────────────────────────────
// `organizationId` is mandatory and enforced inside: callers that derive ids
// from an already-scoped parent may pass it for defence in depth, and the
// card delete filter is re-checked against the board's org via the list join.
async function deleteCardCascade(db: Database, cardIds: string[], organizationId: string) {
  if (cardIds.length === 0) return;

  // Only touch cards proven to live in this organization.
  const ownedCardRows = await db
    .select({ id: cards.id })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(inArray(cards.id, cardIds), eq(boards.organizationId, organizationId)));
  const ownedCardIds = ownedCardRows.map((c) => c.id);
  if (ownedCardIds.length === 0) return;

  // card_id tables with NO ACTION referential action — these MUST be removed
  // explicitly or the final `delete(cards)` fails with a foreign-key violation.
  await db.delete(documentCards).where(inArray(documentCards.cardId, ownedCardIds));
  await db.delete(formSubmissions).where(inArray(formSubmissions.cardId, ownedCardIds));
  await db.delete(cardEvents).where(inArray(cardEvents.cardId, ownedCardIds));
  await db.delete(calendarEventLinks).where(inArray(calendarEventLinks.cardId, ownedCardIds));
  await db.delete(gitLinks).where(inArray(gitLinks.cardId, ownedCardIds));

  await db.delete(cardAssignees).where(inArray(cardAssignees.cardId, ownedCardIds));
  await db.delete(cardParticipants).where(inArray(cardParticipants.cardId, ownedCardIds));
  await db.delete(cardWatchers).where(inArray(cardWatchers.cardId, ownedCardIds));
  await db.delete(cardLabels).where(inArray(cardLabels.cardId, ownedCardIds));
  await db.delete(cardSprints).where(inArray(cardSprints.cardId, ownedCardIds));
  await db.delete(cardPhase).where(inArray(cardPhase.cardId, ownedCardIds));
  await db.delete(timeLogs).where(inArray(timeLogs.cardId, ownedCardIds));
  await db.delete(comments).where(inArray(comments.cardId, ownedCardIds));
  await db.delete(attachments).where(inArray(attachments.cardId, ownedCardIds));

  const checklistRows = await db
    .select({ id: checklists.id })
    .from(checklists)
    .where(inArray(checklists.cardId, ownedCardIds));
  const checklistIds = checklistRows.map((cl) => cl.id);
  if (checklistIds.length > 0) {
    await db.delete(checklistItems).where(inArray(checklistItems.checklistId, checklistIds));
    await db.delete(checklists).where(inArray(checklists.id, checklistIds));
  }

  await db.delete(cards).where(inArray(cards.id, ownedCardIds));
}

async function deleteBoardCascade(db: Database, boardId: string, organizationId: string) {
  // Scope the board by org up front; cascades below derive from this id only.
  const [ownedBoard] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.organizationId, organizationId)))
    .limit(1);
  if (!ownedBoard) throw httpError(404, 'Board not found in trash');

  const listRows = await db.select({ id: lists.id }).from(lists).where(eq(lists.boardId, boardId));
  const listIds = listRows.map((l) => l.id);

  if (listIds.length > 0) {
    const cardRows = await db
      .select({ id: cards.id })
      .from(cards)
      .where(inArray(cards.listId, listIds));
    const cardIds = cardRows.map((c) => c.id);
    if (cardIds.length > 0) {
      await deleteCardCascade(db, cardIds, organizationId);
    }
    await db.delete(lists).where(inArray(lists.id, listIds));
  }

  await db.delete(labels).where(eq(labels.boardId, boardId));
  await db.delete(boardMembers).where(eq(boardMembers.boardId, boardId));
  await db.delete(automations).where(eq(automations.boardId, boardId));
  await db.delete(intakeForms).where(eq(intakeForms.boardId, boardId));

  await db
    .delete(boards)
    .where(and(eq(boards.id, boardId), eq(boards.organizationId, organizationId)));
}

async function deleteProjectCascade(db: Database, projectId: string, organizationId: string) {
  const [ownedProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!ownedProject) throw httpError(404, 'Project not found in trash');

  const boardRows = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.projectId, projectId), eq(boards.organizationId, organizationId)));

  for (const b of boardRows) {
    await deleteBoardCascade(db, b.id, organizationId);
  }

  await db.delete(phases).where(eq(phases.projectId, projectId));
  await db.delete(sprints).where(eq(sprints.projectId, projectId));
  await db.delete(documents).where(eq(documents.projectId, projectId));

  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));
}

async function deleteWorkspaceCascade(db: Database, workspaceId: string, organizationId: string) {
  const [ownedWorkspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
    .limit(1);
  if (!ownedWorkspace) throw httpError(404, 'Workspace not found in trash');

  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.organizationId, organizationId)));

  for (const p of projectRows) {
    await deleteProjectCascade(db, p.id, organizationId);
  }

  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));

  await db
    .delete(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)));
}
