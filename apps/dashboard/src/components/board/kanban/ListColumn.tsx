import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { DatePicker } from '@boardly/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@boardly/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@boardly/ui/dropdown-menu';
import {
  Plus,
  Calendar,
  MoreHorizontal,
  Trash2,
  Edit2,
  AlertTriangle,
  Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../../lib/api';
import { useOptimisticMutation } from '../../../lib/useOptimisticMutation';
import { useAuthStore } from '../../../store/authStore';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { AsyncMemberSearchableSelect } from '../../ui/AsyncMemberSelect';
import { SortableCard } from './SortableCard';
import {
  type KanbanCard,
  type KanbanList,
  CARD_ESTIMATED_HEIGHT,
  VIRTUALIZE_THRESHOLD,
} from './types';

interface ListColumnProps {
  list: KanbanList;
  boardId: string;
  isDraggingActive: boolean;
  onAddCard: (listId: string, card: KanbanCard) => void;
  onReplaceCard: (listId: string, tempId: string, serverCard: KanbanCard) => void;
  onRemoveCard: (listId: string, tempId: string) => void;
  onCardClick: (id: string) => void;
  onOpenFullEditor: (
    listId: string,
    data: {
      title?: string;
      description?: string;
      assigneeId?: string;
      dueDate?: string;
      storyPoints?: string;
    }
  ) => void;
}

export const ListColumn = memo(function ListColumn({
  list,
  boardId,
  isDraggingActive,
  onAddCard,
  onReplaceCard,
  onRemoveCard,
  onCardClick,
  onOpenFullEditor,
}: ListColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: list.id,
    data: {
      type: 'column',
      list,
    },
  });

  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(user?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [storyPoints, setStoryPoints] = useState<string>('');
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [isEditingList, setIsEditingList] = useState(false);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [editListName, setEditListName] = useState(list.name);

  const { requestClose: closeRenameList } = useDialogClose({
    isOpen: isEditingList,
    onClose: () => setIsEditingList(false),
  });

  const { requestClose: closeDeleteList } = useDialogClose({
    isOpen: isDeletingList,
    onClose: () => setIsDeletingList(false),
  });

  // Sync default assignee to current user
  useEffect(() => {
    if (user?.id && !assigneeId) {
      setAssigneeId(user.id);
    }
  }, [user?.id, assigneeId]);

  const deleteListMutation = useMutation({
    mutationFn: async () => await api.delete(`/lists/${list.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
      queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
      closeDeleteList();
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to delete list. Please try again.'));
    },
  });

  const updateListMutation = useMutation({
    mutationFn: async (name: string) => await api.patch(`/lists/${list.id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
      queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
      closeRenameList();
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to rename list. Please try again.'));
    },
  });

  const pendingTempId = useRef<string | null>(null);
  const addCardMutation = useOptimisticMutation<any, Record<string, any>>(
    async (payload) => (await api.post('/cards', payload)).data,
    {
      queryKeys: [['board', 'full', boardId]],
      applyOptimistic: (payload) => {
        pendingTempId.current = `temp-${Date.now()}`;
        onAddCard(list.id, {
          id: pendingTempId.current,
          title: payload.title,
          listId: list.id,
          position: Number.MAX_SAFE_INTEGER,
          labels: [],
          assignees: [],
          commentsCount: 0,
          attachmentsCount: 0,
          checklistTotal: 0,
          checklistDone: 0,
        } as KanbanCard);
      },
      onSuccessExtra: (serverCard) => {
        if (pendingTempId.current) onReplaceCard(list.id, pendingTempId.current, serverCard);
        pendingTempId.current = null;
      },
      onErrorExtra: (payload) => {
        // Roll back the temp card and restore the typed title so nothing is lost.
        if (pendingTempId.current) onRemoveCard(list.id, pendingTempId.current);
        pendingTempId.current = null;
        if (payload?.title) setTitle(payload.title);
      },
      errorMessage: 'Failed to create task. Please try again.',
    }
  );

  const handleAdd = () => {
    if (!title.trim() || addCardMutation.isPending) return;
    const payload: any = {
      listId: list.id,
      title: title.trim(),
      description: description.trim() || undefined,
      assigneeId: assigneeId || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      storyPoints: storyPoints ? Number(storyPoints) : undefined,
    };
    addCardMutation.mutate(payload);
    setTitle('');
    setDescription('');
    setDueDate('');
    setStoryPoints('');
    setAssigneeId(user?.id || '');
    setAdding(false);
    setShowMoreFields(false);
  };

  const handleFullEditor = () => {
    onOpenFullEditor(list.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      assigneeId: assigneeId || undefined,
      dueDate: dueDate || undefined,
      storyPoints: storyPoints || undefined,
    });
    setTitle('');
    setDescription('');
    setDueDate('');
    setStoryPoints('');
    setAdding(false);
    setShowMoreFields(false);
  };

  const cardIds = useMemo(() => list.cards.map((c) => c.id), [list.cards]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isVirtualized = !isDraggingActive && list.cards.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: list.cards.length,
    getScrollElement: () => (isDraggingActive ? null : scrollRef.current),
    estimateSize: () => CARD_ESTIMATED_HEIGHT,
    overscan: 8,
    getItemKey: (index) => list.cards[index]?.id ?? index,
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-72 border rounded-2xl p-3 flex flex-col max-h-full flex-shrink-0 shadow-xs backdrop-blur-sm transition-colors duration-150 ${
        isOver && isDraggingActive
          ? 'bg-muted/70 border-primary/50 ring-2 ring-primary/20'
          : 'bg-muted/40 border-border/70'
      }`}
    >
      <div className="flex items-center justify-between font-semibold text-sm mb-3 px-1 text-foreground">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{list.name}</span>
          <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.2 rounded-full bg-muted/80 border border-border/60">
            {list.cards.length}
          </span>
        </div>

        {/* List Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              onClick={() => {
                setEditListName(list.name);
                setIsEditingList(true);
              }}
            >
              <Edit2 className="w-3.5 h-3.5" /> Rename List
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              onClick={() => {
                setAdding(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Card
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={() => setIsDeletingList(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete List
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Rename List Dialog */}
      {isEditingList && (
        <Dialog open={isEditingList} onOpenChange={setIsEditingList}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename List</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editListName.trim()) {
                  updateListMutation.mutate(editListName.trim());
                }
              }}
              className="space-y-4 py-2"
            >
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">List Name</Label>
                <Input
                  autoFocus
                  required
                  value={editListName}
                  onChange={(e) => setEditListName(e.target.value)}
                  placeholder="e.g. In Progress"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeRenameList}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!editListName.trim() || updateListMutation.isPending}
                >
                  {updateListMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete List Confirmation Dialog */}
      {isDeletingList && (
        <Dialog open={isDeletingList} onOpenChange={setIsDeletingList}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" /> Delete List?
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to delete{' '}
                <strong className="text-foreground">"{list.name}"</strong>? All {list.cards.length}{' '}
                cards inside will be permanently removed.
              </p>
              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={closeDeleteList}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteListMutation.isPending}
                  onClick={() => deleteListMutation.mutate()}
                >
                  {deleteListMutation.isPending ? 'Deleting...' : 'Delete List'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <div
        ref={scrollRef}
        data-virtualized-column={isVirtualized ? 'true' : 'false'}
        className="flex-1 overflow-y-auto min-h-[50px] pr-0.5"
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {isVirtualized ? (
            <div
              className="relative min-h-[40px]"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const card = list.cards[virtualRow.index];
                if (!card) return null;
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <SortableCard
                      card={card}
                      isDraggingActive={isDraggingActive}
                      onClick={() => onCardClick(card.id)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2 min-h-[40px]">
              {list.cards.map((card) => (
                <SortableCard
                  key={card.id}
                  card={card}
                  isDraggingActive={isDraggingActive}
                  onClick={() => onCardClick(card.id)}
                />
              ))}

              {list.cards.length === 0 && (
                <div
                  className={`h-24 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1.5 text-xs font-medium ${
                    isOver && isDraggingActive
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'border-border/60 text-muted-foreground/50 bg-muted/20'
                  }`}
                >
                  <Plus className="w-4 h-4 opacity-70" />
                  <span>Drop tasks here</span>
                </div>
              )}
            </div>
          )}
        </SortableContext>
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="p-3 rounded-xl bg-card border border-primary/50 shadow-lg space-y-2.5 animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Title Textarea */}
            <textarea
              autoFocus
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full text-xs bg-background border border-input rounded-lg p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground leading-relaxed text-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setAdding(false);
                }
              }}
            />

            {/* Optional Description / Summary Notes */}
            {showMoreFields && (
              <div className="space-y-1 pt-0.5 animate-in fade-in-50 duration-150">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add quick notes or summary..."
                  className="h-7 text-xs bg-background"
                />
              </div>
            )}

            {/* Attribute Chips: Assignee, Due Date, Story Points */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
              {/* Assignee Searchable Picker */}
              <div className="max-w-[130px] min-w-[95px]">
                <AsyncMemberSearchableSelect
                  orgId={user?.organizationId}
                  currentUser={user}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  pinnedIds={assigneeId ? [assigneeId] : []}
                  size="sm"
                  triggerClassName="h-6 px-1.5 text-[11px] bg-muted/60 hover:bg-muted/90 border-border/70 rounded-md"
                />
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-1 bg-muted/60 hover:bg-muted/90 px-2 py-0.5 rounded-md border border-border/70 text-xs transition-colors">
                <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                <div className="w-[95px]">
                  <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="Date"
                    triggerClassName="h-6 px-1 text-[11px] bg-transparent border-transparent hover:bg-transparent"
                  />
                </div>
              </div>

              {/* Story Points */}
              <div className="flex items-center gap-1 bg-muted/60 hover:bg-muted/90 px-2 py-0.5 rounded-md border border-border/70 text-xs transition-colors">
                <span className="text-[10px] font-bold text-muted-foreground">PTS</span>
                <input
                  type="number"
                  min="0"
                  placeholder="pts"
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  className="w-7 bg-transparent text-[11px] text-center text-foreground outline-none font-medium"
                />
              </div>

              {/* Toggle Notes */}
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors ml-auto flex items-center gap-0.5 cursor-pointer"
                onClick={() => setShowMoreFields(!showMoreFields)}
              >
                {showMoreFields ? 'Less' : '+ Notes'}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 text-xs font-semibold px-3 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                  onClick={handleAdd}
                  disabled={!title.trim() || addCardMutation.isPending}
                >
                  {addCardMutation.isPending ? 'Adding…' : 'Add Card'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-border hover:bg-muted/80 text-foreground cursor-pointer"
                  onClick={handleFullEditor}
                  title="Open full task creator modal"
                >
                  <Maximize2 className="w-3 h-3 text-primary" /> Full Editor
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-foreground px-2 cursor-pointer"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors h-8 text-xs font-medium cursor-pointer"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1.5 w-3.5 h-3.5" /> Add a card
          </Button>
        )}
      </div>
    </div>
  );
});
