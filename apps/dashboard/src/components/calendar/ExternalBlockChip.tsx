import React from 'react';
import type { CalendarExternal } from '../../lib/calendarService';
import { blockStyle, formatTimeRange } from './calendar-utils';

interface ExternalBlockChipProps {
  event: CalendarExternal;
  dragActive: boolean;
  onSelect: (e: React.PointerEvent) => void;
  onPressStart: (e: React.PointerEvent) => void;
  onPressUp: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  layoutStyle?: React.CSSProperties;
}

export function ExternalBlockChip({
  event,
  dragActive,
  onSelect,
  onPressStart,
  onPressUp,
  onResizeStart,
  layoutStyle,
}: ExternalBlockChipProps) {
  if (!event.start) return null;

  return (
    <div
      data-block
      onPointerDown={onPressStart}
      onPointerUp={(e) => {
        if (dragActive) return;
        onPressUp(e);
        onSelect(e);
      }}
      title={`${event.summary} — ${formatTimeRange(event.start, event.end)} (click for details, drag to reschedule)`}
      className="absolute left-1 right-1 rounded-lg bg-muted/70 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground overflow-hidden cursor-grab active:cursor-grabbing z-[6] hover:border-primary/40 hover:text-foreground"
      style={{ ...blockStyle(event.start, event.end), ...layoutStyle }}
    >
      <span className="block truncate pointer-events-none font-semibold">{event.summary}</span>
      <span className="block truncate text-[9px] opacity-80 pointer-events-none">
        {formatTimeRange(event.start, event.end)}
      </span>
      <span
        role="separator"
        aria-label="Resize meeting"
        onPointerDown={onResizeStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/40 rounded-b-lg"
      />
    </div>
  );
}
