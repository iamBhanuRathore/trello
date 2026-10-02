import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
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
} from 'date-fns';
import { calendarService, describeCalendarError, type CalendarFeed } from '../lib/calendarService';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { CardModal } from '../components/board/CardModal';
import {
  type CalendarView,
  type QuickCreateValue,
  type CalendarSelection,
  EventPopover,
  QuickCreatePopover,
  CalendarHeader,
  MonthGrid,
  TimeGrid,
  UnscheduledTray,
  atTime,
  snapMinutes,
  toISO,
} from '../components/calendar';

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

  const nav = useCallback(
    (dir: number) => {
      if (view === 'month') setCursor((c) => addMonths(c, dir));
      else if (view === 'week') setCursor((c) => addDays(c, dir * 7));
      else setCursor((c) => addDays(c, dir));
    },
    [view]
  );

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
  }, [view, selection, createDraft, activeCardId, nav]);

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <CalendarHeader
        cursor={cursor}
        view={view}
        title={title}
        isFeedFetching={isFeedFetching}
        placeTask={placeTask}
        googleStatus={googleStatus}
        unscheduledCount={feed?.unscheduled.length || 0}
        sprints={feed?.sprints}
        milestones={feed?.milestones}
        onNav={nav}
        onToday={() => setCursor(new Date())}
        onViewChange={setView}
        onToggleTray={() => setIsTrayOpen((v) => !v)}
        onConnectGoogle={connectGoogle}
        onDisconnectGoogle={disconnectGoogle}
        onSyncGoogle={() => syncMutation.mutate()}
        isSyncingGoogle={syncMutation.isPending}
      />

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
          <UnscheduledTray
            feed={feed}
            placeTaskId={placeTaskId}
            onTogglePlaceTask={(id) => setPlaceTaskId((prev) => (prev === id ? null : id))}
            onClose={() => setIsTrayOpen(false)}
          />
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
export default Calendar;
