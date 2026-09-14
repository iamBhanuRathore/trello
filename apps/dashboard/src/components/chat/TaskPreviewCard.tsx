import React from 'react';
import { CheckSquare, ExternalLink } from 'lucide-react';

interface TaskPreviewCardProps {
  cardId: string;
  title: string;
  taskNumber?: string;
  onClick?: () => void;
}

export const TaskPreviewCard: React.FC<TaskPreviewCardProps> = ({
  cardId,
  title,
  taskNumber,
  onClick,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else {
      // Open card directly via query parameter or task route
      window.dispatchEvent(
        new CustomEvent('boardly:open-card', { detail: { cardId } })
      );
    }
  };

  return (
    <div
      onClick={handleClick}
      className="my-2 inline-flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/40 hover:bg-muted border border-border/80 text-xs text-foreground cursor-pointer transition-colors shadow-2xs group max-w-sm"
    >
      <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
        <CheckSquare className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {taskNumber && (
            <span className="text-[10px] font-mono font-bold text-muted-foreground bg-background/80 px-1 rounded">
              #{taskNumber}
            </span>
          )}
          <span className="font-semibold truncate text-foreground group-hover:text-primary transition-colors">
            {title}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">Linked Task</span>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors" />
    </div>
  );
};
