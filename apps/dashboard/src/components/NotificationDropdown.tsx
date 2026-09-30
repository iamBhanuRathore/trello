import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, CheckCheck, Search, Settings, X } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { useDialogClose } from '../hooks/useDialogClose';
import { NotificationRow } from './notifications/NotificationRow';
import { QueryError } from './common/QueryError';
import { notificationTarget, type NotificationItem } from '../lib/notifications';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifCrossTabSync,
  useNotificationRealtime,
  useNotificationsInfinite,
  useUnreadCount,
} from '../hooks/useNotifications';

type Tab = 'all' | 'unread';

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const navigate = useNavigate();

  const { requestClose, handleOverlayClick } = useDialogClose({
    isOpen: open,
    onClose: () => setOpen(false),
  });

  // Fetch only while open; server-filtered search keeps it cheap.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search, open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebounced('');
    }
  }, [open]);

  const filters = useMemo(
    () => ({
      unreadOnly: tab === 'unread' || undefined,
      q: debounced ? debounced : undefined,
    }),
    [tab, debounced]
  );
  const listQuery = useNotificationsInfinite(filters, open);
  const unreadQuery = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useNotifCrossTabSync();
  useNotificationRealtime(open);

  const unreadCount = unreadQuery.data ?? 0;
  const items: NotificationItem[] = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items).slice(0, 10),
    [listQuery.data]
  );

  const openNotification = (n: NotificationItem) => {
    if (!n.isRead) markRead.mutate(n.id);
    requestClose();
    const target = notificationTarget(n);
    if (target) navigate(target);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 ring-2 ring-background" />
          </span>
        )}
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={handleOverlayClick}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-96 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground sm:text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                    title="Mark every notification in this organization as read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Mark all read</span>
                  </Button>
                )}
                <Link to="/settings/notifications" onClick={requestClose}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Notification preferences"
                    aria-label="Notification preferences"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={requestClose}
                  aria-label="Close notifications"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative border-b border-border/60 bg-muted/20 px-3.5 py-2">
              <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notifications…"
                aria-label="Search notifications"
                className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border/60 bg-muted/20 px-3.5 py-2 text-xs">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'unread', label: `Unread (${unreadCount})` },
                ] as { id: Tab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 font-medium transition-all ${
                    tab === t.id
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="max-h-[380px] overflow-y-auto bg-popover">
              {listQuery.isPending ? (
                <div className="space-y-2 p-3" aria-label="Loading notifications">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                        <div className="h-2.5 w-full animate-pulse rounded bg-muted/60" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : listQuery.isError ? (
                <QueryError
                  compact
                  message="Couldn't load notifications."
                  onRetry={() => listQuery.refetch()}
                  className="justify-center p-4"
                />
              ) : items.length === 0 ? (
                <div className="space-y-1.5 p-8 text-center">
                  <p className="text-xs font-semibold text-foreground">
                    {debounced
                      ? 'No matching notifications'
                      : tab === 'unread'
                        ? 'No unread notifications'
                        : 'No notifications yet'}
                  </p>
                  <p className="mx-auto max-w-xs text-[11px] text-muted-foreground">
                    {debounced || tab === 'unread'
                      ? 'Try a different search or check back later.'
                      : 'Mentions, assignments, and comments will appear here.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {items.map((n) => (
                    <li key={n.id}>
                      <NotificationRow
                        variant="compact"
                        notification={n}
                        onOpen={openNotification}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <Link
              to="/notifications"
              onClick={requestClose}
              className="flex items-center justify-center gap-1.5 border-t border-border bg-muted/30 p-2.5 text-[11px] font-medium text-primary hover:bg-muted/50"
            >
              View all notifications
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
