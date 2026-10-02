import React from 'react';
import { Button } from '@boardly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@boardly/ui/dropdown-menu';
import { Pause, Play, CheckCircle2, MoreHorizontal, Star, Eye } from 'lucide-react';

interface TaskDetailBottomBarProps {
  isTimerRunning: boolean;
  timerSeconds: number;
  formatTimer: (seconds: number) => string;
  onStartTask: () => void;
  onCompleteTask: () => void;
  onCloneTask: () => void;
  onCreateSubtask: () => void;
  onArchiveTask: () => void;
  onDeleteTask: () => void;
  userRating: number;
  onOpenRateModal: () => void;
  uniqueMemberCount: number;
}

export const TaskDetailBottomBar: React.FC<TaskDetailBottomBarProps> = ({
  isTimerRunning,
  timerSeconds,
  formatTimer,
  onStartTask,
  onCompleteTask,
  onCloneTask,
  onCreateSubtask,
  onArchiveTask,
  onDeleteTask,
  userRating,
  onOpenRateModal,
  uniqueMemberCount,
}) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 lg:right-[420px] xl:right-[480px] px-4 sm:px-6 py-3 sm:py-3.5 bg-card/95 backdrop-blur-md border-t border-border/80 flex items-center justify-between gap-3 z-30 shadow-xl">
      <div className="flex items-center gap-2">
        {/* Start / Pause Button */}
        <Button
          size="sm"
          className={`h-8 px-4 font-bold text-xs gap-1.5 shadow-2xs cursor-pointer ${
            isTimerRunning
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-sky-600 hover:bg-sky-700 text-white'
          }`}
          onClick={onStartTask}
        >
          {isTimerRunning ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-white" /> Pause ({formatTimer(timerSeconds)})
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" /> Start
            </>
          )}
        </Button>

        {/* Complete Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-4 font-semibold text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5 cursor-pointer"
          onClick={onCompleteTask}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Complete
        </Button>

        {/* Three-Dot Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-48 p-1.5">
            <DropdownMenuItem onClick={onCloneTask} className="text-xs cursor-pointer">
              Clone Task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateSubtask} className="text-xs cursor-pointer">
              Add Subtask
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchiveTask} className="text-xs cursor-pointer">
              Archive Task
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDeleteTask}
              variant="destructive"
              className="text-xs cursor-pointer"
            >
              Delete Task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right: Rate task & Views */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
        <button
          type="button"
          className="hover:text-amber-500 transition-colors flex items-center gap-1 cursor-pointer"
          onClick={onOpenRateModal}
        >
          <Star
            className={`w-3.5 h-3.5 ${
              userRating > 0 ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'
            }`}
          />
          <span>{userRating > 0 ? `${userRating} Stars` : 'Rate task'}</span>
        </button>

        <div className="flex items-center gap-1" title="Active viewers on card">
          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{uniqueMemberCount}</span>
        </div>
      </div>
    </div>
  );
};
