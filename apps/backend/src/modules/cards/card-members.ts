import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  cards,
  boards,
  users,
  cardAssignees,
  cardParticipants,
  cardWatchers,
  cardViews,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { eventBus } from '../../lib/event-bus';
import {
  isValidUuid,
  verifyCardAccess,
  requireOrgMember,
  getBoardIdForCard,
  logCardHistory,
  getUserDisplayName,
  bumpForCard,
} from './card-helpers';

// ─── Assignees (Single Assignee Model) ─────────────────────────────────────────
export async function assignUserToCard(
  db: Database,
  cardId: string,
  organizationId: string,
  userId: string,
  actorId: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    throw httpError(400, 'Invalid UUID provided for cardId or userId');
  }
  await verifyCardAccess(db, cardId, organizationId);
  await requireOrgMember(db, organizationId, userId);
  // Enforce single primary assignee: clear previous assignees first
  await db.delete(cardAssignees).where(eq(cardAssignees.cardId, cardId));
  await db
    .insert(cardAssignees)
    .values({
      cardId,
      userId,
      // Automation system actors are not users rows — coerce to NULL.
      assignedBy: isValidUuid(actorId) ? actorId : undefined,
    })
    .onConflictDoNothing();
  await logCardHistory(
    db,
    cardId,
    actorId,
    `👤 Assigned **${await getUserDisplayName(db, userId)}**`
  );
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.assigned', { cardId, assigneeId: userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.assigned',
        payload: { cardId, assigneeId: userId },
        actorId,
        organizationId: board.organizationId,
      });
    }
  }
  // bumpForCard (not bumpCardAndBoard) so a parent card's embedded
  // subtask list is invalidated too — assignees/participants/watchers are
  // part of the parent's cached getCard payload.
  await bumpForCard(db, cardId, boardId ?? null);
  return { success: true };
}

export async function removeUserFromCard(
  db: Database,
  cardId: string,
  organizationId: string,
  userId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    throw httpError(400, 'Invalid UUID provided for cardId or userId');
  }
  await verifyCardAccess(db, cardId, organizationId);
  const name = actorId ? await getUserDisplayName(db, userId) : null;
  await db
    .delete(cardAssignees)
    .where(and(eq(cardAssignees.cardId, cardId), eq(cardAssignees.userId, userId)));
  if (actorId) {
    await logCardHistory(db, cardId, actorId, `👤 Unassigned **${name}**`);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.unassigned', { cardId, userId });
  }
  // bumpForCard (not bumpCardAndBoard) so a parent card's embedded
  // subtask list is invalidated too — assignees/participants/watchers are
  // part of the parent's cached getCard payload.
  await bumpForCard(db, cardId, boardId ?? null);
  return { success: true };
}

// ─── Participants (Multiple Collaborators Model) ──────────────────────────────
export async function addParticipantToCard(
  db: Database,
  cardId: string,
  organizationId: string,
  userId: string,
  actorId: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    throw httpError(400, 'Invalid UUID provided for cardId or userId');
  }
  await verifyCardAccess(db, cardId, organizationId);
  await requireOrgMember(db, organizationId, userId);
  // Automation system actors are not users rows — coerce to NULL.
  const addedBy = isValidUuid(actorId) ? actorId : undefined;
  await db
    .insert(cardParticipants)
    .values({ cardId, userId, addedBy, addedAt: new Date() })
    .onConflictDoUpdate({
      target: [cardParticipants.cardId, cardParticipants.userId],
      set: { addedAt: new Date(), addedBy },
    });
  await logCardHistory(
    db,
    cardId,
    actorId,
    `🤝 Added **${await getUserDisplayName(db, userId)}** as a participant`
  );
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.participant_added', { cardId, userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board) {
      eventBus.emit('internal', {
        event: 'card.participant_added',
        payload: { cardId, participantId: userId },
        actorId,
        organizationId: board.organizationId,
      });
    }
  }
  // bumpForCard (not bumpCardAndBoard) so a parent card's embedded
  // subtask list is invalidated too — assignees/participants/watchers are
  // part of the parent's cached getCard payload.
  await bumpForCard(db, cardId, boardId ?? null);
  return { success: true };
}

export async function removeParticipantFromCard(
  db: Database,
  cardId: string,
  organizationId: string,
  userId: string,
  actorId?: string
) {
  if (!isValidUuid(cardId) || !isValidUuid(userId)) {
    throw httpError(400, 'Invalid UUID provided for cardId or userId');
  }
  await verifyCardAccess(db, cardId, organizationId);
  const name = actorId ? await getUserDisplayName(db, userId) : null;
  await db
    .delete(cardParticipants)
    .where(and(eq(cardParticipants.cardId, cardId), eq(cardParticipants.userId, userId)));
  if (actorId) {
    await logCardHistory(db, cardId, actorId, `🤝 Removed **${name}** from participants`);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.participant_removed', { cardId, userId });
  }
  // bumpForCard (not bumpCardAndBoard) so a parent card's embedded
  // subtask list is invalidated too — assignees/participants/watchers are
  // part of the parent's cached getCard payload.
  await bumpForCard(db, cardId, boardId ?? null);
  return { success: true };
}

export async function getCardParticipants(db: Database, cardId: string, organizationId: string) {
  if (!isValidUuid(cardId)) return [];
  await verifyCardAccess(db, cardId, organizationId);
  return await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      addedAt: cardParticipants.addedAt,
      createdAt: cardParticipants.addedAt,
    })
    .from(cardParticipants)
    .innerJoin(users, eq(users.id, cardParticipants.userId))
    .where(eq(cardParticipants.cardId, cardId));
}

// ─── Watchers ─────────────────────────────────────────────────────────────────
export async function watchCard(
  db: Database,
  cardId: string,
  userId: string,
  organizationId?: string,
  actorUserId?: string
) {
  if (organizationId) {
    await verifyCardAccess(db, cardId, organizationId);
  }
  await db
    .insert(cardWatchers)
    .values({ cardId, userId, subscribedAt: new Date() })
    .onConflictDoUpdate({
      target: [cardWatchers.cardId, cardWatchers.userId],
      set: { subscribedAt: new Date() },
    });
  if (actorUserId) {
    const body =
      actorUserId === userId
        ? '👀 Started watching this task'
        : `👀 Added **${await getUserDisplayName(db, userId)}** as an observer`;
    await logCardHistory(db, cardId, actorUserId, body);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.watched', { cardId, userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board?.organizationId) {
      eventBus.emit('internal', {
        event: 'card.watched',
        payload: { cardId, userId },
        actorId: userId,
        organizationId: board.organizationId,
      });
    }
  }
  // bumpForCard (not bumpCardAndBoard) so a parent card's embedded
  // subtask list is invalidated too — assignees/participants/watchers are
  // part of the parent's cached getCard payload.
  await bumpForCard(db, cardId, boardId ?? null);
  return { success: true, watched: true };
}

export async function unwatchCard(
  db: Database,
  cardId: string,
  userId: string,
  organizationId?: string,
  actorUserId?: string
) {
  if (organizationId) {
    await verifyCardAccess(db, cardId, organizationId);
  }
  await db
    .delete(cardWatchers)
    .where(and(eq(cardWatchers.cardId, cardId), eq(cardWatchers.userId, userId)));
  if (actorUserId) {
    const body =
      actorUserId === userId
        ? '👀 Stopped watching this task'
        : `👀 Removed **${await getUserDisplayName(db, userId)}** from observers`;
    await logCardHistory(db, cardId, actorUserId, body);
  }
  const boardId = await getBoardIdForCard(db, cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'card.unwatched', { cardId, userId });
    const [board] = await db
      .select({ organizationId: boards.organizationId })
      .from(boards)
      .where(eq(boards.id, boardId));
    if (board?.organizationId) {
      eventBus.emit('internal', {
        event: 'card.unwatched',
        payload: { cardId, userId },
        actorId: userId,
        organizationId: board.organizationId,
      });
    }
  }
  // bumpForCard (not bumpCardAndBoard) so a parent card's embedded
  // subtask list is invalidated too — assignees/participants/watchers are
  // part of the parent's cached getCard payload.
  await bumpForCard(db, cardId, boardId ?? null);
  return { success: true, watched: false };
}

export async function getCardWatchers(db: Database, cardId: string, organizationId: string) {
  await verifyCardAccess(db, cardId, organizationId);
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      subscribedAt: cardWatchers.subscribedAt,
      createdAt: cardWatchers.subscribedAt,
    })
    .from(cardWatchers)
    .innerJoin(users, eq(users.id, cardWatchers.userId))
    .where(eq(cardWatchers.cardId, cardId));
}

// ─── Card Views ──────────────────────────────────────────────────────────────
export async function recordCardView(db: Database, cardId: string, userId: string) {
  await db
    .insert(cardViews)
    .values({ cardId, userId, viewedAt: new Date() })
    .onConflictDoUpdate({
      target: [cardViews.cardId, cardViews.userId],
      set: { viewedAt: new Date() },
    })
    .catch(() => {});
}

export async function getCardViewers(db: Database, cardId: string, organizationId: string) {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!card) throw httpError(404, 'Card not found');

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      viewedAt: cardViews.viewedAt,
    })
    .from(cardViews)
    .innerJoin(users, eq(users.id, cardViews.userId))
    .where(eq(cardViews.cardId, cardId))
    .orderBy(desc(cardViews.viewedAt))
    .limit(50);
  return { count: rows.length, viewers: rows };
}
