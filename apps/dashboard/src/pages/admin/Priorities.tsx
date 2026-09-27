import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Plus, Pencil, Trash2, Star, ChevronUp, ChevronDown, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { priorityService, type Priority } from '../../lib/priorityService';
import { QueryError } from '../../components/common/QueryError';

export function Priorities() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#8b5cf6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#64748b');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    data: priorities = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['priorities'],
    queryFn: () => priorityService.list(),
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['priorities'] });

  const createMutation = useMutation({
    mutationFn: () => priorityService.create({ name: newName.trim(), color: newColor }),
    onSuccess: () => {
      setNewName('');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create priority');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; color?: string; rank?: number };
    }) => priorityService.update(id, input),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update priority');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => priorityService.remove(id),
    onSuccess: () => {
      setConfirmDeleteId(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete priority');
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => priorityService.setDefault(id),
    onSuccess: () => invalidate(),
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to set default priority');
    },
  });

  const moveRank = (p: Priority, dir: -1 | 1) => {
    const sorted = [...priorities].sort((a, b) => a.rank - b.rank);
    const idx = sorted.findIndex((x) => x.id === p.id);
    const other = sorted[idx + dir];
    if (!other) return;
    // Swap ranks with the neighbor (two updates, same invalidation).
    updateMutation.mutate({ id: p.id, input: { rank: other.rank } });
    updateMutation.mutate({ id: other.id, input: { rank: p.rank } });
  };

  const startEdit = (p: Priority) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditColor(p.color);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/80 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary" />
            Task Priorities
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Org-wide priority levels with colors. Used on task cards, filters, and the task detail
            screen. New tasks default to the starred level.
          </p>
        </div>
      </div>

      {/* Add form */}
      <div className="p-4 rounded-2xl border border-border/80 bg-card/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            aria-label="New priority color"
            className="w-9 h-9 rounded-lg border border-border bg-background cursor-pointer shrink-0 p-1"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New priority name (e.g. Blocker)..."
            className="h-9 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim() && !createMutation.isPending) {
                e.preventDefault();
                createMutation.mutate();
              }
            }}
          />
        </div>
        <Button
          size="sm"
          disabled={!newName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="h-9 text-xs gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Priority
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Loading priorities...</div>
      ) : isError ? (
        <QueryError
          message="Couldn't load priorities. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : (
        <div className="rounded-2xl border border-border/80 bg-card/40 divide-y divide-border/50 overflow-hidden">
          {priorities.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="w-4 h-4 rounded-full shrink-0 border border-black/20"
                style={{ backgroundColor: p.color }}
              />
              {editingId === p.id ? (
                <>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    aria-label="Priority color"
                    className="w-8 h-8 rounded-lg border border-border bg-background cursor-pointer shrink-0 p-1"
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-xs flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!editName.trim() || updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        id: p.id,
                        input: { name: editName.trim(), color: editColor },
                      })
                    }
                    aria-label="Save"
                    className="h-8 w-8 p-0 cursor-pointer"
                  >
                    <Check className="w-4 h-4 text-emerald-500" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel"
                    className="h-8 w-8 p-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                      {p.name}
                      {p.isDefault && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          default
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => defaultMutation.mutate(p.id)}
                    disabled={p.isDefault || defaultMutation.isPending}
                    title={p.isDefault ? 'Default for new tasks' : 'Set as default for new tasks'}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:cursor-default ${
                      p.isDefault
                        ? 'text-amber-500'
                        : 'text-muted-foreground hover:text-amber-500 hover:bg-muted'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${p.isDefault ? 'fill-amber-500' : ''}`} />
                  </button>
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      onClick={() => moveRank(p, -1)}
                      aria-label="Move up"
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRank(p, 1)}
                      aria-label="Move down"
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    aria-label={`Rename ${p.name}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {confirmDeleteId === p.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(p.id)}
                        className="h-7 text-[11px] cursor-pointer"
                      >
                        Confirm?
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-7 w-7 p-0 cursor-pointer"
                        aria-label="Cancel delete"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(p.id)}
                      aria-label={`Delete ${p.name}`}
                      title="Delete (tasks move to the default level)"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Deleting a level moves its tasks to the default — nothing is ever orphaned. The last
        remaining level cannot be deleted.
      </p>
    </div>
  );
}
