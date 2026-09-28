import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { verifyAccessToken } from '../../middleware/auth';
import { eventBus } from '../../lib/event-bus';
import { presenceStore, initializeRedisPubSub, onRedisBroadcast } from '../../redis';
import type { PresenceUser } from '../../redis';
import { db } from '../../db/index';
import { boards } from '../../db/schema/index';
import { handleChatSocketAction, type ChatSocketMessage } from '../chat/chat.gateway';
import {
  handlePresenceSocketAction,
  handlePresenceDisconnect,
  type PresenceSocketMessage,
} from '../presence/presence.gateway';
import { recordUserHeartbeat } from '../presence/presenceService';

/** Framework-untyped WS connection bag — documented here instead of `any`. */
export interface RealtimeWsData {
  query?: { token?: string };
  userId?: string;
  organizationId?: string;
  subscribedBoards?: Set<string>;
}

/** Inbound WS protocol: chat + presence gateway messages plus board actions. */
export interface SocketInboundMessage {
  action?: string;
  channelId?: string;
  boardId?: string;
  cardId?: string;
  isTyping?: boolean;
  status?: PresenceSocketMessage['status'];
  customStatusText?: string;
  expiresInMinutes?: number;
  user?: { name?: string; email?: string; avatarUrl?: string | null };
}

export type { PresenceUser };

/**
 * Confirms a board belongs to the socket owner's organization.
 * Every board-scoped WS action must pass this before subscribing or mutating.
 */
async function assertBoardAccess(boardId: string, organizationId?: string): Promise<boolean> {
  if (!organizationId) return false;
  const [row] = await db
    .select({ organizationId: boards.organizationId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  return row?.organizationId === organizationId;
}

export const realtimeRoutes = new Elysia({ prefix: '/realtime' }).ws('/ws', {
  async open(ws) {
    // Validate token
    const wsData = ws.data as RealtimeWsData;
    const token = wsData.query?.token;
    if (!token) {
      ws.send({ type: 'error', message: 'Missing token' });
      ws.close();
      return;
    }

    try {
      const payload = await verifyAccessToken(token);
      wsData.userId = payload.userId;
      wsData.organizationId = (payload as { organizationId?: string }).organizationId;
      wsData.subscribedBoards = new Set<string>();

      // Subscribe user to personal inbox & organization presence feed
      ws.subscribe(`user:inbox:${payload.userId}`);
      ws.subscribe('org:presence');

      // Record online presence
      await recordUserHeartbeat(payload.userId);
    } catch {
      ws.send({ type: 'error', message: 'Invalid token' });
      ws.close();
      return;
    }
  },
  async message(ws, message: SocketInboundMessage) {
    if (!message || typeof message !== 'object') return;

    const wsData = ws.data as RealtimeWsData;
    const userId = wsData.userId;
    const subscribedBoards = wsData.subscribedBoards;

    // 1. Route Chat Gateway actions (chat:join, chat:leave, chat:typing, chat:read)
    if (typeof message.action === 'string' && message.action.startsWith('chat:')) {
      await handleChatSocketAction(ws, message as ChatSocketMessage, db);
      return;
    }

    // 2. Route Presence Gateway actions (presence:heartbeat, presence:status_override)
    if (typeof message.action === 'string' && message.action.startsWith('presence:')) {
      await handlePresenceSocketAction(ws, message as PresenceSocketMessage, db);
      return;
    }

    if (!userId) return;

    // 3. Board Real-time: Subscribe & Register Presence
    if (message.action === 'subscribe' && message.boardId) {
      const boardId = message.boardId;
      if (!(await assertBoardAccess(boardId, wsData.organizationId))) {
        ws.send({ type: 'error', message: 'Forbidden — board not in your organization' });
        return;
      }
      const topic = `board:${boardId}`;
      ws.subscribe(topic);
      subscribedBoards?.add(boardId);

      const userPresence: PresenceUser = {
        id: userId,
        name: message.user?.name || 'Team Member',
        email: message.user?.email || '',
        avatarUrl: message.user?.avatarUrl || null,
        lastActiveAt: Date.now(),
      };

      await presenceStore.setUser(boardId, userId, userPresence);

      ws.send({ type: 'subscribed', topic });

      // Broadcast updated presence list to all board subscribers
      const activeUsers = await presenceStore.getUsers(boardId);
      await eventBus.broadcast(topic, 'presence:update', {
        boardId,
        users: activeUsers,
      });
    }

    // 4. Board Real-time: Active Card Focus / Viewing
    else if (message.action === 'card_focus' && message.boardId) {
      const boardId = message.boardId;
      if (!(await assertBoardAccess(boardId, wsData.organizationId))) return;
      const topic = `board:${boardId}`;

      const updated = await presenceStore.updateUser(boardId, userId, {
        activeCardId: message.cardId || null,
      });

      if (updated) {
        await eventBus.broadcast(topic, 'presence:card_focus', {
          boardId,
          userId,
          cardId: message.cardId,
        });
      }
    }

    // 5. Board Real-time: Card Comment Typing Indicators
    else if (message.action === 'typing' && message.boardId) {
      const boardId = message.boardId;
      if (!(await assertBoardAccess(boardId, wsData.organizationId))) return;
      const topic = `board:${boardId}`;

      const updated = await presenceStore.updateUser(boardId, userId, {
        isTypingCardId: message.isTyping ? message.cardId : null,
      });

      if (updated) {
        await eventBus.broadcast(topic, 'presence:typing', {
          boardId,
          userId,
          userName: updated.name,
          cardId: message.cardId,
          isTyping: !!message.isTyping,
        });
      }
    }

    // 6. Board Real-time: Heartbeat Keep-Alive
    else if (message.action === 'heartbeat' && message.boardId) {
      const boardId = message.boardId;
      if (!(await assertBoardAccess(boardId, wsData.organizationId))) return;
      await presenceStore.refreshUser(boardId, userId);
      await recordUserHeartbeat(userId);
      ws.send({ type: 'heartbeat:ack', boardId, timestamp: Date.now() });
    }
  },
  async close(ws) {
    const wsData = ws.data as RealtimeWsData | undefined;
    const userId = wsData?.userId;
    const subscribedBoards = wsData?.subscribedBoards;

    if (userId) {
      await handlePresenceDisconnect(userId);

      if (subscribedBoards) {
        for (const boardId of subscribedBoards) {
          await presenceStore.removeUser(boardId, userId);
          const activeUsers = await presenceStore.getUsers(boardId);
          await eventBus.broadcast(`board:${boardId}`, 'presence:update', {
            boardId,
            users: activeUsers,
          });
        }
      }
    }
  },
});

export function setupRealtimeEventBus(
  server: {
    publish: (topic: string, message: string) => unknown;
  } | null
) {
  // 1. Hook up Redis Pub/Sub receiver to local server publish
  initializeRedisPubSub().catch(() => {});
  onRedisBroadcast(({ topic, event, payload }) => {
    if (server) {
      server.publish(topic, JSON.stringify({ type: event, payload }));
    }
  });

  // 2. In-Memory fallback listener when Redis is inactive or broadcasting locally
  eventBus.on('broadcast', ({ topic, event, payload }) => {
    if (server) {
      server.publish(topic, JSON.stringify({ type: event, payload }));
    }
  });

  // 3. Start background presence sweeper with automatic eviction broadcast
  presenceStore.startSweeper(15000, async (boardId, remainingUsers) => {
    await eventBus.broadcast(`board:${boardId}`, 'presence:update', {
      boardId,
      users: remainingUsers,
    });
  });
}
