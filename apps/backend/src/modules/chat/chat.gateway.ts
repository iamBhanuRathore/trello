import { eventBus } from '../../lib/event-bus';
import { markChannelRead } from './service';
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

export async function handleChatSocketAction(ws: any, message: ChatSocketMessage, db: Database) {
  const userId = ws.data.userId;
  if (!userId || !message.action) return;

  const channelId = message.channelId;
  if (!channelId) return;

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
      await markChannelRead(db, channelId, userId);
      break;
    }

    default:
      break;
  }
}
