import React, { useState, useEffect, useRef, useCallback } from 'react';
import { isSameDay } from 'date-fns';
import { HOUR_H } from './types';

interface NowLineProps {
  days: Date[];
  headerOffset: (dayIndex: number) => number;
  gridRef: React.RefObject<HTMLDivElement | null>;
}

export function NowLine({ days, headerOffset, gridRef }: NowLineProps) {
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
