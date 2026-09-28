import { eq, and } from 'drizzle-orm';
import { eventBus } from '../../lib/event-bus';
import { markChannelRead } from './service';
import { chatChannels, chatChannelMembers } from '../../db/schema/index';
import type { Database } from '../../db/index';

export interface ChatSocketMessage {
  action: 'chat:join' | 'chat:leave' | 'chat:typing' | 'chat:read';
  channelId?: string;
  isTyping?: boolean;
  user?: {
    name?: string;
    avatarUrl?: string;
  };
}

/**
 * Confirms the channel belongs to the socket owner's org AND the user is a
 * channel member. Every chat WS action must pass this first.
 */
async function assertChannelAccess(
  db: Database,
  channelId: string,
  organizationId: string,
  userId: string
): Promise<boolean> {
  const [channel] = await db
    .select({ organizationId: chatChannels.organizationId })
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel || channel.organizationId !== organizationId) return false;
  const [member] = await db
    .select({ id: chatChannelMembers.id })
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);
  return Boolean(member);
}

export async function handleChatSocketAction(ws: any, message: ChatSocketMessage, db: Database) {
  const userId = ws.data.userId;
  const organizationId = ws.data.organizationId;
  if (!userId || !organizationId || !message.action) return;

  const channelId = message.channelId;
  if (!channelId) return;

  if (!(await assertChannelAccess(db, channelId, organizationId, userId))) {
    ws.send?.({ type: 'error', message: 'Forbidden — channel not in your organization' });
    return;
  }

  switch (message.action) {
    case 'chat:join': {
      const topic = `chat:channel:${channelId}`;
      ws.subscribe(topic);
      ws.send({ type: 'chat:joined', channelId, topic });
      break;
    }

    case 'chat:leave': {
      const topic = `chat:channel:${channelId}`;
      ws.unsubscribe(topic);
      ws.send({ type: 'chat:left', channelId });
      break;
    }

    case 'chat:typing': {
      const topic = `chat:channel:${channelId}`;
      await eventBus.broadcast(topic, 'chat:user_typing', {
        channelId,
        userId,
        userName: message.user?.name || 'Someone',
        isTyping: !!message.isTyping,
      });
      break;
    }

    case 'chat:read': {
      await markChannelRead(db, channelId, organizationId, userId);
      break;
    }

    default:
      break;
  }
}
