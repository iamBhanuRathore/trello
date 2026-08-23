import { eq, and, isNotNull, isNull, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  workspaces,
  projects,
  boards,
  cards,
  lists,
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
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
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
    .innerJoin(projects, eq(projects.id, boards.projectId))
    .where(and(eq(boards.organizationId, organizationId), isNotNull(boards.deletedAt)));

  trashedBoards.forEach((b) => {
    if (b.deletedAt) {
      trashedItems.push({
        id: b.id,
        name: b.name,
        itemType: 'board',
        deletedAt: b.deletedAt.toISOString(),
        daysRemaining: calculateDaysRemaining(b.deletedAt),
        locationInfo: `Project: ${pProjectName(b.projectName)}`,
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
    .where(and(eq(boards.organizationId, organizationId), isNotNull(cards.deletedAt), isNull(boards.deletedAt)));

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
    return restored;
  }

  if (itemType === 'project') {
    const [restored] = await db
      .update(projects)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(projects.id, itemId), eq(projects.organizationId, organizationId)))
      .returning();
    if (!restored) throw httpError(404, 'Project not found in trash');

    // Also ensure parent workspace is active
    await db
      .update(workspaces)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(workspaces.id, restored.workspaceId));

    return restored;
  }

  if (itemType === 'board') {
    const [restored] = await db
      .update(boards)
      .set({ deletedAt: null, isArchived: false, updatedAt: new Date() })
      .where(and(eq(boards.id, itemId), eq(boards.organizationId, organizationId)))
      .returning();
    if (!restored) throw httpError(404, 'Board not found in trash');

    // Also restore parent project if deleted
    await db
      .update(projects)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, restored.projectId));

    return restored;
  }

  if (itemType === 'card') {
    const [restored] = await db
      .update(cards)
      .set({ deletedAt: null, isArchived: false, updatedAt: new Date() })
      .where(and(eq(cards.id, itemId), eq(cards.organizationId, organizationId)))
      .returning();
    if (!restored) throw httpError(404, 'Card not found in trash');
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
  if (itemType === 'card') {
    await deleteCardCascade(db, [itemId]);
    return { success: true, id: itemId };
  }

  if (itemType === 'board') {
    await deleteBoardCascade(db, itemId, organizationId);
    return { success: true, id: itemId };
  }

  if (itemType === 'project') {
    await deleteProjectCascade(db, itemId, organizationId);
    return { success: true, id: itemId };
  }

  if (itemType === 'workspace') {
    await deleteWorkspaceCascade(db, itemId, organizationId);
    return { success: true, id: itemId };
  }

  throw httpError(400, 'Invalid item type');
}

// ─── Empty Entire Organization Trash ──────────────────────────────────────────
export async function emptyTrash(db: Database, organizationId: string) {
  const trashed = await listTrash(db, organizationId);
  for (const item of trashed) {
    await hardDeleteItem(db, organizationId, item.itemType, item.id);
  }
  return { success: true, purgedCount: trashed.length };
}

// ─── Cascade Helpers ──────────────────────────────────────────────────────────
async function deleteCardCascade(db: Database, cardIds: string[]) {
  if (cardIds.length === 0) return;

  await db.delete(cardAssignees).where(inArray(cardAssignees.cardId, cardIds));
  await db.delete(cardParticipants).where(inArray(cardParticipants.cardId, cardIds));
  await db.delete(cardWatchers).where(inArray(cardWatchers.cardId, cardIds));
  await db.delete(cardLabels).where(inArray(cardLabels.cardId, cardIds));
  await db.delete(cardSprints).where(inArray(cardSprints.cardId, cardIds));
  await db.delete(cardPhase).where(inArray(cardPhase.cardId, cardIds));
  await db.delete(timeLogs).where(inArray(timeLogs.cardId, cardIds));
  await db.delete(comments).where(inArray(comments.cardId, cardIds));
  await db.delete(attachments).where(inArray(attachments.cardId, cardIds));

  const checklistRows = await db
    .select({ id: checklists.id })
    .from(checklists)
    .where(inArray(checklists.cardId, cardIds));
  const checklistIds = checklistRows.map((cl) => cl.id);
  if (checklistIds.length > 0) {
    await db.delete(checklistItems).where(inArray(checklistItems.checklistId, checklistIds));
    await db.delete(checklists).where(inArray(checklists.id, checklistIds));
  }

  await db.delete(cards).where(inArray(cards.id, cardIds));
}

async function deleteBoardCascade(db: Database, boardId: string, organizationId: string) {
  const listRows = await db.select({ id: lists.id }).from(lists).where(eq(lists.boardId, boardId));
  const listIds = listRows.map((l) => l.id);

  if (listIds.length > 0) {
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listIds));
    const cardIds = cardRows.map((c) => c.id);
    if (cardIds.length > 0) {
      await deleteCardCascade(db, cardIds);
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
