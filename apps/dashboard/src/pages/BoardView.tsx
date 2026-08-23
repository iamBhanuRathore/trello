import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DndContext, closestCorners, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@boardly/ui/button';
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
  User,
  Sparkles,
  ListChecks,
} from 'lucide-react';
import { isPast, format } from 'date-fns';
import { CardModal } from '../components/board/CardModal';
import { AutomationsModal } from '../components/board/AutomationsModal';
import { FormBuilderModal } from '../components/board/FormBuilderModal';
import { PresenceAvatars } from '../components/board/PresenceAvatars';
import { useRealtimeBoard } from '../hooks/useRealtimeBoard';
import { useAuthStore } from '../store/authStore';
import { orgService } from '../lib/orgService';

interface KanbanCard {
  id: string;
  title: string;
  description?: string | null;
  listId: string;
  position: number;
  dueDate?: string | null;
  storyPoints?: number | null;
  estimateMinutes?: number | null;
  stage?: { id: string; name: string; color: string; category: string } | null;
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

export function BoardView() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: board } = useQuery({
    queryKey: ['board', boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}`)).data,
  });

  const { data: listsData } = useQuery({
    queryKey: ['lists', boardId],
    queryFn: async () => (await api.get(`/lists?boardId=${boardId}`)).data,
  });

  const [lists, setLists] = useState<KanbanList[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(searchParams.get('card') || null);

  // Initialize Realtime WebSocket Connection & Presence
  const { presenceUsers, emitCardFocus } = useRealtimeBoard(boardId);

  useEffect(() => {
    const cardParam = searchParams.get('card');
    if (cardParam && cardParam !== selectedCardId) {
      setSelectedCardId(cardParam);
      emitCardFocus(cardParam);
    }
  }, [searchParams, emitCardFocus]);

  const handleCardClick = (cardId: string) => {
    setSelectedCardId(cardId);
    emitCardFocus(cardId);
    setSearchParams({ card: cardId });
  };

  const handleCloseModal = () => {
    setSelectedCardId(null);
    emitCardFocus(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('card');
    setSearchParams(nextParams);
  };

  // Fetch cards for each list manually for MVP (in a real app, API would return lists with cards or a /cards?boardId= endpoint)
  useEffect(() => {
    if (!listsData) return;

    const fetchCards = async () => {
      const enrichedLists = await Promise.all(
        listsData.map(async (list: any) => {
          const res = await api.get(`/cards?listId=${list.id}`);
          return { ...list, cards: res.data };
        })
      );
      setLists(enrichedLists);
    };

    fetchCards();
  }, [listsData]);

  const moveCardMutation = useMutation({
    mutationFn: async ({
      cardId,
      listId,
      position,
    }: {
      cardId: string;
      listId: string;
      position: number;
    }) => {
      await api.patch(`/cards/${cardId}/move`, { listId, position });
    },
    onSuccess: () => {
      // In a real app we'd optimistically update, but here we'll let it happen
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeCardId = active.id as string;
    const overId = over.id as string;

    // Find the lists
    let sourceList = lists.find((l) => l.cards.some((c) => c.id === activeCardId));
    let destList = lists.find((l) => l.cards.some((c) => c.id === overId) || l.id === overId);

    if (!sourceList || !destList) return;

    const activeCard = sourceList.cards.find((c) => c.id === activeCardId)!;

    if (sourceList.id === destList.id) {
      // Reordering in same list
      const oldIndex = sourceList.cards.findIndex((c) => c.id === activeCardId);
      const newIndex = destList.cards.findIndex((c) => c.id === overId);
      if (oldIndex === newIndex) return;

      const newCards = [...sourceList.cards];
      newCards.splice(oldIndex, 1);
      newCards.splice(newIndex, 0, activeCard);

      // Simple position calculation (midpoint)
      const prev = newCards[newIndex - 1]?.position || 0;
      const next = newCards[newIndex + 1]?.position || prev + 65536 * 2;
      const newPos = (prev + next) / 2;

      activeCard.position = newPos;

      const newLists = lists.map((l) => (l.id === sourceList!.id ? { ...l, cards: newCards } : l));
      setLists(newLists);

      moveCardMutation.mutate({ cardId: activeCardId, listId: sourceList.id, position: newPos });
    } else {
      // Moving to different list
      const oldIndex = sourceList.cards.findIndex((c) => c.id === activeCardId);
      let newIndex = destList.cards.findIndex((c) => c.id === overId);
      if (newIndex === -1) newIndex = destList.cards.length; // Dropped on empty list

      const newSourceCards = [...sourceList.cards];
      newSourceCards.splice(oldIndex, 1);

      const newDestCards = [...destList.cards];
      newDestCards.splice(newIndex, 0, activeCard);

      const prev = newDestCards[newIndex - 1]?.position || 0;
      const next = newDestCards[newIndex + 1]?.position || prev + 65536 * 2;
      const newPos = (prev + next) / 2;

      activeCard.position = newPos;
      activeCard.listId = destList.id;

      const newLists = lists.map((l) => {
        if (l.id === sourceList!.id) return { ...l, cards: newSourceCards };
        if (l.id === destList!.id) return { ...l, cards: newDestCards };
        return l;
      });
      setLists(newLists);

      moveCardMutation.mutate({ cardId: activeCardId, listId: destList.id, position: newPos });
    }
  };

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [isAutomationsOpen, setIsAutomationsOpen] = useState(false);
  const [isFormsOpen, setIsFormsOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isEditingBoard, setIsEditingBoard] = useState(false);
  const [isDeletingBoard, setIsDeletingBoard] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');

  // Org members for task creation
  const { data: members = [] } = useQuery({
    queryKey: ['orgMembers', user?.organizationId],
    queryFn: () => (user?.organizationId ? orgService.getMembers(user.organizationId) : Promise.resolve([])),
    enabled: !!user?.organizationId,
  });

  const deleteBoardMutation = useMutation({
    mutationFn: async () => await api.delete(`/boards/${boardId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate('/');
    },
  });

  const updateBoardMutation = useMutation({
    mutationFn: async (name: string) => await api.patch(`/boards/${boardId}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      setIsEditingBoard(false);
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

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
            className="h-8 text-xs font-semibold gap-1.5 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setIsCreateTaskOpen(true)}
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
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex h-full gap-4 items-start">
            {lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                boardId={boardId!}
                onAddCard={(c) => {
                  const newLists = lists.map((l) =>
                    l.id === list.id ? { ...l, cards: [...l.cards, c] } : l
                  );
                  setLists(newLists);
                }}
                onCardClick={handleCardClick}
              />
            ))}

            <AddListForm
              boardId={boardId!}
              onAdd={() => queryClient.invalidateQueries({ queryKey: ['lists', boardId] })}
            />
          </div>
        </DndContext>
      </div>
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
      {boardId && (
        <>
          <AutomationsModal
            boardId={boardId}
            isOpen={isAutomationsOpen}
            onClose={() => setIsAutomationsOpen(false)}
            lists={lists}
          />
          <FormBuilderModal
            boardId={boardId}
            lists={lists}
            isOpen={isFormsOpen}
            onClose={() => setIsFormsOpen(false)}
          />

          {/* Create Task Modal */}
          {isCreateTaskOpen && (
            <CreateTaskModal
              lists={lists}
              members={members}
              currentUser={user}
              isOpen={isCreateTaskOpen}
              onClose={() => setIsCreateTaskOpen(false)}
              onTaskCreated={(card) => {
                queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
                setIsCreateTaskOpen(false);
                if (card?.id) handleCardClick(card.id);
              }}
            />
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
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingBoard(false)}>
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
                    Are you sure you want to delete board <strong className="text-foreground">{board?.name}</strong>?
                  </p>
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-1">
                    <p className="font-semibold">This board will be moved to Trash.</p>
                    <p>All lists, cards, checklist items, and comments will be moved to the Recycle Bin and automatically purged after 30 days. You can restore them from Trash before then.</p>
                  </div>
                  <div className="flex justify-end gap-2 pt-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsDeletingBoard(false)}>
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
  onAddCard,
  onCardClick,
}: {
  list: KanbanList;
  boardId: string;
  onAddCard: (c: KanbanCard) => void;
  onCardClick: (id: string) => void;
}) {
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
  }, [user?.id]);

  // Org members for quick assignee selector
  const { data: members = [] } = useQuery({
    queryKey: ['orgMembers', user?.organizationId],
    queryFn: () => (user?.organizationId ? orgService.getMembers(user.organizationId) : Promise.resolve([])),
    enabled: !!user?.organizationId,
  });

  const deleteListMutation = useMutation({
    mutationFn: async () => await api.delete(`/lists/${list.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
      setIsDeletingList(false);
    },
  });

  const updateListMutation = useMutation({
    mutationFn: async (name: string) => await api.patch(`/lists/${list.id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists', boardId] });
      setIsEditingList(false);
    },
  });

  const handleAdd = async (openDetails = false) => {
    if (!title.trim()) return;
    const payload: any = {
      listId: list.id,
      title: title.trim(),
      description: description.trim() || undefined,
      assigneeId: assigneeId || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      storyPoints: storyPoints ? Number(storyPoints) : undefined,
    };
    const res = await api.post('/cards', payload);
    onAddCard(res.data);
    setTitle('');
    setDescription('');
    setDueDate('');
    setStoryPoints('');
    setAssigneeId(user?.id || '');
    setAdding(false);
    setShowMoreFields(false);
    if (openDetails && res.data?.id) {
      onCardClick(res.data.id);
    }
  };

  return (
    <div className="w-72 bg-muted/40 border border-border/70 rounded-2xl p-3 flex flex-col max-h-full flex-shrink-0 shadow-xs backdrop-blur-sm">
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
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
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

      {/* Edit List Dialog */}
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
                  value={editListName}
                  onChange={(e) => setEditListName(e.target.value)}
                  placeholder="e.g. In Progress, Done"
                  className="h-9 text-xs"
                  autoFocus
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingList(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateListMutation.isPending}>
                  {updateListMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete List Dialog */}
      {isDeletingList && (
        <Dialog open={isDeletingList} onOpenChange={setIsDeletingList}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" /> Delete List
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>
                Are you sure you want to delete list <strong className="text-foreground">{list.name}</strong>?
              </p>
              <p className="text-destructive text-xs">
                All cards within this list will be removed.
              </p>
              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsDeletingList(false)}>
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

      <div className="flex-1 overflow-y-auto min-h-[50px]">
        <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {list.cards.map((card) => (
              <SortableCard key={card.id} card={card} onClick={() => onCardClick(card.id)} />
            ))}
          </div>
        </SortableContext>
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="p-3 rounded-xl bg-card border border-primary/40 shadow-md space-y-2.5 animate-in fade-in-50 duration-150">
            {/* Title Textarea */}
            <textarea
              autoFocus
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full text-xs bg-background border border-input rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd(false);
                }
              }}
            />

            {/* Optional Description / Summary Notes */}
            {showMoreFields && (
              <div className="space-y-1 pt-1 border-t border-border/50 animate-in fade-in-50 duration-150">
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
              {/* Assignee Picker */}
              <div className="flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-lg border border-border/70">
                <User className="w-3 h-3 text-muted-foreground" />
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="bg-transparent text-[11px] font-medium text-foreground outline-none cursor-pointer max-w-[105px] truncate"
                >
                  {user && <option value={user.id}>Me ({user.name})</option>}
                  {members.map((m: any) =>
                    m.userId !== user?.id ? (
                      <option key={m.userId} value={m.userId}>
                        {m.name || m.email}
                      </option>
                    ) : null
                  )}
                  <option value="">Unassigned</option>
                </select>
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-lg border border-border/70">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-transparent text-[11px] text-foreground outline-none cursor-pointer"
                />
              </div>

              {/* Story Points */}
              <div className="flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-lg border border-border/70">
                <span className="text-[10px] font-bold text-muted-foreground">PTS</span>
                <input
                  type="number"
                  min="0"
                  placeholder="pts"
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  className="w-8 bg-transparent text-[11px] text-center text-foreground outline-none font-medium"
                />
              </div>

              {/* Toggle Notes */}
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-primary transition-colors ml-auto font-medium"
                onClick={() => setShowMoreFields(!showMoreFields)}
              >
                {showMoreFields ? 'Less' : '+ Notes'}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-7 text-xs font-semibold" onClick={() => handleAdd(false)}>
                  Add Card
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleAdd(true)}
                  title="Create and open full card details modal"
                >
                  <Maximize2 className="w-3 h-3" /> Full Editor
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors h-8 text-xs font-medium"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1.5 w-3.5 h-3.5" /> Add a card
          </Button>
        )}
      </div>
    </div>
  );
}

function SortableCard({ card, onClick }: { card: KanbanCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimeoutRef = useRef<any>(null);

  const handleMouseEnter = () => {
    if (isDragging) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPreview(true);
    }, 450);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowPreview(false);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDueOverdue = card.dueDate ? isPast(new Date(card.dueDate)) : false;
  const primaryAssignee = card.assignee || card.assignees?.[0];
  const hasChecklists = (card.checklistTotal ?? 0) > 0;
  const isChecklistComplete = hasChecklists && card.checklistDone === card.checklistTotal;
  const checklistPercent = hasChecklists
    ? Math.round(((card.checklistDone ?? 0) / card.checklistTotal!) * 100)
    : 0;

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Card
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all group bg-card hover:shadow-md border-border/80 rounded-xl overflow-hidden"
        onClick={(e) => {
          if (!e.defaultPrevented) onClick();
        }}
      >
        <CardContent className="p-3 space-y-2">
          {/* Top: Labels */}
          {card.labels && card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.labels.map((lbl) => (
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
          )}

          {/* Title */}
          <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
            {card.title}
          </div>

          {/* Stage Badge if assigned */}
          {card.stage && (
            <div className="flex items-center gap-1">
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
            </div>
          )}

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
                  <span>{new Date(card.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
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
                  <span>{card.checklistDone}/{card.checklistTotal}</span>
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
                <span className="inline-flex items-center gap-1 hover:text-foreground transition-colors" title="Comments">
                  <MessageSquare className="w-3 h-3" />
                  <span>{card.commentsCount}</span>
                </span>
              )}

              {/* Attachments Count */}
              {(card.attachmentsCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 hover:text-foreground transition-colors" title="Attachments">
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
                    {primaryAssignee.name ? primaryAssignee.name.substring(0, 1).toUpperCase() : 'U'}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full border border-dashed border-border/80 flex items-center justify-center text-[8px] text-muted-foreground/40 shrink-0" title="Unassigned">
                +
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Rich Hover Preview Tooltip Card ─── */}
      {showPreview && !isDragging && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] w-80 p-3.5 rounded-2xl bg-popover/95 backdrop-blur-xl border border-border/80 shadow-2xl z-50 pointer-events-none animate-in fade-in-50 zoom-in-95 duration-150 text-foreground space-y-2.5">
          {/* Header Row: Stage & Points */}
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
                <span className="text-[10px] text-muted-foreground font-mono">Task Preview</span>
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
                {isDueOverdue ? 'Overdue' : 'Due'}{' '}
                {format(new Date(card.dueDate), 'MMM d')}
              </span>
            )}
          </div>

          {/* Full Non-truncated Title */}
          <div className="text-xs font-bold text-foreground leading-snug">
            {card.title}
          </div>

          {/* Description Excerpt if present */}
          {card.description ? (
            <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg border border-border/50 line-clamp-3 leading-relaxed">
              {card.description}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground/70 italic">
              No description provided.
            </div>
          )}

          {/* Checklist Progress Bar */}
          {hasChecklists && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-muted-foreground flex items-center gap-1">
                  <ListChecks className="w-3 h-3 text-primary" /> Checklist Progress
                </span>
                <span className="font-mono text-foreground font-semibold">
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

          {/* Assignee & Activity Summary */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px]">
            {primaryAssignee ? (
              <div className="flex items-center gap-1.5 min-w-0">
                {primaryAssignee.avatarUrl ? (
                  <img
                    src={primaryAssignee.avatarUrl}
                    alt={primaryAssignee.name}
                    className="w-4 h-4 rounded-full object-cover ring-1 ring-border"
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[8px] font-bold">
                    {primaryAssignee.name ? primaryAssignee.name.substring(0, 1).toUpperCase() : 'U'}
                  </div>
                )}
                <span className="truncate max-w-[130px] font-medium text-foreground">
                  {primaryAssignee.name || primaryAssignee.email}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground italic text-[10px]">Unassigned</span>
            )}

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {(card.commentsCount ?? 0) > 0 && (
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="w-3 h-3" /> {card.commentsCount}
                </span>
              )}
              {(card.attachmentsCount ?? 0) > 0 && (
                <span className="flex items-center gap-0.5">
                  <Paperclip className="w-3 h-3" /> {card.attachmentsCount}
                </span>
              )}
            </div>
          </div>

          {/* Quick Footer Hint */}
          <div className="text-[9px] text-muted-foreground/60 text-center font-mono pt-0.5">
            Click card to open full details
          </div>
        </div>
      )}
    </div>
  );
}

function AddListForm({ boardId, onAdd }: { boardId: string; onAdd: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const handleAdd = async () => {
    if (!name) return;
    await api.post('/lists', { boardId, name });
    setName('');
    setAdding(false);
    onAdd();
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
            <Button size="sm" onClick={handleAdd}>
              Add List
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

function CreateTaskModal({
  lists,
  members,
  currentUser,
  isOpen,
  onClose,
  onTaskCreated,
}: {
  lists: KanbanList[];
  members: any[];
  currentUser: any;
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: (card: any) => void;
}) {
  const [title, setTitle] = useState('');
  const [listId, setListId] = useState(lists[0]?.id || '');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentUser?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [storyPoints, setStoryPoints] = useState<string>('');
  const [estimateHours, setEstimateHours] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !listId) return;

    setIsSubmitting(true);
    try {
      const payload: any = {
        listId,
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        storyPoints: storyPoints ? Number(storyPoints) : undefined,
        estimateMinutes: estimateHours ? Math.round(Number(estimateHours) * 60) : undefined,
      };

      const res = await api.post('/cards', payload);
      onTaskCreated(res.data);
    } catch (err) {
      console.error('Failed to create task', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        <div className="p-5 border-b border-border bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Create New Task</DialogTitle>
              <p className="text-xs text-muted-foreground">Add a new item to your Kanban board</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target List & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">Board Column</Label>
              <select
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                required
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">Task Title</Label>
              <Input
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Implement authentication microservice..."
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs font-semibold text-foreground mb-1.5 block">
              Description / Requirements (Markdown supported)
            </Label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide background, checklist, or acceptance criteria..."
              className="w-full text-xs rounded-lg border border-input bg-background p-3 outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground leading-relaxed"
            />
          </div>

          {/* Assignee & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">Primary Assignee</Label>
              <select
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                {currentUser && <option value={currentUser.id}>Assign to Me ({currentUser.name})</option>}
                {members.map((m: any) =>
                  m.userId !== currentUser?.id ? (
                    <option key={m.userId} value={m.userId}>
                      {m.name || m.email}
                    </option>
                  ) : null
                )}
                <option value="">Unassigned</option>
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Points & Hours Estimate */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">Story Points</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 3, 5, 8"
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">Estimated Hours</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 4.5"
                value={estimateHours}
                onChange={(e) => setEstimateHours(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim() || isSubmitting} className="gap-1.5">
              {isSubmitting ? 'Creating...' : 'Create & Open Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
