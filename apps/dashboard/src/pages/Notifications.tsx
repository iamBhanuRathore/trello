import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Bell,
  CheckCheck,
  Inbox,
  Search,
  Settings,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@boardly/ui/button';
import { QueryError } from '../components/common/QueryError';
import { NotificationRow } from '../components/notifications/NotificationRow';
import {
  NOTIFICATION_TYPE_FILTERS,
  notificationTarget,
  type NotificationFilters,
  type NotificationItem,
} from '../lib/notifications';
import {
  useBulkArchiveNotifications,
  useBulkMarkNotificationsRead,
  useBulkUnarchiveNotifications,
  useInvalidateNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNeedsAction,
  useNotifCrossTabSync,
  useNotificationRealtime,
  useNotificationsInfinite,
  useUnreadCount,
} from '../hooks/useNotifications';

type PrimaryTab = 'all' | 'unread' | 'important' | 'starred';
type ArchivedView = 'active' | 'archived' | 'all';

const PAGE_TITLE = 'Notifications';

function parseParams(params: URLSearchParams): {
  tab: PrimaryTab;
  archived: ArchivedView;
  types: string[];
  q: string;
} {
  const tabRaw = params.get('tab');
  const tab: PrimaryTab =
    tabRaw === 'unread' || tabRaw === 'important' || tabRaw === 'starred' ? tabRaw : 'all';
  const archRaw = params.get('archived');
  const archived: ArchivedView = archRaw === 'archived' || archRaw === 'all' ? archRaw : 'active';
  const types = (params.get('types') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => NOTIFICATION_TYPE_FILTERS.some((f) => f.id === t));
  return { tab, archived, types, q: params.get('q') ?? '' };
}

function toFilters(
  tab: PrimaryTab,
  archived: ArchivedView,
  types: string[],
  q: string
): NotificationFilters {
  return {
    unreadOnly: tab === 'unread' || undefined,
    importantOnly: tab === 'important' || undefined,
    starredOnly: tab === 'starred' || undefined,
    archived: archived === 'active' ? 'exclude' : archived === 'archived' ? 'only' : 'include',
    types: types.length > 0 ? types : undefined,
    q: q.trim() ? q.trim() : undefined,
  };
}

function dayBucket(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Older';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const day = startOf(d);
  const today = startOf(now);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Older'];

function isEditableTarget(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export function Notifications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const parsed = parseParams(searchParams);
  const [searchInput, setSearchInput] = useState(parsed.q);
  const [debouncedQ, setDebouncedQ] = useState(parsed.q);

  // Debounce search into the URL (≈250ms) so links stay shareable.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(searchInput);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput.trim()) next.set('q', searchInput.trim());
          else next.delete('q');
          return next;
        },
        { replace: true }
      );
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, setSearchParams]);

  // Keep the input in sync when navigating back/forward.
  useEffect(() => {
    setSearchInput(parsed.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const filters = useMemo(
    () => toFilters(parsed.tab, parsed.archived, parsed.types, debouncedQ),
    [parsed.tab, parsed.archived, parsed.types, debouncedQ]
  );

  const listQuery = useNotificationsInfinite(filters);
  const pristine =
    parsed.tab === 'all' &&
    parsed.types.length === 0 &&
    !debouncedQ.trim() &&
    parsed.archived === 'active';
  const needsActionQuery = useNeedsAction(pristine);
  const unreadQuery = useUnreadCount();

  useNotifCrossTabSync();
  useNotificationRealtime(true);

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const bulkRead = useBulkMarkNotificationsRead();
  const bulkArchive = useBulkArchiveNotifications();
  const bulkUnarchive = useBulkUnarchiveNotifications();
  const invalidateAll = useInvalidateNotifications();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items: NotificationItem[] = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items),
    [listQuery.data]
  );
  const needsAction = pristine ? (needsActionQuery.data?.items ?? []) : [];
  const needsActionTotal = pristine ? (needsActionQuery.data?.total ?? 0) : 0;
  const naIds = useMemo(() => new Set(needsAction.map((n) => n.id)), [needsAction]);

  const grouped = useMemo(() => {
    const now = new Date();
    const map = new Map<string, NotificationItem[]>();
    for (const n of items) {
      if (naIds.has(n.id)) continue;
      const bucket = dayBucket(n.createdAt, now);
      const arr = map.get(bucket) ?? [];
      arr.push(n);
      map.set(bucket, arr);
    }
    return GROUP_ORDER.filter((g) => (map.get(g) ?? []).length > 0).map((g) => ({
      label: g,
      items: map.get(g)!,
    }));
  }, [items, naIds]);

  const flatVisible: NotificationItem[] = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
          listQuery.fetchNextPage();
        }
      },
      { rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.hasNextPage, listQuery.isFetchingNextPage, listQuery.dataUpdatedAt]);

  const announce = (msg: string) => setAnnouncement(msg);

  const openNotification = useCallback(
    (n: NotificationItem) => {
      if (!n.isRead) markRead.mutate(n.id);
      const target = notificationTarget(n);
      if (!target) {
        toast.error('This item is no longer available.');
        return;
      }
      navigate(target);
    },
    [markRead, navigate]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectMode(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const handleArchiveWithUndo = (ids: string[]) => {
    bulkArchive.mutate(ids, {
      onSuccess: () => {
        clearSelection();
        announce(`${ids.length} archived`);
        toast('Archived', {
          description:
            parsed.archived === 'active'
              ? `${ids.length} notification${ids.length === 1 ? '' : 's'} archived.`
              : undefined,
          action: {
            label: 'Undo',
            onClick: () =>
              bulkUnarchive.mutate(ids, {
                onSuccess: () => {
                  invalidateAll();
                  announce('Archive undone');
                },
                onError: () => toast.error('Could not undo archive.'),
              }),
          },
          duration: 5000,
        });
      },
      onError: () => toast.error('Could not archive. Please try again.'),
    });
  };

  // Keyboard triage: j/k move, Enter open, s star, e archive, u read/unread, x select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget()) {
        if (e.key === 'Escape') (document.activeElement as HTMLElement)?.blur();
        return;
      }
      if (flatVisible.length === 0) {
        if (e.key === '/') {
          e.preventDefault();
          document.getElementById('notif-search')?.focus();
        }
        return;
      }
      const idx = focusedId ? flatVisible.findIndex((n) => n.id === focusedId) : -1;
      if (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1;
        const next = flatVisible[(idx + dir + flatVisible.length) % flatVisible.length]!;
        setFocusedId(next.id);
        rowRefs.current.get(next.id)?.scrollIntoView({ block: 'nearest' });
        rowRefs.current.get(next.id)?.querySelector('a')?.focus({ preventScroll: true });
      } else if (e.key === 'Enter' && idx >= 0) {
        openNotification(flatVisible[idx]!);
      } else if ((e.key === 'x' || e.key === 'X') && idx >= 0) {
        e.preventDefault();
        toggleSelect(flatVisible[idx]!.id);
      } else if ((e.key === 'u' || e.key === 'U') && idx >= 0) {
        e.preventDefault();
        const n = flatVisible[idx]!;
        // Direct patch via list mutation hooks is row-owned; trigger via ref click.
        rowRefs.current
          .get(n.id)
          ?.querySelector<HTMLButtonElement>('button[aria-label^="Mark notification"]')
          ?.click();
      } else if ((e.key === 's' || e.key === 'S') && idx >= 0) {
        e.preventDefault();
        rowRefs.current
          .get(flatVisible[idx]!.id)
          ?.querySelector<HTMLButtonElement>(
            'button[aria-label$="as important"],button[aria-label="Unstar notification"]'
          )
          ?.click();
      } else if ((e.key === 'e' || e.key === 'E') && idx >= 0) {
        e.preventDefault();
        handleArchiveWithUndo([flatVisible[idx]!.id]);
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('notif-search')?.focus();
      } else if (e.key === 'Escape' && selectMode) {
        clearSelection();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatVisible, focusedId, selectMode]);

  const setParam = (patch: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: false }
    );
  };

  const toggleType = (id: string) => {
    const has = parsed.types.includes(id);
    const next = has ? parsed.types.filter((t) => t !== id) : [...parsed.types, id];
    setParam({ types: next.length > 0 ? next.join(',') : null });
  };

  const unreadCount = unreadQuery.data ?? 0;
  const hasActiveFilters =
    parsed.tab !== 'all' ||
    parsed.types.length > 0 ||
    debouncedQ.trim() !== '' ||
    parsed.archived !== 'active';
  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({}, { replace: false });
  };

  const selectedIds = useMemo(() => [...selected], [selected]);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-28 sm:px-4">
      {/* Screen-reader action announcements */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{PAGE_TITLE}</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              title="Mark every notification in this organization as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <Link to="/settings/notifications" title="Notification preferences">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Toolbar: search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="notif-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Filter and search…  ( / )"
          aria-label="Filter and search notifications"
          className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        {searchInput && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchInput('')}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Toolbar: primary tabs */}
      <div
        className="mt-3 flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Notification filters"
      >
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread' },
            { id: 'important', label: 'Important' },
            { id: 'starred', label: 'Starred' },
          ] as { id: PrimaryTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={parsed.tab === t.id}
            onClick={() => setParam({ tab: t.id === 'all' ? null : t.id })}
            className={`h-8 cursor-pointer rounded-lg px-3 text-xs font-medium transition-colors ${
              parsed.tab === t.id
                ? 'bg-primary/10 font-semibold text-primary'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
        {(
          [
            { id: 'active', label: 'Active' },
            { id: 'archived', label: 'Archived' },
            { id: 'all', label: 'All incl. archived' },
          ] as { id: ArchivedView; label: string }[]
        ).map((v) => (
          <button
            key={v.id}
            aria-pressed={parsed.archived === v.id}
            onClick={() => setParam({ archived: v.id === 'active' ? null : v.id })}
            className={`h-8 cursor-pointer rounded-lg px-2.5 text-xs transition-colors ${
              parsed.archived === v.id
                ? 'bg-muted font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Toolbar: type pills */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Filter by type">
        {NOTIFICATION_TYPE_FILTERS.map((t) => {
          const on = parsed.types.includes(t.id);
          return (
            <button
              key={t.id}
              aria-pressed={on}
              onClick={() => toggleType(t.id)}
              className={`h-7 cursor-pointer rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                on
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Needs-action strip */}
      {pristine && needsAction.length > 0 && (
        <section
          aria-label="Needs action"
          className="mt-4 overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/[0.04]"
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 sm:px-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              Needs action
              {needsActionTotal > needsAction.length && (
                <span className="font-normal text-muted-foreground">
                  · {needsActionTotal} total
                </span>
              )}
            </p>
            {needsActionTotal > needsAction.length && (
              <button
                onClick={() => setParam({ tab: 'important' })}
                className="cursor-pointer text-[11px] font-medium text-primary hover:underline"
              >
                View all {needsActionTotal}
              </button>
            )}
          </div>
          <ul className="divide-y divide-border/50">
            {needsAction.map((n) => (
              <li key={n.id}>
                <NotificationRow
                  notification={n}
                  selectMode={selectMode}
                  selected={selected.has(n.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={openNotification}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* List */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card/40">
        {listQuery.isPending ? (
          <div className="divide-y divide-border/50" aria-label="Loading notifications">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        ) : listQuery.isError ? (
          <QueryError
            message="Couldn't load notifications."
            onRetry={() => listQuery.refetch()}
            className="min-h-[30vh]"
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {hasActiveFilters ? (
                <Search className="h-5 w-5" />
              ) : debouncedQ ? (
                <Search className="h-5 w-5" />
              ) : parsed.archived === 'archived' ? (
                <Archive className="h-5 w-5" />
              ) : parsed.tab === 'unread' ? (
                <Bell className="h-5 w-5" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
            </div>
            <p className="text-sm font-semibold">
              {hasActiveFilters || debouncedQ
                ? 'No matching notifications'
                : parsed.archived === 'archived'
                  ? 'Nothing archived'
                  : parsed.tab === 'unread'
                    ? 'You are all caught up'
                    : 'No notifications yet'}
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {hasActiveFilters || debouncedQ
                ? 'Try a different search or clear the filters below.'
                : 'When teammates mention you, assign tasks, or comment, updates will appear here.'}
            </p>
            {(hasActiveFilters || debouncedQ) && (
              <Button variant="outline" size="sm" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div>
            {grouped.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h2 className="sticky top-0 z-10 border-y border-border/50 bg-muted/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur first:border-t-0 sm:px-4">
                  {group.label}
                </h2>
                <ul className="divide-y divide-border/50" role="list">
                  {group.items.map((n) => (
                    <li
                      key={n.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(n.id, el);
                        else rowRefs.current.delete(n.id);
                      }}
                      data-notif-id={n.id}
                      onTouchStart={() => {
                        if (selectMode || selected.has(n.id)) return;
                        longPressTimer.current = setTimeout(() => toggleSelect(n.id), 500);
                      }}
                      onTouchEnd={() => {
                        if (longPressTimer.current) clearTimeout(longPressTimer.current);
                      }}
                      onTouchMove={() => {
                        if (longPressTimer.current) clearTimeout(longPressTimer.current);
                      }}
                    >
                      <NotificationRow
                        notification={n}
                        selectMode={selectMode}
                        selected={selected.has(n.id)}
                        onToggleSelect={toggleSelect}
                        onOpen={openNotification}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <div ref={sentinelRef} aria-hidden className="h-1" />
        {listQuery.isFetchingNextPage && (
          <p className="border-t border-border/50 px-4 py-3 text-center text-xs text-muted-foreground">
            Loading more…
          </p>
        )}
      </div>

      {/* Footer hint */}
      <p className="mt-3 flex items-center justify-center gap-1.5 px-4 text-center text-[11px] text-muted-foreground">
        <Inbox className="h-3 w-3" />
        <span className="hidden sm:inline">
          j/k navigate · Enter open · s star · e archive · u read/unread · x select · / search
        </span>
        <span className="sm:hidden">Tap a notification to open it · long-press to select</span>
      </p>

      {/* Sticky bulk bar */}
      {(selectMode || selected.size > 0) && selectedIds.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          role="toolbar"
          aria-label="Bulk actions"
        >
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
            <span className="text-xs font-semibold tabular-nums" aria-live="polite">
              {selectedIds.length} selected
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              disabled={bulkRead.isPending}
              onClick={() =>
                bulkRead.mutate(selectedIds, {
                  onSuccess: () => {
                    announce(`${selectedIds.length} marked as read`);
                    clearSelection();
                  },
                  onError: () => toast.error('Could not mark as read.'),
                })
              }
            >
              Mark read
            </Button>
            {parsed.archived === 'archived' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={bulkUnarchive.isPending}
                onClick={() =>
                  bulkUnarchive.mutate(selectedIds, {
                    onSuccess: () => {
                      announce('Restored from archive');
                      clearSelection();
                    },
                    onError: () => toast.error('Could not unarchive.'),
                  })
                }
              >
                Unarchive
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={bulkArchive.isPending}
                onClick={() => handleArchiveWithUndo(selectedIds)}
              >
                Archive
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
