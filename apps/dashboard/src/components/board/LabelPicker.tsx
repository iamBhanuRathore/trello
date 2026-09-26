import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Search, X, Check, Tag, ExternalLink } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export interface BoardLabel {
  id: string;
  boardId: string;
  name: string;
  color: string;
}

interface LabelPickerProps {
  boardId?: string;
  cardId: string;
  cardLabelIds: Set<string>;
  onClose: () => void;
}

export function LabelPicker({ boardId, cardId, cardLabelIds, onClose }: LabelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = user?.isPlatformAdmin || user?.role === 'org_owner' || user?.role === 'org_admin';

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const { data: boardLabels = [], isLoading } = useQuery<BoardLabel[]>({
    queryKey: ['boardLabels', boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}/labels`)).data,
    enabled: !!boardId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const toggleLabelMutation = useMutation({
    mutationFn: async ({ labelId, hasLabel }: { labelId: string; hasLabel: boolean }) => {
      if (hasLabel) {
        await api.delete(`/cards/${cardId}/labels/${labelId}`);
      } else {
        await api.post(`/cards/${cardId}/labels`, { labelId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
    },
  });

  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return boardLabels;
    const q = searchQuery.toLowerCase().trim();
    return boardLabels.filter((lbl) => lbl.name.toLowerCase().includes(q));
  }, [boardLabels, searchQuery]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full rounded-2xl border border-border/80 bg-popover/98 dark:bg-slate-900/98 backdrop-blur-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-50 flex flex-col text-foreground ring-1 ring-white/5"
    >
      <div className="p-3 border-b border-border/70 flex items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">Labels</span>
          {boardLabels.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
              {boardLabels.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="p-2.5 border-b border-border/50 bg-background/50">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search labels..."
            className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-muted/60 border border-input/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-muted-foreground/70 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 text-muted-foreground hover:text-foreground p-0.5"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Loading labels...</p>
        ) : filteredLabels.length === 0 ? (
          <div className="p-4 text-center space-y-1">
            <p className="text-xs font-medium text-foreground">No labels found</p>
            {searchQuery && (
              <p className="text-[11px] text-muted-foreground">
                No labels match &ldquo;{searchQuery}&rdquo;
              </p>
            )}
          </div>
        ) : (
          filteredLabels.map((lbl) => {
            const hasLabel = cardLabelIds.has(lbl.id);
            return (
              <button
                key={lbl.id}
                type="button"
                className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all group cursor-pointer ${
                  hasLabel
                    ? 'bg-primary/10 border border-primary/25 shadow-xs'
                    : 'hover:bg-muted/70 border border-transparent'
                }`}
                onClick={() => toggleLabelMutation.mutate({ labelId: lbl.id, hasLabel })}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-1 ring-border/50"
                    style={{ backgroundColor: lbl.color }}
                  />
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-md truncate transition-colors"
                    style={{
                      backgroundColor: `${lbl.color}15`,
                      color: lbl.color,
                      border: `1px solid ${lbl.color}30`,
                    }}
                  >
                    {lbl.name}
                  </span>
                </div>
                <div
                  className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    hasLabel
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'border border-border/80 group-hover:border-primary/60 group-hover:bg-primary/5 text-transparent group-hover:text-primary/40'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-border/70 bg-muted/20">
        {isAdmin ? (
          <Link
            to="/admin/labels"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 w-full h-8 text-xs rounded-lg border border-dashed border-border hover:border-primary/60 hover:bg-primary/5 hover:text-primary text-muted-foreground transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Manage labels in Admin Panel
          </Link>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground/70">
            Contact an admin to create or manage labels
          </p>
        )}
      </div>

      <div className="p-2 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground px-3">
        <span>{filteredLabels.length} available</span>
        <span className="text-muted-foreground/60 font-mono">Press Esc to close</span>
      </div>
    </div>
  );
}
