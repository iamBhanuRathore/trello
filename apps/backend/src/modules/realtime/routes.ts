import { Elysia } from 'elysia';
import { verifyAccessToken } from '../../middleware/auth';
import { eventBus } from '../../lib/event-bus';

interface PresenceUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  activeCardId?: string | null;
  isTypingCardId?: string | null;
  lastActiveAt: number;
}

// In-memory presence map: boardId -> (userId -> PresenceUser)
const boardPresence = new Map<string, Map<string, PresenceUser>>();

export const realtimeRoutes = new Elysia({ prefix: '/realtime' })
  .ws('/ws', {
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
      } catch (e) {
        ws.send({ type: 'error', message: 'Invalid token' });
        ws.close();
        return;
      }
    },
    message(ws, message: any) {
      if (!message || typeof message !== 'object') return;

      const userId = (ws.data as any).userId;
      const subscribedBoards = (ws.data as any).subscribedBoards as Set<string>;

      // 1. Subscribe to Board & Register Presence
      if (message.action === 'subscribe' && message.boardId) {
        const boardId = message.boardId;
        const topic = `board:${boardId}`;
        ws.subscribe(topic);
        subscribedBoards?.add(boardId);

        if (!boardPresence.has(boardId)) {
          boardPresence.set(boardId, new Map());
        }

        const userPresence: PresenceUser = {
          id: userId,
          name: message.user?.name || 'Team Member',
          email: message.user?.email || '',
          avatarUrl: message.user?.avatarUrl || null,
          lastActiveAt: Date.now(),
        };

        boardPresence.get(boardId)!.set(userId, userPresence);

        ws.send({ type: 'subscribed', topic });

        // Broadcast presence list to all board subscribers
        const activeUsers = Array.from(boardPresence.get(boardId)!.values());
        eventBus.emit('broadcast', {
          topic,
          event: 'presence:update',
          payload: { boardId, users: activeUsers },
        });
      }

      // 2. Active Card Focus / Viewing
      else if (message.action === 'card_focus' && message.boardId) {
        const boardId = message.boardId;
        const topic = `board:${boardId}`;
        const boardMap = boardPresence.get(boardId);

        if (boardMap && boardMap.has(userId)) {
          const u = boardMap.get(userId)!;
          u.activeCardId = message.cardId || null;
          u.lastActiveAt = Date.now();

          eventBus.emit('broadcast', {
            topic,
            event: 'presence:card_focus',
            payload: { boardId, userId, cardId: message.cardId },
          });
        }
      }

      // 3. Typing Indicators
      else if (message.action === 'typing' && message.boardId) {
        const boardId = message.boardId;
        const topic = `board:${boardId}`;
        const boardMap = boardPresence.get(boardId);

        if (boardMap && boardMap.has(userId)) {
          const u = boardMap.get(userId)!;
          u.isTypingCardId = message.isTyping ? message.cardId : null;

          eventBus.emit('broadcast', {
            topic,
            event: 'presence:typing',
            payload: {
              boardId,
              userId,
              userName: u.name,
              cardId: message.cardId,
              isTyping: !!message.isTyping,
            },
          });
        }
      }
    },
    close(ws) {
      const userId = (ws.data as any)?.userId;
      const subscribedBoards = (ws.data as any)?.subscribedBoards as Set<string>;

      if (userId && subscribedBoards) {
        for (const boardId of subscribedBoards) {
          const boardMap = boardPresence.get(boardId);
          if (boardMap) {
            boardMap.delete(userId);
            if (boardMap.size === 0) {
              boardPresence.delete(boardId);
            }
            const activeUsers = Array.from(boardMap.values());
            eventBus.emit('broadcast', {
              topic: `board:${boardId}`,
              event: 'presence:update',
              payload: { boardId, users: activeUsers },
            });
          }
        }
      }
    },
  });

export function setupRealtimeEventBus(server: any) {
  eventBus.on('broadcast', ({ topic, event, payload }) => {
    if (server) {
      server.publish(topic, JSON.stringify({ type: event, payload }));
    }
  });
}

