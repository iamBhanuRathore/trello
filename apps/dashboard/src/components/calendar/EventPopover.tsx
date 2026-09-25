import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { ExternalLink, Trash2, FolderOpen, Clock, X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { CalendarExternal } from '../../lib/calendarService';

export type CalendarSelection =
  | {
      kind: 'task';
      id: string;
      key?: string | null;
      title: string;
      start: string;
      end?: string | null;
    }
  | { kind: 'external'; event: CalendarExternal };

function fmtRange(startISO: string, endISO?: string | null): string {
  const start = new Date(startISO);
  const date = format(start, 'EEE, MMM d');
  const t0 = format(start, 'h:mm a');
  if (!endISO) return `${date} · ${t0}`;
  const end = new Date(endISO);
  const sameDay = format(end, 'yyyy-MM-dd') === format(start, 'yyyy-MM-dd');
  return `${date} · ${t0} – ${format(end, sameDay ? 'h:mm a' : 'MMM d, h:mm a')}`;
}

function usePopoverPosition(anchor: { x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ left: anchor.x, top: anchor.y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = anchor.x;
    let top = anchor.y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, pos };
}

export const EventPopover: React.FC<{
  anchor: { x: number; y: number };
  selection: CalendarSelection;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onUnscheduleTask: (id: string) => void;
  onDeleteExternal: (id: string) => void;
  isWorking: boolean;
}> = ({
  anchor,
  selection,
  onClose,
  onOpenTask,
  onUnscheduleTask,
  onDeleteExternal,
  isWorking,
}) => {
  const { ref, pos } = usePopoverPosition(anchor);
  useEscapeKey(onClose, true);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 w-72 rounded-2xl border border-border bg-popover shadow-2xl p-3.5 space-y-2.5 animate-in fade-in-50 zoom-in-95 duration-100"
      role="dialog"
      aria-label="Event details"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">
            {selection.kind === 'task'
              ? `${selection.key ? `[${selection.key}] ` : ''}${selection.title}`
              : selection.event.summary}
          </p>
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            {selection.kind === 'task'
              ? fmtRange(selection.start, selection.end)
              : selection.event.start
                ? fmtRange(selection.event.start, selection.event.end)
                : 'All-day'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
            selection.kind === 'task'
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {selection.kind === 'task' ? 'Boardly task' : 'Google Calendar'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {selection.kind === 'task' ? (
          <>
            <button
              type="button"
              onClick={() => onOpenTask(selection.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Open task
            </button>
            <button
              type="button"
              onClick={() => onUnscheduleTask(selection.id)}
              disabled={isWorking}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer disabled:opacity-50"
            >
              Remove block
            </button>
          </>
        ) : (
          <>
            {selection.event.htmlLink && (
              <a
                href={selection.event.htmlLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Google
              </a>
            )}
            <button
              type="button"
              onClick={() => onDeleteExternal(selection.event.id)}
              disabled={isWorking}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/30 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
