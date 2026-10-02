import { isSameDay } from 'date-fns';
import { HOUR_H, type DragState } from './types';

interface DragGhostProps {
  drag: DragState;
  days: Date[];
}

export function DragGhost({ drag, days }: DragGhostProps) {
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
