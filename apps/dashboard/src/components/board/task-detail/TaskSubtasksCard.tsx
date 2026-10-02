import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Layers, Plus } from 'lucide-react';
import { AsyncMemberSearchableSelect } from '../../ui/AsyncMemberSelect';

interface TaskSubtasksCardProps {
  card: any;
  subtasks: any[];
  currentUserId?: string;
  currentUser?: any;
  orgId?: string;
  onSelectCard?: (id: string) => void;
  onCreateFullSubtask: () => void;
  onQuickSubtaskSubmit: (title: string, assigneeId?: string) => Promise<void>;
  isSubmittingQuickSubtask?: boolean;
}

export const TaskSubtasksCard: React.FC<TaskSubtasksCardProps> = ({
  card,
  subtasks,
  currentUserId,
  currentUser,
  orgId,
  onSelectCard,
  onCreateFullSubtask,
  onQuickSubtaskSubmit,
  isSubmittingQuickSubtask,
}) => {
  const navigate = useNavigate();
  const [subtaskFilter, setSubtaskFilter] = useState<'all' | 'mine'>('all');
  const [quickSubTitle, setQuickSubTitle] = useState('');
  const [quickSubAssignee, setQuickSubAssignee] = useState('');

  const filteredSubtasks = useMemo(() => {
    if (subtaskFilter === 'mine' && currentUserId) {
      return subtasks.filter(
        (s: any) =>
          s.assigneeId === currentUserId ||
          s.assignee?.id === currentUserId ||
          s.assignees?.some((a: any) => a.id === currentUserId)
      );
    }
    return subtasks;
  }, [subtasks, subtaskFilter, currentUserId]);

  const handleSubmit = async () => {
    if (!quickSubTitle.trim() || !card?.listId || isSubmittingQuickSubtask) return;
    await onQuickSubtaskSubmit(quickSubTitle.trim(), quickSubAssignee || undefined);
    setQuickSubTitle('');
    setQuickSubAssignee('');
  };

  return (
    <div
      id="section-subtasks"
      className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Subtasks ({subtasks.length})</span>
        </div>

        <div className="flex items-center gap-1.5">
          {subtasks.length > 0 && currentUserId && (
            <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border text-[11px]">
              <button
                type="button"
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition-colors ${
                  subtaskFilter === 'all'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setSubtaskFilter('all')}
              >
                All ({subtasks.length})
              </button>
              <button
                type="button"
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer transition-colors ${
                  subtaskFilter === 'mine'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setSubtaskFilter('mine')}
              >
                Assigned to me
              </button>
            </div>
          )}

          <button
            type="button"
            title="Open full subtask composer (dates, labels, checklist…)"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer ml-1"
            onClick={onCreateFullSubtask}
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Subtasks items list */}
      <div className="space-y-2">
        {filteredSubtasks.map((subtask: any) => {
          const subAssignee = subtask.assignee || subtask.assignees?.[0];
          return (
            <div
              key={subtask.id}
              className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 cursor-pointer transition-all group"
              onClick={() =>
                onSelectCard ? onSelectCard(subtask.id) : navigate(`/cards/${subtask.id}`)
              }
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {subtask.title}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {subAssignee && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                    {subAssignee.avatarUrl ? (
                      <img
                        src={subAssignee.avatarUrl}
                        alt={subAssignee.name}
                        className="w-3.5 h-3.5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                        {subAssignee.name ? subAssignee.name.substring(0, 1).toUpperCase() : 'U'}
                      </div>
                    )}
                    <span className="truncate max-w-[80px]">{subAssignee.name}</span>
                  </div>
                )}

                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {subtask.listName || card?.listName || 'To Do'}
                </span>
              </div>
            </div>
          );
        })}
        {filteredSubtasks.length === 0 && subtasks.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-2">
            No subtasks assigned to you yet.
          </p>
        )}
      </div>

      {/* Quick handoff */}
      <div className="pt-3 border-t border-border/50">
        <p className="text-[11px] font-semibold text-muted-foreground mb-2">
          Hand off a subtask — this task stays the parent
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={quickSubTitle}
            onChange={(e) => setQuickSubTitle(e.target.value)}
            placeholder="e.g. Test the login flow…"
            aria-label="Subtask title"
            className="h-9 text-xs flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              } else if (e.key === 'Escape') {
                setQuickSubTitle('');
                setQuickSubAssignee('');
              }
            }}
          />
          <div className="sm:w-52 shrink-0">
            {orgId ? (
              <AsyncMemberSearchableSelect
                orgId={orgId}
                currentUser={currentUser}
                value={quickSubAssignee}
                onChange={setQuickSubAssignee}
                placeholder="Assign to…"
                pinnedIds={quickSubAssignee ? [quickSubAssignee] : []}
              />
            ) : null}
          </div>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!quickSubTitle.trim() || !card?.listId || isSubmittingQuickSubtask}
            title="Create subtask under this task"
            className="h-9 text-xs px-4 shrink-0 cursor-pointer"
          >
            {isSubmittingQuickSubtask ? 'Adding…' : 'Add Subtask'}
          </Button>
        </div>
      </div>
    </div>
  );
};
