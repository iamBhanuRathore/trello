import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Link2,
  Unlink,
  RefreshCw,
  Flag,
  Zap,
  MousePointerClick,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  format,
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  setHours,
  setMinutes,
} from 'date-fns';
import {
  calendarService,
  describeCalendarError,
  type CalendarFeed,
  type CalendarExternal,
} from '../lib/calendarService';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { CardModal } from '../components/board/CardModal';
import { EventPopover, type CalendarSelection } from '../components/calendar/EventPopover';
import {
  QuickCreatePopover,
  type QuickCreateValue,
} from '../components/calendar/QuickCreatePopover';

type CalendarView = 'month' | 'week' | 'day';

const HOUR_H = 56;
const SNAP_MIN = 15;

function snapMinutes(mins: number): number {
  return Math.round(mins / SNAP_MIN) * SNAP_MIN;
}

function atTime(day: Date, mins: number): Date {
  const snapped = snapMinutes(mins);
  return setMinutes(setHours(day, Math.floor(snapped / 60)), snapped % 60);
}

function toISO(d: Date): string {
  return d.toISOString();
}

export function Calendar() {
  const [view, setView] = useState<CalendarView>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [placeTaskId, setPlaceTaskId] = useState<string | null>(null);
  const [isTrayOpen, setIsTrayOpen] = useState(true);
  const [selection, setSelection] = useState<{
    selection: CalendarSelection;
    anchor: { x: number; y: number };
  } | null>(null);
  const [createDraft, setCreateDraft] = useState<{
    day: Date;
    mins: number;
    anchor: { x: number; y: number };
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Visible range drives the feed query
  const range = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
      return { from: toISO(start), to: toISO(end) };
    }
    if (view === 'week') {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return { from: toISO(start), to: toISO(addDays(start, 7)) };
    }
    const start = new Date(cursor);
    start.setHours(0, 0, 0, 0);
    return { from: toISO(start), to: toISO(addDays(start, 1)) };
  }, [view, cursor]);

  const { data: feed, isFetching: isFeedFetching } = useQuery<CalendarFeed>({
    queryKey: ['calendar', 'feed', range.from, range.to],
    queryFn: () => calendarService.feed(range.from, range.to),
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });

  const { data: googleStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['calendar', 'google-status'],
    queryFn: () => calendarService.status(),
    staleTime: 60000,
  });

  // OAuth redirect feedback (?connected=1 / ?error=…)
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      toast.success('Google Calendar connected');
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['calendar', 'feed'] });
      searchParams.delete('connected');
      setSearchParams(searchParams, { replace: true });
    } else if (error) {
      toast.error(`Google connect failed: ${error}`);
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEscapeKey(() => {
    if (placeTaskId) setPlaceTaskId(null);
  }, !!placeTaskId);

  // Keyboard navigation (skipped while typing or when a popover/modal is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (selection || createDraft || activeCardId) return;
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nav(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nav(1);
      } else if (k === 't') {
        e.preventDefault();
        setCursor(new Date());
      } else if (k === 'm') {
        setView('month');
      } else if (k === 'w') {
        setView('week');
      } else if (k === 'd') {
        setView('day');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor, selection, createDraft, activeCardId, placeTaskId]);

  const scheduleMutation = useMutation({
    mutationFn: ({
      cardId,
      start,
      end,
    }: {
      cardId: string;
      start: string | null;
      end?: string | null;
    }) => calendarService.schedule(cardId, start, end),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'feed'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
    onError: (err: any) => {
      toast.error(describeCalendarError(err, 'Failed to schedule task'));
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const pull = await calendarService.pull().catch(() => ({ events: [] }));
      const push = await calendarService.push().catch(() => ({ pushed: 0, failed: 0 }));
      return { pullCount: pull.events.length, ...push };
    },
    onSuccess: (r) => {
      toast.success(`Synced — ${r.pullCount} Google events, ${r.pushed} tasks pushed`);
      queryClient.invalidateQueries({ queryKey: ['calendar', 'feed'] });
      refetchStatus();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Sync failed');
    },
  });

  const invalidateFeed = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar', 'feed'] });
  };

  const createExternalMutation = useMutation({
    mutationFn: (payload: { title: string; start: string; end: string }) =>
      calendarService.createExternalEvent(payload),
    onSuccess: () => {
      toast.success('Meeting created on Google Calendar');
      setCreateDraft(null);
      invalidateFeed();
    },
    onError: (err: any) => {
      toast.error(describeCalendarError(err, 'Failed to create meeting'));
    },
  });

  const updateExternalMutation = useMutation({
    mutationFn: (payload: { eventId: string; start?: string; end?: string; title?: string }) =>
      calendarService.updateExternalEvent(payload.eventId, {
        start: payload.start,
        end: payload.end,
        title: payload.title,
      }),
    onSuccess: () => invalidateFeed(),
    onError: (err: any) => {
      toast.error(describeCalendarError(err, 'Failed to move meeting'));
      invalidateFeed();
    },
  });

  const deleteExternalMutation = useMutation({
    mutationFn: (eventId: string) => calendarService.deleteExternalEvent(eventId),
    onSuccess: () => {
      toast.success('Meeting deleted from Google Calendar');
      setSelection(null);
      invalidateFeed();
    },
    onError: (err: any) => {
      toast.error(describeCalendarError(err, 'Failed to delete meeting'));
    },
  });

  const addMeetMutation = useMutation({
    mutationFn: (eventId: string) =>
      calendarService.updateExternalEvent(eventId, { addConference: true }),
    onSuccess: (res, eventId) => {
      toast.success('Google Meet link added');
      // Flip the open popover to Join mode instantly; feed refresh follows.
      setSelection((prev) => {
        if (!prev || prev.selection.kind !== 'external' || prev.selection.event.id !== eventId) {
          return prev;
        }
        return {
          ...prev,
          selection: {
            ...prev.selection,
            event: { ...prev.selection.event, hangoutLink: res.hangoutLink || undefined },
          },
        };
      });
      invalidateFeed();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to add Meet link');
    },
  });

  const unscheduleMutation = useMutation({
    mutationFn: (cardId: string) => calendarService.schedule(cardId, null, null),
    onSuccess: () => {
      toast.success('Time block removed');
      setSelection(null);
      invalidateFeed();
    },
    onError: (err: any) => {
      toast.error(describeCalendarError(err, 'Failed to remove block'));
    },
  });

  const handleQuickCreate = (value: QuickCreateValue) => {
    if (!createDraft) return;
    if (value.mode === 'meeting') {
      const start = atTime(createDraft.day, createDraft.mins);
      createExternalMutation.mutate({
        title: value.title,
        start: toISO(start),
        end: toISO(new Date(start.getTime() + 60 * 60_000)),
      });
    } else if (value.taskId) {
      const start = atTime(createDraft.day, createDraft.mins);
      scheduleMutation.mutate({
        cardId: value.taskId,
        start: toISO(start),
        end: toISO(new Date(start.getTime() + 60 * 60_000)),
      });
      setCreateDraft(null);
    }
  };

  const connectGoogle = async () => {
    try {
      window.location.href = await calendarService.authUrl();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Google sync is not configured');
    }
  };

  const disconnectGoogle = async () => {
    try {
      await calendarService.disconnect();
      toast.success('Google Calendar disconnected');
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['calendar', 'feed'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to disconnect');
    }
  };

  const days = useMemo(() => {
    if (view === 'month') {
      return eachDayOfInterval({
        start: new Date(range.from),
        end: addDays(new Date(range.to), -1),
      });
    }
    if (view === 'week') {
      const start = new Date(range.from);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return [new Date(range.from)];
  }, [view, range]);

  const placeTask = feed?.unscheduled.find((t) => t.id === placeTaskId) || null;

  const title = useMemo(() => {
    if (view === 'month') return format(cursor, 'MMMM yyyy');
    if (view === 'week') {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return `${format(start, 'MMM d')} – ${format(addDays(start, 6), 'MMM d, yyyy')}`;
    }
    return format(cursor, 'EEEE, MMM d, yyyy');
  }, [view, cursor]);

  const nav = (dir: number) => {
    if (view === 'month') setCursor(addMonths(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-1 mr-1">
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label="Previous"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label="Next"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <h2 className="text-base font-bold tracking-tight mr-1">{title}</h2>
        <span
          className="text-[10px] font-mono text-muted-foreground border border-border/60 rounded-md px-1.5 py-0.5 mr-2 hidden sm:inline"
          title="All times shown in your local timezone"
        >
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </span>
        {isFeedFetching && (
          <span className="text-[10px] text-muted-foreground animate-pulse mr-2 hidden sm:inline">
            Updating…
          </span>
        )}

        <div className="flex items-center rounded-xl bg-muted/50 border border-border p-0.5">
          {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                view === v
                  ? 'bg-background shadow-xs text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {placeTask && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-semibold animate-pulse">
              <MousePointerClick className="w-3 h-3" />
              Placing “{placeTask.title.slice(0, 24)}” — click a slot (Esc to cancel)
            </span>
          )}
          <GoogleSyncBadge
            googleStatus={googleStatus}
            onConnect={connectGoogle}
            onDisconnect={disconnectGoogle}
            onSync={() => syncMutation.mutate()}
            isSyncing={syncMutation.isPending}
          />
          <button
            type="button"
            onClick={() => setIsTrayOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Unscheduled ({feed?.unscheduled.length || 0})</span>
          </button>
        </div>
      </div>

      {/* Sprint overlay strip */}
      {feed?.sprints.length || feed?.milestones.length ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-6 py-2 border-b border-border/60 bg-muted/20 shrink-0">
          {(feed?.sprints || []).map((s) => (
            <span
              key={s.id}
              title={`${s.name} (${s.start} → ${s.end})`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 text-[11px] font-semibold"
            >
              <Zap className="w-3 h-3" />
              {s.name}
            </span>
          ))}
          {(feed?.milestones || []).map((m) => (
            <span
              key={m.id}
              title={`${m.name} (${m.start} → ${m.end})`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-400 text-[11px] font-semibold"
            >
              <Flag className="w-3 h-3" />
              {m.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0">
        {/* Main grid */}
        <div className="flex-1 min-w-0 overflow-auto">
          {view === 'month' ? (
            <MonthGrid
              days={days}
              cursor={cursor}
              feed={feed}
              onOpenTask={setActiveCardId}
              onSelectDay={(d) => {
                setCursor(d);
                setView('day');
              }}
              onSelectTask={(block, anchor) =>
                setSelection({
                  selection: {
                    kind: 'task',
                    id: block.id,
                    key: block.key,
                    title: block.title,
                    start: block.start,
                    end: block.end,
                    googleUrl: block.googleUrl || null,
                  },
                  anchor,
                })
              }
              onSelectExternal={(event, anchor) =>
                setSelection({ selection: { kind: 'external', event }, anchor })
              }
            />
          ) : (
            <TimeGrid
              days={days}
              feed={feed}
              placeTaskId={placeTaskId}
              onPlace={(day, mins) => {
                if (!placeTaskId) return;
                const start = atTime(day, mins);
                scheduleMutation.mutate({
                  cardId: placeTaskId,
                  start: toISO(start),
                  end: toISO(new Date(start.getTime() + 60 * 60_000)),
                });
                setPlaceTaskId(null);
              }}
              onMove={(cardId, day, mins, durationMin) => {
                const start = atTime(day, mins);
                scheduleMutation.mutate({
                  cardId,
                  start: toISO(start),
                  end: toISO(new Date(start.getTime() + durationMin * 60_000)),
                });
              }}
              onResize={(cardId, day, startISO, mins) => {
                const start = new Date(startISO);
                const end = atTime(day, mins);
                if (end > start) {
                  scheduleMutation.mutate({ cardId, start: start.toISOString(), end: toISO(end) });
                }
              }}
              onOpenTask={setActiveCardId}
              onSelectTask={(block, anchor) =>
                setSelection({
                  selection: {
                    kind: 'task',
                    id: block.id,
                    key: block.key,
                    title: block.title,
                    start: block.start,
                    end: block.end,
                    googleUrl: block.googleUrl || null,
                  },
                  anchor,
                })
              }
              onSelectExternal={(event, anchor) =>
                setSelection({ selection: { kind: 'external', event }, anchor })
              }
              onEmptyClick={(day, mins, clientX, clientY) => {
                if (placeTaskId) return;
                setCreateDraft({
                  day,
                  mins: snapMinutes(mins),
                  anchor: {
                    x: Math.min(clientX, window.innerWidth - 340),
                    y: Math.min(clientY, window.innerHeight - 320),
                  },
                });
              }}
              onExternalMove={(eventId, day, mins, durationMin) => {
                const start = atTime(day, mins);
                updateExternalMutation.mutate({
                  eventId,
                  start: toISO(start),
                  end: toISO(new Date(start.getTime() + durationMin * 60_000)),
                });
              }}
              onExternalResize={(eventId, startISO, day, mins) => {
                const start = new Date(startISO);
                const end = atTime(day, mins);
                if (end > start) {
                  updateExternalMutation.mutate({
                    eventId,
                    start: start.toISOString(),
                    end: toISO(end),
                  });
                }
              }}
            />
          )}
        </div>

        {/* Unscheduled tray */}
        {isTrayOpen && (
          <aside className="w-64 shrink-0 border-l border-border bg-card/40 flex flex-col min-h-0">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
              <p className="text-xs font-bold">Unscheduled</p>
              <button
                type="button"
                onClick={() => setIsTrayOpen(false)}
                aria-label="Close unscheduled panel"
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {(feed?.unscheduled || []).length === 0 &&
                ((feed?.blocks || []).length > 0 || (feed?.dueDates || []).length > 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-6">
                    Nothing unscheduled — every assigned task has a time block.
                  </p>
                ) : (
                  <div className="text-center py-6 space-y-2">
                    <p className="text-xs font-semibold">No tasks on your plate</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Tasks assigned to you appear here.
                      <br />
                      Create a workspace, add a board, and assign yourself a card — then drag it
                      onto the calendar.
                    </p>
                  </div>
                ))}
              {(feed?.unscheduled || []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPlaceTaskId(placeTaskId === t.id ? null : t.id)}
                  title="Click, then click a calendar slot to schedule"
                  className={`w-full text-left p-2 rounded-xl border transition-all cursor-pointer ${
                    placeTaskId === t.id
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border/60 bg-background hover:border-primary/40'
                  }`}
                >
                  <p className="text-xs font-semibold truncate">
                    {t.key ? (
                      <span className="font-mono text-muted-foreground">{t.key} </span>
                    ) : null}
                    {t.title}
                  </p>
                  {t.dueDate && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Due {format(new Date(t.dueDate), 'MMM d, h:mm a')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      <CardModal
        cardId={activeCardId}
        open={!!activeCardId}
        onOpenChange={(open) => {
          if (!open) {
            setActiveCardId(null);
            queryClient.invalidateQueries({ queryKey: ['calendar', 'feed'] });
          }
        }}
        onSelectCard={(id) => setActiveCardId(id)}
      />

      {selection && (
        <EventPopover
          anchor={selection.anchor}
          selection={selection.selection}
          onClose={() => setSelection(null)}
          onOpenTask={(id) => {
            setSelection(null);
            setActiveCardId(id);
          }}
          onUnscheduleTask={(id) => unscheduleMutation.mutate(id)}
          onDeleteExternal={(id) => deleteExternalMutation.mutate(id)}
          onAddMeet={(id) => addMeetMutation.mutate(id)}
          isWorking={
            unscheduleMutation.isPending ||
            deleteExternalMutation.isPending ||
            addMeetMutation.isPending
          }
        />
      )}

      {createDraft && (
        <QuickCreatePopover
          anchor={createDraft.anchor}
          slotLabel={format(atTime(createDraft.day, createDraft.mins), 'EEE, MMM d · h:mm a')}
          unscheduled={feed?.unscheduled || []}
          googleConnected={!!googleStatus?.connected}
          isWorking={createExternalMutation.isPending || scheduleMutation.isPending}
          onClose={() => setCreateDraft(null)}
          onConfirm={handleQuickCreate}
        />
      )}
    </div>
  );
}

function GoogleSyncBadge({
  googleStatus,
  onConnect,
  onDisconnect,
  onSync,
  isSyncing,
}: {
  googleStatus?: { configured: boolean; connected: boolean; connection?: any };
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  isSyncing: boolean;
}) {
  if (!googleStatus) return null;
  if (!googleStatus.configured) {
    return (
      <span
        title="Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / CALENDAR_TOKEN_KEY to enable"
        className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border text-[11px] text-muted-foreground"
      >
        <CalendarDays className="w-3.5 h-3.5" />
        Google sync off
      </span>
    );
  }
  if (!googleStatus.connected) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all cursor-pointer shadow-sm"
      >
        <Link2 className="w-3.5 h-3.5" />
        Connect Google
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-[11px]">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span className="font-semibold text-emerald-700 dark:text-emerald-400 max-w-[140px] truncate hidden sm:inline">
        {googleStatus.connection?.email || 'Google connected'}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={isSyncing}
        title="Sync now (pull events, push scheduled tasks)"
        className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
      </button>
      <button
        type="button"
        onClick={onDisconnect}
        title="Disconnect Google Calendar"
        className="p-1 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
      >
        <Unlink className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

/* ─── Month grid ─────────────────────────────────────────────────────────── */

function MonthGrid({
  days,
  cursor,
  feed,
  onOpenTask,
  onSelectDay,
  onSelectTask,
  onSelectExternal,
}: {
  days: Date[];
  cursor: Date;
  feed?: CalendarFeed;
  onOpenTask: (id: string) => void;
  onSelectDay: (d: Date) => void;
  onSelectTask: (
    block: {
      id: string;
      key?: string | null;
      title: string;
      start: string;
      end?: string | null;
      googleUrl?: string | null;
    },
    anchor: { x: number; y: number }
  ) => void;
  onSelectExternal: (event: CalendarExternal, anchor: { x: number; y: number }) => void;
}) {
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();
  return (
    <div className="grid grid-cols-7 auto-rows-fr min-h-full" style={{ minHeight: '100%' }}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <div
          key={d}
          className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground border-b border-border/60 uppercase tracking-wide"
        >
          {d}
        </div>
      ))}
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const blocks = (feed?.blocks || []).filter(
          (b) => format(new Date(b.start), 'yyyy-MM-dd') === key
        );
        const dues = (feed?.dueDates || []).filter(
          (d) => format(new Date(d.start), 'yyyy-MM-dd') === key
        );
        const externals = (feed?.external || []).filter(
          (e) => e.start && format(new Date(e.start), 'yyyy-MM-dd') === key
        );
        return (
          <button
            key={key + day.getMonth()}
            type="button"
            onClick={() => onSelectDay(day)}
            className={`min-h-[96px] p-1.5 border-b border-r border-border/40 text-left align-top transition-colors hover:bg-muted/30 cursor-pointer ${
              inMonth(day) ? '' : 'bg-muted/20 opacity-60'
            } ${isToday(day) ? 'bg-primary/5' : ''}`}
          >
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold ${
                isToday(day) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {format(day, 'd')}
            </span>
            <span className="mt-1 space-y-0.5 block">
              {blocks.slice(0, 2).map((b) => (
                <span
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onSelectTask(b, { x: r.left, y: r.bottom + 6 });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpenTask(b.id);
                  }}
                  className="block truncate px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-semibold hover:bg-primary/25 cursor-pointer"
                >
                  {format(new Date(b.start), 'HH:mm')} {b.key ? `${b.key} ` : ''}
                  {b.title}
                </span>
              ))}
              {dues.slice(0, 2).map((d) => (
                <span
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onSelectTask(
                      { id: d.id, key: d.key, title: d.title, start: d.start },
                      { x: r.left, y: r.bottom + 6 }
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpenTask(d.id);
                  }}
                  className="flex items-center gap-1 truncate px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-semibold hover:bg-amber-500/20 cursor-pointer"
                >
                  <Flag className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{d.title}</span>
                </span>
              ))}
              {externals.slice(0, 1).map((e) => (
                <span
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                    onSelectExternal(e, { x: r.left, y: r.bottom + 6 });
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                      onSelectExternal(e, { x: r.left, y: r.bottom + 6 });
                    }
                  }}
                  className="block truncate px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] hover:text-foreground cursor-pointer"
                >
                  {e.start ? format(new Date(e.start), 'HH:mm') : ''} {e.summary}
                </span>
              ))}
              {blocks.length + dues.length + externals.length > 5 && (
                <span className="block text-[10px] text-muted-foreground px-1.5">
                  +{blocks.length + dues.length + externals.length - 5} more
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Week / Day time grid with drag scheduling ──────────────────────────── */

interface DragState {
  mode: 'move' | 'resize' | 'create';
  kind: 'task' | 'external';
  cardId?: string;
  day: Date;
  startMins: number;
  curMins: number;
  origDurationMin: number;
  pointerId: number;
  topOffset: number;
}

interface PendingPress {
  kind: 'task' | 'external';
  id: string;
  startISO: string;
  endISO?: string | null;
  x: number;
  y: number;
  pointerId: number;
}

function TimeGrid({
  days,
  feed,
  placeTaskId,
  onPlace,
  onMove,
  onResize,
  onOpenTask,
  onSelectTask,
  onSelectExternal,
  onEmptyClick,
  onExternalMove,
  onExternalResize,
}: {
  days: Date[];
  feed?: CalendarFeed;
  placeTaskId: string | null;
  onPlace: (day: Date, mins: number) => void;
  onMove: (cardId: string, day: Date, mins: number, durationMin: number) => void;
  onResize: (cardId: string, day: Date, startISO: string, mins: number) => void;
  onOpenTask: (id: string) => void;
  onSelectTask: (
    block: {
      id: string;
      key?: string | null;
      title: string;
      start: string;
      end?: string | null;
      googleUrl?: string | null;
    },
    anchor: { x: number; y: number }
  ) => void;
  onSelectExternal: (event: CalendarExternal, anchor: { x: number; y: number }) => void;
  onEmptyClick: (day: Date, mins: number, clientX: number, clientY: number) => void;
  onExternalMove: (eventId: string, day: Date, mins: number, durationMin: number) => void;
  onExternalResize: (eventId: string, startISO: string, day: Date, mins: number) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingPress | null>(null);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Header height varies with all-day chips — measure the target column.
  const headerOffset = useCallback((dayIndex: number): number => {
    const header = gridRef.current?.querySelector(`[data-cal-dayheader="${dayIndex}"]`);
    return header ? (header as HTMLElement).getBoundingClientRect().height : 28;
  }, []);

  const minsFromEvent = useCallback(
    (e: React.PointerEvent, dayIndex: number): number => {
      const grid = gridRef.current;
      if (!grid) return 9 * 60;
      const rect = grid.getBoundingClientRect();
      const y = e.clientY - rect.top - headerOffset(dayIndex);
      return Math.max(0, Math.min(24 * 60, (y / HOUR_H) * 60));
    },
    [headerOffset]
  );

  const dayIndexFromEvent = useCallback(
    (e: React.PointerEvent): number => {
      const grid = gridRef.current;
      if (!grid) return 0;
      const rect = grid.getBoundingClientRect();
      const x = e.clientX - rect.left - 48; // gutter offset
      return Math.max(
        0,
        Math.min(days.length - 1, Math.floor(x / ((rect.width - 48) / days.length)))
      );
    },
    [days.length]
  );

  const anchorFromClient = (clientX: number, clientY: number) => ({
    x: Math.min(clientX, window.innerWidth - 300),
    y: Math.min(clientY + 6, window.innerHeight - 260),
  });

  const beginDragFromPending = (pending: PendingPress, dayIdx: number, mins: number) => {
    const start = new Date(pending.startISO);
    const end = pending.endISO ? new Date(pending.endISO) : new Date(start.getTime() + 60 * 60_000);
    setDrag({
      mode: 'move',
      kind: pending.kind,
      cardId: pending.id,
      day: days[dayIdx]!,
      startMins: start.getHours() * 60 + start.getMinutes(),
      curMins: mins,
      origDurationMin: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)),
      pointerId: pending.pointerId,
      topOffset: headerOffset(dayIdx),
      ...(pending.kind === 'external' ? { startISO: pending.startISO } : {}),
    } as DragState & { startISO?: string });
  };

  const handleGridPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return;
    pendingRef.current = null;
    if (!placeTaskId) {
      // Record for click-to-create (fires on pointerup if unmoved).
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      return;
    }
    const idx = dayIndexFromEvent(e);
    const mins = snapMinutes(minsFromEvent(e, idx));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({
      mode: 'create',
      kind: 'task',
      cardId: placeTaskId,
      day: days[idx]!,
      startMins: mins,
      curMins: mins,
      origDurationMin: 60,
      pointerId: e.pointerId,
      topOffset: headerOffset(idx),
    });
  };

  const handleGridPointerMove = (e: React.PointerEvent) => {
    if (drag) {
      if (e.pointerId !== drag.pointerId) return;
      const idx = dayIndexFromEvent(e);
      const mins = snapMinutes(minsFromEvent(e, idx));
      setDrag({ ...drag, day: days[idx]!, curMins: mins });
      return;
    }
    // Promote a block press to a drag past the movement threshold.
    const pending = pendingRef.current;
    if (pending && e.pointerId === pending.pointerId) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 5) {
        const idx = dayIndexFromEvent(e);
        const mins = snapMinutes(minsFromEvent(e, idx));
        pendingRef.current = null;
        beginDragFromPending(pending, idx, mins);
      }
    }
  };

  const handleGridPointerUp = (e: React.PointerEvent) => {
    if (drag) {
      if (e.pointerId !== drag.pointerId) return;
      const d = drag;
      setDrag(null);
      const lo = Math.min(d.startMins, d.curMins);
      if (d.mode === 'create' && d.cardId) {
        onPlace(d.day, lo);
      } else if (d.mode === 'move' && d.cardId) {
        if (d.kind === 'external') onExternalMove(d.cardId, d.day, lo, d.origDurationMin);
        else onMove(d.cardId, d.day, lo, d.origDurationMin);
      } else if (d.mode === 'resize' && d.cardId) {
        if (d.kind === 'external')
          onExternalResize(
            d.cardId,
            (d as any).startISO,
            d.day,
            Math.max(d.startMins + 15, d.curMins)
          );
        else onResize(d.cardId, d.day, (d as any).startISO, Math.max(d.startMins + 15, d.curMins));
      }
      return;
    }
    // Plain click on empty space → quick-create popover.
    const down = downRef.current;
    downRef.current = null;
    pendingRef.current = null;
    if (!down || placeTaskId) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const idx = dayIndexFromEvent(e);
    onEmptyClick(days[idx]!, snapMinutes(minsFromEvent(e, idx)), e.clientX, e.clientY);
  };

  // place-mode task id is captured into drag state at pointerdown.

  const startBlockPress = (
    e: React.PointerEvent,
    press: { kind: 'task' | 'external'; id: string; startISO: string; endISO?: string | null }
  ) => {
    e.stopPropagation();
    e.preventDefault();
    pendingRef.current = { ...press, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  const resolvePressUp = (e: React.PointerEvent) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || e.pointerId !== pending.pointerId) return;
    const anchor = anchorFromClient(e.clientX, e.clientY);
    if (pending.kind === 'task') {
      const block = (feed?.blocks || []).find((b) => b.id === pending.id);
      if (block) onSelectTask(block, anchor);
    } else {
      const event = (feed?.external || []).find((ev) => ev.id === pending.id);
      if (event) onSelectExternal(event, anchor);
    }
  };

  const startBlockDrag = (
    e: React.PointerEvent,
    block: { id: string; start: string; end?: string | null },
    mode: 'move' | 'resize'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const start = new Date(block.start);
    const end = block.end ? new Date(block.end) : new Date(start.getTime() + 60 * 60_000);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const blockDayIdx = days.findIndex((d) => isSameDay(d, start));
    setDrag({
      mode,
      kind: 'task',
      cardId: block.id,
      day: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      startMins,
      curMins: mode === 'resize' ? end.getHours() * 60 + end.getMinutes() : startMins,
      origDurationMin: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)),
      pointerId: e.pointerId,
      topOffset: headerOffset(blockDayIdx >= 0 ? blockDayIdx : 0),
      ...(mode === 'resize' ? { startISO: block.start } : {}),
    } as DragState & { startISO?: string });
  };

  const startExternalDrag = (
    e: React.PointerEvent,
    event: { id: string; start: string | null; end?: string | null },
    mode: 'move' | 'resize'
  ) => {
    if (!event.start) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : new Date(start.getTime() + 60 * 60_000);
    const startMins = start.getHours() * 60 + start.getMinutes();
    const blockDayIdx = days.findIndex((d) => isSameDay(d, start));
    setDrag({
      mode,
      kind: 'external',
      cardId: event.id,
      day: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      startMins,
      curMins: mode === 'resize' ? end.getHours() * 60 + end.getMinutes() : startMins,
      origDurationMin: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)),
      pointerId: e.pointerId,
      topOffset: headerOffset(blockDayIdx >= 0 ? blockDayIdx : 0),
      startISO: event.start,
    } as DragState & { startISO?: string });
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div
      ref={gridRef}
      onPointerDown={handleGridPointerDown}
      onPointerMove={handleGridPointerMove}
      onPointerUp={handleGridPointerUp}
      className={`relative grid select-none ${placeTaskId ? 'cursor-crosshair' : ''}`}
      style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}
      role="application"
      aria-label="Calendar time grid"
    >
      {/* Corner + day headers */}
      <div className="sticky top-0 z-10 bg-background border-b border-border/60 h-7" />
      {days.map((day, di) => (
        <div
          key={day.toISOString()}
          data-cal-dayheader={di}
          className={`sticky top-0 z-10 bg-background border-b border-l border-border/60 min-h-7 px-2 py-0.5 ${
            isSameDay(day, new Date())
              ? 'font-bold text-primary'
              : 'text-muted-foreground font-semibold'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] h-6">
            <span className="uppercase">{format(day, 'EEE')}</span>
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday(day) ? 'bg-primary text-primary-foreground' : ''}`}
            >
              {format(day, 'd')}
            </span>
          </div>
          {(feed?.external || [])
            .filter((e) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              if (!e.allDay) return false;
              if (e.start) return format(new Date(e.start), 'yyyy-MM-dd') === dayKey;
              if (e.end) {
                return format(new Date(new Date(e.end).getTime() - 1), 'yyyy-MM-dd') === dayKey;
              }
              return false;
            })
            .slice(0, 2)
            .map((e) => (
              <a
                key={e.id}
                href={e.htmlLink || undefined}
                target="_blank"
                rel="noreferrer"
                title={e.summary}
                onClick={(ev) => ev.stopPropagation()}
                className="block truncate px-1.5 py-px mb-0.5 rounded-md bg-muted text-muted-foreground text-[10px] hover:text-foreground"
              >
                {e.summary}
              </a>
            ))}
        </div>
      ))}

      {/* Hour rows */}
      {hours.map((h) => (
        <React.Fragment key={h}>
          <div
            className="text-[10px] font-mono text-muted-foreground text-right pr-2 border-r border-border/40"
            style={{ height: HOUR_H }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
          {days.map((day, di) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayBlocks = (feed?.blocks || []).filter(
              (b) => format(new Date(b.start), 'yyyy-MM-dd') === key
            );
            const dayDues = (feed?.dueDates || []).filter(
              (d) =>
                format(new Date(d.start), 'yyyy-MM-dd') === key &&
                new Date(d.start).getHours() === h
            );
            // External blocks render once in the midnight cell below with
            // absolute offsets — no hour filter (it hid non-midnight events).
            const dayExt = (feed?.external || []).filter(
              (e) => e.start && !e.allDay && format(new Date(e.start), 'yyyy-MM-dd') === key
            );
            return (
              <div
                key={key + h}
                className="relative border-b border-l border-border/40"
                style={{ height: HOUR_H }}
              >
                {h === 0 &&
                  (() => {
                    const timed = [
                      ...dayBlocks.map((b) => ({ id: `t:${b.id}`, start: b.start, end: b.end })),
                      ...dayExt.map((e) => ({ id: `e:${e.id}`, start: e.start!, end: e.end })),
                    ];
                    const layout = layoutDayColumns(timed);
                    return (
                      <>
                        {dayBlocks.map((b) => {
                          const l = layout.get(`t:${b.id}`) || { col: 0, cols: 1 };
                          return (
                            <BlockChip
                              key={b.id}
                              block={b}
                              dragActive={!!drag}
                              layoutStyle={columnStyle(l.col, l.cols)}
                              onOpen={() => onOpenTask(b.id)}
                              onSelect={(e) => {
                                const anchor = anchorFromClient(e.clientX, e.clientY);
                                onSelectTask(b, anchor);
                              }}
                              onPressStart={(e) =>
                                startBlockPress(e, {
                                  kind: 'task',
                                  id: b.id,
                                  startISO: b.start,
                                  endISO: b.end,
                                })
                              }
                              onPressUp={resolvePressUp}
                              onResizeStart={(e) => startBlockDrag(e, b, 'resize')}
                            />
                          );
                        })}
                        {dayExt.map((e) => {
                          const l = layout.get(`e:${e.id}`) || { col: 0, cols: 1 };
                          return (
                            <ExternalBlockChip
                              key={e.id}
                              event={e}
                              dragActive={!!drag}
                              layoutStyle={columnStyle(l.col, l.cols)}
                              onSelect={(ev) => {
                                const anchor = anchorFromClient(ev.clientX, ev.clientY);
                                onSelectExternal(e, anchor);
                              }}
                              onPressStart={(ev) =>
                                startBlockPress(ev, {
                                  kind: 'external',
                                  id: e.id,
                                  startISO: e.start!,
                                  endISO: e.end,
                                })
                              }
                              onPressUp={resolvePressUp}
                              onResizeStart={(ev) => startExternalDrag(ev, e, 'resize')}
                            />
                          );
                        })}
                      </>
                    );
                  })()}
                {dayDues.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenTask(d.id);
                    }}
                    title={`Due: ${d.title}`}
                    className="absolute left-1 top-0.5 inline-flex items-center gap-1 px-1.5 py-px rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-bold hover:bg-amber-500/25 cursor-pointer z-[5]"
                  >
                    <Flag className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[120px]">{d.title}</span>
                  </button>
                ))}
                {di === 0 && <span className="sr-only">{h}</span>}
              </div>
            );
          })}
        </React.Fragment>
      ))}

      {/* Drag ghost preview */}
      {drag && <DragGhost drag={drag} days={days} />}

      {/* Current-time indicator */}
      <NowLine days={days} headerOffset={headerOffset} gridRef={gridRef} />
    </div>
  );
}

function NowLine({
  days,
  headerOffset,
  gridRef,
}: {
  days: Date[];
  headerOffset: (dayIndex: number) => number;
  gridRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [now, setNow] = useState(() => new Date());
  const userScrolledRef = useRef(false);
  const scroller = useCallback(
    () => gridRef.current?.parentElement as HTMLElement | null,
    [gridRef]
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayIdx = days.findIndex((d) => isSameDay(d, now));
  const isToday = todayIdx >= 0;

  // Scroll the line into view on entry — once, until the user scrolls manually.
  useEffect(() => {
    if (!isToday || userScrolledRef.current) return;
    const container = scroller();
    if (!container) return;
    const top = headerOffset(todayIdx) + (now.getHours() * 60 + now.getMinutes()) * (HOUR_H / 60);
    container.scrollTop = Math.max(0, top - container.clientHeight / 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday]);

  useEffect(() => {
    const container = scroller();
    if (!container) return;
    const onScroll = () => {
      userScrolledRef.current = true;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [scroller, gridRef]);

  if (!isToday) return null;

  const top = headerOffset(todayIdx) + (now.getHours() * 60 + now.getMinutes()) * (HOUR_H / 60);
  const left = `calc(48px + (100% - 48px) * ${todayIdx} / ${days.length})`;
  const width = `calc((100% - 48px) / ${days.length})`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[7]"
      style={{ top, left, width, height: 0 }}
    >
      <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
      <span className="absolute left-1 right-0 top-[-1px] h-0.5 bg-red-500 rounded-full" />
    </div>
  );
}

function blockStyle(startISO: string, endISO?: string | null): React.CSSProperties {
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date(start.getTime() + 60 * 60_000);
  const top = (start.getHours() * 60 + start.getMinutes()) * (HOUR_H / 60);
  const height = Math.max(22, ((end.getTime() - start.getTime()) / 60000) * (HOUR_H / 60));
  return { top, height };
}

/**
 * Google-style overlap layout: concurrent blocks share the day width
 * side-by-side instead of stacking. Returns column assignment per id.
 */
function layoutDayColumns(
  items: { id: string; start: string; end?: string | null }[]
): Map<string, { col: number; cols: number }> {
  const withTimes = items.map((it) => {
    const s = new Date(it.start).getTime();
    const e = it.end ? new Date(it.end).getTime() : s + 60 * 60_000;
    return { id: it.id, s, e: Math.max(e, s + 15 * 60_000) };
  });
  // Union-find clusters of transitively overlapping intervals.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) || x;
    if (p !== x) parent.set(x, find(p));
    return parent.get(x) || x;
  };
  for (const it of withTimes) parent.set(it.id, it.id);
  const sorted = [...withTimes].sort((a, b) => a.s - b.s || a.e - b.e);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j]!.s < sorted[i]!.e; j++) {
      const a = find(sorted[i]!.id);
      const b = find(sorted[j]!.id);
      if (a !== b) parent.set(a, b);
    }
  }
  const clusters = new Map<string, typeof withTimes>();
  for (const it of withTimes) {
    const root = find(it.id);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(it);
  }
  // Greedy column packing per cluster (interval-graph coloring).
  const out = new Map<string, { col: number; cols: number }>();
  for (const members of clusters.values()) {
    const ordered = [...members].sort((a, b) => a.s - b.s || a.e - b.e);
    const colEnds: number[] = [];
    const assignment = new Map<string, number>();
    for (const m of ordered) {
      let col = colEnds.findIndex((end) => end <= m.s);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(m.e);
      } else {
        colEnds[col] = m.e;
      }
      assignment.set(m.id, col);
    }
    const cols = colEnds.length;
    for (const [id, col] of assignment) out.set(id, { col, cols });
  }
  return out;
}

function columnStyle(col: number, cols: number): React.CSSProperties {
  if (cols <= 1) return {};
  return {
    left: `calc(4px + (100% - 8px) * ${col} / ${cols})`,
    width: `calc((100% - 8px) / ${cols} - 2px)`,
    right: 'auto' as const,
  };
}

function formatTimeRange(startISO: string, endISO?: string | null): string {
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date(start.getTime() + 60 * 60_000);
  return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
}

function BlockChip({
  block,
  dragActive,
  onOpen,
  onSelect,
  onPressStart,
  onPressUp,
  onResizeStart,
  layoutStyle,
}: {
  block: { id: string; key?: string | null; title: string; start: string; end?: string | null };
  dragActive: boolean;
  onOpen: () => void;
  onSelect: (e: React.PointerEvent) => void;
  onPressStart: (e: React.PointerEvent) => void;
  onPressUp: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  layoutStyle?: React.CSSProperties;
}) {
  return (
    <div
      data-block
      onPointerDown={onPressStart}
      onPointerUp={(e) => {
        if (dragActive) return;
        onPressUp(e);
        onSelect(e);
      }}
      onDoubleClick={onOpen}
      title={`${block.key ? `[${block.key}] ` : ''}${block.title} — ${formatTimeRange(block.start, block.end)} (click for details, drag to move, double-click to open)`}
      className="absolute left-1 right-1 rounded-lg bg-primary/15 border border-primary/30 border-l-4 border-l-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary overflow-hidden cursor-grab active:cursor-grabbing z-[6] hover:bg-primary/25"
      style={{ ...blockStyle(block.start, block.end), ...layoutStyle }}
    >
      <span className="block truncate pointer-events-none">
        {block.key ? `${block.key} ` : ''}
        {block.title}
      </span>
      <span className="block truncate text-[9px] font-medium opacity-80 pointer-events-none">
        {formatTimeRange(block.start, block.end)}
      </span>
      <span
        role="separator"
        aria-label="Resize block"
        onPointerDown={onResizeStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/40 rounded-b-lg"
      />
    </div>
  );
}

function ExternalBlockChip({
  event,
  dragActive,
  onSelect,
  onPressStart,
  onPressUp,
  onResizeStart,
  layoutStyle,
}: {
  event: CalendarExternal;
  dragActive: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onPressStart: (e: React.PointerEvent) => void;
  onPressUp: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  layoutStyle?: React.CSSProperties;
}) {
  if (!event.start) return null;
  return (
    <div
      data-block
      onPointerDown={onPressStart}
      onPointerUp={(e) => {
        if (dragActive) return;
        onPressUp(e);
        onSelect(e);
      }}
      title={`${event.summary} — ${formatTimeRange(event.start, event.end)} (click for details, drag to reschedule)`}
      className="absolute left-1 right-1 rounded-lg bg-muted/70 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground overflow-hidden cursor-grab active:cursor-grabbing z-[6] hover:border-primary/40 hover:text-foreground"
      style={{ ...blockStyle(event.start, event.end), ...layoutStyle }}
    >
      <span className="block truncate pointer-events-none font-semibold">{event.summary}</span>
      <span className="block truncate text-[9px] opacity-80 pointer-events-none">
        {formatTimeRange(event.start, event.end)}
      </span>
      <span
        role="separator"
        aria-label="Resize meeting"
        onPointerDown={onResizeStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/40 rounded-b-lg"
      />
    </div>
  );
}

function DragGhost({ drag, days }: { drag: DragState; days: Date[] }) {
  const dayIdx = days.findIndex((d) => isSameDay(d, drag.day));
  const lo = Math.min(drag.startMins, drag.curMins);
  const hi = Math.max(drag.startMins, drag.curMins);
  const top = (drag.topOffset ?? 28) + lo * (HOUR_H / 60);
  const height =
    drag.mode === 'move'
      ? Math.max(22, drag.origDurationMin * (HOUR_H / 60))
      : Math.max(22, (hi - lo) * (HOUR_H / 60));
  const left = `calc(48px + (100% - 48px) * ${dayIdx} / ${days.length} + 4px)`;
  const width = `calc((100% - 48px) / ${days.length} - 8px)`;
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg bg-primary/25 border-2 border-dashed border-primary"
      style={{ top, height, left, width }}
    />
  );
}
