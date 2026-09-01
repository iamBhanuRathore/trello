import { Elysia } from 'elysia';
import { verifyAccessToken } from '../../middleware/auth';
import { eventBus } from '../../lib/event-bus';
import { presenceStore, initializeRedisPubSub, onRedisBroadcast, PresenceUser } from '../../redis';

export type { PresenceUser };

export const realtimeRoutes = new Elysia({ prefix: '/realtime' }).ws('/ws', {
  async open(ws) {
    // Validate token
    const token = (ws.data.query as any)?.token;
    if (!token) {
      ws.send({ type: 'error', message: 'Missing token' });
      ws.close();
      return;
    }

    try {
      const payload = await verifyAccessToken(token);
      (ws.data as any).userId = payload.userId;
      (ws.data as any).subscribedBoards = new Set<string>();
    } catch {
      ws.send({ type: 'error', message: 'Invalid token' });
      ws.close();
      return;
    }
  },
  async message(ws, message: any) {
    if (!message || typeof message !== 'object') return;

    const userId = (ws.data as any).userId;
    const subscribedBoards = (ws.data as any).subscribedBoards as Set<string>;

    // 1. Subscribe to Board & Register Presence
    if (message.action === 'subscribe' && message.boardId) {
      const boardId = message.boardId;
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

    // 2. Active Card Focus / Viewing
    else if (message.action === 'card_focus' && message.boardId) {
      const boardId = message.boardId;
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

    // 3. Typing Indicators
    else if (message.action === 'typing' && message.boardId) {
      const boardId = message.boardId;
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

    // 4. Heartbeat Keep-Alive
    else if (message.action === 'heartbeat' && message.boardId) {
      const boardId = message.boardId;
      await presenceStore.refreshUser(boardId, userId);
      ws.send({ type: 'heartbeat:ack', boardId, timestamp: Date.now() });
    }
  },
  async close(ws) {
    const userId = (ws.data as any)?.userId;
    const subscribedBoards = (ws.data as any)?.subscribedBoards as Set<string>;

    if (userId && subscribedBoards) {
      for (const boardId of subscribedBoards) {
        await presenceStore.removeUser(boardId, userId);
        const activeUsers = await presenceStore.getUsers(boardId);
        await eventBus.broadcast(`board:${boardId}`, 'presence:update', {
          boardId,
          users: activeUsers,
        });
      }
    }
  },
});

export function setupRealtimeEventBus(server: any) {
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
