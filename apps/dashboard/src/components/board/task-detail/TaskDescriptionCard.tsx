import React from 'react';
import { Button } from '@boardly/ui/button';
import { PriorityBadge } from '../PriorityBadge';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import { Kbd } from '../../ui/Kbd';
import {
  FileText,
  Edit3,
  ChevronUp,
  ChevronDown,
  Bold,
  Italic,
  Code,
  List as ListIcon,
  CheckSquare,
  Quote,
  Save,
} from 'lucide-react';

interface TaskDescriptionCardProps {
  cardTitle: string;
  cardPriority?: { name?: string | null; color?: string | null } | null | any;
  descriptionValue: string;
  isDescDirty: boolean;
  isDescExpanded: boolean;
  descTab: 'write' | 'preview';
  isPending: boolean;
  onUpdateTitle: (title: string) => void;
  onDescriptionChange: (val: string) => void;
  onSetDescTab: (tab: 'write' | 'preview') => void;
  onSetIsDescExpanded: (expanded: boolean) => void;
  onSaveDescription: () => void;
  onDiscardDescription: () => void;
  onInsertMarkdown: (prefix: string, suffix?: string) => void;
}

export const TaskDescriptionCard: React.FC<TaskDescriptionCardProps> = ({
  cardTitle,
  cardPriority,
  descriptionValue,
  isDescDirty,
  isDescExpanded,
  descTab,
  isPending,
  onUpdateTitle,
  onDescriptionChange,
  onSetDescTab,
  onSetIsDescExpanded,
  onSaveDescription,
  onDiscardDescription,
  onInsertMarkdown,
}) => {
  return (
    <div className="space-y-4">
      {/* Task Title Header (Large, Crisp with inline editing) */}
      <div className="flex items-center gap-2">
        <PriorityBadge priority={cardPriority} />
        <input
          type="text"
          className="w-full text-xl sm:text-2xl font-bold bg-transparent border-b border-transparent hover:border-border focus:border-ring focus:bg-muted/20 rounded-lg px-1.5 py-1 outline-none transition-colors text-foreground tracking-tight"
          defaultValue={cardTitle}
          placeholder="Task title..."
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== cardTitle) {
              onUpdateTitle(e.target.value.trim());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      {/* ─── REQUIREMENT / DESCRIPTION CARD (Bitrix24 Style with Edit & Expand) ─── */}
      <div
        id="section-status-summary"
        className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Requirement / Description</span>
            {isDescDirty && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-semibold flex items-center gap-1.5 border border-amber-500/20 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
              </span>
            )}
          </div>

          {/* Action Buttons: Edit & Expand Toggle */}
          <div className="flex items-center gap-2">
            {descTab === 'preview' && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-primary/10"
                onClick={() => onSetDescTab('write')}
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            )}

            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 rounded hover:bg-muted"
              onClick={() => onSetIsDescExpanded(!isDescExpanded)}
            >
              {isDescExpanded ? (
                <>
                  <span>Collapse</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>Expand</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Description Body */}
        {isDescExpanded && (
          <div>
            {descTab === 'write' ? (
              <div className="border border-border rounded-xl bg-muted/20 overflow-hidden focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all">
                {/* Markdown Quick Toolbar */}
                <div className="flex items-center gap-1 p-1.5 bg-muted/40 border-b border-border text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => onInsertMarkdown('**', '**')}
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => onInsertMarkdown('*', '*')}
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => onInsertMarkdown('### ')}
                    title="Heading"
                  >
                    <span className="text-xs font-bold font-mono">H</span>
                  </Button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => onInsertMarkdown('`', '`')}
                    title="Code"
                  >
                    <Code className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => onInsertMarkdown('- ')}
                    title="Bullet list"
                  >
                    <ListIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => onInsertMarkdown('- [ ] ')}
                    title="Checklist item"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => onInsertMarkdown('> ')}
                    title="Quote"
                  >
                    <Quote className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <textarea
                  id="card-description-editor"
                  className="w-full min-h-[140px] p-3.5 bg-transparent border-0 outline-none text-xs leading-relaxed resize-y placeholder:text-muted-foreground"
                  placeholder="Add structured technical requirement, acceptance criteria, or context..."
                  value={descriptionValue}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      onSaveDescription();
                    }
                  }}
                />
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/30 border-t border-border/60 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    Markdown supported • <Kbd shortcut="mod+enter" /> to save
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={onDiscardDescription}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs px-3 gap-1.5 cursor-pointer font-semibold"
                      disabled={isPending}
                      onClick={onSaveDescription}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isPending ? 'Saving...' : 'Save requirement'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {descriptionValue?.trim() ? (
                  <div
                    className="p-4 rounded-xl border border-border/70 bg-muted/15 min-h-[90px] text-xs text-foreground/90 hover:border-border transition-colors cursor-text leading-relaxed"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (
                        target.tagName !== 'A' &&
                        target.tagName !== 'INPUT' &&
                        target.tagName !== 'BUTTON'
                      ) {
                        onSetDescTab('write');
                      }
                    }}
                  >
                    <MarkdownRenderer
                      content={descriptionValue}
                      onToggleTask={(newContent) => {
                        onDescriptionChange(newContent);
                        onSaveDescription();
                      }}
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => onSetDescTab('write')}
                    className="p-5 rounded-xl border border-dashed border-border bg-muted/10 hover:bg-muted/20 hover:border-primary/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center select-none"
                  >
                    <FileText className="w-5 h-5 text-muted-foreground/60" />
                    <p className="text-xs font-semibold text-foreground/80">
                      No requirement provided
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Click here to write technical specifications or acceptance criteria
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
