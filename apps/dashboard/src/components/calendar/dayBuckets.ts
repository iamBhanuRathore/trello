import { format } from 'date-fns';
import type {
  CalendarFeed,
  CalendarExternal,
  CalendarBlock,
  CalendarDue,
} from '../../lib/calendarService';

/**
 * Day buckets for the calendar grids.
 *
 * Every cell used to re-filter the whole feed with a fresh
 * `format(new Date(...), 'yyyy-MM-dd')` per element: 24 hours x 7 days x 3 arrays
 * in the week grid, ~42 cells x 3 arrays in the month grid — hundreds of Intl
 * formatter constructions on every render, repeated on each drag frame. Bucket
 * once per feed, then look up.
 */
export interface DayBuckets {
  blocksByDay: Map<string, CalendarBlock[]>;
  dueByDayHour: Map<string, CalendarDue[]>;
  /** Due dates bucketed by day only (month view has no hour dimension). */
  dueByDay: Map<string, CalendarDue[]>;
  timedExternalByDay: Map<string, CalendarExternal[]>;
  allDayExternalByDay: Map<string, CalendarExternal[]>;
  /** Every external event bucketed by its start day, all-day or not. */
  externalByDay: Map<string, CalendarExternal[]>;
}

export const EMPTY_BUCKETS: DayBuckets = {
  blocksByDay: new Map(),
  dueByDayHour: new Map(),
  dueByDay: new Map(),
  timedExternalByDay: new Map(),
  allDayExternalByDay: new Map(),
  externalByDay: new Map(),
};

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export function buildDayBuckets(feed?: CalendarFeed): DayBuckets {
  if (!feed) return EMPTY_BUCKETS;
  const buckets: DayBuckets = {
    blocksByDay: new Map(),
    dueByDayHour: new Map(),
    dueByDay: new Map(),
    timedExternalByDay: new Map(),
    allDayExternalByDay: new Map(),
    externalByDay: new Map(),
  };
  for (const b of feed.blocks) {
    push(buckets.blocksByDay, format(new Date(b.start), 'yyyy-MM-dd'), b);
  }
  for (const d of feed.dueDates) {
    const start = new Date(d.start);
    const dayKey = format(start, 'yyyy-MM-dd');
    push(buckets.dueByDay, dayKey, d);
    push(buckets.dueByDayHour, `${dayKey}#${start.getHours()}`, d);
  }
  for (const e of feed.external) {
    if (e.allDay) {
      // All-day chips render in the day header: an event with only an `end`
      // belongs to the day before it ends.
      let dayKey: string | null = null;
      if (e.start) dayKey = format(new Date(e.start), 'yyyy-MM-dd');
      else if (e.end) dayKey = format(new Date(new Date(e.end).getTime() - 1), 'yyyy-MM-dd');
      if (dayKey) push(buckets.allDayExternalByDay, dayKey, e);
    } else if (e.start) {
      push(buckets.timedExternalByDay, format(new Date(e.start), 'yyyy-MM-dd'), e);
    }
    if (e.start) push(buckets.externalByDay, format(new Date(e.start), 'yyyy-MM-dd'), e);
  }
  return buckets;
}
