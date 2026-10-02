import React, { memo, useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@boardly/ui/card';
import { Eye, AlertCircle, Calendar, CheckSquare, MessageSquare, Paperclip } from 'lucide-react';
import { isPast } from 'date-fns';
import { PriorityBadge } from '../PriorityBadge';
import { CardHoverPreviewPortal } from './CardHoverPreviewPortal';
import type { KanbanCard } from './types';

interface KanbanCardViewProps {
  card: KanbanCard;
  isDragging?: boolean;
  isOverlay?: boolean;
  isDraggingActive?: boolean;
  onClick?: () => void;
}

export const KanbanCardView = memo(function KanbanCardView({
  card,
  isDragging = false,
  isOverlay = false,
  isDraggingActive = false,
  onClick,
}: KanbanCardViewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimeoutRef = useRef<any>(null);

  const handleMouseEnter = () => {
    if (isDragging || isOverlay || isDraggingActive) return;
    hoverTimeoutRef.current = setTimeout(() => {
      if (cardRef.current) {
        setAnchorRect(cardRef.current.getBoundingClientRect());
        setShowPreview(true);
      }
    }, 700);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowPreview(false);
    setAnchorRect(null);
  };

  const handleTriggerQuickPeek = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cardRef.current) {
      setAnchorRect(cardRef.current.getBoundingClientRect());
      setShowPreview(true);
    }
  };

  useEffect(() => {
    if (isDraggingActive || isDragging || isOverlay) {
      setShowPreview(false);
      setAnchorRect(null);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    }
  }, [isDraggingActive, isDragging, isOverlay]);

  useEffect(() => {
    if (!showPreview) return;
    const handleScroll = () => {
      setShowPreview(false);
      setAnchorRect(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showPreview]);

  // When dragging the item inside the list, render an elegant ghost placeholder slot
  if (isDragging && !isOverlay) {
    return (
      <div className="w-full min-h-[76px] rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 transition-all duration-200 pointer-events-none" />
    );
  }

  const isDueOverdue = card.dueDate ? isPast(new Date(card.dueDate)) : false;
  const primaryAssignee = card.assignee || card.assignees?.[0];
  const hasChecklists = (card.checklistTotal ?? 0) > 0;
  const isChecklistComplete = hasChecklists && card.checklistDone === card.checklistTotal;

  return (
    <div
      ref={cardRef}
      className="relative select-none group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Card
        className={`transition-all rounded-xl overflow-hidden ${
          isOverlay
            ? 'shadow-2xl shadow-black/60 ring-2 ring-primary/80 rotate-2 scale-[1.03] bg-card/95 backdrop-blur-md cursor-grabbing border-primary/50'
            : 'cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-md border-border/80 bg-card'
        }`}
        onClick={(e) => {
          if (!isOverlay && !isDragging && onClick && !e.defaultPrevented) {
            setShowPreview(false);
            onClick();
          }
        }}
      >
        <CardContent className="p-3 space-y-2 relative">
          {/* Top: Labels + Hover Quick Peek Button */}
          <div className="flex items-center justify-between gap-1 min-h-[20px]">
            <div className="flex flex-wrap gap-1">
              {card.labels &&
                card.labels.length > 0 &&
                card.labels.map((lbl) => (
                  <span
                    key={lbl.id}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1"
                    style={{
                      backgroundColor: `${lbl.color}20`,
                      color: lbl.color,
                      border: `1px solid ${lbl.color}35`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: lbl.color }}
                    />
                    <span className="truncate max-w-[90px]">{lbl.name}</span>
                  </span>
                ))}
            </div>

            {/* Quick Peek Button on Card Hover */}
            {!isOverlay && !isDragging && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex items-center gap-1">
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Quick View Details"
                  onClick={handleTriggerQuickPeek}
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Title with Ticket Key */}
          <div className="flex items-start gap-1.5 leading-snug">
            {card.key && (
              <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0 border border-primary/20">
                {card.key}
              </span>
            )}
            <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {card.title}
            </span>
          </div>

          {/* Stage + Priority Badges if assigned */}
          <div className="flex items-center gap-1 flex-wrap">
            {card.priority && <PriorityBadge priority={card.priority} />}
            {card.stage && (
              <span
                className="px-1.5 py-0.2 rounded text-[10px] font-medium border"
                style={{
                  backgroundColor: `${card.stage.color}15`,
                  color: card.stage.color,
                  borderColor: `${card.stage.color}30`,
                }}
              >
                {card.stage.name}
              </span>
            )}
          </div>

          {/* Bottom Row: Metadata Badges & Assignee Avatar */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground gap-2">
            <div className="flex items-center flex-wrap gap-2 min-w-0">
              {/* Due Date */}
              {card.dueDate && (
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    isDueOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'
                  }`}
                  title={card.dueDate ? new Date(card.dueDate).toLocaleDateString() : ''}
                >
                  {isDueOverdue ? (
                    <AlertCircle className="w-3 h-3 text-destructive" />
                  ) : (
                    <Calendar className="w-3 h-3" />
                  )}
                  <span>
                    {new Date(card.dueDate).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </span>
              )}

              {/* Checklist Progress */}
              {hasChecklists && (
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    isChecklistComplete ? 'text-emerald-500 font-semibold' : 'text-muted-foreground'
                  }`}
                  title="Checklist completion"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>
                    {card.checklistDone}/{card.checklistTotal}
                  </span>
                </span>
              )}

              {/* Story Points */}
              {card.storyPoints !== null && card.storyPoints !== undefined && (
                <span className="px-1.5 py-0.2 rounded bg-muted text-foreground font-mono text-[10px] font-medium">
                  {card.storyPoints} pts
                </span>
              )}

              {/* Comments Count */}
              {(card.commentsCount ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  title="Comments"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>{card.commentsCount}</span>
                </span>
              )}

              {/* Attachments Count */}
              {(card.attachmentsCount ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  title="Attachments"
                >
                  <Paperclip className="w-3 h-3" />
                  <span>{card.attachmentsCount}</span>
                </span>
              )}
            </div>

            {/* Assignee Avatar */}
            {primaryAssignee ? (
              <div
                className="shrink-0"
                title={`Assigned to: ${primaryAssignee.name || primaryAssignee.email}`}
              >
                {primaryAssignee.avatarUrl ? (
                  <img
                    src={primaryAssignee.avatarUrl}
                    alt={primaryAssignee.name}
                    className="w-5 h-5 rounded-full object-cover ring-1 ring-border shadow-2xs"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold shadow-2xs">
                    {primaryAssignee.name
                      ? primaryAssignee.name.substring(0, 1).toUpperCase()
                      : 'U'}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="w-4 h-4 rounded-full border border-dashed border-border/80 flex items-center justify-center text-[8px] text-muted-foreground/40 shrink-0"
                title="Unassigned"
              >
                +
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Portaled Non-Clipped Quick Preview Card */}
      {showPreview && anchorRect && !isDragging && !isOverlay && !isDraggingActive && (
        <CardHoverPreviewPortal
          card={card}
          anchorRect={anchorRect}
          onOpenDetails={() => {
            setShowPreview(false);
            if (onClick) onClick();
          }}
          onClose={() => {
            setShowPreview(false);
            setAnchorRect(null);
          }}
        />
      )}
    </div>
  );
});
