import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import type { PresenceUser } from '../components/board/PresenceAvatars';

const WS_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('http', 'ws')
  : 'ws://localhost:3001';

export function useRealtimeBoard(boardId: string | undefined) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const token = typeof window !== 'undefined' ? localStorage.getItem('boardly_access_token') : null;
  const wsRef = useRef<WebSocket | null>(null);

  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({}); // cardId -> userNames

  const emitCardFocus = useCallback(
    (cardId: string | null) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && boardId) {
        wsRef.current.send(JSON.stringify({ action: 'card_focus', boardId, cardId }));
      }
    },
    [boardId]
  );

  const emitTyping = useCallback(
    (cardId: string, isTyping: boolean) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && boardId) {
        wsRef.current.send(JSON.stringify({ action: 'typing', boardId, cardId, isTyping }));
      }
    },
    [boardId]
  );

  useEffect(() => {
    if (!boardId || !token) return;

    // Connect to backend WebSocket
    const url = `${WS_URL}/realtime/ws?token=${token}`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(url);
      wsRef.current = ws;
    } catch {
      return;
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          action: 'subscribe',
          boardId,
          user: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
              }
            : undefined,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 1. Presence Update
        if (data.type === 'presence:update' && data.payload?.boardId === boardId) {
          setPresenceUsers(data.payload.users || []);
        }

        // 2. Typing Indicator
        else if (data.type === 'presence:typing' && data.payload?.boardId === boardId) {
          const { cardId, userName, isTyping } = data.payload;
          setTypingUsers((prev) => {
            const current = prev[cardId] || [];
            if (isTyping) {
              if (!current.includes(userName)) {
                return { ...prev, [cardId]: [...current, userName] };
              }
            } else {
              return { ...prev, [cardId]: current.filter((u) => u !== userName) };
            }
            return prev;
          });
        }

        // 3. Board/Card mutations
        else if (
          data.type &&
          (data.type.startsWith('card.') ||
            data.type.startsWith('list.') ||
            data.type.startsWith('board.'))
        ) {
          queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
        }
      } catch {
        // Unparseable frame — ignore; the next update will resync.
      }
    };

    ws.onerror = () => {
      // Connection-level errors are surfaced via onclose/reconnect, not here.
    };

    // 4. Heartbeat keep-alive every 25s to maintain presence TTL
    const heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'heartbeat', boardId }));
      }
    }, 25000);

    return () => {
      clearInterval(heartbeatTimer);
      ws.close();
      wsRef.current = null;
    };
  }, [boardId, token, user, queryClient]);

  return {
    presenceUsers,
    typingUsers,
    emitCardFocus,
    emitTyping,
  };
}
