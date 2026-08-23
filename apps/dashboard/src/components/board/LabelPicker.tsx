import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Search, X, Check, Tag, Plus, Palette } from 'lucide-react';
import { Button } from '@boardly/ui/button';

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

export const PRESET_LABEL_COLORS = [
  { color: '#ef4444', name: 'Red' },
  { color: '#f97316', name: 'Orange' },
  { color: '#f59e0b', name: 'Amber' },
  { color: '#10b981', name: 'Emerald' },
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#3b82f6', name: 'Blue' },
  { color: '#8b5cf6', name: 'Violet' },
  { color: '#ec4899', name: 'Pink' },
  { color: '#6366f1', name: 'Indigo' },
  { color: '#14b8a6', name: 'Teal' },
];

export function LabelPicker({
  boardId,
  cardId,
  cardLabelIds,
  onClose,
}: LabelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_LABEL_COLORS[3].color);

  // Focus search on open
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on Escape or click outside
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

  // Fetch board labels
  const { data: boardLabels = [], isLoading } = useQuery<BoardLabel[]>({
    queryKey: ['boardLabels', boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}/labels`)).data,
    enabled: !!boardId,
  });

  // Toggle label on card mutation
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

  // Create new label mutation
  const createLabelMutation = useMutation({
    mutationFn: async () => {
      if (!newLabelName.trim() || !boardId) return;
      const res = await api.post(`/boards/${boardId}/labels`, {
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      // Attach to card immediately
      await api.post(`/cards/${cardId}/labels`, { labelId: res.data.id });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boardLabels', boardId] });
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      setNewLabelName('');
      setIsCreating(false);
    },
  });

  // Filter labels
  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return boardLabels;
    const q = searchQuery.toLowerCase().trim();
    return boardLabels.filter((lbl) => lbl.name.toLowerCase().includes(q));
  }, [boardLabels, searchQuery]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full rounded-2xl border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 z-50 flex flex-col text-foreground mt-2"
    >
      {/* ─── Header ─── */}
      <div className="p-3 border-b border-border/70 flex items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Labels
          </span>
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

      {/* ─── Search Bar ─── */}
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

      {/* ─── Labels List ─── */}
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

      {/* ─── Create Label Section ─── */}
      <div className="p-3 border-t border-border/70 bg-muted/20 space-y-3">
        {!isCreating ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1.5 justify-center border-dashed hover:border-primary hover:text-primary transition-colors"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Create new label
          </Button>
        ) : (
          <div className="space-y-3 animate-in fade-in-50 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Palette className="w-3.5 h-3.5 text-primary" />
                <span>Create Label</span>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-[11px] p-0.5"
                onClick={() => {
                  setIsCreating(false);
                  setNewLabelName('');
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Label Preview */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
              <span className="text-[10px] text-muted-foreground font-medium uppercase">Preview:</span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-md truncate max-w-[180px]"
                style={{
                  backgroundColor: `${newLabelColor}20`,
                  color: newLabelColor,
                  border: `1px solid ${newLabelColor}40`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block mr-1.5"
                  style={{ backgroundColor: newLabelColor }}
                />
                {newLabelName.trim() || 'Label Preview'}
              </span>
            </div>

            {/* Name Input */}
            <input
              type="text"
              placeholder="Label name (e.g. Frontend, High Priority)..."
              className="w-full h-8 px-3 text-xs rounded-lg bg-background border border-input focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-muted-foreground/70 transition-all"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLabelName.trim()) {
                  e.preventDefault();
                  createLabelMutation.mutate();
                }
              }}
              autoFocus
            />

            {/* Color Palette Grid */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Select Color
              </span>
              <div className="grid grid-cols-5 gap-2 pt-0.5">
                {PRESET_LABEL_COLORS.map(({ color, name }) => {
                  const isSelected = newLabelColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      title={name}
                      className={`h-6 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-105 shadow-sm'
                          : 'hover:scale-105 opacity-85 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewLabelColor(color)}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow-sm stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => {
                  setIsCreating(false);
                  setNewLabelName('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 h-7 text-xs"
                disabled={!newLabelName.trim() || createLabelMutation.isPending}
                onClick={() => createLabelMutation.mutate()}
              >
                {createLabelMutation.isPending ? 'Creating...' : 'Create & Attach'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Footer ─── */}
      <div className="p-2 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground px-3">
        <span>{filteredLabels.length} available</span>
        <span className="text-muted-foreground/60 font-mono">Press Esc to close</span>
      </div>
    </div>
  );
}
