import { useMemo } from 'react';
import { format, isToday } from 'date-fns';
import { Flag } from 'lucide-react';
import type { CalendarFeed, CalendarExternal } from '../../lib/calendarService';
import { buildDayBuckets } from './dayBuckets';

interface MonthGridProps {
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
}

export function MonthGrid({
  days,
  cursor,
  feed,
  onOpenTask,
  onSelectDay,
  onSelectTask,
  onSelectExternal,
}: MonthGridProps) {
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();

  // Bucket the feed once instead of re-filtering it in every cell.
  const buckets = useMemo(() => buildDayBuckets(feed), [feed]);

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
        const blocks = buckets.blocksByDay.get(key) || [];
        const dues = buckets.dueByDay.get(key) || [];
        const externals = buckets.externalByDay.get(key) || [];
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
