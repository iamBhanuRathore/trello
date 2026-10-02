export type CalendarView = 'month' | 'week' | 'day';

export const HOUR_H = 56;
export const SNAP_MIN = 15;

export interface DragState {
  mode: 'move' | 'resize' | 'create';
  kind: 'task' | 'external';
  cardId?: string;
  day: Date;
  startMins: number;
  curMins: number;
  origDurationMin: number;
  pointerId: number;
  topOffset: number;
  startISO?: string;
}

export interface PendingPress {
  kind: 'task' | 'external';
  id: string;
  startISO: string;
  endISO?: string | null;
  x: number;
  y: number;
  pointerId: number;
}
