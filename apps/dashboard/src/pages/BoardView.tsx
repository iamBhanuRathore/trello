import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
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
  pointerWithin,
  rectIntersection,
  closestCorners,
} from '@dnd-kit/core';
import type {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragCancelEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { Button } from '@boardly/ui/button';
import { RouteFallback } from '../components/common/RouteFallback';
import { useRealtimeBoard } from '../hooks/useRealtimeBoard';
import { useAuthStore } from '../store/authStore';
import { usePermissions, permissionReason } from '../hooks/usePermissions';
import {
  type KanbanCard,
  type KanbanList,
  dropAnimation,
  BoardHeader,
  ListColumn,
  AddListForm,
  KanbanCardView,
} from '../components/board/kanban';

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
  // Single source of truth: the ?card= URL param IS the dialog state. A
  // previous dual (local state + param synced by effect) tore on close —
  // setState committed before the router navigation landed, and the sync
  // effect reopened from the stale param ("needs two closes"). Deriving
  // directly from the URL makes close atomic: no torn pair can exist.
  const selectedCardId = searchParams.get('card');
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [clonedLists, setClonedLists] = useState<KanbanList[] | null>(null);
  // Timestamp of the last explicit modal close. Closing unmounts the dialog
  // mid-gesture, so the same pointer's click can land on the board tile
  // beneath and instantly reopen it (close → reopen "needs two closes").
  const lastModalCloseRef = useRef(0);

  // Initialize Realtime WebSocket Connection & Presence
  const { presenceUsers, emitCardFocus } = useRealtimeBoard(boardId);

  const handleCardClick = useCallback(
    (cardId: string) => {
      // Optimistic tiles carry temp ids until the server responds — opening
      // the modal for one 404s ("Task not found"). Ignore the click; the
      // tile is replaced with the real card within a beat.
      if (!cardId || cardId.startsWith('temp-')) return;
      // Swallow the pass-through click from the gesture that just closed the
      // modal (backdrop close unmounts mid-click; the click lands on the tile).
      if (Date.now() - lastModalCloseRef.current < 500) return;
      // Replace: dialog state is ephemeral — pushing would make browser-Back
      // reopen the dialog (e.g. Back from /cards/:id lands on ?card=).
      setSearchParams({ card: cardId }, { replace: true });
      emitCardFocus(cardId);
    },
    [emitCardFocus, setSearchParams]
  );

  const handleCloseModal = useCallback(() => {
    lastModalCloseRef.current = Date.now();
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
    { cardId: string; listId: string; position: number; expectedVersion?: number }
  >(
    async ({ cardId, listId, position, expectedVersion }) => {
      await api.patch(`/cards/${cardId}/move`, { listId, position, expectedVersion });
    },
    {
      queryKeys: [['board', 'full', boardId]],
      onErrorExtra: (_variables, err) => {
        // Roll the optimistic board back to the last server state.
        const cached = queryClient.getQueryData<{ lists: KanbanList[] }>([
          'board',
          'full',
          boardId,
        ]);
        if (cached?.lists) setLists(cached.lists);
        // Version conflicts refetch via onSettled — show the specific
        // message and suppress the generic error toast (return true).
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          toast.info('Another session moved this task — synced to the latest position.');
          return true;
        }
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

  const { can: canPerm, isLoading: permsLoading } = usePermissions();
  // ANY-of mirrors the backend alias (card.move ∨ card.update). Fail closed
  // while /me is unresolved; the denied-drag toast is skipped until then.
  const canMoveCard = !permsLoading && canPerm('card.move', 'card.update');

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!canMoveCard) return;
      const { active } = event;
      const card = lists.flatMap((l) => l.cards).find((c) => c.id === active.id);
      if (card) {
        setActiveCard(card);
        setClonedLists(lists);
      }
    },
    [lists, canMoveCard]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!canMoveCard) return;
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
    [lists, canMoveCard]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);
      setClonedLists(null);

      if (!canMoveCard) {
        // Handler-level gate: keyboard sensor can start a drag without buttons.
        if (over && active.id !== over.id && clonedLists) setLists(clonedLists);
        if (over && active.id !== over.id && !permsLoading) {
          toast.error(permissionReason('card.move'));
        }
        return;
      }

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
        expectedVersion: newCards[targetIndex]?.version,
      });
    },
    [lists, clonedLists, moveCardMutation, canMoveCard, permsLoading]
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

  const user = useAuthStore((state) => state.user);
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

  // Stable column handlers — the per-column closures they replace broke memo()
  // by handing every column a fresh function identity on each render.
  const handleColumnAddCard = useCallback((listId: string, card: KanbanCard) => {
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, cards: [...l.cards, card] } : l))
    );
  }, []);

  const handleColumnReplaceCard = useCallback(
    (listId: string, tempId: string, serverCard: KanbanCard) => {
      setLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? { ...l, cards: l.cards.map((c) => (c.id === tempId ? serverCard : c)) }
            : l
        )
      );
    },
    []
  );

  const handleColumnRemoveCard = useCallback((listId: string, tempId: string) => {
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId ? { ...l, cards: l.cards.filter((c) => c.id !== tempId) } : l
      )
    );
  }, []);

  const handleColumnFullEditor = useCallback(
    (
      listId: string,
      data: {
        title?: string;
        description?: string;
        assigneeId?: string;
        dueDate?: string;
        storyPoints?: string;
      }
    ) => {
      setCreateTaskConfig({
        isOpen: true,
        initialData: { listId, ...data },
      });
    },
    [setCreateTaskConfig]
  );

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
      <BoardHeader
        board={board}
        boardId={boardId!}
        presenceUsers={presenceUsers}
        onCreateTask={() =>
          setCreateTaskConfig({
            isOpen: true,
            initialData: { listId: lists[0]?.id },
          })
        }
        onOpenForms={() => setIsFormsOpen(true)}
        onOpenAutomations={() => setIsAutomationsOpen(true)}
      />

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
              {/* Memoized columns: these handlers are stable and untouched
                  lists keep their object identity, so a drag-over frame only
                  repaints the two columns that actually changed. */}
              {lists.map((list) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  boardId={boardId!}
                  isDraggingActive={!!activeCard}
                  onAddCard={handleColumnAddCard}
                  onReplaceCard={handleColumnReplaceCard}
                  onRemoveCard={handleColumnRemoveCard}
                  onCardClick={handleCardClick}
                  onOpenFullEditor={handleColumnFullEditor}
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
                projectId={board?.projectId}
                orgId={user?.organizationId}
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
        </>
      )}
    </div>
  );
}
export default BoardView;
