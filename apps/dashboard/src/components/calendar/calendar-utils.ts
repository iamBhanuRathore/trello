import React from 'react';
import { format, setHours, setMinutes } from 'date-fns';
import { HOUR_H, SNAP_MIN } from './types';

export function snapMinutes(mins: number): number {
  return Math.round(mins / SNAP_MIN) * SNAP_MIN;
}

export function atTime(day: Date, mins: number): Date {
  const snapped = snapMinutes(mins);
  return setMinutes(setHours(day, Math.floor(snapped / 60)), snapped % 60);
}

export function toISO(d: Date): string {
  return d.toISOString();
}

export function formatTimeRange(startISO: string, endISO?: string | null): string {
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date(start.getTime() + 60 * 60_000);
  return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
}

export function blockStyle(startISO: string, endISO?: string | null): React.CSSProperties {
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
export function layoutDayColumns(
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

export function columnStyle(col: number, cols: number): React.CSSProperties {
  if (cols <= 1) return {};
  return {
    left: `calc(4px + (100% - 8px) * ${col} / ${cols})`,
    width: `calc((100% - 8px) / ${cols} - 2px)`,
    right: 'auto' as const,
  };
}
