import React, { useState, useRef, useCallback } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { Flag } from 'lucide-react';
import type { CalendarFeed, CalendarExternal } from '../../lib/calendarService';
import { HOUR_H, type DragState, type PendingPress } from './types';
import { snapMinutes, layoutDayColumns, columnStyle } from './calendar-utils';
import { NowLine } from './NowLine';
import { BlockChip } from './BlockChip';
import { ExternalBlockChip } from './ExternalBlockChip';
import { DragGhost } from './DragGhost';

interface TimeGridProps {
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
}

export function TimeGrid({
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
}: TimeGridProps) {
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
          {days.map((day) => {
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
                                  daylight: true,
                                } as any)
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
