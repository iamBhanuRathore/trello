import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, CheckSquare, Loader2, ArrowRight } from 'lucide-react';
import { searchService } from '../../lib/searchService';
import { useDialogClose } from '../../hooks/useDialogClose';

interface TaskMentionPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask: (task: { id: string; title: string; taskNumber?: string }) => void;
}

export const TaskMentionPickerModal: React.FC<TaskMentionPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectTask,
}) => {
  // One sanctioned close path (X / backdrop / Esc, idempotent).
  const { requestClose, handleOverlayClick } = useDialogClose({ isOpen, onClose });

  const [searchQuery, setSearchQuery] = useState('');

  const { data: results, isLoading } = useQuery({
    queryKey: ['chat', 'task-search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await searchService.search(searchQuery.trim());
      // Filter only cards
      return (res.cards || []).slice(0, 10);
    },
    enabled: isOpen && searchQuery.trim().length > 0,
  });

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header with search input */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search task to mention (e.g. login, design, bug)..."
            autoFocus
            className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground focus:ring-0 px-0"
          />
          <button
            type="button"
            onClick={requestClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {isLoading && (
            <div className="flex items-center justify-center p-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!isLoading && searchQuery.trim() && (!results || results.length === 0) && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No tasks found matching "{searchQuery}"
            </div>
          )}

          {!searchQuery.trim() && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Type keywords or task name to search tasks across your workspaces
            </div>
          )}

          {results?.map((card: any) => (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                onSelectTask({
                  id: card.id,
                  title: card.title,
                  taskNumber: card.taskNumber,
                });
                onClose();
              }}
              className="w-full text-left p-2.5 rounded-xl hover:bg-muted/70 transition-colors flex items-center justify-between gap-3 group cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <CheckSquare className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {card.taskNumber && (
                      <span className="text-[10px] font-mono font-bold text-muted-foreground px-1 py-0.5 rounded bg-muted">
                        #{card.taskNumber}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-foreground truncate">
                      {card.title}
                    </span>
                  </div>
                  {card.listName && (
                    <span className="text-[11px] text-muted-foreground">in {card.listName}</span>
                  )}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
