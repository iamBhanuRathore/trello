import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Flag,
  Plus,
  Pencil,
  Trash2,
  Star,
  Check,
  X,
  GripVertical,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import { priorityService, type Priority } from '../../lib/priorityService';
import { QueryError } from '../../components/common/QueryError';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { PriorityBadge } from '../../components/board/PriorityBadge';
import { useDialogClose } from '../../hooks/useDialogClose';

/** Jira/Linear-style swatch palette + freeform custom color. */
const COLOR_PRESETS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#64748b',
];

function ColorSwatches({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (c: string) => void;
  label: string;
}) {
  const customActive = !COLOR_PRESETS.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label={label}>
      {COLOR_PRESETS.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Color ${c}`}
            title={c}
            onClick={() => onChange(c)}
            className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer shrink-0 ${
              selected
                ? 'border-foreground scale-110 ring-2 ring-primary/30'
                : 'border-black/20 hover:scale-105'
            }`}
            style={{ backgroundColor: c }}
          />
        );
      })}
      <label
        title="Custom color"
        className={`relative w-7 h-7 rounded-full border-2 overflow-hidden cursor-pointer shrink-0 transition-all ${
          customActive
            ? 'border-foreground scale-110 ring-2 ring-primary/30'
            : 'border-dashed border-muted-foreground/60 hover:scale-105'
        }`}
      >
        <span className="sr-only">Custom color</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom priority color"
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <span
          className="absolute inset-0"
          style={{
            background: customActive
              ? value
              : 'conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#8b5cf6,#ef4444)',
          }}
        />
      </label>
    </div>
  );
}

export function Priorities() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#8b5cf6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#64748b');
  const [deleteTarget, setDeleteTarget] = useState<Priority | null>(null);

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

  const sorted = useMemo(
    () => [...priorities].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    [priorities]
  );
  const defaultPriority = useMemo(
    () => priorities.find((p) => p.isDefault) || [...priorities].sort((a, b) => a.rank - b.rank)[0],
    [priorities]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['priorities'] });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
  };

  const createMutation = useMutation({
    mutationFn: () => priorityService.create({ name: newName.trim(), color: newColor }),
    onSuccess: () => {
      setNewName('');
      invalidate();
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
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update priority');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => priorityService.remove(id),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete priority');
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => priorityService.setDefault(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['priorities'] }),
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to set default priority');
    },
  });

  /** Persist a new visual order: optimistic reorder, sequential rank writes, rollback. */
  const reorderMutation = useMutation({
    mutationFn: async (next: Priority[]) => {
      for (let i = 0; i < next.length; i++) {
        if (next[i].rank !== i) await priorityService.update(next[i].id, { rank: i });
      }
    },
    onMutate: async (next: Priority[]) => {
      await queryClient.cancelQueries({ queryKey: ['priorities'] });
      const prev = queryClient.getQueryData<Priority[]>(['priorities']);
      queryClient.setQueryData<Priority[]>(['priorities'], (old) => {
        if (!old) return old;
        const rankById = new Map(next.map((p, i) => [p.id, i]));
        return old.map((p) => (rankById.has(p.id) ? { ...p, rank: rankById.get(p.id)! } : p));
      });
      return { prev };
    },
    onError: (err: any, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['priorities'], ctx.prev);
      toast.error(err?.response?.data?.error || 'Failed to reorder priorities');
    },
    onSettled: () => invalidate(),
  });

  const moveRank = (p: Priority, dir: -1 | 1) => {
    const idx = sorted.findIndex((x) => x.id === p.id);
    if (idx === -1 || idx + dir < 0 || idx + dir >= sorted.length) return;
    reorderMutation.mutate(arrayMove(sorted, idx, idx + dir));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sorted.findIndex((p) => p.id === active.id);
    const newIdx = sorted.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    reorderMutation.mutate(arrayMove(sorted, oldIdx, newIdx));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const startEdit = (p: Priority) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditColor(p.color);
  };
  const cancelEdit = () => setEditingId(null);
  const editDirty = (p: Priority) =>
    editName.trim() !== p.name || editColor.toLowerCase() !== p.color.toLowerCase();
  const saveEdit = (p: Priority) => {
    if (!editName.trim() || !editDirty(p) || updateMutation.isPending) return;
    updateMutation.mutate({
      id: p.id,
      input: { name: editName.trim(), color: editColor },
    });
  };

  const canCreate = Boolean(newName.trim()) && !createMutation.isPending;

  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen: deleteTarget !== null,
    onClose: () => setDeleteTarget(null),
  });

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
            screen. New tasks default to the starred level — drag rows to reorder.
          </p>
        </div>
      </div>

      {/* Add form */}
      <div className="p-4 rounded-2xl border border-border/80 bg-card/60 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New priority name (e.g. Blocker)..."
            aria-label="New priority name"
            className="h-9 text-xs flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canCreate) {
                e.preventDefault();
                createMutation.mutate();
              }
            }}
          />
          <Button
            size="sm"
            disabled={!canCreate}
            title={newName.trim() ? undefined : 'Enter a name for the new level'}
            onClick={() => createMutation.mutate()}
            className="h-9 text-xs gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {createMutation.isPending ? 'Adding…' : 'Add Priority'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ColorSwatches value={newColor} onChange={setNewColor} label="New priority color" />
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Preview:</span>
            <PriorityBadge priority={{ name: newName.trim() || 'Blocker', color: newColor }} />
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div
          className="rounded-2xl border border-border/80 overflow-hidden"
          aria-label="Loading priorities"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50 last:border-0"
            >
              <div className="w-5 h-5 rounded-full bg-muted animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-muted animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <QueryError
          message="Couldn't load priorities. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-2xl border-dashed bg-card/20 space-y-2">
          <Flag className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-xs font-medium">No priority levels yet.</p>
          <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
            Add your first level above — e.g. Blocker, Urgent, Normal.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="rounded-2xl border border-border/80 bg-card/40 divide-y divide-border/50 overflow-hidden">
              {sorted.map((p) => (
                <SortableRow
                  key={p.id}
                  priority={p}
                  isEditing={editingId === p.id}
                  editName={editName}
                  editColor={editColor}
                  editDirty={editDirty(p)}
                  isSaving={updateMutation.isPending}
                  isReordering={reorderMutation.isPending}
                  onEditName={setEditName}
                  onEditColor={setEditColor}
                  onSave={() => saveEdit(p)}
                  onCancelEdit={cancelEdit}
                  onRename={() => startEdit(p)}
                  onMoveUp={() => moveRank(p, -1)}
                  onMoveDown={() => moveRank(p, 1)}
                  onSetDefault={() => defaultMutation.mutate(p.id)}
                  onDelete={() => setDeleteTarget(p)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <p className="text-[11px] text-muted-foreground">
        Deleting a level moves its tasks to the default — nothing is ever orphaned. The last
        remaining level cannot be deleted.
      </p>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={handleOpenChange}
        title={`Delete “${deleteTarget?.name}”?`}
        description={`Tasks using ${deleteTarget?.name || 'this level'} will move to the default level (${defaultPriority?.name || 'default'}). This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete Level'}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={async () => {
          if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget.id);
        }}
      />
    </div>
  );
}

function SortableRow(props: {
  priority: Priority;
  isEditing: boolean;
  editName: string;
  editColor: string;
  editDirty: boolean;
  isSaving: boolean;
  isReordering: boolean;
  onEditName: (v: string) => void;
  onEditColor: (v: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onRename: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { priority: p } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
    disabled: props.isEditing,
  });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 transition-colors ${
        isDragging ? 'bg-primary/5 ring-1 ring-inset ring-primary/30 z-10 relative' : ''
      }`}
    >
      {/* Drag handle — the primary reorder affordance (Linear/Jira pattern). */}
      <button
        type="button"
        aria-label={`Reorder ${p.name} (drag or use row menu)`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        className="p-2 -ml-1 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors cursor-grab active:cursor-grabbing touch-none shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {props.isEditing ? (
        <div className="flex-1 min-w-0 space-y-2.5 py-0.5">
          <div className="flex items-center gap-2">
            <Input
              value={props.editName}
              onChange={(e) => props.onEditName(e.target.value)}
              aria-label="Priority name"
              className="h-9 text-xs flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') props.onSave();
                if (e.key === 'Escape') props.onCancelEdit();
              }}
            />
            <Button
              size="sm"
              disabled={!props.editName.trim() || !props.editDirty || props.isSaving}
              onClick={props.onSave}
              aria-label="Save changes"
              title="Save changes"
              className="h-9 w-9 p-0 shrink-0 cursor-pointer"
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={props.onCancelEdit}
              aria-label="Cancel editing"
              title="Cancel (Esc)"
              className="h-9 w-9 p-0 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ColorSwatches
              value={props.editColor}
              onChange={props.onEditColor}
              label="Priority color"
            />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Preview:</span>
              <PriorityBadge
                priority={{ name: props.editName.trim() || p.name, color: props.editColor }}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
              {p.name}
              {p.isDefault && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  default
                </span>
              )}
            </span>
            <PriorityBadge priority={{ name: p.name, color: p.color }} />
          </div>

          {/* Default toggle stays visible — it is the key per-row affordance. */}
          <button
            type="button"
            onClick={props.onSetDefault}
            disabled={p.isDefault}
            title={p.isDefault ? 'Default for new tasks' : 'Set as default for new tasks'}
            aria-label={p.isDefault ? `${p.name} is the default` : `Set ${p.name} as default`}
            aria-pressed={p.isDefault}
            className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors cursor-pointer disabled:cursor-default shrink-0 ${
              p.isDefault
                ? 'text-amber-500'
                : 'text-muted-foreground hover:text-amber-500 hover:bg-muted'
            }`}
          >
            <Star className={`w-4 h-4 ${p.isDefault ? 'fill-amber-500' : ''}`} />
          </button>

          {/* Everything else lives in the overflow menu — no more icon soup. */}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${p.name}`}
                className="h-9 w-9 rounded-lg shrink-0 cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!p.isDefault && (
                <>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-xs"
                    onClick={props.onSetDefault}
                  >
                    <Star className="w-3.5 h-3.5 text-muted-foreground" /> Set as default
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={props.onRename}>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Rename / recolor
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                disabled={props.isReordering}
                onClick={props.onMoveUp}
              >
                <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                disabled={props.isReordering}
                onClick={props.onMoveDown}
              >
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer gap-2 text-xs"
                onClick={props.onDelete}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
