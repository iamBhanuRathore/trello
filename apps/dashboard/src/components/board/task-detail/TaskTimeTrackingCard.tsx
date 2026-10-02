import React from 'react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { DatePicker } from '@boardly/ui';
import { Clock, Plus, Trash2 } from 'lucide-react';

interface TaskTimeTrackingCardProps {
  timeTrackingData?: any;
  estimateMinutes?: number;
  totalLoggedMinutes: number;
  timeProgressPercent: number;
  isTimerRunning: boolean;
  timerSeconds: number;
  formatTimer: (seconds: number) => string;
  isLoggingTime: boolean;
  logHours: string;
  logMinutes: string;
  logDate: string;
  logDescription: string;
  logIsBillable: boolean;
  isSavingLog: boolean;
  onToggleLoggingTime: () => void;
  onSetLogHours: (val: string) => void;
  onSetLogMinutes: (val: string) => void;
  onSetLogDate: (val: string) => void;
  onSetLogDescription: (val: string) => void;
  onSetLogIsBillable: (val: boolean) => void;
  onSubmitLog: () => void;
  onDeleteLog: (logId: string) => void;
}

export const TaskTimeTrackingCard: React.FC<TaskTimeTrackingCardProps> = ({
  timeTrackingData,
  estimateMinutes = 0,
  totalLoggedMinutes,
  timeProgressPercent,
  isTimerRunning,
  timerSeconds,
  formatTimer,
  isLoggingTime,
  logHours,
  logMinutes,
  logDate,
  logDescription,
  logIsBillable,
  isSavingLog,
  onToggleLoggingTime,
  onSetLogHours,
  onSetLogMinutes,
  onSetLogDate,
  onSetLogDescription,
  onSetLogIsBillable,
  onSubmitLog,
  onDeleteLog,
}) => {
  return (
    <div
      id="section-time-tracking"
      className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-bold text-foreground">Time Tracking & Worklogs</span>
        </div>
        <div className="flex items-center gap-2">
          {isTimerRunning && (
            <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-600 text-xs font-mono font-bold animate-pulse">
              ⏱ {formatTimer(timerSeconds)}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 cursor-pointer"
            onClick={onToggleLoggingTime}
          >
            <Plus className="w-3.5 h-3.5" /> Log Time
          </Button>
        </div>
      </div>

      {/* Time progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Logged:{' '}
            <strong className="text-foreground">{(totalLoggedMinutes / 60).toFixed(1)}h</strong>
          </span>
          <span>
            Estimate:{' '}
            <strong className="text-foreground">
              {estimateMinutes ? `${(estimateMinutes / 60).toFixed(1)}h` : 'None'}
            </strong>
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              estimateMinutes > 0 && totalLoggedMinutes > estimateMinutes
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${estimateMinutes > 0 ? timeProgressPercent : 100}%` }}
          />
        </div>
      </div>

      {isLoggingTime && (
        <div className="p-3.5 bg-muted/40 border border-border rounded-xl space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Hours</Label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                className="h-8 text-sm bg-background"
                value={logHours}
                onChange={(e) => onSetLogHours(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Minutes</Label>
              <Input
                type="number"
                min="0"
                placeholder="30"
                className="h-8 text-sm bg-background"
                value={logMinutes}
                onChange={(e) => onSetLogMinutes(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
            <DatePicker
              value={logDate}
              onChange={onSetLogDate}
              triggerClassName="h-8 text-sm bg-background"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Work Note</Label>
            <Input
              placeholder="Describe work completed..."
              className="h-8 text-sm bg-background"
              value={logDescription}
              onChange={(e) => onSetLogDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={logIsBillable}
                onChange={(e) => onSetLogIsBillable(e.target.checked)}
                className="rounded accent-primary cursor-pointer"
              />
              Billable client work
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs cursor-pointer"
                onClick={onToggleLoggingTime}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs cursor-pointer"
                onClick={onSubmitLog}
                disabled={isSavingLog}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Time logs history entries */}
      {timeTrackingData?.timeLogs && timeTrackingData.timeLogs.length > 0 && (
        <div className="space-y-1.5 mt-2 pt-2 border-t border-border/50">
          {timeTrackingData.timeLogs.slice(0, 4).map((log: any) => (
            <div
              key={log.id}
              className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/20 border border-border/50 group hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {(log.minutes / 60).toFixed(1)} hrs
                </span>
                <span className="text-muted-foreground truncate max-w-[180px]">
                  {log.description || 'Work logged'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{log.loggedDate}</span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-0.5 cursor-pointer"
                  onClick={() => onDeleteLog(log.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
