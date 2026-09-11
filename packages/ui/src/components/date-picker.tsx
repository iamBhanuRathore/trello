import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../utils';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS_MON_FIRST = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_SUN_FIRST = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(value?: string): Date | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatDisplay(value?: string): string {
  const d = parseISODate(value);
  if (!d) return '';
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export interface DatePickerProps {
  /** ISO date string (YYYY-MM-DD). Empty string/undefined = no selection. */
  value?: string;
  /** Called with an ISO date string, or '' when cleared. */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  triggerClassName?: string;
  /** Monday-first (ISO, default) or Sunday-first weeks. */
  weekStartsOn?: 0 | 1;
  min?: string;
  max?: string;
}

/**
 * Theme-aware date picker replacing native `<input type="date">` (whose
 * browser-chrome popup ignores the design system entirely). Same YYYY-MM-DD
 * string contract, so it drops into every existing form untouched.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  required = false,
  className,
  triggerClassName,
  weekStartsOn = 1,
  min,
  max,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseISODate(value);
  const today = React.useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const [viewYear, setViewYear] = React.useState(() => (selected ?? today).getFullYear());
  const [viewMonth, setViewMonth] = React.useState(() => (selected ?? today).getMonth());

  // When opened, jump the calendar to the selected date (or today).
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const anchor = selected ?? today;
      setViewYear(anchor.getFullYear());
      setViewMonth(anchor.getMonth());
    }
    setOpen(nextOpen);
  };

  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);

  const cells = React.useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    // Monday-first offset: JS getDay() is 0=Sunday.
    const leading = weekStartsOn === 1 ? (first.getDay() + 6) % 7 : first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    const list: { date: Date; inView: boolean }[] = [];
    for (let i = leading - 1; i >= 0; i--) {
      list.push({ date: new Date(viewYear, viewMonth - 1, daysInPrevMonth - i), inView: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ date: new Date(viewYear, viewMonth, d), inView: true });
    }
    while (list.length % 7 !== 0 || list.length < 42) {
      const last = list[list.length - 1].date;
      list.push({
        date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
        inView: false,
      });
      if (list.length >= 42) break;
    }
    return list;
  }, [viewYear, viewMonth, weekStartsOn]);

  const moveMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const pick = (date: Date) => {
    onChange(toISODate(date));
    setOpen(false);
  };

  const selectedISO = selected ? toISODate(selected) : undefined;
  const todayISO = toISODate(today);
  const display = formatDisplay(value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger
        data-slot="date-picker-trigger"
        disabled={disabled}
        className={cn('w-full', className)}
        render={
          <button
            type="button"
            aria-required={required || undefined}
            className={cn(
              'w-full flex items-center justify-between gap-2 rounded-lg border border-input bg-background font-medium text-foreground transition-all duration-150 outline-none text-left cursor-pointer h-9 px-3 text-xs',
              'focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary',
              'hover:bg-muted/30 hover:border-border',
              disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
              !display && 'text-muted-foreground',
              triggerClassName
            )}
          >
            <span className="flex items-center gap-2 truncate min-w-0 flex-1">
              <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{display || placeholder}</span>
              {required && !display && (
                <span className="text-destructive shrink-0" aria-hidden="true">
                  *
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {display && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Clear date"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onChange('');
                    }
                  }}
                  className="p-0.5 hover:text-foreground text-muted-foreground rounded transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </span>
          </button>
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          className="isolate z-[100001] outline-none"
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <PopoverPrimitive.Popup
            data-slot="date-picker-content"
            className="z-[100001] w-[290px] rounded-xl bg-popover/95 backdrop-blur-2xl border border-border/80 shadow-2xl ring-1 ring-primary/20 p-3 text-foreground outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {/* Month / year navigation */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => moveMonth(-1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => moveMonth(1)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {(weekStartsOn === 1 ? WEEKDAYS_MON_FIRST : WEEKDAYS_SUN_FIRST).map((d) => (
                <span
                  key={d}
                  className="h-7 flex items-center justify-center text-[10px] font-bold text-muted-foreground"
                >
                  {d}
                </span>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Choose a date">
              {cells.map(({ date, inView }) => {
                const iso = toISODate(date);
                const isSelected = iso === selectedISO;
                const isToday = iso === todayISO;
                const isDisabled =
                  (minDate && date < minDate) || (maxDate && date > maxDate) || false;
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    disabled={isDisabled}
                    onClick={() => pick(date)}
                    className={cn(
                      'h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center',
                      !inView && 'text-muted-foreground/40',
                      inView &&
                        !isSelected &&
                        'text-foreground hover:bg-primary/10 hover:text-primary',
                      isSelected &&
                        'bg-primary text-primary-foreground font-bold hover:bg-primary/90',
                      !isSelected && isToday && 'ring-1 ring-primary/60 text-primary font-bold',
                      isDisabled && 'opacity-30 cursor-not-allowed pointer-events-none'
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-1"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pick(today)}
                className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer px-1"
              >
                Today
              </button>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
