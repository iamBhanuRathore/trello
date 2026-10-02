import { eq, and, desc, asc, sql, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  chatAttachments,
  chatReactions,
  users,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { clampLimit } from '../../lib/pagination';
import { httpError, requireChannelMembership } from './chat-common';

export async function sendMessage(
  db: Database,
  channelId: string,
  organizationId: string,
  userId: string,
  input: {
    body: string;
    parentMessageId?: string;
    replyToMessageId?: string;
    isAnnouncement?: boolean;
    attachmentIds?: string[];
  }
) {
  if (!input.body || input.body.trim().length === 0) {
    throw httpError(400, 'Message body cannot be empty');
  }

  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');
  if (channel.organizationId !== organizationId) throw httpError(404, 'Channel not found');

  // Verify membership
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);

  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');

  // Announcement check
  if (channel.isAnnouncementOnly && membership.role === 'member') {
    throw httpError(403, 'Only channel admins can post in this announcement channel');
  }

  const [message] = await db
    .insert(chatMessages)
    .values({
      channelId,
      userId,
      body: input.body.trim(),
      parentMessageId: input.parentMessageId || null,
      replyToMessageId: input.replyToMessageId || null,
      isAnnouncement: !!input.isAnnouncement,
    })
    .returning();

  if (!message) throw httpError(500, 'Failed to create message');

  // Link attachments if provided (scoped to this channel to prevent cross-channel hijack)
  if (input.attachmentIds && input.attachmentIds.length > 0) {
    await db
      .update(chatAttachments)
      .set({ messageId: message.id })
      .where(
        and(
          inArray(chatAttachments.id, input.attachmentIds),
          eq(chatAttachments.channelId, channelId)
        )
      );
  }

  // Update channel preview and timestamp if top-level
  if (!input.parentMessageId) {
    const preview = input.body.trim().slice(0, 120);
    await db
      .update(chatChannels)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: preview,
      })
      .where(eq(chatChannels.id, channelId));
  }

  // Update sender's read pointer
  await db
    .update(chatChannelMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)));

  // Fetch author details
  const [author] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Fetch quoted reply message if replyToMessageId is present
  let replyTo: { id: string; body: string; authorName: string } | null = null;
  if (input.replyToMessageId) {
    const [repliedMsg] = await db
      .select({
        id: chatMessages.id,
        body: chatMessages.body,
        authorName: users.name,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.userId, users.id))
      .where(eq(chatMessages.id, input.replyToMessageId))
      .limit(1);
    if (repliedMsg) {
      replyTo = repliedMsg;
    }
  }

  const fullMessage = {
    ...message,
    author,
    replyTo,
    attachments: [],
    reactions: [],
    replyCount: 0,
  };

  // Broadcast to channel topic
  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:message_created', fullMessage);

  // Notify channel members' inboxes for unread badge updates
  const members = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        sql`${chatChannelMembers.userId} != ${userId}`
      )
    );

  for (const m of members) {
    await eventBus.broadcast(`user:inbox:${m.userId}`, 'chat:unread_bump', {
      channelId,
      messageId: message.id,
      senderName: author?.name || 'Someone',
      preview: input.body.trim().slice(0, 80),
    });
  }

  // @[Name](userId) mentions → notify mentioned members only (never the author).
  try {
    const memberIds = new Set(members.map((m) => m.userId));
    const mentionedUserIds = [
      ...new Set(
        [...input.body.matchAll(/@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g)].map((m) => m[2] as string)
      ),
    ].filter((id) => id !== userId && memberIds.has(id));
    if (mentionedUserIds.length > 0) {
      eventBus.emit('internal', {
        event: 'chat.mentioned',
        payload: {
          channelId,
          messageId: message.id,
          mentionedUserIds,
          messagePreview: input.body.trim().slice(0, 140),
        },
        actorId: userId,
        organizationId: channel.organizationId as string,
      });
    }
  } catch {}

  return fullMessage;
}

export async function editMessage(
  db: Database,
  messageId: string,
  organizationId: string,
  userId: string,
  newBody: string
) {
  if (!newBody || newBody.trim().length === 0) {
    throw httpError(400, 'Message body cannot be empty');
  }

  const [message] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);

  if (!message) throw httpError(404, 'Message not found');
  if (message.userId !== userId) {
    throw httpError(403, 'Permission denied: only author can edit message');
  }
  // Removed members cannot keep editing history — membership is re-checked.
  await requireChannelMembership(db, message.channelId, organizationId, userId);

  const [updated] = await db
    .update(chatMessages)
    .set({
      body: newBody.trim(),
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(chatMessages.id, messageId))
    .returning();

  await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:message_updated', updated);

  return updated;
}

export async function deleteMessage(
  db: Database,
  messageId: string,
  organizationId: string,
  actorId: string
) {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);

  if (!message) throw httpError(404, 'Message not found');

  // Tenant check before any permission branch (author path previously skipped it).
  const [channel] = await db
    .select({ organizationId: chatChannels.organizationId })
    .from(chatChannels)
    .where(eq(chatChannels.id, message.channelId))
    .limit(1);
  if (!channel || channel.organizationId !== organizationId)
    throw httpError(404, 'Message not found');

  // Check permissions: author OR channel owner/admin
  const isAuthor = message.userId === actorId;

  if (!isAuthor) {
    const [membership] = await db
      .select()
      .from(chatChannelMembers)
      .where(
        and(
          eq(chatChannelMembers.channelId, message.channelId),
          eq(chatChannelMembers.userId, actorId)
        )
      )
      .limit(1);

    const isGroupAdmin = membership?.role === 'owner' || membership?.role === 'admin';
    if (!isGroupAdmin) {
      throw httpError(
        403,
        'Permission denied: only message author or channel admins can delete messages'
      );
    }
  }

  // Soft-delete for enterprise audit trace
  await db
    .update(chatMessages)
    .set({
      deletedAt: new Date(),
      deletedBy: actorId,
    })
    .where(eq(chatMessages.id, messageId));

  await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:message_deleted', {
    id: messageId,
    channelId: message.channelId,
    deletedBy: actorId,
  });

  return { success: true };
}

export async function listMessages(
  db: Database,
  channelId: string,
  organizationId: string,
  userId: string,
  cursor?: string,
  limit = 50
) {
  // Verify user has channel access (org check inside)
  await requireChannelMembership(db, channelId, organizationId, userId);

  const conditions = [
    eq(chatMessages.channelId, channelId),
    isNull(chatMessages.parentMessageId), // Top-level stream messages
    isNull(chatMessages.deletedAt),
  ];

  if (cursor) {
    const cursorIso = new Date(cursor).toISOString();
    conditions.push(sql`${chatMessages.createdAt} < ${cursorIso}::timestamp`);
  }

  const rawMessages = await db
    .select({
      message: chatMessages,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      },
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  // Reverse so client receives chronological order
  const messagesChronological = rawMessages.reverse();
  if (messagesChronological.length === 0) return [];

  // Batched enrichment: 4 set-based queries serve the whole page.
  const messageIds = messagesChronological.map((m) => m.message.id);
  const quotedIds = [
    ...new Set(
      messagesChronological
        .map((m) => m.message.replyToMessageId)
        .filter((id): id is string => !!id)
    ),
  ];

  const [attachmentRows, reactionRows, replyCountRows, quotedRows] = await Promise.all([
    db.select().from(chatAttachments).where(inArray(chatAttachments.messageId, messageIds)),
    db
      .select({
        messageId: chatReactions.messageId,
        emoji: chatReactions.emoji,
        userId: chatReactions.userId,
      })
      .from(chatReactions)
      .where(inArray(chatReactions.messageId, messageIds)),
    db
      .select({
        parentMessageId: chatMessages.parentMessageId,
        count: sql<number>`count(*)::int`,
      })
      .from(chatMessages)
      .where(and(inArray(chatMessages.parentMessageId, messageIds), isNull(chatMessages.deletedAt)))
      .groupBy(chatMessages.parentMessageId),
    quotedIds.length > 0
      ? db
          .select({
            id: chatMessages.id,
            body: chatMessages.body,
            authorName: users.name,
          })
          .from(chatMessages)
          .innerJoin(users, eq(chatMessages.userId, users.id))
          .where(inArray(chatMessages.id, quotedIds))
      : Promise.resolve([] as Array<{ id: string; body: string; authorName: string }>),
  ]);

  const attachmentsByMessage = new Map<string, (typeof attachmentRows)[number][]>();
  for (const row of attachmentRows) {
    if (!row.messageId) continue;
    const arr = attachmentsByMessage.get(row.messageId) ?? [];
    arr.push(row);
    attachmentsByMessage.set(row.messageId, arr);
  }
  const reactionsByMessage = new Map<string, Map<string, string[]>>();
  for (const row of reactionRows) {
    const byEmoji = reactionsByMessage.get(row.messageId) ?? new Map<string, string[]>();
    const users = byEmoji.get(row.emoji) ?? [];
    users.push(row.userId);
    byEmoji.set(row.emoji, users);
    reactionsByMessage.set(row.messageId, byEmoji);
  }
  const replyCounts = new Map(replyCountRows.map((r) => [r.parentMessageId, Number(r.count)]));
  const quotedById = new Map(quotedRows.map((q) => [q.id, q]));

  return messagesChronological.map(({ message, author }) => {
    const byEmoji = reactionsByMessage.get(message.id);
    const reactions = byEmoji
      ? [...byEmoji.entries()].map(([emoji, userIds]) => ({
          emoji,
          count: userIds.length,
          userIds,
          hasReacted: userIds.includes(userId),
        }))
      : [];
    return {
      ...message,
      author,
      replyTo: message.replyToMessageId ? (quotedById.get(message.replyToMessageId) ?? null) : null,
      attachments: attachmentsByMessage.get(message.id) ?? [],
      reactions,
      replyCount: replyCounts.get(message.id) ?? 0,
    };
  });
}

export async function listThreadReplies(
  db: Database,
  parentMessageId: string,
  organizationId: string,
  userId: string,
  options: { limit?: number | string } = {}
) {
  const [parent] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, parentMessageId))
    .limit(1);

  if (!parent) throw httpError(404, 'Parent message not found');

  // Verify membership (org check inside)
  await requireChannelMembership(db, parent.channelId, organizationId, userId);

  const replies = await db
    .select({
      message: chatMessages,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      },
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(and(eq(chatMessages.parentMessageId, parentMessageId), isNull(chatMessages.deletedAt)))
    .orderBy(asc(chatMessages.createdAt))
    .limit(clampLimit(options.limit));

  // Batched quoted-reply lookup
  const quotedIds = [
    ...new Set(replies.map((r) => r.message.replyToMessageId).filter((id): id is string => !!id)),
  ];
  const quotedRows = quotedIds.length
    ? await db
        .select({
          id: chatMessages.id,
          body: chatMessages.body,
          authorName: users.name,
        })
        .from(chatMessages)
        .innerJoin(users, eq(chatMessages.userId, users.id))
        .where(inArray(chatMessages.id, quotedIds))
    : [];
  const quotedById = new Map(quotedRows.map((q) => [q.id, q]));

  return replies.map(({ message, author }) => ({
    ...message,
    author,
    replyTo: message.replyToMessageId ? (quotedById.get(message.replyToMessageId) ?? null) : null,
  }));
}

/**
 * Posts a system (activity-feed) message. Rendered as a centered pill,
 * not a regular chat bubble. Bypasses announcement-only restriction so
 * automation feedback always lands.
 */
export async function postSystemMessage(
  db: Database,
  channelId: string,
  actorId: string,
  body: string
) {
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');

  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId)))
    .limit(1);
  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');

  const [message] = await db
    .insert(chatMessages)
    .values({ channelId, userId: actorId, body: body.trim(), isSystem: true })
    .returning();
  if (!message) throw httpError(500, 'Failed to post activity message');

  const [author] = await db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);

  const fullMessage = {
    ...message,
    author,
    replyTo: null,
    attachments: [],
    reactions: [],
    replyCount: 0,
  };

  await db
    .update(chatChannels)
    .set({ lastMessageAt: new Date(), lastMessagePreview: body.trim().slice(0, 120) })
    .where(eq(chatChannels.id, channelId));

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:message_created', fullMessage);

  const members = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        sql`${chatChannelMembers.userId} != ${actorId}`
      )
    );
  for (const m of members) {
    await eventBus.broadcast(`user:inbox:${m.userId}`, 'chat:unread_bump', {
      channelId,
      messageId: message.id,
      senderName: 'Activity',
      preview: body.trim().slice(0, 80),
    });
  }

  return fullMessage;
}

/**
 * Fan-out helper for project domain events (card created/moved/completed).
 * Never throws — activity feed must not break the underlying mutation.
 */
export async function notifyProjectChannels(
  db: Database,
  organizationId: string,
  projectId: string,
  actorId: string,
  text: string
): Promise<void> {
  try {
    const linked = await db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(
        and(
          eq(chatChannels.organizationId, organizationId),
          eq(chatChannels.projectId, projectId),
          eq(chatChannels.isArchived, false)
        )
      );
    for (const ch of linked) {
      await postSystemMessage(db, ch.id, actorId, text).catch(() => {});
    }
  } catch {
    // Activity feed is best-effort by design.
  }
}

/**
 * Seen-by detail (Telegram "2 Seen"): members whose lastReadAt >= message.createdAt.
 * Excludes the author. Returns readers + total eligible so UI can render "N Seen".
 */
export async function getMessageSeenBy(
  db: Database,
  messageId: string,
  organizationId: string,
  requesterId: string
) {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);
  if (!message) throw httpError(404, 'Message not found');
  await requireChannelMembership(db, message.channelId, organizationId, requesterId);

  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      lastReadAt: chatChannelMembers.lastReadAt,
    })
    .from(chatChannelMembers)
    .innerJoin(users, eq(chatChannelMembers.userId, users.id))
    .where(eq(chatChannelMembers.channelId, message.channelId));

  const msgTime = new Date(message.createdAt).getTime();
  const readers = members
    .filter((m) => m.userId !== message.userId)
    .filter((m) => m.lastReadAt && new Date(m.lastReadAt).getTime() >= msgTime)
    .map(({ lastReadAt, ...rest }) => rest);

  return { count: readers.length, readers, messageId, channelId: message.channelId };
}
