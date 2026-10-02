import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  cards,
  cardAssignees,
  cardParticipants,
  cardWatchers,
  cardAccessRequests,
  organizationMembers,
  users,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import { CardAccessStatus } from '@boardly/shared-types';

export interface CardAccessRow {
  id: string;
  organizationId: string;
  isPrivate: boolean | null;
  createdBy: string | null;
}

function privateTaskError(): Error & { status: number; details: unknown } {
  return Object.assign(
    httpError(
      403,
      'This task is private. You are not a participant — request access from the assignee to view it.'
    ),
    { details: { code: 'PRIVATE_TASK' } }
  );
}

async function isOrgManager(
  db: Database,
  organizationId: string,
  userId: string,
  isPlatformAdmin?: boolean
): Promise<boolean> {
  if (isPlatformAdmin) return true;
  const [m] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      )
    )
    .limit(1);
  return m?.role === 'org_owner' || m?.role === 'org_admin';
}

async function isInvolved(db: Database, cardId: string, userId: string): Promise<boolean> {
  const [a, p, w] = await Promise.all([
    db
      .select({ cardId: cardAssignees.cardId })
      .from(cardAssignees)
      .where(and(eq(cardAssignees.cardId, cardId), eq(cardAssignees.userId, userId)))
      .limit(1),
    db
      .select({ cardId: cardParticipants.cardId })
      .from(cardParticipants)
      .where(and(eq(cardParticipants.cardId, cardId), eq(cardParticipants.userId, userId)))
      .limit(1),
    db
      .select({ cardId: cardWatchers.cardId })
      .from(cardWatchers)
      .where(and(eq(cardWatchers.cardId, cardId), eq(cardWatchers.userId, userId)))
      .limit(1),
  ]);
  return a.length > 0 || p.length > 0 || w.length > 0;
}

/** Open tasks behave exactly as today — only private tasks gate. */
export async function canAccessCard(
  db: Database,
  card: CardAccessRow,
  userId: string,
  isPlatformAdmin?: boolean
): Promise<boolean> {
  if (!card.isPrivate) return true;
  if (isPlatformAdmin) return true;
  if (card.createdBy && card.createdBy === userId) return true;
  if (await isOrgManager(db, card.organizationId, userId, false)) return true;
  return await isInvolved(db, card.id, userId);
}

export async function requireCardAccess(
  db: Database,
  card: CardAccessRow,
  userId: string,
  isPlatformAdmin?: boolean
): Promise<void> {
  if (!(await canAccessCard(db, card, userId, isPlatformAdmin))) throw privateTaskError();
}

async function loadCardRow(db: Database, cardId: string, organizationId: string) {
  const [card] = await db
    .select({
      id: cards.id,
      organizationId: cards.organizationId,
      isPrivate: cards.isPrivate,
      createdBy: cards.createdBy,
      key: cards.key,
      title: cards.title,
    })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!card) throw httpError(404, 'Card not found');
  return card;
}

/** Outsider asks to join a private task — notifies assignees + creator. */
export async function requestCardAccess(
  db: Database,
  cardId: string,
  organizationId: string,
  userId: string
) {
  const card = await loadCardRow(db, cardId, organizationId);
  if (!card.isPrivate) throw httpError(400, 'This task is already open to the organization');
  if (await canAccessCard(db, card, userId, false))
    throw httpError(400, 'You already have access to this task');

  const [existing] = await db
    .select()
    .from(cardAccessRequests)
    .where(and(eq(cardAccessRequests.cardId, cardId), eq(cardAccessRequests.userId, userId)))
    .limit(1);
  if (existing?.status === CardAccessStatus.Pending) return existing;
  const [row] = existing
    ? await db
        .update(cardAccessRequests)
        .set({ status: CardAccessStatus.Pending })
        .where(eq(cardAccessRequests.id, existing.id))
        .returning()
    : await db.insert(cardAccessRequests).values({ cardId, userId }).returning();

  const [requester] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  eventBus.emit('internal', {
    event: 'card.access_requested',
    payload: {
      cardId,
      cardKey: card.key,
      cardTitle: card.title,
      requesterId: userId,
      requesterName: requester?.name || 'A teammate',
    },
    actorId: userId,
    organizationId,
  });
  return row;
}

/** Involved members (or managers) see pending requests on private tasks. */
export async function listAccessRequests(
  db: Database,
  cardId: string,
  organizationId: string,
  actorId: string,
  isPlatformAdmin?: boolean
) {
  const card = await loadCardRow(db, cardId, organizationId);
  await requireCardAccess(db, card, actorId, isPlatformAdmin);
  const rows = await db
    .select({
      id: cardAccessRequests.id,
      userId: cardAccessRequests.userId,
      status: cardAccessRequests.status,
      createdAt: cardAccessRequests.createdAt,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(cardAccessRequests)
    .innerJoin(users, eq(users.id, cardAccessRequests.userId))
    .where(eq(cardAccessRequests.cardId, cardId))
    .orderBy(cardAccessRequests.createdAt);
  return rows;
}

/** Approve (adds as watcher) or dismiss a pending request. */
export async function resolveAccessRequest(
  db: Database,
  cardId: string,
  requestId: string,
  organizationId: string,
  actorId: string,
  decision: 'approved' | 'dismissed',
  isPlatformAdmin?: boolean
) {
  const card = await loadCardRow(db, cardId, organizationId);
  await requireCardAccess(db, card, actorId, isPlatformAdmin);
  const [req] = await db
    .select()
    .from(cardAccessRequests)
    .where(and(eq(cardAccessRequests.id, requestId), eq(cardAccessRequests.cardId, cardId)))
    .limit(1);
  if (!req) throw httpError(404, 'Access request not found');

  if (decision === 'approved') {
    await db.insert(cardWatchers).values({ cardId, userId: req.userId }).onConflictDoNothing();
  }
  const [row] = await db
    .update(cardAccessRequests)
    .set({ status: decision })
    .where(eq(cardAccessRequests.id, requestId))
    .returning();
  return row;
}
