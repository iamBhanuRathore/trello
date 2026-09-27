import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '../lib/api';
import { toast } from 'sonner';
import { useOptimisticMutation } from '../lib/useOptimisticMutation';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDroppable,
  pointerWithin,
  rectIntersection,
  closestCorners,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import type {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragCancelEvent,
  CollisionDetection,
  DropAnimation,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@boardly/ui/button';
import { DatePicker } from '@boardly/ui';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Card, CardContent } from '@boardly/ui/card';
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
  Workflow,
  FileText,
  CheckSquare,
  Calendar,
  AlertCircle,
  MessageSquare,
  Paperclip,
  MoreHorizontal,
  Settings,
  Trash2,
  Edit2,
  AlertTriangle,
  Maximize2,
  ListChecks,
  Eye,
} from 'lucide-react';
import { isPast, format } from 'date-fns';
// Heavy modals are code-split: each loads on first open, not with the board.
const CardModal = lazy(() =>
  import('../components/board/CardModal').then((m) => ({ default: m.CardModal }))
);
const AutomationsModal = lazy(() =>
  import('../components/board/AutomationsModal').then((m) => ({ default: m.AutomationsModal }))
);
const FormBuilderModal = lazy(() =>
  import('../components/board/FormBuilderModal').then((m) => ({ default: m.FormBuilderModal }))
);
const CreateTaskModal = lazy(() =>
  import('../components/board/CreateTaskModal').then((m) => ({ default: m.CreateTaskModal }))
);
import { RouteFallback } from '../components/common/RouteFallback';
import { PresenceAvatars } from '../components/board/PresenceAvatars';
import { PriorityBadge } from '../components/board/PriorityBadge';
import { useRealtimeBoard } from '../hooks/useRealtimeBoard';
import { useAuthStore } from '../store/authStore';
import { AsyncMemberSearchableSelect } from '../components/ui/AsyncMemberSelect';

interface KanbanCard {
  id: string;
  key?: string | null;
  taskNumber?: number | null;
  projectKey?: string | null;
  title: string;
  description?: string | null;
  listId: string;
  position: number;
  dueDate?: string | null;
  storyPoints?: number | null;
  estimateMinutes?: number | null;
  stage?: { id: string; name: string; color: string; category: string } | null;
  priorityId?: string | null;
  priority?: { id: string; name: string; color: string } | null;
  labels?: { id: string; name: string; color: string }[];
  assignee?: { id: string; name: string; email: string; avatarUrl?: string } | null;
  assignees?: { id: string; name: string; email: string; avatarUrl?: string }[];
  checklistTotal?: number;
  checklistDone?: number;
  commentsCount?: number;
  attachmentsCount?: number;
}

interface KanbanList {
  id: string;
  name: string;
  position: number;
  cards: KanbanCard[];
}

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.4',
      },
    },
  }),
  duration: 200,
  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
};

export function BoardView() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Single aggregate request: board + lists + enriched cards (~8 Neon queries
  // on miss, 1 Redis RTT on hit). Replaces 1× board + 1× lists + N× cards fan-out.
  const {
    data: full,
    isLoading: isBoardLoading,
    isError: isBoardError,
    refetch: refetchBoard,
  } = useQuery({
    queryKey: ['board', 'full', boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}/full`)).data,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const board = full?.board;
  const listsData = full?.lists;

  const [lists, setLists] = useState<KanbanList[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    searchParams.get('card') || null
  );
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [clonedLists, setClonedLists] = useState<KanbanList[] | null>(null);

  // Initialize Realtime WebSocket Connection & Presence
  const { presenceUsers, emitCardFocus } = useRealtimeBoard(boardId);

  useEffect(() => {
    const cardParam = searchParams.get('card');
    if (cardParam && cardParam !== selectedCardId) {
      setSelectedCardId(cardParam);
      emitCardFocus(cardParam);
    }
  }, [searchParams, emitCardFocus, selectedCardId]);

  const handleCardClick = useCallback(
    (cardId: string) => {
      // Optimistic tiles carry temp ids until the server responds — opening
      // the modal for one 404s ("Task not found"). Ignore the click; the
      // tile is replaced with the real card within a beat.
      if (!cardId || cardId.startsWith('temp-')) return;
      setSelectedCardId(cardId);
      emitCardFocus(cardId);
      // Replace: dialog state is ephemeral — pushing would make browser-Back
      // reopen the dialog (e.g. Back from /cards/:id lands on ?card=).
      setSearchParams({ card: cardId }, { replace: true });
    },
    [emitCardFocus, setSearchParams]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedCardId(null);
    emitCardFocus(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('card');
    setSearchParams(nextParams, { replace: true });
  }, [emitCardFocus, searchParams, setSearchParams]);

  // Seed local drag-drop state from the aggregate payload (no per-list fetch).
  useEffect(() => {
    if (!listsData) return;
    setLists(listsData);
  }, [listsData]);

  const moveCardMutation = useOptimisticMutation<
    void,
    { cardId: string; listId: string; position: number }
  >(
    async ({ cardId, listId, position }) => {
      await api.patch(`/cards/${cardId}/move`, { listId, position });
    },
    {
      queryKeys: [['board', 'full', boardId]],
      onErrorExtra: () => {
        // Roll the optimistic board back to the last server state.
        const cached = queryClient.getQueryData<{ lists: KanbanList[] }>([
          'board',
          'full',
          boardId,
        ]);
        if (cached?.lists) setLists(cached.lists);
      },
      errorMessage: 'Failed to move task. Please try again.',
    }
  );

  // Custom collision detection for Kanban multi-container board
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    // 1. Pointer inside container/card
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    // 2. Intersecting bounding boxes
    const rectCollisions = rectIntersection(args);
    if (rectCollisions.length > 0) {
      return rectCollisions;
    }

    // 3. Fallback to closest corners
    return closestCorners(args);
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const card = lists.flatMap((l) => l.cards).find((c) => c.id === active.id);
      if (card) {
        setActiveCard(card);
        setClonedLists(lists);
      }
    },
    [lists]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeContainer = lists.find((l) => l.cards.some((c) => c.id === activeId));
      const overContainer = lists.find(
        (l) => l.id === overId || l.cards.some((c) => c.id === overId)
      );

      if (!activeContainer || !overContainer || activeContainer.id === overContainer.id) {
        return;
      }

      setLists((prev) => {
        const sourceList = prev.find((l) => l.id === activeContainer.id);
        const targetList = prev.find((l) => l.id === overContainer.id);
        if (!sourceList || !targetList) return prev;

        const activeIndex = sourceList.cards.findIndex((c) => c.id === activeId);
        if (activeIndex === -1) return prev;

        const movingCard = { ...sourceList.cards[activeIndex], listId: targetList.id };
        let overIndex = targetList.cards.findIndex((c) => c.id === overId);

        if (overIndex === -1) {
          overIndex = targetList.cards.length;
        }

        return prev.map((l) => {
          if (l.id === sourceList.id) {
            return {
              ...l,
              cards: l.cards.filter((c) => c.id !== activeId),
            };
          }
          if (l.id === targetList.id) {
            const nextCards = [...l.cards];
            nextCards.splice(overIndex, 0, movingCard);
            return {
              ...l,
              cards: nextCards,
            };
          }
          return l;
        });
      });
    },
    [lists]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);
      setClonedLists(null);

      if (!over) {
        if (clonedLists) setLists(clonedLists);
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      const currentContainer = lists.find((l) => l.cards.some((c) => c.id === activeId));
      if (!currentContainer) return;

      const activeIndex = currentContainer.cards.findIndex((c) => c.id === activeId);
      const overIndex = currentContainer.cards.findIndex((c) => c.id === overId);

      let newCards = [...currentContainer.cards];
      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        newCards = arrayMove(newCards, activeIndex, overIndex);
      }

      // Calculate position
      const targetIndex = newCards.findIndex((c) => c.id === activeId);
      if (targetIndex === -1) return;

      const prevCard = newCards[targetIndex - 1];
      const nextCard = newCards[targetIndex + 1];

      let newPos: number;
      if (!prevCard && !nextCard) {
        newPos = 65536;
      } else if (!prevCard) {
        newPos = (nextCard.position || 65536) / 2;
      } else if (!nextCard) {
        newPos = (prevCard.position || 0) + 65536;
      } else {
        newPos = ((prevCard.position || 0) + (nextCard.position || 0)) / 2;
      }

      const updatedCard = {
        ...newCards[targetIndex],
        position: newPos,
        listId: currentContainer.id,
      };
      newCards[targetIndex] = updatedCard;

      const updatedLists = lists.map((l) =>
        l.id === currentContainer.id ? { ...l, cards: newCards } : l
      );
      setLists(updatedLists);

      moveCardMutation.mutate({
        cardId: activeId,
        listId: currentContainer.id,
        position: newPos,
      });
    },
    [lists, clonedLists, moveCardMutation]
  );

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      if (clonedLists) {
        setLists(clonedLists);
      }
      setActiveCard(null);
      setClonedLists(null);
    },
    [clonedLists]
  );

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [isAutomationsOpen, setIsAutomationsOpen] = useState(false);
  const [isFormsOpen, setIsFormsOpen] = useState(false);
  const [createTaskConfig, setCreateTaskConfig] = useState<{
    isOpen: boolean;
    initialData?: {
      listId?: string;
      title?: string;
      description?: string;
      assigneeId?: string;
      dueDate?: string;
      storyPoints?: string;
    };
  }>({ isOpen: false });
  const [isEditingBoard, setIsEditingBoard] = useState(false);
  const [isDeletingBoard, setIsDeletingBoard] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');

  const deleteBoardMutation = useMutation({
    mutationFn: async () => await api.delete(`/boards/${boardId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate('/');
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to delete board. Please try again.'));
    },
  });

  const updateBoardMutation = useMutation({
    mutationFn: async (name: string) => await api.patch(`/boards/${boardId}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      setIsEditingBoard(false);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to rename board. Please try again.'));
    },
  });

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 150,
      tolerance: 5,
    },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });

  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">{board?.name || 'Loading...'}</h1>
          <PresenceAvatars users={presenceUsers} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 text-xs font-semibold gap-1.5 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            onClick={() =>
              setCreateTaskConfig({
                isOpen: true,
                initialData: { listId: lists[0]?.id },
              })
            }
          >
            <Plus className="h-4 w-4" /> Create Task
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsFormsOpen(true)}>
            <FileText className="h-4 w-4 mr-1.5 text-primary" />
            Intake Forms
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsAutomationsOpen(true)}>
            <Workflow className="h-4 w-4 mr-1.5" />
            Automations
          </Button>

          {/* Board Settings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Board Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs"
                onClick={() => {
                  setEditBoardName(board?.name || '');
                  setIsEditingBoard(true);
                }}
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename Board
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={() => setIsDeletingBoard(true)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4 pt-1">
        {isBoardLoading ? (
          <div className="flex h-full gap-4 items-start" aria-label="Loading board">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-72 shrink-0 rounded-xl border border-border/60 bg-card/40 p-3 space-y-3 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-5 w-7 rounded-full bg-muted/70" />
                </div>
                {[0, 1, 2].map((j) => (
                  <div key={j} className="h-20 rounded-lg bg-muted/70" />
                ))}
                <div className="h-8 rounded-lg bg-muted/50" />
              </div>
            ))}
          </div>
        ) : isBoardError ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load this board. It may have been deleted or you lost access.
              </p>
              <Button size="sm" variant="outline" onClick={() => refetchBoard()}>
                Retry
              </Button>
            </div>
          </div>
        ) : lists.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No lists yet. Create your first list to start adding tasks.
              </p>
              <AddListForm
                boardId={boardId!}
                onAdd={() =>
                  queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] })
                }
                onAddList={(temp) => setLists((prev) => [...prev, temp])}
                onReplaceList={(tempId, serverList) =>
                  setLists((prev) =>
                    prev.map((l) => (l.id === tempId ? { ...serverList, cards: [] } : l))
                  )
                }
                onRemoveList={(tempId) => setLists((prev) => prev.filter((l) => l.id !== tempId))}
              />
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex h-full gap-4 items-start">
              {lists.map((list) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  boardId={boardId!}
                  isDraggingActive={!!activeCard}
                  onAddCard={(c) => {
                    const newLists = lists.map((l) =>
                      l.id === list.id ? { ...l, cards: [...l.cards, c] } : l
                    );
                    setLists(newLists);
                  }}
                  onReplaceCard={(tempId, serverCard) => {
                    setLists((prev) =>
                      prev.map((l) =>
                        l.id === list.id
                          ? {
                              ...l,
                              cards: l.cards.map((c) => (c.id === tempId ? serverCard : c)),
                            }
                          : l
                      )
                    );
                  }}
                  onRemoveCard={(tempId) => {
                    setLists((prev) =>
                      prev.map((l) =>
                        l.id === list.id
                          ? { ...l, cards: l.cards.filter((c) => c.id !== tempId) }
                          : l
                      )
                    );
                  }}
                  onCardClick={handleCardClick}
                  onOpenFullEditor={(data) => {
                    setCreateTaskConfig({
                      isOpen: true,
                      initialData: {
                        listId: list.id,
                        ...data,
                      },
                    });
                  }}
                />
              ))}

              <AddListForm
                boardId={boardId!}
                onAdd={() =>
                  queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] })
                }
                onAddList={(temp) => setLists((prev) => [...prev, temp])}
                onReplaceList={(tempId, serverList) =>
                  setLists((prev) =>
                    prev.map((l) => (l.id === tempId ? { ...serverList, cards: [] } : l))
                  )
                }
                onRemoveList={(tempId) => setLists((prev) => prev.filter((l) => l.id !== tempId))}
              />
            </div>

            <DragOverlay dropAnimation={dropAnimation}>
              {activeCard ? (
                <div className="w-72 pointer-events-none">
                  <KanbanCardView card={activeCard} isOverlay />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      {selectedCardId && (
        <Suspense fallback={<RouteFallback label="Loading task…" />}>
          <CardModal
            cardId={selectedCardId}
            open={!!selectedCardId}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseModal();
              }
            }}
            onSelectCard={(id) => handleCardClick(id)}
          />
        </Suspense>
      )}
      {boardId && (
        <>
          {isAutomationsOpen && (
            <Suspense fallback={<RouteFallback label="Loading automations…" />}>
              <AutomationsModal
                boardId={boardId}
                isOpen={isAutomationsOpen}
                onClose={() => setIsAutomationsOpen(false)}
                lists={lists}
              />
            </Suspense>
          )}
          {isFormsOpen && (
            <Suspense fallback={<RouteFallback label="Loading forms…" />}>
              <FormBuilderModal
                boardId={boardId}
                lists={lists}
                isOpen={isFormsOpen}
                onClose={() => setIsFormsOpen(false)}
              />
            </Suspense>
          )}

          {/* Create Task Modal */}
          {createTaskConfig.isOpen && (
            <Suspense fallback={<RouteFallback label="Loading composer…" />}>
              <CreateTaskModal
                lists={lists}
                members={[]}
                currentUser={user}
                isOpen={createTaskConfig.isOpen}
                initialData={createTaskConfig.initialData}
                boardId={boardId}
                orgId={user?.organizationId}
                onClose={() => setCreateTaskConfig({ isOpen: false })}
                onTaskCreated={(card) => {
                  queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
                  queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
                  setCreateTaskConfig({ isOpen: false });
                  if (card?.id) handleCardClick(card.id);
                }}
              />
            </Suspense>
          )}

          {/* Edit Board Dialog */}
          {isEditingBoard && (
            <Dialog open={isEditingBoard} onOpenChange={setIsEditingBoard}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Rename Board</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editBoardName.trim()) {
                      updateBoardMutation.mutate(editBoardName.trim());
                    }
                  }}
                  className="space-y-4 py-2"
                >
                  <div>
                    <Label className="text-xs font-semibold mb-1.5 block">Board Name</Label>
                    <Input
                      value={editBoardName}
                      onChange={(e) => setEditBoardName(e.target.value)}
                      placeholder="e.g. Core Web App Sprint"
                      className="h-9 text-xs"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingBoard(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={updateBoardMutation.isPending}>
                      {updateBoardMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {/* Delete Board Dialog */}
          {isDeletingBoard && (
            <Dialog open={isDeletingBoard} onOpenChange={setIsDeletingBoard}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" /> Delete Board
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2 text-xs text-muted-foreground">
                  <p>
                    Are you sure you want to delete board{' '}
                    <strong className="text-foreground">{board?.name}</strong>?
                  </p>
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
                    <p className="font-semibold">This board will be moved to Trash.</p>
                    <p>
                      All lists, cards, checklist items, and comments will be moved to the Recycle
                      Bin and automatically purged after 30 days. You can restore them from Trash
                      before then.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDeletingBoard(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteBoardMutation.isPending}
                      onClick={() => deleteBoardMutation.mutate()}
                    >
                      {deleteBoardMutation.isPending ? 'Deleting...' : 'Permanently Delete Board'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}

function ListColumn({
  list,
  boardId,
  isDraggingActive,
  onAddCard,
  onReplaceCard,
  onRemoveCard,
  onCardClick,
  onOpenFullEditor,
}: {
  list: KanbanList;
  boardId: string;
  isDraggingActive: boolean;
  onAddCard: (c: KanbanCard) => void;
  onReplaceCard: (tempId: string, serverCard: KanbanCard) => void;
  onRemoveCard: (tempId: string) => void;
  onCardClick: (id: string) => void;
  onOpenFullEditor: (data: {
    title?: string;
    description?: string;
    assigneeId?: string;
    dueDate?: string;
    storyPoints?: string;
  }) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: list.id,
    data: {
      type: 'column',
      list,
    },
  });

  const queryClient = useQueryClient();
  const { user } = useAuthStore();
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

  // Sync default assignee to current user
  useEffect(() => {
    if (user?.id && !assigneeId) {
      setAssigneeId(user.id);
    }
  }, [user?.id, assigneeId]);

  // Quick assignee selector uses server-side search (async) — no full fetch.

  const deleteListMutation = useMutation({
    mutationFn: async () => await api.delete(`/lists/${list.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'full', boardId] });
      queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
      setIsDeletingList(false);
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
      setIsEditingList(false);
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
        onAddCard({
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
        if (pendingTempId.current) onReplaceCard(pendingTempId.current, serverCard);
        pendingTempId.current = null;
      },
      onErrorExtra: (payload) => {
        // Roll back the temp card and restore the typed title so nothing is lost.
        if (pendingTempId.current) onRemoveCard(pendingTempId.current);
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
    onOpenFullEditor({
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
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs"
              onClick={() => {
                setEditListName(list.name);
                setIsEditingList(true);
              }}
            >
              <Edit2 className="w-3.5 h-3.5 text-muted-foreground" /> Rename List
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingList(false)}
                >
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDeletingList(false)}
                >
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

      <div className="flex-1 overflow-y-auto min-h-[50px] space-y-2 pr-0.5">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
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
}

function SortableCard({
  card,
  isDraggingActive,
  onClick,
}: {
  card: KanbanCard;
  isDraggingActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: {
      type: 'card',
      card,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardView
        card={card}
        isDragging={isDragging}
        isDraggingActive={isDraggingActive}
        onClick={onClick}
      />
    </div>
  );
}

function CardHoverPreviewPortal({
  card,
  anchorRect,
  onOpenDetails,
  onClose,
}: {
  card: KanbanCard;
  anchorRect: DOMRect;
  onOpenDetails: () => void;
  onClose: () => void;
}) {
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

function KanbanCardView({
  card,
  isDragging = false,
  isOverlay = false,
  isDraggingActive = false,
  onClick,
}: {
  card: KanbanCard;
  isDragging?: boolean;
  isOverlay?: boolean;
  isDraggingActive?: boolean;
  onClick?: () => void;
}) {
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
}

function AddListForm({
  boardId,
  onAdd,
  onAddList,
  onReplaceList,
  onRemoveList,
}: {
  boardId: string;
  onAdd: () => void;
  onAddList: (temp: KanbanList) => void;
  onReplaceList: (tempId: string, serverList: KanbanList) => void;
  onRemoveList: (tempId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const pendingTempId = useRef<string | null>(null);

  const addListMutation = useOptimisticMutation<any, { name: string }>(
    async (payload) => (await api.post('/lists', { boardId, name: payload.name })).data,
    {
      queryKeys: [['board', 'full', boardId]],
      applyOptimistic: (payload) => {
        pendingTempId.current = `temp-${Date.now()}`;
        onAddList({
          id: pendingTempId.current,
          name: payload.name,
          position: Number.MAX_SAFE_INTEGER,
          cards: [],
        });
      },
      onSuccessExtra: (serverList) => {
        if (pendingTempId.current)
          onReplaceList(pendingTempId.current, { ...serverList, cards: [] });
        pendingTempId.current = null;
        // Refresh after the temp row is swapped so a stale refetch can't wipe it.
        onAdd();
      },
      onErrorExtra: (payload) => {
        if (pendingTempId.current) onRemoveList(pendingTempId.current);
        pendingTempId.current = null;
        if (payload?.name) setName(payload.name);
      },
      errorMessage: 'Failed to create list. Please try again.',
    }
  );

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed || addListMutation.isPending) return;
    addListMutation.mutate({ name: trimmed });
    setName('');
    setAdding(false);
  };

  return (
    <div className="w-72 flex-shrink-0">
      {adding ? (
        <Card className="p-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name..."
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!name.trim() || addListMutation.isPending}
            >
              {addListMutation.isPending ? 'Adding…' : 'Add List'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="w-full justify-start bg-background/50 backdrop-blur"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-2 w-4 h-4" /> Add another list
        </Button>
      )}
    </div>
  );
}
