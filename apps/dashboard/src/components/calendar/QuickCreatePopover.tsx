import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Video, CheckSquare, X, Loader2 } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { UnscheduledTask } from '../../lib/calendarService';

export interface QuickCreateValue {
  mode: 'meeting' | 'task';
  title: string;
  taskId?: string;
}

export const QuickCreatePopover: React.FC<{
  anchor: { x: number; y: number };
  slotLabel: string;
  unscheduled: UnscheduledTask[];
  googleConnected: boolean;
  isWorking: boolean;
  onClose: () => void;
  onConfirm: (value: QuickCreateValue) => void;
}> = ({ anchor, slotLabel, unscheduled, googleConnected, isWorking, onClose, onConfirm }) => {
  const [mode, setMode] = useState<'meeting' | 'task'>(googleConnected ? 'meeting' : 'task');
  const [title, setTitle] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y });

  useEscapeKey(onClose, true);

  useEffect(() => {
    inputRef.current?.focus();
    const el = boxRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      let left = anchor.x;
      let top = anchor.y;
      if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
      if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
      setPos({ left: Math.max(8, left), top: Math.max(8, top) });
    }
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = unscheduled.filter((t) =>
    t.title.toLowerCase().includes(taskSearch.toLowerCase())
  );

  const canConfirm =
    !isWorking && (mode === 'meeting' ? title.trim().length > 0 : selectedTaskId !== null);

  const confirm = () => {
    if (!canConfirm) return;
    if (mode === 'meeting') onConfirm({ mode, title: title.trim() });
    else onConfirm({ mode, title: '', taskId: selectedTaskId! });
  };

  return createPortal(
    <div
      ref={boxRef}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 w-80 rounded-2xl border border-border bg-popover shadow-2xl p-3.5 space-y-3 animate-in fade-in-50 zoom-in-95 duration-100"
      role="dialog"
      aria-label="Create calendar entry"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground">{slotLabel}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-muted/50 border border-border">
        {(
          [
            { id: 'meeting', label: 'Meeting', icon: Video, disabled: !googleConnected },
            { id: 'task', label: 'Task block', icon: CheckSquare, disabled: false },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={m.disabled}
            onClick={() => setMode(m.id)}
            title={m.disabled ? 'Connect Google Calendar first' : undefined}
            className={`inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === m.id
                ? 'bg-background shadow-xs text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <m.icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'meeting' ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm();
          }}
          placeholder="Meeting title (Enter to create)"
          className="w-full h-10 px-3 rounded-xl bg-muted/40 border border-border text-sm outline-none focus:border-primary placeholder:text-muted-foreground"
        />
      ) : (
        <div className="space-y-2">
          <input
            ref={inputRef}
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            placeholder="Search unscheduled tasks..."
            className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
          />
          <div className="max-h-44 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                {unscheduled.length === 0 ? 'Nothing unscheduled.' : 'No matches.'}
              </p>
            )}
            {filtered.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTaskId(t.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedTaskId === t.id
                    ? 'bg-primary/10 border border-primary/40'
                    : 'border border-transparent hover:bg-muted'
                }`}
              >
                <span className="block truncate">
                  {t.key ? <span className="font-mono text-muted-foreground">{t.key} </span> : null}
                  {t.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={!canConfirm}
        className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
      >
        {isWorking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {mode === 'meeting' ? 'Create meeting' : 'Place task here'}
      </button>
    </div>,
    document.body
  );
};
