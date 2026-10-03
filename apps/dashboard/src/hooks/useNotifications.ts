import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import {
  bulkArchiveNotifications,
  bulkMarkNotificationsRead,
  bulkUnarchiveNotifications,
  fetchNeedsAction,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  starNotification,
  type NotificationFilters,
  type NotificationItem,
  type NotificationPage,
} from '../lib/notifications';

// ─── Query keys ──────────────────────────────────────────────────────────────

function normalizeFilters(f: NotificationFilters): NotificationFilters {
  return {
    unreadOnly: f.unreadOnly || undefined,
    starredOnly: f.starredOnly || undefined,
    importantOnly: f.importantOnly || undefined,
    archived: f.archived && f.archived !== 'exclude' ? f.archived : undefined,
    types: f.types && f.types.length > 0 ? [...f.types].sort() : undefined,
    q: f.q?.trim() ? f.q.trim() : undefined,
  };
}

export const notifKeys = {
  root: ['notifications'] as const,
  list: (filters: NotificationFilters) =>
    ['notifications', 'list', normalizeFilters(filters)] as const,
  needsAction: ['notifications', 'needs-action'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

// ─── Cross-tab sync ──────────────────────────────────────────────────────────

const NOTIF_CHANNEL = 'boardly:notifications';

function postNotifSync(): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      new BroadcastChannel(NOTIF_CHANNEL).postMessage({ type: 'invalidate' });
    }
  } catch {
    /* BroadcastChannel unavailable — same-tab invalidation still applies. */
  }
}

export function useNotifCrossTabSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(NOTIF_CHANNEL);
    bc.onmessage = (e) => {
      if (e.data?.type === 'invalidate') {
        queryClient.invalidateQueries({ queryKey: notifKeys.root });
      }
    };
    return () => bc.close();
  }, [queryClient]);
}

// ─── Realtime (existing /v1/realtime/ws user:inbox channel) ──────────────────

const WS_URL = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string).replace(/^http/, 'ws')
  : 'ws://localhost:3001';

/** Invalidate inbox caches on `notifications:new` push, with reconnect backoff. */
export function useNotificationRealtime(enabled = true): void {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const token = typeof window !== 'undefined' ? localStorage.getItem('boardly_access_token') : null;
  const [tick, setTick] = useState(0);
  const delayRef = useRef(2000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !token || !user?.id) return;
    let mounted = true;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_URL}/realtime/ws?token=${token}`);
    } catch {
      return;
    }
    const reconnect = () => {
      if (!mounted || timerRef.current) return;
      const d = delayRef.current;
      delayRef.current = Math.min(d * 2, 30000);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (mounted) setTick((t) => t + 1);
      }, d);
    };
    ws.onopen = () => {
      delayRef.current = 2000;
    };
    ws.onclose = reconnect;
    ws.onerror = reconnect;
    ws.onmessage = (event) => {
      if (!mounted) return;
      try {
        const msg = JSON.parse(event.data as string) as { type?: string };
        if (msg.type === 'notifications:new') {
          queryClient.invalidateQueries({ queryKey: notifKeys.root });
          postNotifSync();
        }
      } catch {
        /* Non-JSON frames are heartbeats/presence — ignore. */
      }
    };
    return () => {
      mounted = false;
      // The pending backoff timer outlived the unmount otherwise, and fired
      // setTick on a dead component (and kept the socket reconnecting).
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        ws.close();
      } catch {
        /* Already closed. */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, user?.id, tick, queryClient]);
}

// List / strip / badge
//
// These deliberately do NOT opt back into `refetchOnWindowFocus`: the global
// default in lib/queryClient.ts is false, and the realtime socket already
// invalidates `notifKeys.root` on every `notifications:new` frame. Three keys
// refetched on each tab focus against a 15s freshness window.

const LIST_LIMIT = 30;

export function useNotificationsInfinite(filters: NotificationFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: notifKeys.list(filters),
    queryFn: ({ pageParam }) =>
      fetchNotifications(filters, LIST_LIMIT, (pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useNeedsAction(enabled = true) {
  return useQuery({
    queryKey: notifKeys.needsAction,
    queryFn: () => fetchNeedsAction(5),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// Exactly one owner for the unread-count interval in the app: AppSidebar's copy
// is removed, otherwise the two timers drift and this key is fetched ~2x per
// window.
export function useUnreadCount() {
  return useQuery({
    queryKey: notifKeys.unreadCount,
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
}

// ─── Optimistic cache patching ───────────────────────────────────────────────

type NotifInfinite = InfiniteData<NotificationPage>;

function patchLists(
  queryClient: ReturnType<typeof useQueryClient>,
  patch: (item: NotificationItem) => NotificationItem | null
): void {
  const entries = queryClient.getQueriesData<NotifInfinite>({
    queryKey: ['notifications', 'list'],
  });
  for (const [key, data] of entries) {
    if (!data) continue;
    let changed = false;
    const pages = data.pages.map((page) => {
      const items: NotificationItem[] = [];
      for (const item of page.items) {
        const next = patch(item);
        if (next === null) {
          changed = true;
          continue;
        }
        if (next !== item) changed = true;
        items.push(next);
      }
      return changed ? { ...page, items } : page;
    });
    if (changed) queryClient.setQueryData(key, { ...data, pages });
  }
}

function refreshDerived(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: notifKeys.needsAction });
  queryClient.invalidateQueries({ queryKey: notifKeys.unreadCount });
  postNotifSync();
}

const IMPORTANT_TYPES = new Set([
  'card.mentioned',
  'card.assigned',
  'card.due_soon',
  'card.overdue',
  'chat.mentioned',
]);

function recomputeImportant(item: NotificationItem): boolean {
  if (item.isStarred) return true;
  if (item.isRead) return false;
  return IMPORTANT_TYPES.has(item.eventType);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', 'list'] });
      patchLists(queryClient, (item) =>
        item.id === id && !item.isRead ? { ...item, isRead: true } : item
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: notifKeys.root }),
    onSettled: () => refreshDerived(queryClient),
  });
}

export function useToggleNotificationUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
      isRead ? markNotificationUnread(id) : markNotificationRead(id),
    onMutate: async ({ id, isRead }) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', 'list'] });
      patchLists(queryClient, (item) =>
        item.id === id
          ? {
              ...item,
              isRead: !isRead,
              isImportant: recomputeImportant({ ...item, isRead: !isRead }),
            }
          : item
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: notifKeys.root }),
    onSettled: () => refreshDerived(queryClient),
  });
}

export function useToggleNotificationStar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      starNotification(id, starred),
    onMutate: async ({ id, starred }) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', 'list'] });
      patchLists(queryClient, (item) => {
        if (item.id !== id) return item;
        const next = { ...item, isStarred: starred };
        return { ...next, isImportant: recomputeImportant(next) };
      });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: notifKeys.root }),
    onSettled: () => refreshDerived(queryClient),
  });
}

export function useBulkMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkMarkNotificationsRead(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', 'list'] });
      const set = new Set(ids);
      patchLists(queryClient, (item) =>
        set.has(item.id) && !item.isRead ? { ...item, isRead: true } : item
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: notifKeys.root }),
    onSettled: () => refreshDerived(queryClient),
  });
}

export function useBulkArchiveNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkArchiveNotifications(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', 'list'] });
      const set = new Set(ids);
      // Dismiss from visible lists; archived-only views refetch instead.
      patchLists(queryClient, (item) => (set.has(item.id) ? null : item));
    },
    onError: () => queryClient.invalidateQueries({ queryKey: notifKeys.root }),
    onSettled: () => refreshDerived(queryClient),
  });
}

export function useBulkUnarchiveNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkUnarchiveNotifications(ids),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notifKeys.root });
      postNotifSync();
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', 'list'] });
      patchLists(queryClient, (item) => (!item.isRead ? { ...item, isRead: true } : item));
    },
    onError: () => queryClient.invalidateQueries({ queryKey: notifKeys.root }),
    onSettled: () => refreshDerived(queryClient),
  });
}

/** External invalidation sink (realtime hook, cross-tab, undo flows). */
export function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: notifKeys.root });
  }, [queryClient]);
}
