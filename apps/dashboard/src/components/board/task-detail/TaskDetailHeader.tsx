import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@boardly/ui/button';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import {
  ArrowLeft,
  Flame,
  MessageSquare,
  Share2,
  MoreHorizontal,
  Tag,
  Copy,
  GitBranch,
  CopyPlus,
  PlusCircle,
  Layers,
  Archive,
  Trash2,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';

interface TaskDetailHeaderProps {
  card: any;
  lists: any[];
  mode: 'modal' | 'page';
  mobileActiveTab: 'details' | 'chat';
  commentsCount: number;
  copiedId: boolean;
  copiedLink: boolean;
  copiedBranch: boolean;
  taskIdentifier: string;
  isCloning: boolean;
  onSetMobileActiveTab: (tab: 'details' | 'chat') => void;
  onCopyId: () => void;
  onCopyLink: () => void;
  onCopyBranch: () => void;
  onOpenShareModal: () => void;
  onCloneTask: () => void;
  onCreateSubtask: () => void;
  onCloneAsSubtask: () => void;
  onOpenArchiveConfirm: () => void;
  onOpenDeleteConfirm: () => void;
  onAttemptAction: (action: () => void) => void;
  onClose?: () => void;
}

export const TaskDetailHeader: React.FC<TaskDetailHeaderProps> = ({
  card,
  lists,
  mode,
  mobileActiveTab,
  commentsCount,
  copiedId,
  copiedLink,
  copiedBranch,
  taskIdentifier,
  isCloning,
  onSetMobileActiveTab,
  onCopyId,
  onCopyLink,
  onCopyBranch,
  onOpenShareModal,
  onCloneTask,
  onCreateSubtask,
  onCloneAsSubtask,
  onOpenArchiveConfirm,
  onOpenDeleteConfirm,
  onAttemptAction,
  onClose,
}) => {
  const navigate = useNavigate();
  const { can, isLoading: permsLoading } = usePermissions();
  // POST /cards (+parentCardId) and POST /cards/:id/clone are card.create-only.
  const canCloneTask = permsLoading ? false : can('card.create');
  const canDeleteTask = permsLoading ? false : can('card.delete');

  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b border-border/70 shrink-0 bg-card/95 backdrop-blur-md z-20">
      {/* Left: Breadcrumbs / Path & Identifier */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden flex-wrap">
        {mode === 'page' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => (card.boardId ? navigate(`/b/${card.boardId}`) : navigate(-1))}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        )}

        {card.boardName && (
          <>
            <span
              className="font-semibold text-foreground/80 hover:text-foreground cursor-pointer truncate max-w-[160px]"
              onClick={() => navigate(`/b/${card.boardId}`)}
            >
              {card.boardName}
            </span>
            <span>/</span>
          </>
        )}

        {/* Current Column */}
        <span
          className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/60 font-medium text-xs truncate max-w-[160px]"
          title={`Current column: ${lists?.find((l: any) => l.id === card.listId)?.name || card.listName || ''}`}
        >
          {lists?.find((l: any) => l.id === card.listId)?.name || card.listName || 'Backlog'}
        </span>

        {/* User-Friendly Task Identifier Pill */}
        <div
          onClick={onCopyId}
          className="px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 font-mono font-bold text-xs cursor-pointer transition-all flex items-center gap-1 shrink-0 select-none"
          title={`Click to copy Task ID (${taskIdentifier})`}
        >
          <Tag className="w-3 h-3 opacity-70" />
          <span>{copiedId ? 'Copied ID!' : taskIdentifier}</span>
        </div>

        {/* Priority / High Flame Indicator */}
        {card.priority === 'urgent' || card.priority === 'high' ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-semibold">
            <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
            <span>High Priority</span>
          </div>
        ) : null}
      </div>

      {/* Right: Quick Action Controls, Mobile Tab Switcher & Dropdown */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Mobile Tab Switcher (Details vs Chat) */}
        <div className="flex lg:hidden items-center bg-muted/70 p-0.5 rounded-lg border border-border mr-1">
          <button
            type="button"
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              mobileActiveTab === 'details'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onSetMobileActiveTab('details')}
          >
            Task
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
              mobileActiveTab === 'chat'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => onSetMobileActiveTab('chat')}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Chat ({commentsCount})</span>
          </button>
        </div>

        {/* Share Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs text-foreground gap-1.5 cursor-pointer hover:bg-muted font-medium"
          onClick={onOpenShareModal}
          title="Share task & copy links"
        >
          <Share2 className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">Share</span>
        </Button>

        {/* Three-Dot Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Task options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56 p-1.5">
            <div className="px-2 py-1.5 bg-muted/50 rounded-md border border-border/60 mb-1 flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-foreground">
                {taskIdentifier}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                Identifier
              </span>
            </div>

            <DropdownMenuItem onClick={onCopyId} className="cursor-pointer text-xs gap-2">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span>Copy Task ID</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {taskIdentifier}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={onCopyLink} className="cursor-pointer text-xs gap-2">
              <Copy className="w-3.5 h-3.5 text-primary" />
              <span>{copiedLink ? 'Copied Link!' : 'Copy Task Link'}</span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={onCopyBranch} className="cursor-pointer text-xs gap-2">
              <GitBranch className="w-3.5 h-3.5 text-primary" />
              <span>{copiedBranch ? 'Copied Branch!' : 'Copy Git Branch'}</span>
            </DropdownMenuItem>

            {(canCloneTask || canDeleteTask) && <DropdownMenuSeparator />}

            {canCloneTask && (
              <DropdownMenuItem
                onClick={onCloneTask}
                disabled={isCloning}
                className="cursor-pointer text-xs gap-2"
              >
                <CopyPlus className="w-3.5 h-3.5 text-emerald-500" />
                <span>Clone Task</span>
              </DropdownMenuItem>
            )}

            {canCloneTask && (
              <DropdownMenuItem onClick={onCreateSubtask} className="cursor-pointer text-xs gap-2">
                <PlusCircle className="w-3.5 h-3.5 text-indigo-500" />
                <span>Create Subtask</span>
              </DropdownMenuItem>
            )}

            {canCloneTask && (
              <DropdownMenuItem
                onClick={onCloneAsSubtask}
                disabled={isCloning}
                className="cursor-pointer text-xs gap-2"
              >
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                <span>Clone & Create Subtask</span>
              </DropdownMenuItem>
            )}

            {canDeleteTask && (
              <>
                {canCloneTask && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={onOpenArchiveConfirm}
                  className="cursor-pointer text-xs gap-2"
                >
                  <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Archive Task</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={onOpenDeleteConfirm}
                  variant="destructive"
                  className="cursor-pointer text-xs gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Task</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {mode === 'modal' ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() =>
              onAttemptAction(() => {
                onClose?.();
                navigate(`/cards/${card.id}`);
              })
            }
            title="Open as full screen page"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => onAttemptAction(() => navigate(`/b/${card.boardId}`))}
            title="Return to Kanban view"
          >
            <Minimize2 className="w-4 h-4" />
          </Button>
        )}

        {mode === 'modal' && onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => onAttemptAction(onClose)}
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
