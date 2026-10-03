import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { chatService, type ChatChannel, type ChatMessageItem } from '../lib/chatService';

const WS_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws')
  : 'ws://localhost:3001';

/** Minimum gap between full ['chat','channels'] refetches. Bursts coalesce. */
const CHANNELS_REFRESH_MIN_GAP_MS = 8000;
/** Trailing debounce for advancing our own read pointer on the open channel. */
const ACTIVE_READ_DEBOUNCE_MS = 1500;

export function useChatRealtime(passedChannelId?: string | null) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const token = typeof window !== 'undefined' ? localStorage.getItem('boardly_access_token') : null;
  const wsRef = useRef<WebSocket | null>(null);
  const prevChannelIdRef = useRef<string | null>(null);

  const setTyping = useChatStore((s) => s.setTyping);
  const clearExpiredTyping = useChatStore((s) => s.clearExpiredTyping);
  const setUserPresence = useChatStore((s) => s.setUserPresence);
  const setWsConnected = useChatStore((s) => s.setWsConnected);
  const storeChannelId = useChatStore((s) => s.activeChannelId);

  const activeChannelId = passedChannelId !== undefined ? passedChannelId : storeChannelId;
  // Latest channel for the connect-once effect below: channel switches are
  // handled by the dedicated subscription effect, so the socket must NOT
  // reconnect when the channel changes (hence a ref, not a dep).
  const activeChannelIdRef = useRef(activeChannelId);
  activeChannelIdRef.current = activeChannelId;

  // --- Coalesced ['chat','channels'] refresh --------------------------------
  // WS bursts (message_created + unread_bump per message, read_receipts,
  // E2E/test traffic) used to invalidate this heavy key per event. Slow
  // responses then stacked behind each other (129 requests observed).
  const lastChannelsRefreshRef = useRef(0);
  const pendingRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestChannelsRefresh = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastChannelsRefreshRef.current;
    if (elapsed >= CHANNELS_REFRESH_MIN_GAP_MS) {
      lastChannelsRefreshRef.current = now;
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      return;
    }
    if (pendingRefreshTimer.current) return; // trailing refresh already scheduled
    pendingRefreshTimer.current = setTimeout(() => {
      pendingRefreshTimer.current = null;
      lastChannelsRefreshRef.current = Date.now();
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    }, CHANNELS_REFRESH_MIN_GAP_MS - elapsed);
  }, [queryClient]);

  useEffect(
    () => () => {
      if (pendingRefreshTimer.current) clearTimeout(pendingRefreshTimer.current);
    },
    []
  );

  // --- Debounced read-pointer advance for the open channel -------------------
  // The open channel never bumps its own unread count, so ChatFeed's
  // unread-gated effect won't fire for live arrivals. Advance the server
  // pointer here (trailing) instead of refetching the channel list.
  const activeReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeReadInFlight = useRef(false);

  const scheduleActiveChannelRead = useCallback(
    (channelId: string) => {
      if (activeReadTimer.current) clearTimeout(activeReadTimer.current);
      activeReadTimer.current = setTimeout(() => {
        activeReadTimer.current = null;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        if (activeReadInFlight.current) return;
        activeReadInFlight.current = true;
        chatService
          .markChannelRead(channelId)
          .then(() => {
            queryClient.setQueryData<ChatChannel[]>(['chat', 'channels'], (old) =>
              old?.map((c) => (c.id === channelId ? { ...c, unreadCount: 0 } : c))
            );
          })
          .catch(() => {})
          .finally(() => {
            activeReadInFlight.current = false;
          });
      }, ACTIVE_READ_DEBOUNCE_MS);
    },
    [queryClient]
  );

  useEffect(
    () => () => {
      if (activeReadTimer.current) clearTimeout(activeReadTimer.current);
    },
    []
  );

  const patchChannelPreview = useCallback(
    (channelId: string, preview: string) => {
      queryClient.setQueryData<ChatChannel[]>(['chat', 'channels'], (old) => {
        if (!old) return old;
        let changed = false;
        const next = old.map((c) => {
          if (c.id !== channelId) return c;
          changed = true;
          return {
            ...c,
            lastMessagePreview: preview.slice(0, 120),
            lastMessageAt: new Date().toISOString(),
          };
        });
        return changed ? next : old;
      });
    },
    [queryClient]
  );

  // Periodic sweeper for expired typing states
  useEffect(() => {
    const timer = setInterval(() => {
      clearExpiredTyping();
    }, 1500);
    return () => clearInterval(timer);
  }, [clearExpiredTyping]);

  // Connect and maintain WebSocket connection (auto-reconnects with backoff —
  // without this a backend restart/deploy silently kills presence, typing and
  // live messages until the next full page reload).
  const [reconnectTick, setReconnectTick] = useState(0);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token || !userId) return;

    let isMounted = true;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let ws: WebSocket;

    try {
      ws = new WebSocket(`${WS_URL}/realtime/ws?token=${token}`);
      wsRef.current = ws;
    } catch {
      return;
    }

    const scheduleReconnect = () => {
      if (!isMounted || reconnectTimer.current) return;
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 15000);
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        if (isMounted) setReconnectTick((t) => t + 1);
      }, delay);
    };

    ws.onopen = () => {
      if (!isMounted) return;
      setWsConnected(true);
      reconnectDelayRef.current = 1000;

      // Heartbeat loop every 25 seconds
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'presence:heartbeat' }));
        }
      }, 25000);

      // If active channel exists on connect, subscribe to it
      const channelAtConnect = activeChannelIdRef.current;
      if (channelAtConnect) {
        ws.send(JSON.stringify({ action: 'chat:join', channelId: channelAtConnect }));
        prevChannelIdRef.current = channelAtConnect;
      }

      // Flush offline outbox queue on socket reconnection
      useChatStore.getState().processOutbox();
    };

    const markDisconnected = () => {
      if (isMounted) {
        setWsConnected(false);
        scheduleReconnect();
      }
    };
    ws.onclose = markDisconnected;
    ws.onerror = markDisconnected;

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

          const openChannelId = useChatStore.getState().activeChannelId;
          if (msg.channelId === openChannelId && !msg.parentMessageId) {
            // Viewing this channel: patch preview in place, advance our read
            // pointer debounced. No channels refetch (the storm source).
            patchChannelPreview(msg.channelId, msg.body);
            scheduleActiveChannelRead(msg.channelId);
          } else {
            requestChannelsRefresh();
          }
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

        // 4. Reaction Toggled (scoped to the message's channel)
        else if (type === 'chat:reaction_toggled') {
          const { messageId, channelId } = payload;
          if (channelId) {
            queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channelId] });
          } else {
            // Backward compat with pre-payload servers.
            queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
          }
          queryClient.invalidateQueries({ queryKey: ['chat', 'thread', messageId] });
        }

        // 5. User Typing Indicator
        else if (type === 'chat:user_typing') {
          const { channelId, userId: typerId, userName, isTyping } = payload;
          if (typerId !== userId) {
            setTyping(channelId, typerId, userName, isTyping);
          }
        }

        // 6. User Presence Status Update
        else if (type === 'presence:updated') {
          setUserPresence(payload);
        }

        // 7. Unread Bump on Background Channel (the active channel is
        // already handled by message_created — skip to avoid double refresh)
        else if (type === 'chat:unread_bump') {
          const openChannelId = useChatStore.getState().activeChannelId;
          if (payload?.channelId && payload.channelId === openChannelId) return;
          requestChannelsRefresh();
        }

        // 8. New Channel Created / Added to Channel
        else if (type === 'chat:channel_created') {
          requestChannelsRefresh();
        }

        // 9. Read Receipt Received (ticks come from the store; no refetch —
        // the old channel-details invalidation re-fired a fetch per receipt)
        else if (type === 'chat:read_receipt') {
          const { channelId, userId: readerId, readAt } = payload;
          useChatStore.getState().setReadReceipt(channelId, readerId, readAt);
        }
      } catch {}
    };

    return () => {
      isMounted = false;
      setWsConnected(false);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [
    token,
    userId,
    reconnectTick,
    queryClient,
    setTyping,
    setUserPresence,
    setWsConnected,
    patchChannelPreview,
    requestChannelsRefresh,
    scheduleActiveChannelRead,
  ]);

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
