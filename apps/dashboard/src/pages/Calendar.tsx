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
  ExternalLink,
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
import { calendarService, type CalendarFeed } from '../lib/calendarService';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { CardModal } from '../components/board/CardModal';

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

  const { data: feed } = useQuery<CalendarFeed>({
    queryKey: ['calendar', 'feed', range.from, range.to],
    queryFn: () => calendarService.feed(range.from, range.to),
    staleTime: 30000,
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
      toast.error(err.response?.data?.message || err.message || 'Failed to schedule task');
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
        <h2 className="text-base font-bold tracking-tight mr-2">{title}</h2>

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
              {(feed?.unscheduled || []).length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-6">
                  Nothing unscheduled — every assigned task has a time block.
                </p>
              )}
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
}: {
  days: Date[];
  cursor: Date;
  feed?: CalendarFeed;
  onOpenTask: (id: string) => void;
  onSelectDay: (d: Date) => void;
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
                    onOpenTask(b.id);
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
                    onOpenTask(d.id);
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
                  className="block truncate px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px]"
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
  cardId?: string;
  day: Date;
  startMins: number;
  curMins: number;
  origDurationMin: number;
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
}: {
  days: Date[];
  feed?: CalendarFeed;
  placeTaskId: string | null;
  onPlace: (day: Date, mins: number) => void;
  onMove: (cardId: string, day: Date, mins: number, durationMin: number) => void;
  onResize: (cardId: string, day: Date, startISO: string, mins: number) => void;
  onOpenTask: (id: string) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const minsFromEvent = useCallback((e: React.PointerEvent): number => {
    const grid = gridRef.current;
    if (!grid) return 9 * 60;
    const rect = grid.getBoundingClientRect();
    const y = e.clientY - rect.top - 28; // header offset
    return Math.max(0, Math.min(24 * 60, (y / HOUR_H) * 60));
  }, []);

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

  const handleGridPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return;
    if (!placeTaskId) return;
    const idx = dayIndexFromEvent(e);
    const mins = snapMinutes(minsFromEvent(e));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({
      mode: 'create',
      cardId: placeTaskId,
      day: days[idx]!,
      startMins: mins,
      curMins: mins,
      origDurationMin: 60,
      pointerId: e.pointerId,
    });
  };

  const handleGridPointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const idx = dayIndexFromEvent(e);
    const mins = snapMinutes(minsFromEvent(e));
    setDrag({ ...drag, day: days[idx]!, curMins: mins });
  };

  const handleGridPointerUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    const lo = Math.min(d.startMins, d.curMins);
    if (d.mode === 'create' && d.cardId) {
      onPlace(d.day, lo);
    } else if (d.mode === 'move' && d.cardId) {
      onMove(d.cardId, d.day, lo, d.origDurationMin);
    } else if (d.mode === 'resize' && d.cardId) {
      onResize(d.cardId, d.day, (d as any).startISO, Math.max(d.startMins + 15, d.curMins));
    }
  };

  // place-mode task id is captured into drag state at pointerdown.

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
    setDrag({
      mode,
      cardId: block.id,
      day: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      startMins,
      curMins: mode === 'resize' ? end.getHours() * 60 + end.getMinutes() : startMins,
      origDurationMin: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)),
      pointerId: e.pointerId,
      ...(mode === 'resize' ? { startISO: block.start } : {}),
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
      {days.map((day) => (
        <div
          key={day.toISOString()}
          className={`sticky top-0 z-10 bg-background border-b border-l border-border/60 h-7 px-2 flex items-center gap-1.5 text-[11px] ${
            isSameDay(day, new Date())
              ? 'font-bold text-primary'
              : 'text-muted-foreground font-semibold'
          }`}
        >
          <span className="uppercase">{format(day, 'EEE')}</span>
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday(day) ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {format(day, 'd')}
          </span>
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
            const dayExt = (feed?.external || []).filter(
              (e) =>
                e.start &&
                !e.allDay &&
                format(new Date(e.start), 'yyyy-MM-dd') === key &&
                new Date(e.start).getHours() === h
            );
            return (
              <div
                key={key + h}
                className="relative border-b border-l border-border/40"
                style={{ height: HOUR_H }}
              >
                {h === 0 && (
                  <>
                    {dayBlocks.map((b) => (
                      <BlockChip
                        key={b.id}
                        block={b}
                        onOpen={() => onOpenTask(b.id)}
                        onMoveStart={(e) => startBlockDrag(e, b, 'move')}
                        onResizeStart={(e) => startBlockDrag(e, b, 'resize')}
                      />
                    ))}
                    {dayExt.map((e) => (
                      <a
                        key={e.id}
                        href={e.htmlLink || undefined}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        title={e.summary}
                        className="absolute left-1 right-1 rounded-lg bg-muted/70 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground truncate flex items-center gap-1"
                        style={blockStyle(e.start!, e.end)}
                      >
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{e.summary}</span>
                      </a>
                    ))}
                  </>
                )}
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

function BlockChip({
  block,
  onOpen,
  onMoveStart,
  onResizeStart,
}: {
  block: { id: string; key?: string | null; title: string; start: string; end?: string | null };
  onOpen: () => void;
  onMoveStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      data-block
      onPointerDown={onMoveStart}
      onDoubleClick={onOpen}
      title={`${block.key ? `[${block.key}] ` : ''}${block.title} — drag to move, double-click to open`}
      className="absolute left-1 right-1 rounded-lg bg-primary/15 border border-primary/30 border-l-4 border-l-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary overflow-hidden cursor-grab active:cursor-grabbing z-[6] hover:bg-primary/25"
      style={blockStyle(block.start, block.end)}
    >
      <span className="block truncate pointer-events-none">
        {format(new Date(block.start), 'HH:mm')} {block.key ? `${block.key} ` : ''}
        {block.title}
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

function DragGhost({ drag, days }: { drag: DragState; days: Date[] }) {
  const dayIdx = days.findIndex((d) => isSameDay(d, drag.day));
  const lo = Math.min(drag.startMins, drag.curMins);
  const hi = Math.max(drag.startMins, drag.curMins);
  const top = 28 + lo * (HOUR_H / 60);
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
