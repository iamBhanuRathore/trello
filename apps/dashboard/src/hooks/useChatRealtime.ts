import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import type { ChatMessageItem } from '../lib/chatService';

const WS_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws')
  : 'ws://localhost:3001';

export function useChatRealtime(passedChannelId?: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const token = typeof window !== 'undefined' ? localStorage.getItem('boardly_access_token') : null;
  const wsRef = useRef<WebSocket | null>(null);
  const prevChannelIdRef = useRef<string | null>(null);

  const {
    setTyping,
    clearExpiredTyping,
    setUserPresence,
    activeChannelId: storeChannelId,
  } = useChatStore();

  const activeChannelId = passedChannelId !== undefined ? passedChannelId : storeChannelId;

  // Periodic sweeper for expired typing states
  useEffect(() => {
    const timer = setInterval(() => {
      clearExpiredTyping();
    }, 1500);
    return () => clearInterval(timer);
  }, [clearExpiredTyping]);

  // Connect and maintain WebSocket connection
  useEffect(() => {
    if (!token || !user) return;

    let isMounted = true;
    let heartbeatTimer: any = null;
    let ws: WebSocket;

    try {
      ws = new WebSocket(`${WS_URL}/realtime/ws?token=${token}`);
      wsRef.current = ws;
    } catch {
      return;
    }

    ws.onopen = () => {
      if (!isMounted) return;

      // Heartbeat loop every 25 seconds
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'presence:heartbeat' }));
        }
      }, 25000);

      // If active channel exists on connect, subscribe to it
      if (activeChannelId) {
        ws.send(JSON.stringify({ action: 'chat:join', channelId: activeChannelId }));
        prevChannelIdRef.current = activeChannelId;
      }

      // Flush offline outbox queue on socket reconnection
      useChatStore.getState().processOutbox();
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        // 1. New Message Created
        if (type === 'chat:message_created') {
          const msg = payload as ChatMessageItem;
          // If reply to thread, update thread query
          if (msg.parentMessageId) {
            queryClient.setQueryData(
              ['chat', 'thread', msg.parentMessageId],
              (old: ChatMessageItem[] | undefined) => (old ? [...old, msg] : [msg])
            );
          } else {
            // Append to active channel message stream
            queryClient.setQueryData(
              ['chat', 'messages', msg.channelId],
              (old: ChatMessageItem[] | undefined) => {
                if (!old) return [msg];
                if (old.some((m) => m.id === msg.id)) return old;
                return [...old, msg];
              }
            );
          }

          // Invalidate channels list to update preview and order
          queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
        }

        // 2. Message Updated / Edited
        else if (type === 'chat:message_updated') {
          const updated = payload;
          queryClient.setQueryData(
            ['chat', 'messages', updated.channelId],
            (old: ChatMessageItem[] | undefined) =>
              old?.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }

        // 3. Message Deleted
        else if (type === 'chat:message_deleted') {
          const { id, channelId } = payload;
          queryClient.setQueryData(
            ['chat', 'messages', channelId],
            (old: ChatMessageItem[] | undefined) => old?.filter((m) => m.id !== id)
          );
        }

        // 4. Reaction Toggled
        else if (type === 'chat:reaction_toggled') {
          const { messageId } = payload;
          queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
          queryClient.invalidateQueries({ queryKey: ['chat', 'thread', messageId] });
        }

        // 5. User Typing Indicator
        else if (type === 'chat:user_typing') {
          const { channelId, userId, userName, isTyping } = payload;
          if (userId !== user.id) {
            setTyping(channelId, userId, userName, isTyping);
          }
        }

        // 6. User Presence Status Update
        else if (type === 'presence:updated') {
          setUserPresence(payload);
        }

        // 7. Unread Bump on Background Channel
        else if (type === 'chat:unread_bump') {
          queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
        }

        // 8. New Channel Created / Added to Channel
        else if (type === 'chat:channel_created') {
          queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
        }

        // 9. Read Receipt Received (for double blue tick updates)
        else if (type === 'chat:read_receipt') {
          const { channelId, userId: readerId, readAt } = payload;
          useChatStore.getState().setReadReceipt(channelId, readerId, readAt);
          queryClient.invalidateQueries({ queryKey: ['chat', 'channel-details', channelId] });
        }
      } catch {}
    };

    return () => {
      isMounted = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [token, user?.id]);

  // Handle channel switching subscriptions
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (prevChannelIdRef.current && prevChannelIdRef.current !== activeChannelId) {
      ws.send(
        JSON.stringify({
          action: 'chat:leave',
          channelId: prevChannelIdRef.current,
        })
      );
    }

    if (activeChannelId) {
      ws.send(
        JSON.stringify({
          action: 'chat:join',
          channelId: activeChannelId,
        })
      );
    }

    prevChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  // Outbound action triggers
  const emitTyping = useCallback(
    (channelId: string, isTyping: boolean) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && user) {
        ws.send(
          JSON.stringify({
            action: 'chat:typing',
            channelId,
            isTyping,
            user: {
              name: user.name,
              avatarUrl: user.avatarUrl,
            },
          })
        );
      }
    },
    [user]
  );

  const emitRead = useCallback((channelId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          action: 'chat:read',
          channelId,
        })
      );
    }
  }, []);

  return {
    emitTyping,
    emitRead,
  };
}
