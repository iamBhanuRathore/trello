import { X } from 'lucide-react';
import { format } from 'date-fns';
import type { CalendarFeed } from '../../lib/calendarService';

interface UnscheduledTrayProps {
  feed?: CalendarFeed;
  placeTaskId: string | null;
  onTogglePlaceTask: (id: string) => void;
  onClose: () => void;
}

export function UnscheduledTray({
  feed,
  placeTaskId,
  onTogglePlaceTask,
  onClose,
}: UnscheduledTrayProps) {
  const unscheduled = feed?.unscheduled || [];
  const hasBlocks = (feed?.blocks || []).length > 0;
  const hasDueDates = (feed?.dueDates || []).length > 0;

  return (
    <aside
      className="shrink-0 border-l border-border bg-card/40 flex flex-col min-h-0
                 w-64
                 max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(20rem,85vw)]
                 max-lg:shadow-2xl"
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
        <p className="text-xs font-bold">Unscheduled</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close unscheduled panel"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {unscheduled.length === 0 &&
          (hasBlocks || hasDueDates ? (
            <p className="text-[11px] text-muted-foreground text-center py-6">
              Nothing unscheduled — every assigned task has a time block.
            </p>
          ) : (
            <div className="text-center py-6 space-y-2">
              <p className="text-xs font-semibold">No tasks on your plate</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tasks assigned to you appear here.
                <br />
                Create a workspace, add a board, and assign yourself a card — then drag it onto the
                calendar.
              </p>
            </div>
          ))}
        {unscheduled.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTogglePlaceTask(t.id)}
            title="Click, then click a calendar slot to schedule"
            className={`w-full text-left p-2 rounded-xl border transition-all cursor-pointer ${
              placeTaskId === t.id
                ? 'border-primary bg-primary/10 shadow-sm'
                : 'border-border/60 bg-background hover:border-primary/40'
            }`}
          >
            <p className="text-xs font-semibold truncate">
              {t.key ? <span className="font-mono text-muted-foreground">{t.key} </span> : null}
              {t.title}
            </p>
            {t.dueDate && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Due {format(new Date(t.dueDate), 'MMM d, h:mm a')}
              </p>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
}
