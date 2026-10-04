import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import type { PresenceUser } from '../components/board/PresenceAvatars';

const WS_URL = import.meta.env.VITE_API_URL
  ? String(import.meta.env.VITE_API_URL).replace(/^http/, 'ws')
  : 'ws://localhost:3001/v1';

const HEARTBEAT_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
// Feed pages are pulled in a loop until drained; cap the burst so a huge
// backlog can't wedge the render thread.
const MAX_GAP_PAGES = 10;

interface BoardFullShape {
  changeCursor?: number;
  lists?: Array<{
    id: string;
    name: string;
    position: number;
    version?: number;
    isArchived?: boolean;
    cards?: Array<{
      id: string;
      listId: string;
      title: string;
      position: number;
      version?: number;
      isArchived?: boolean;
    }>;
  }>;
}

export function useRealtimeBoard(boardId: string | undefined) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const user = useAuthStore((state) => state.user);
  const token = typeof window !== 'undefined' ? localStorage.getItem('boardly_access_token') : null;
  const wsRef = useRef<WebSocket | null>(null);
  const closedByUsRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const cursorRef = useRef<number | null>(null);

  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({}); // cardId -> userNames
  const [connected, setConnected] = useState(false);

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

  // Merge a changes-feed page into the cached full-board payload. Returns true
  // when the caller must fall back to a full refetch (unknown ids).
  //
  // Strictly immutable: every touched row gets a new object identity so the
  // memoized board columns can skip the ones that didn't change. Mutating in
  // place would leave `memo` comparing equal references and silently skip the
  // repaint.
  const applyChanges = useCallback(
    (boardId: string, changes: { lists: any[]; cards: any[] }) => {
      let needFullRefetch = false;
      queryClient.setQueryData<BoardFullShape>(['board', 'full', boardId], (old) => {
        if (!old?.lists) {
          needFullRefetch = true;
          return old;
        }
        // Clone-on-write: `next` holds replaced rows, `lists` preserves
        // identity for everything untouched.
        const next = new Map<string, any>();
        const list = (id: string) => next.get(id) ?? old!.lists!.find((l) => l.id === id);
        const setList = (id: string, value: any) => next.set(id, value);

        for (const cl of changes.lists || []) {
          const existing = list(cl.id);
          if (!existing) {
            needFullRefetch = true;
            continue;
          }
          setList(cl.id, {
            ...existing,
            name: cl.name ?? existing.name,
            position: cl.position ?? existing.position,
            version: cl.version ?? existing.version,
            isArchived: cl.isArchived ?? existing.isArchived,
          });
        }

        // Cards are keyed to their (possibly already-replaced) list object.
        const cardsById = new Map<string, { listId: string; index: number }>();
        for (const l of old.lists) {
          (l.cards || []).forEach((c, index) => cardsById.set(c.id, { listId: l.id, index }));
        }

        for (const cc of changes.cards || []) {
          const found = cardsById.get(cc.id);
          if (!found) {
            needFullRefetch = true; // New card — needs full enrichment, not a bare row.
            continue;
          }
          const source = list(found.listId)!;
          const current = source.cards[found.index];
          const updated = {
            ...current,
            title: cc.title ?? current.title,
            position: cc.position ?? current.position,
            version: cc.version ?? current.version,
            isArchived: cc.isArchived ?? current.isArchived,
            listId: cc.listId ?? current.listId,
          };
          const without = source.cards.filter((c: any) => c.id !== cc.id);
          if (cc.listId && cc.listId !== source.id) {
            const target = list(cc.listId);
            if (!target) {
              needFullRefetch = true;
              continue;
            }
            setList(source.id, { ...source, cards: without });
            setList(target.id, {
              ...target,
              cards: [...(target.cards || []), updated].sort(
                (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
              ),
            });
          } else {
            setList(source.id, {
              ...source,
              cards: source.cards.map((c: any, i: number) => (i === found.index ? updated : c)),
            });
          }
        }

        // Identity stability is load-bearing here. Returning a fresh `lists`
        // array for a change page that altered nothing defeats TanStack Query's
        // structural sharing, so every realtime frame re-renders the whole
        // board with new list identities. dnd-kit reads those as index changes
        // and its derived-transform effect then setStates once per render,
        // which deadlocks an in-flight drag with "Maximum update depth
        // exceeded". When nothing actually differs we hand back the original
        // cache object untouched and React bails out.
        if (next.size === 0) return old;

        const lists = old.lists.map((l) => next.get(l.id) ?? l);
        return { ...old, lists };
      });
      return needFullRefetch;
    },
    [queryClient]
  );

  const gapFill = useCallback(
    async (boardId: string) => {
      const startCursor = cursorRef.current;
      if (startCursor === null) {
        // No cursor — a full refetch is the only correct sync. The response
        // seeds the cursor, so the next reconnect can resume incrementally.
        await queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
        return;
      }
      let cursor = startCursor;
      try {
        for (let page = 0; page < MAX_GAP_PAGES; page++) {
          const { data } = await api.get(
            `/boards/${boardId}/changes?since=${encodeURIComponent(String(cursor))}`
          );
          const total = (data.lists?.length || 0) + (data.cards?.length || 0);
          if (total > 0) {
            const needFull = applyChanges(boardId, data);
            if (needFull) {
              // Unknown ids (new cards) need full enrichment — bail out to a
              // refetch rather than paging further into a partial board.
              await queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
              return;
            }
          }
          cursor = typeof data.nextCursor === 'number' ? data.nextCursor : cursor;
          cursorRef.current = cursor;
          if (!data.hasMore) return;
        }
        // Still catching up after MAX_GAP_PAGES — a refetch is simpler and
        // guaranteed consistent.
        await queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
      } catch {
        await queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
      }
    },
    [applyChanges, queryClient]
  );

  useEffect(() => {
    if (!boardId || !token) return;

    closedByUsRef.current = false;
    let ws: WebSocket | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    // Seed the feed cursor from the full-board payload: every row it contains
    // is already applied, so reconnects resume from there instead of replaying.
    const cached = queryClient.getQueryData<BoardFullShape>(['board', 'full', boardId]);
    if (typeof cached?.changeCursor === 'number') cursorRef.current = cached.changeCursor;

    const connect = () => {
      if (closedByUsRef.current) return;
      const isResume = attemptRef.current > 0;
      try {
        ws = new WebSocket(`${WS_URL}/realtime/ws?token=${token}`);
        wsRef.current = ws;
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        setConnected(true);
        attemptRef.current = 0;
        ws?.send(
          JSON.stringify({
            action: 'subscribe',
            boardId,
            user: user
              ? { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }
              : undefined,
          })
        );
        if (isResume) {
          // Reconnected after a drop — reconcile missed frames, don't refetch blindly.
          void gapFill(boardId);
        }
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

          // 3. Board/Card mutations — apply incrementally, no full refetch.
          else if (
            data.type &&
            (data.type.startsWith('card.') ||
              data.type.startsWith('list.') ||
              data.type.startsWith('board.'))
          ) {
            const payload = data.payload || {};
            // Live frames advance the cursor so a later reconnect resumes here
            // instead of replaying what we already applied.
            if (typeof payload.changeSeq === 'number') {
              cursorRef.current = Math.max(cursorRef.current ?? 0, payload.changeSeq);
            }
            const changes = { lists: [] as any[], cards: [] as any[] };
            if (data.type.startsWith('card.') && payload.id) {
              changes.cards.push({
                id: payload.id,
                listId: payload.listId,
                title: payload.title,
                position: payload.position,
                version: payload.version,
                isArchived: payload.isArchived,
                changeSeq: payload.changeSeq,
              });
            } else if (data.type.startsWith('list.') && payload.id) {
              changes.lists.push({
                id: payload.id,
                name: payload.name,
                position: payload.position,
                version: payload.version,
                isArchived: payload.isArchived,
                changeSeq: payload.changeSeq,
              });
            }
            const touched = changes.cards.length + changes.lists.length > 0;
            const needFull = touched ? applyChanges(boardId, changes) : true;
            if (needFull) {
              void queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
            }
          }
        } catch {
          // Unparseable frame — ignore; the next update will resync.
        }
      };

      ws.onerror = () => {
        // Connection-level errors are surfaced via onclose/reconnect, not here.
      };

      ws.onclose = () => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
        scheduleReconnect();
      };

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'heartbeat', boardId }));
        }
      }, HEARTBEAT_MS);
    };

    const scheduleReconnect = () => {
      if (closedByUsRef.current) return;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** Math.min(attemptRef.current, 5),
        RECONNECT_MAX_MS
      );
      attemptRef.current += 1;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, delay + Math.random() * 500);
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
    // userId (stable string) instead of the user object — identity churn
    // used to reconnect on every auth-store write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, token, userId, queryClient]);

  return {
    presenceUsers,
    typingUsers,
    emitCardFocus,
    emitTyping,
    connected,
  };
}
