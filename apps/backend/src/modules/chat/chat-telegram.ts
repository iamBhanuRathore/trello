import { eq, and, desc, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { chatChannels, chatMessages, chatAttachments, users } from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { clampLimit } from '../../lib/pagination';
import { httpError, requireChannelMembership } from './chat-common';

export async function pinMessage(
  db: Database,
  messageId: string,
  organizationId: string,
  actorId: string,
  pinned: boolean
) {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!message) throw httpError(404, 'Message not found');
  if (message.parentMessageId) throw httpError(400, 'Thread replies cannot be pinned');
  if (message.isSystem) throw httpError(400, 'System messages cannot be pinned');

  const membership = await requireChannelMembership(db, message.channelId, organizationId, actorId);
  // DMs + groups: any member can pin (Telegram behavior). Announcement-only
  // channels stay admin-gated.
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, message.channelId))
    .limit(1);
  if (channel?.isAnnouncementOnly && membership.role === 'member') {
    throw httpError(403, 'Only channel admins can pin in this channel');
  }

  const [updated] = await db
    .update(chatMessages)
    .set({
      isPinned: pinned,
      pinnedAt: pinned ? new Date() : null,
      pinnedBy: pinned ? actorId : null,
    })
    .where(eq(chatMessages.id, messageId))
    .returning();

  await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:message_pinned', {
    messageId,
    channelId: message.channelId,
    isPinned: pinned,
    pinnedBy: actorId,
  });

  return updated;
}

export async function listPinnedMessages(
  db: Database,
  channelId: string,
  organizationId: string,
  userId: string,
  options: { limit?: number | string } = {}
) {
  await requireChannelMembership(db, channelId, organizationId, userId);
  const rows = await db
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
    .where(
      and(
        eq(chatMessages.channelId, channelId),
        eq(chatMessages.isPinned, true),
        isNull(chatMessages.deletedAt)
      )
    )
    .orderBy(desc(chatMessages.pinnedAt))
    .limit(clampLimit(options.limit, { def: 100 }));
  return rows.map(({ message, author }) => ({ ...message, author }));
}

export async function forwardMessage(
  db: Database,
  sourceMessageId: string,
  targetChannelId: string,
  organizationId: string,
  actorId: string
) {
  const [source] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, sourceMessageId), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!source) throw httpError(404, 'Source message not found');
  if (source.isSystem) throw httpError(400, 'System messages cannot be forwarded');

  await requireChannelMembership(db, source.channelId, organizationId, actorId);

  const [target] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, targetChannelId))
    .limit(1);
  if (!target) throw httpError(404, 'Target channel not found');
  if (target.organizationId !== organizationId) throw httpError(404, 'Target channel not found');
  const targetMembership = await requireChannelMembership(
    db,
    targetChannelId,
    organizationId,
    actorId
  );
  if (target.isAnnouncementOnly && targetMembership.role === 'member') {
    throw httpError(403, 'Only channel admins can post in this announcement channel');
  }

  const [copy] = await db
    .insert(chatMessages)
    .values({
      channelId: targetChannelId,
      userId: actorId,
      body: source.body,
      forwardedFromId: source.id,
    })
    .returning();
  if (!copy) throw httpError(500, 'Failed to forward message');

  // Clone attachments (new rows pointing at the copy, same file URLs)
  const sourceAttachments = await db
    .select()
    .from(chatAttachments)
    .where(eq(chatAttachments.messageId, source.id));
  for (const att of sourceAttachments) {
    await db.insert(chatAttachments).values({
      messageId: copy.id,
      channelId: targetChannelId,
      uploadedBy: actorId,
      fileName: att.fileName,
      fileUrl: att.fileUrl,
      fileSize: att.fileSize,
      fileType: att.fileType,
    });
  }

  const preview = source.body.trim().slice(0, 120);
  await db
    .update(chatChannels)
    .set({ lastMessageAt: new Date(), lastMessagePreview: preview })
    .where(eq(chatChannels.id, targetChannelId));

  const [author] = await db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);

  const fullMessage = {
    ...copy,
    author,
    replyTo: null,
    attachments: [],
    reactions: [],
    replyCount: 0,
  };
  await eventBus.broadcast(`chat:channel:${targetChannelId}`, 'chat:message_created', fullMessage);
  return fullMessage;
}
