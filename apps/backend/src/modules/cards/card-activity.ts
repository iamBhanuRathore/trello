import { eq, and, isNull, inArray, desc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  cards,
  comments,
  attachments,
  users,
  cardWatchers,
  notifications,
  organizationMembers,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import { clampLimit } from '../../lib/pagination';
import { eventBus } from '../../lib/event-bus';
import { verifyCardAccess, getBoardIdForCard, bumpForCard } from './card-helpers';

// ─── Comments ─────────────────────────────────────────────────────────────────
export async function listComments(
  db: Database,
  cardId: string,
  organizationId: string,
  options: { limit?: number | string } = {}
) {
  await verifyCardAccess(db, cardId, organizationId);
  return db
    .select({
      id: comments.id,
      cardId: comments.cardId,
      userId: comments.userId,
      body: comments.body,
      isEdited: comments.isEdited,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorEmail: users.email,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.cardId, cardId), isNull(comments.deletedAt)))
    .orderBy(desc(comments.createdAt))
    .limit(clampLimit(options.limit));
}

export async function createComment(
  db: Database,
  cardId: string,
  organizationId: string,
  userId: string,
  body: string,
  mentionedUserIds?: string[]
) {
  await verifyCardAccess(db, cardId, organizationId);
  const [comment] = await db.insert(comments).values({ cardId, userId, body }).returning();

  // Find board (org comes from the verified tenant scope, not the card graph)
  const boardId = await getBoardIdForCard(db, cardId);
  const orgId = organizationId;

  // Handle mentioned users
  const targetMentionIds = new Set<string>(mentionedUserIds || []);

  // Also auto-extract mentions from markdown tags: @[Name](uuid) or @uuid
  // Single pass with matchAll — the body used to be matched once to count and
  // then re-matched per hit with the same regex.
  const mentionTagIds: string[] = [];
  for (const match of body.matchAll(/@\[([^\]]+)\]\(([a-f0-9-]+)\)/g)) {
    if (match[2]) mentionTagIds.push(match[2]);
  }
  for (const id of mentionTagIds) targetMentionIds.add(id);

  // Auto-add mentioned users as observers / watchers if not already watching.
  // Only organization members can be pulled in — guessed cross-org UUIDs are ignored.
  // Enrichment (actor/task names) is hoisted once — shared by every mention below.
  const { enrichNotificationPayload } = await import('../notifications/service');
  const mentionEnriched = await enrichNotificationPayload(db, { actorId: userId, cardId });

  // One membership probe for every candidate, then two bulk inserts. This used
  // to be 3 serial queries PER mention (membership check, watcher insert,
  // notification insert) — 5 mentions cost 15 round trips on the comment path.
  const candidateIds = Array.from(targetMentionIds).filter((id) => !!id && id !== userId);
  if (candidateIds.length > 0) {
    const memberRows = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          inArray(organizationMembers.userId, candidateIds),
          isNull(organizationMembers.deletedAt)
        )
      );
    const eligible = memberRows.map((m) => m.userId);

    if (eligible.length > 0) {
      await db
        .insert(cardWatchers)
        .values(eligible.map((userId) => ({ cardId, userId })))
        .onConflictDoNothing();

      if (boardId) {
        for (const mentionedId of eligible) {
          eventBus.broadcast(`board:${boardId}`, 'card.watched', { cardId, userId: mentionedId });
        }
      }

      if (orgId) {
        await db
          .insert(notifications)
          .values(
            eligible.map((mentionedId) => ({
              userId: mentionedId,
              organizationId: orgId,
              eventType: 'card.mentioned',
              payload: {
                cardId,
                commentId: comment?.id,
                actorId: userId,
                commentSnippet: body.slice(0, 150),
                ...mentionEnriched,
              },
            }))
          )
          .catch(() => {});
        for (const mentionedId of eligible) {
          void (async () => {
            try {
              const { emailChannelAllowed, sendThreadedCardEmail } =
                await import('../inbound/threading');
              if (await emailChannelAllowed(db, orgId, mentionedId, 'card.mentioned')) {
                await sendThreadedCardEmail(db, {
                  organizationId: orgId,
                  cardId,
                  recipientUserId: mentionedId,
                  actorId: userId,
                  commentText: body,
                  event: 'card.mentioned',
                });
              }
            } catch {
              // Never let mail break the comment write.
            }
          })();
        }
      }
    }
  }

  // Notify others via internal event bus
  if (boardId && orgId) {
    eventBus.emit('internal', {
      event: 'card.commented',
      payload: {
        cardId,
        commentText: body,
        mentionedUserIds: Array.from(targetMentionIds),
      },
      actorId: userId,
      organizationId: orgId,
    });
  }

  await bumpForCard(db, cardId);
  return comment;
}

export async function updateComment(
  db: Database,
  commentId: string,
  userId: string,
  organizationId: string,
  body: string,
  isPlatformAdmin: boolean = false
) {
  const [comment] = await db
    .select({
      id: comments.id,
      cardId: comments.cardId,
      userId: comments.userId,
      organizationId: cards.organizationId,
    })
    .from(comments)
    .innerJoin(cards, eq(cards.id, comments.cardId))
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
    .limit(1);

  if (!comment) {
    throw httpError(404, 'Comment not found');
  }

  if (comment.organizationId !== organizationId && !isPlatformAdmin) {
    throw httpError(403, 'Forbidden');
  }

  let canEdit = comment.userId === userId || isPlatformAdmin;

  if (!canEdit) {
    const [membership] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);

    if (
      membership &&
      ['org_owner', 'org_admin', 'workspace_admin', 'admin'].includes(membership.role)
    ) {
      canEdit = true;
    }
  }

  if (!canEdit) {
    throw httpError(403, 'You do not have permission to edit this comment');
  }

  const [updated] = await db
    .update(comments)
    .set({
      body,
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId))
    .returning();

  const boardId = await getBoardIdForCard(db, comment.cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'comment.updated', {
      cardId: comment.cardId,
      commentId,
      body,
    });
  }

  // Comments on a subtask appear in the parent's cached payload.
  await bumpForCard(db, comment.cardId, boardId ?? null);
  return updated;
}

export async function deleteComment(
  db: Database,
  commentId: string,
  userId: string,
  organizationId: string,
  isPlatformAdmin: boolean = false
) {
  const [comment] = await db
    .select({
      id: comments.id,
      cardId: comments.cardId,
      userId: comments.userId,
      organizationId: cards.organizationId,
    })
    .from(comments)
    .innerJoin(cards, eq(cards.id, comments.cardId))
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
    .limit(1);

  if (!comment) {
    throw httpError(404, 'Comment not found');
  }

  if (comment.organizationId !== organizationId && !isPlatformAdmin) {
    throw httpError(403, 'Forbidden');
  }

  let canDelete = comment.userId === userId || isPlatformAdmin;

  if (!canDelete) {
    const [membership] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);

    if (
      membership &&
      ['org_owner', 'org_admin', 'workspace_admin', 'admin'].includes(membership.role)
    ) {
      canDelete = true;
    }
  }

  if (!canDelete) {
    throw httpError(403, 'You do not have permission to delete this comment');
  }

  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));

  const boardId = await getBoardIdForCard(db, comment.cardId);
  if (boardId) {
    eventBus.broadcast(`board:${boardId}`, 'comment.deleted', {
      cardId: comment.cardId,
      commentId,
    });
  }

  // Comments on a subtask appear in the parent's cached payload.
  await bumpForCard(db, comment.cardId, boardId ?? null);
  return { success: true, id: commentId };
}

// ─── Attachments ──────────────────────────────────────────────────────────────
export async function listAttachments(
  db: Database,
  cardId: string,
  organizationId: string,
  options: { limit?: number | string } = {}
) {
  await verifyCardAccess(db, cardId, organizationId);
  return db
    .select()
    .from(attachments)
    .where(and(eq(attachments.cardId, cardId), isNull(attachments.deletedAt)))
    .orderBy(desc(attachments.createdAt))
    .limit(clampLimit(options.limit));
}

export async function createAttachmentRecord(
  db: Database,
  cardId: string,
  organizationId: string,
  userId: string,
  url: string,
  fileName: string,
  fileType?: string,
  sizeBytes?: number
) {
  await verifyCardAccess(db, cardId, organizationId);
  const [attachment] = await db
    .insert(attachments)
    .values({ cardId, uploadedBy: userId, url, fileName, fileType, sizeBytes })
    .returning();
  await bumpForCard(db, cardId);
  return attachment;
}

export async function deleteAttachment(
  db: Database,
  attachmentId: string,
  organizationId: string,
  userId: string
) {
  const [attachment] = await db
    .update(attachments)
    .set({ deletedAt: new Date() })
    .where(and(eq(attachments.id, attachmentId), eq(attachments.uploadedBy, userId)))
    .returning();
  if (!attachment) throw httpError(404, 'Attachment not found or not authorized to delete');
  // Tenant check on the owning card (uploader match alone is not enough).
  await verifyCardAccess(db, attachment.cardId, organizationId);
  await bumpForCard(db, attachment.cardId);
  return attachment;
}
