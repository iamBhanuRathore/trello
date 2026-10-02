import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  cards,
  lists,
  boards,
  comments,
  checklists,
  users,
  components,
  cardComponents,
  organizationMembers,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import {
  bumpCardAndBoard,
  bumpCardCache,
  cachedBoardIdForCard,
  cachedCardIdForChecklist,
  rememberChecklistCard,
} from '../../lib/cache';

export interface CreateCardInput {
  listId: string;
  title: string;
  description?: string;
  position?: number;
  parentCardId?: string;
  dueDate?: string;
  stageId?: string;
  priorityId?: string | null;
  storyPoints?: number;
  estimateMinutes?: number;
  assigneeId?: string;
  /** Board-scoped components to link at creation (resolved to defaults when set). */
  componentIds?: string[];
  /** Applied at creation so the full composer can set everything in one call. */
  labelIds?: string[];
  participantIds?: string[];
  watcherIds?: string[];
  checklist?: { title?: string; items?: string[] };
  actorId?: string;
  /** Project-automation provenance (bounce guard). Backward-compatible optional. */
  sourceRuleId?: string;
  sourceActionId?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id);
}

export async function verifyListAccess(db: Database, listId: string, organizationId: string) {
  const [list] = await db
    .select({ listId: lists.id, boardId: boards.id })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(lists.id, listId), eq(boards.organizationId, organizationId)))
    .limit(1);

  if (!list) throw httpError(404, 'List not found or access denied');
  return list;
}

/** Link creation-time components (board+org scoped) — returns the linked ids. */
export async function linkCreateComponents(
  db: Database,
  organizationId: string,
  cardId: string,
  boardId: string | null | undefined,
  input: CreateCardInput
): Promise<string[]> {
  const ids = (input.componentIds || []).filter((id) => isValidUuid(id));
  if (ids.length === 0 || !boardId) return [];
  const valid = await db
    .select({ id: components.id })
    .from(components)
    .where(
      and(
        inArray(components.id, ids),
        eq(components.boardId, boardId),
        eq(components.organizationId, organizationId)
      )
    );
  if (valid.length === 0) return [];
  await db
    .insert(cardComponents)
    .values(valid.map((c) => ({ cardId, componentId: c.id, addedBy: input.actorId })))
    .onConflictDoNothing()
    .catch(() => {});
  return valid.map((c) => c.id);
}

/** Tenant gate for every card sub-resource: single indexed PK lookup + org match. */
export async function verifyCardAccess(db: Database, cardId: string, organizationId: string) {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!card) throw httpError(404, 'Card not found or access denied');
  return card;
}

/** Assignees/participants/watchers must be members of the card's organization. */
export async function requireOrgMember(db: Database, organizationId: string, userId: string) {
  const [m] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
        isNull(organizationMembers.deletedAt)
      )
    )
    .limit(1);
  if (!m) throw httpError(403, 'User is not a member of this organization');
  return m;
}

export async function getBoardIdForCard(db: Database, cardId: string) {
  const [result] = await db
    .select({ boardId: lists.boardId })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .where(eq(cards.id, cardId))
    .limit(1);
  return result?.boardId;
}

/** Resolve the project owning a card (card → list → board → project). */
export async function getProjectIdForCard(
  db: Database,
  cardId: string,
  organizationId: string
): Promise<string | null> {
  const [row] = await db
    .select({ projectId: boards.projectId })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  return row?.projectId ?? null;
}

/** Bump card + board versions after a card mutation (cached cb map first, DB fallback). */
export async function bumpForCard(db: Database, cardId: string, knownBoardId?: string | null) {
  let boardId = knownBoardId ?? (await cachedBoardIdForCard(cardId));
  if (!boardId) boardId = (await getBoardIdForCard(db, cardId)) ?? null;
  await bumpCardAndBoard(cardId, boardId);
  // Subtasks are embedded in the parent's cached getCard payload — a subtask
  // mutation must also bump the parent. Single indexed PK lookup.
  const [row] = await db
    .select({ parentCardId: cards.parentCardId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  if (row?.parentCardId) await bumpCardCache(row.parentCardId);
}

/** Bump versions after a checklist-level mutation (resolves card via map, then DB). */
export async function bumpForChecklist(
  db: Database,
  checklistId: string,
  knownCardId?: string | null
) {
  let cardId = knownCardId ?? (await cachedCardIdForChecklist(checklistId));
  if (!cardId) {
    const [row] = await db
      .select({ cardId: checklists.cardId })
      .from(checklists)
      .where(eq(checklists.id, checklistId))
      .limit(1);
    cardId = row?.cardId ?? null;
    if (!cardId) return;
  }
  await rememberChecklistCard(checklistId, cardId);
  await bumpForCard(db, cardId);
}

// ─── Task history (persistent activity feed) ────────────────────────────────
export async function logCardHistory(db: Database, cardId: string, userId: string, body: string) {
  await db
    .insert(comments)
    .values({ cardId, userId, body })
    .catch(() => {});
}

export async function getUserDisplayName(db: Database, userId: string): Promise<string> {
  const [u] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.name || u?.email || 'Someone';
}
