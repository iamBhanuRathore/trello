import { createPortal } from 'react-dom';
import { Button } from '@boardly/ui/button';
import { ListChecks, MessageSquare, Paperclip, Maximize2 } from 'lucide-react';
import { isPast, format } from 'date-fns';
import type { KanbanCard } from './types';

interface CardHoverPreviewPortalProps {
  card: KanbanCard;
  anchorRect: DOMRect;
  onOpenDetails: () => void;
  onClose: () => void;
}

export function CardHoverPreviewPortal({
  card,
  anchorRect,
  onOpenDetails,
  onClose,
}: CardHoverPreviewPortalProps) {
  const isDueOverdue = card.dueDate ? isPast(new Date(card.dueDate)) : false;
  const primaryAssignee = card.assignee || card.assignees?.[0];
  const hasChecklists = (card.checklistTotal ?? 0) > 0;
  const checklistPercent = hasChecklists
    ? Math.round(((card.checklistDone ?? 0) / card.checklistTotal!) * 100)
    : 0;

  const popoverWidth = 320;
  const padding = 16;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left: number;
  let top: number;

  // Horizontal Placement: prefer right of card -> left of card -> center aligned
  if (anchorRect.right + popoverWidth + padding <= viewportWidth) {
    left = anchorRect.right + 12;
    top = Math.max(padding, Math.min(anchorRect.top, viewportHeight - 390));
  } else if (anchorRect.left - popoverWidth - padding >= 0) {
    left = anchorRect.left - popoverWidth - 12;
    top = Math.max(padding, Math.min(anchorRect.top, viewportHeight - 390));
  } else {
    left = Math.max(padding, Math.min(anchorRect.left, viewportWidth - popoverWidth - padding));
    if (anchorRect.top - 360 >= padding) {
      top = anchorRect.top - 360;
    } else {
      top = Math.min(anchorRect.bottom + 12, viewportHeight - 390);
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${popoverWidth}px`,
        zIndex: 99999,
      }}
      className="p-4 rounded-2xl bg-card/95 backdrop-blur-2xl border border-border/80 shadow-[0_25px_60px_rgba(0,0,0,0.6)] ring-1 ring-primary/20 pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-150 text-foreground space-y-3"
      onMouseEnter={() => {}}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Row: Stage & Story Points & Due Date */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {card.stage ? (
            <span
              className="px-2 py-0.5 rounded-md text-[10px] font-semibold border"
              style={{
                backgroundColor: `${card.stage.color}20`,
                color: card.stage.color,
                borderColor: `${card.stage.color}35`,
              }}
            >
              {card.stage.name}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border/60">
              Task Preview
            </span>
          )}

          {card.storyPoints !== null && card.storyPoints !== undefined && (
            <span className="px-2 py-0.5 rounded-md bg-muted text-foreground font-mono text-[10px] font-semibold border border-border">
              {card.storyPoints} PTS
            </span>
          )}
        </div>

        {card.dueDate && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
              isDueOverdue
                ? 'bg-destructive/15 text-destructive border-destructive/30'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
            }`}
          >
            {isDueOverdue ? 'Overdue' : 'Due'} {format(new Date(card.dueDate), 'MMM d')}
          </span>
        )}
      </div>

      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((lbl) => (
            <span
              key={lbl.id}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium flex items-center gap-1"
              style={{
                backgroundColor: `${lbl.color}20`,
                color: lbl.color,
                border: `1px solid ${lbl.color}35`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lbl.color }} />
              {lbl.name}
            </span>
          ))}
        </div>
      )}

      {/* Title with Key */}
      <div className="space-y-1">
        {card.key && (
          <div>
            <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/25">
              {card.key}
            </span>
          </div>
        )}
        <div className="text-sm font-bold text-foreground leading-snug">{card.title}</div>
      </div>

      {/* Description Excerpt */}
      {card.description ? (
        <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-border/60 line-clamp-4 leading-relaxed font-sans">
          {card.description}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/60 italic">No description provided.</div>
      )}

      {/* Checklist Progress */}
      {hasChecklists && (
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-primary" /> Checklist Progress
            </span>
            <span className="font-mono text-foreground font-semibold text-[11px]">
              {card.checklistDone}/{card.checklistTotal} ({checklistPercent}%)
            </span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${checklistPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Assignee & Activity Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
        {primaryAssignee ? (
          <div className="flex items-center gap-2 min-w-0">
            {primaryAssignee.avatarUrl ? (
              <img
                src={primaryAssignee.avatarUrl}
                alt={primaryAssignee.name}
                className="w-5 h-5 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold">
                {primaryAssignee.name ? primaryAssignee.name.substring(0, 1).toUpperCase() : 'U'}
              </div>
            )}
            <span className="truncate max-w-[130px] font-medium text-foreground text-xs">
              {primaryAssignee.name || primaryAssignee.email}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground italic text-xs">Unassigned</span>
        )}

        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          {(card.commentsCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> {card.commentsCount}
            </span>
          )}
          {(card.attachmentsCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5" /> {card.attachmentsCount}
            </span>
          )}
        </div>
      </div>

      {/* Footer Action */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60 font-mono">Click card to edit</span>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-semibold gap-1.5 px-2.5 hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer"
          onClick={() => {
            onClose();
            onOpenDetails();
          }}
        >
          <Maximize2 className="w-3 h-3" /> Full Editor
        </Button>
      </div>
    </div>,
    document.body
  );
}
