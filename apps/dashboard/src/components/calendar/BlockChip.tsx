import React from 'react';
import { blockStyle, formatTimeRange } from './calendar-utils';

interface BlockChipProps {
  block: { id: string; key?: string | null; title: string; start: string; end?: string | null };
  dragActive: boolean;
  onOpen: () => void;
  onSelect: (e: React.PointerEvent) => void;
  onPressStart: (e: React.PointerEvent) => void;
  onPressUp: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  layoutStyle?: React.CSSProperties;
}

export function BlockChip({
  block,
  dragActive,
  onOpen,
  onSelect,
  onPressStart,
  onPressUp,
  onResizeStart,
  layoutStyle,
}: BlockChipProps) {
  return (
    <div
      data-block
      onPointerDown={onPressStart}
      onPointerUp={(e) => {
        if (dragActive) return;
        onPressUp(e);
        onSelect(e);
      }}
      onDoubleClick={onOpen}
      title={`${block.key ? `[${block.key}] ` : ''}${block.title} — ${formatTimeRange(block.start, block.end)} (click for details, drag to move, double-click to open)`}
      className="absolute left-1 right-1 rounded-lg bg-primary/15 border border-primary/30 border-l-4 border-l-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary overflow-hidden cursor-grab active:cursor-grabbing z-[6] hover:bg-primary/25"
      style={{ ...blockStyle(block.start, block.end), ...layoutStyle }}
    >
      <span className="block truncate pointer-events-none">
        {block.key ? `${block.key} ` : ''}
        {block.title}
      </span>
      <span className="block truncate text-[9px] font-medium opacity-80 pointer-events-none">
        {formatTimeRange(block.start, block.end)}
      </span>
      <span
        role="separator"
        aria-label="Resize block"
        onPointerDown={onResizeStart}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/40 rounded-b-lg"
      />
    </div>
  );
}
