import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { chatMessages, chatReactions } from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { httpError, requireChannelMembership } from './chat-common';

export async function toggleReaction(
  db: Database,
  messageId: string,
  organizationId: string,
  userId: string,
  emoji: string
) {
  const [message] = await db
    .select({ channelId: chatMessages.channelId })
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);

  if (!message) throw httpError(404, 'Message not found');

  // Reactions require membership — any authenticated UUID could react before.
  await requireChannelMembership(db, message.channelId, organizationId, userId);

  const [existing] = await db
    .select()
    .from(chatReactions)
    .where(
      and(
        eq(chatReactions.messageId, messageId),
        eq(chatReactions.userId, userId),
        eq(chatReactions.emoji, emoji)
      )
    )
    .limit(1);

  if (existing) {
    await db.delete(chatReactions).where(eq(chatReactions.id, existing.id));
    await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:reaction_toggled', {
      messageId,
      channelId: message.channelId,
      userId,
      emoji,
      action: 'removed',
    });
    return { action: 'removed', emoji };
  } else {
    await db.insert(chatReactions).values({
      messageId,
      userId,
      emoji,
    });

    await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:reaction_toggled', {
      messageId,
      channelId: message.channelId,
      userId,
      emoji,
      action: 'added',
    });
    return { action: 'added', emoji };
  }
}
