import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Inbox as InboxIcon,
  Bell,
  MessageSquare,
  CheckSquare,
  GitPullRequest,
  Archive,
  Clock,
  Star,
  Plus,
  X,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api';
import { useDialogClose } from '../hooks/useDialogClose';
import { usePageMetadata } from '../hooks/usePageMetadata';

type InboxSource = 'notification' | 'dm' | 'task' | 'git';

interface InboxItem {
  key: string;
  source: InboxSource;
  eventTs: string;
  refId: string;
  title: string;
  snippet?: string;
  unreadCount?: number;
  eventType?: string;
  cardId?: string;
  cardKey?: string;
  channelId?: string;
  linkState?: string;
}

const SOURCE_META: Record<InboxSource, { label: string; Icon: typeof Bell }> = {
  notification: { label: 'Notifications', Icon: Bell },
  dm: { label: 'Direct messages', Icon: MessageSquare },
  task: { label: 'My tasks', Icon: CheckSquare },
  git: { label: 'Code reviews', Icon: GitPullRequest },
};

const SNOOZE_PRESETS = [
  { value: '1h', label: '1 hour' },
  { value: '3h', label: '3 hours' },
  { value: 'tomorrow', label: 'Tomorrow 9am' },
] as const;

function itemTarget(item: InboxItem): string | null {
  if (item.source === 'dm' && item.channelId) return `/chat/${item.channelId}`;
  if (item.cardId) return '/my-tasks';
  return null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Inbox() {
  usePageMetadata({ title: 'Inbox' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [snoozeFor, setSnoozeFor] = useState<InboxItem | null>(null);
  const [subtaskFor, setSubtaskFor] = useState<InboxItem | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const listQuery = useInfiniteQuery({
    queryKey: ['inbox'],
    queryFn: async ({ pageParam }: { pageParam?: string | null }) => {
      const { data } = await api.get('/inbox', {
        params: { limit: 30, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return data as { items: InboxItem[]; nextCursor: string | null };
    },
    getNextPageParam: (last) => last.nextCursor,
    initialPageParam: null as string | null,
  });

  const items = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items),
    [listQuery.data]
  );
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const archiveMany = useMutation({
    mutationFn: async (targets: InboxItem[]) => {
      for (const t of targets) await api.post(`/inbox/${t.source}/${t.refId}/archive`);
    },
    onSuccess: (_d, targets) => {
      invalidate();
      setSelected(new Set());
      setSelectMode(false);
      setAnnouncement(`${targets.length} archived`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not archive. Please try again.')),
  });

  const archiveWithUndo = useCallback(
    (targets: InboxItem[]) => {
      archiveMany.mutate(targets, {
        onSuccess: () => {
          toast('Archived', {
            description: `${targets.length} item${targets.length === 1 ? '' : 's'} archived.`,
            action: {
              label: 'Undo',
              onClick: () =>
                (async () => {
                  try {
                    for (const t of targets) await api.post(`/inbox/${t.source}/${t.refId}/undo`);
                    invalidate();
                    setAnnouncement('Archive undone');
                  } catch (err) {
                    toast.error(getApiErrorMessage(err, 'Could not undo archive.'));
                  }
                })(),
            },
            duration: 5000,
          });
        },
      });
    },
    [archiveMany]
  );

  const snoozeMutation = useMutation({
    mutationFn: async ({ item, until }: { item: InboxItem; until: string }) =>
      (await api.post(`/inbox/${item.source}/${item.refId}/snooze`, { until })).data,
    onSuccess: () => {
      invalidate();
      setSnoozeFor(null);
      setAnnouncement('Snoozed');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not snooze. Please try again.')),
  });

  const starMutation = useMutation({
    mutationFn: async (notificationId: string) =>
      (await api.patch(`/notifications/${notificationId}/star`, { starred: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not star. Please try again.')),
  });

  const subtaskMutation = useMutation({
    mutationFn: async ({ item, title }: { item: InboxItem; title: string }) => {
      const parentId = item.cardId || item.refId;
      const { data: parent } = await api.get(`/cards/${parentId}`);
      const listId = parent.listId || parent.list?.id;
      if (!listId) throw new Error('Could not determine the parent task column.');
      return (await api.post('/cards', { listId, title, parentCardId: parentId })).data;
    },
    onSuccess: () => {
      invalidate();
      setSubtaskFor(null);
      setSubtaskTitle('');
      setAnnouncement('Subtask created');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not create subtask.')),
  });

  const openItem = useCallback(
    (item: InboxItem) => {
      const target = itemTarget(item);
      if (!target) {
        toast.error('This item is no longer available.');
        return;
      }
      navigate(target);
    },
    [navigate]
  );

  // Snooze dialog: single close path (Esc/backdrop/X → requestClose).
  const snoozeDialog = useDialogClose({
    isOpen: snoozeFor !== null,
    onClose: () => setSnoozeFor(null),
  });
  const subtaskDialog = useDialogClose({
    isOpen: subtaskFor !== null,
    onClose: () => {
      setSubtaskFor(null);
      setSubtaskTitle('');
    },
  });

  // Keyboard triage: j/k move, Enter open, S snooze, I subtask, T star, E archive.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        if (e.key === 'Escape') (document.activeElement as HTMLElement)?.blur();
        return;
      }
      if (snoozeFor || subtaskFor) return;
      if (items.length === 0) return;
      const idx = focusedKey ? items.findIndex((i) => i.key === focusedKey) : -1;
      const move = (dir: 1 | -1) => {
        const next = items[(idx + dir + items.length) % items.length]!;
        setFocusedKey(next.key);
        rowRefs.current.get(next.key)?.scrollIntoView({ block: 'nearest' });
      };
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter' && idx >= 0) {
        openItem(items[idx]!);
      } else if ((e.key === 's' || e.key === 'S') && idx >= 0) {
        e.preventDefault();
        const item = items[idx]!;
        if (item.source === 'task') toast.error('Tasks are dismiss-only (no snooze).');
        else setSnoozeFor(item);
      } else if ((e.key === 'i' || e.key === 'I') && idx >= 0) {
        e.preventDefault();
        const item = items[idx]!;
        if (!item.cardId && item.source !== 'task')
          toast.error('Subtasks can only be created from tasks.');
        else {
          setSubtaskTitle('');
          setSubtaskFor(item);
        }
      } else if ((e.key === 't' || e.key === 'T') && idx >= 0) {
        e.preventDefault();
        const item = items[idx]!;
        if (item.source !== 'notification') toast.error('Only notifications can be starred.');
        else starMutation.mutate(item.refId);
      } else if ((e.key === 'e' || e.key === 'E') && idx >= 0) {
        e.preventDefault();
        archiveWithUndo([items[idx]!]);
      } else if (e.key === 'Escape' && selectMode) {
        setSelected(new Set());
        setSelectMode(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    items,
    focusedKey,
    selectMode,
    snoozeFor,
    subtaskFor,
    openItem,
    archiveWithUndo,
    starMutation,
  ]);

  // Infinite scroll sentinel.
  useEffect(() => {
    if (!listQuery.hasNextPage || listQuery.isFetchingNextPage) return;
    const el = document.getElementById('inbox-sentinel');
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void listQuery.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.hasNextPage, listQuery.isFetchingNextPage, listQuery.dataUpdatedAt]);

  const grouped = useMemo(() => {
    const order: InboxSource[] = ['notification', 'dm', 'task', 'git'];
    return order
      .map((source) => ({ source, items: items.filter((i) => i.source === source) }))
      .filter((g) => g.items.length > 0);
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 sm:px-4 py-4 sm:py-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <InboxIcon className="w-5 h-5" /> Inbox
        </h1>
        <div className="flex items-center gap-2">
          {selectMode && selected.size > 0 && (
            <button
              type="button"
              onClick={() => archiveWithUndo(items.filter((i) => selected.has(i.key)))}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" /> Archive ({selected.size})
            </button>
          )}
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            j/k navigate · Enter open · S snooze · I subtask · T star · E archive
          </span>
        </div>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading triage…</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-destructive py-8 text-center">
          Could not load the inbox.{' '}
          <button
            type="button"
            onClick={() => void listQuery.refetch()}
            className="underline cursor-pointer"
          >
            Retry
          </button>
        </p>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <InboxIcon className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">All caught up</p>
          <p className="text-xs text-muted-foreground mt-1">
            Mentions, DMs, tasks and reviews land here.
          </p>
        </div>
      ) : (
        grouped.map(({ source, items: group }) => {
          const { label, Icon } = SOURCE_META[source];
          return (
            <section key={source} aria-label={label} className="mt-5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 px-1">
                <Icon className="w-3.5 h-3.5" /> {label} ({group.length})
              </h2>
              <ul className="mt-2 space-y-2">
                {group.map((item) => {
                  const focused = item.key === focusedKey;
                  const checked = selected.has(item.key);
                  return (
                    <li
                      key={item.key}
                      ref={(el) => {
                        if (el) rowRefs.current.set(item.key, el);
                        else rowRefs.current.delete(item.key);
                      }}
                      onClick={() => setFocusedKey(item.key)}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border bg-card transition-colors cursor-pointer min-w-0 ${
                        focused
                          ? 'border-primary/60 ring-1 ring-primary/30'
                          : 'border-border/80 hover:bg-muted/40'
                      }`}
                    >
                      {selectMode && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.title}`}
                          checked={checked}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.key)) next.delete(item.key);
                              else next.add(item.key);
                              return next;
                            })
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => openItem(item)}
                            className="font-medium text-sm truncate hover:underline text-left cursor-pointer min-w-0"
                          >
                            {item.title}
                          </button>
                          {typeof item.unreadCount === 'number' && item.unreadCount > 0 && (
                            <span className="shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                              {item.unreadCount}
                            </span>
                          )}
                        </div>
                        {item.snippet && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.snippet}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" /> {timeAgo(item.eventTs)}
                          {item.cardKey && <span className="font-mono">{item.cardKey}</span>}
                          {item.linkState && <span>{item.linkState.replace('_', ' ')}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {item.source === 'notification' && (
                          <button
                            type="button"
                            aria-label={`Star ${item.title}`}
                            title="Star (T)"
                            onClick={(e) => {
                              e.stopPropagation();
                              starMutation.mutate(item.refId);
                            }}
                            className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        {item.source !== 'task' && (
                          <button
                            type="button"
                            aria-label={`Snooze ${item.title}`}
                            title="Snooze (S)"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSnoozeFor(item);
                            }}
                            className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Archive ${item.title}`}
                          title="Archive (E)"
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveWithUndo([item]);
                          }}
                          className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      <div id="inbox-sentinel" className="h-4" />
      {listQuery.isFetchingNextPage && (
        <p className="text-xs text-muted-foreground text-center py-2">Loading more…</p>
      )}

      {/* Snooze dialog (single close path via useDialogClose). */}
      {snoozeFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onMouseDown={(e) => snoozeDialog.handleOverlayClick(e)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Snooze ${snoozeFor.title}`}
            className="relative w-full max-w-xs rounded-xl border border-border bg-card p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Snooze until</h3>
              <button
                type="button"
                aria-label="Close snooze dialog"
                onClick={() => snoozeDialog.requestClose()}
                className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md hover:bg-muted cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {SNOOZE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  disabled={snoozeMutation.isPending}
                  onClick={() => snoozeMutation.mutate({ item: snoozeFor, until: p.value })}
                  className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-muted/60 disabled:opacity-50 cursor-pointer text-left"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Subtask dialog (title + create; parent locked). */}
      {subtaskFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onMouseDown={(e) => subtaskDialog.handleOverlayClick(e)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Create subtask of ${subtaskFor.title}`}
            className="relative w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Create subtask</h3>
              <button
                type="button"
                aria-label="Close subtask dialog"
                onClick={() => subtaskDialog.requestClose()}
                className="p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md hover:bg-muted cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              Parent: {subtaskFor.cardKey ? `${subtaskFor.cardKey} ` : ''}
              {subtaskFor.title}
            </p>
            <input
              autoFocus
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && subtaskTitle.trim())
                  subtaskMutation.mutate({ item: subtaskFor, title: subtaskTitle.trim() });
              }}
              placeholder="Subtask title"
              aria-label="Subtask title"
              className="mt-3 w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => subtaskDialog.requestClose()}
                className="h-9 px-3 rounded-md border border-border text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!subtaskTitle.trim() || subtaskMutation.isPending}
                title={!subtaskTitle.trim() ? 'Enter a title first' : undefined}
                onClick={() =>
                  subtaskMutation.mutate({ item: subtaskFor, title: subtaskTitle.trim() })
                }
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
