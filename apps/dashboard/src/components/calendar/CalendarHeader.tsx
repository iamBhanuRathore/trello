import { ChevronLeft, ChevronRight, Clock, Flag, Zap, MousePointerClick } from 'lucide-react';
import { GoogleSyncBadge } from './GoogleSyncBadge';
import type { CalendarView } from './types';

interface CalendarHeaderProps {
  cursor: Date;
  view: CalendarView;
  title: string;
  isFeedFetching: boolean;
  placeTask?: { title: string } | null;
  googleStatus?: { configured: boolean; connected: boolean; connection?: any };
  unscheduledCount: number;
  sprints?: Array<{ id: string; name: string; start: string; end: string }>;
  milestones?: Array<{ id: string; name: string; start: string; end: string }>;
  onNav: (dir: number) => void;
  onToday: () => void;
  onViewChange: (v: CalendarView) => void;
  onToggleTray: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onSyncGoogle: () => void;
  isSyncingGoogle: boolean;
}

export function CalendarHeader({
  view,
  title,
  isFeedFetching,
  placeTask,
  googleStatus,
  unscheduledCount,
  sprints = [],
  milestones = [],
  onNav,
  onToday,
  onViewChange,
  onToggleTray,
  onConnectGoogle,
  onDisconnectGoogle,
  onSyncGoogle,
  isSyncingGoogle,
}: CalendarHeaderProps) {
  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-1 mr-1">
          <button
            type="button"
            onClick={() => onNav(-1)}
            aria-label="Previous"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onNav(1)}
            aria-label="Next"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <h2 className="text-base font-bold tracking-tight mr-1">{title}</h2>
        <span
          className="text-[10px] font-mono text-muted-foreground border border-border/60 rounded-md px-1.5 py-0.5 mr-2 hidden sm:inline"
          title="All times shown in your local timezone"
        >
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </span>
        {isFeedFetching && (
          <span className="text-[10px] text-muted-foreground animate-pulse mr-2 hidden sm:inline">
            Updating…
          </span>
        )}

        <div className="flex items-center rounded-xl bg-muted/50 border border-border p-0.5">
          {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                view === v
                  ? 'bg-background shadow-xs text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {placeTask && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-semibold animate-pulse">
              <MousePointerClick className="w-3 h-3" />
              Placing “{placeTask.title.slice(0, 24)}” — click a slot (Esc to cancel)
            </span>
          )}
          <GoogleSyncBadge
            googleStatus={googleStatus}
            onConnect={onConnectGoogle}
            onDisconnect={onDisconnectGoogle}
            onSync={onSyncGoogle}
            isSyncing={isSyncingGoogle}
          />
          <button
            type="button"
            onClick={onToggleTray}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Unscheduled ({unscheduledCount})</span>
          </button>
        </div>
      </div>

      {/* Sprint overlay strip */}
      {sprints.length > 0 || milestones.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-6 py-2 border-b border-border/60 bg-muted/20 shrink-0">
          {sprints.map((s) => (
            <span
              key={s.id}
              title={`${s.name} (${s.start} → ${s.end})`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 text-[11px] font-semibold"
            >
              <Zap className="w-3 h-3" />
              {s.name}
            </span>
          ))}
          {milestones.map((m) => (
            <span
              key={m.id}
              title={`${m.name} (${m.start} → ${m.end})`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-400 text-[11px] font-semibold"
            >
              <Flag className="w-3 h-3" />
              {m.name}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
