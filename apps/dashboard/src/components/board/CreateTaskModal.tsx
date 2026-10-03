import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { Dialog, DialogContent, DialogTitle } from '@boardly/ui/dialog';
import { DatePicker } from '@boardly/ui';
import { toast } from 'sonner';
import { Sparkles, CornerDownRight, Tag, Users, Eye, ListChecks, Check, X } from 'lucide-react';
import { MemberSearchableSelect, ListSearchableSelect } from '../ui/SearchableSelect';
import { AsyncMemberSearchableSelect, AsyncMemberChipPicker } from '../ui/AsyncMemberSelect';
import { usePermissions, permissionReason } from '../../hooks/usePermissions';
import { useDialogClose } from '../../hooks/useDialogClose';

export interface CreateTaskInitialData {
  listId?: string;
  title?: string;
  description?: string;
  assigneeId?: string;
  dueDate?: string;
  storyPoints?: string;
}

interface CreateTaskModalProps {
  lists: any[];
  members: any[];
  currentUser: any;
  isOpen: boolean;
  initialData?: CreateTaskInitialData;
  /** When set, the dialog becomes a "Create Subtask" dialog with the parent locked. */
  parentCardId?: string;
  parentCardTitle?: string;
  /** Board id — enables the Labels section (board tags). */
  boardId?: string;
  /** Org id — powers server-side member search (assignee/participants/observers). */
  orgId?: string;
  onClose: () => void;
  onTaskCreated: (card: any) => void;
}

/**
 * Required-field asterisk (Jira-style): visual `*` + screen-reader label.
 * Use on every mandatory field label so users can scan requirements at a glance.
 */
function RequiredMark() {
  return (
    <>
      <span className="text-destructive" aria-hidden="true">
        *
      </span>
      <span className="sr-only">(required)</span>
    </>
  );
}

/**
 * Compact multi-select chip list for participants / observers.
 * Toggle chips with avatar + name; selected chips highlight.
 */
function MemberChipPicker({
  directory,
  selectedIds,
  onToggle,
  emptyText,
}: {
  directory: { id: string; name?: string; email?: string; avatarUrl?: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  if (directory.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-0.5">
      {directory.map((m) => {
        const selected = selectedIds.includes(m.id);
        const label = m.name || m.email || 'Team Member';
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onToggle(m.id)}
            title={m.email}
            className={`pl-1 pr-2 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
              selected
                ? 'bg-primary/10 text-primary border-primary/40'
                : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground hover:bg-muted/70'
            }`}
          >
            {m.avatarUrl ? (
              <img
                src={m.avatarUrl}
                alt={label}
                className="w-5 h-5 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                {label.substring(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate max-w-[110px]">{label}</span>
            {selected && <Check className="w-3 h-3 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared full task composer (Jira-style). Used for top-level tasks from the
 * board and for subtasks from the task view — in subtask mode the parent is
 * pre-selected and locked to the current task.
 */
export function CreateTaskModal({
  lists,
  members,
  currentUser,
  isOpen,
  initialData,
  parentCardId,
  parentCardTitle,
  boardId,
  orgId,
  onClose,
  onTaskCreated,
}: CreateTaskModalProps) {
  const isSubtask = !!parentCardId;
  const [title, setTitle] = useState(initialData?.title || '');
  const [listId, setListId] = useState(initialData?.listId || lists[0]?.id || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [assigneeId, setAssigneeId] = useState(initialData?.assigneeId || currentUser?.id || '');
  const [dueDate, setDueDate] = useState(initialData?.dueDate || '');
  const [storyPoints, setStoryPoints] = useState<string>(initialData?.storyPoints || '');
  const [estimateHours, setEstimateHours] = useState<string>('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [checklistTitle, setChecklistTitle] = useState('');
  const [checklistItemsText, setChecklistItemsText] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { can, isLoading: permsLoading } = usePermissions();
  // POST /cards is guarded by card.create only (inline assignee/labels included).
  const canCreateTask = permsLoading ? false : can('card.create');

  // Board tags for the Labels section.
  const { data: boardLabels = [] } = useQuery({
    queryKey: ['boardLabels', boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}/labels`)).data,
    enabled: isOpen && !!boardId,
    staleTime: 5 * 60 * 1000,
  });

  // Member directory (assignee select + participant/observer pickers).
  const directory = [
    ...(currentUser?.id
      ? [
          {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            avatarUrl: currentUser.avatarUrl,
          },
        ]
      : []),
    ...(members || [])
      .map((m: any) => ({
        id: m.userId || m.id,
        name: m.name || m.user?.name,
        email: m.email || m.user?.email,
        avatarUrl: m.avatarUrl || m.user?.avatarUrl,
      }))
      .filter((m: any) => m.id && m.id !== currentUser?.id),
  ];

  // Enterprise scale: when orgId is known, member dropdowns search the server
  // (debounced + paginated) instead of rendering the full directory.
  const useAsyncMembers = !!orgId;

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || '');
      setListId(initialData?.listId || lists[0]?.id || '');
      setDescription(initialData?.description || '');
      setAssigneeId(initialData?.assigneeId || currentUser?.id || '');
      setDueDate(initialData?.dueDate || '');
      setStoryPoints(initialData?.storyPoints || '');
      setEstimateHours('');
      setLabelIds([]);
      setParticipantIds([]);
      setWatcherIds([]);
      setChecklistTitle('');
      setChecklistItemsText('');
      setTitleError(null);
    }
  }, [isOpen, initialData, lists, currentUser?.id]);

  const checklistItems = checklistItemsText
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);

  // Remove the nth parsed checklist line from the raw text.
  const removeChecklistLine = (lineIndex: number) => {
    const lines = checklistItemsText.split('\n');
    let seen = -1;
    const next = lines.filter((l) => {
      if (!l.trim()) return true;
      seen += 1;
      return seen !== lineIndex;
    });
    setChecklistItemsText(next.join('\n'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateTask) {
      toast.error(permissionReason('card.create'));
      return;
    }
    if (!title.trim()) {
      setTitleError('Please give the task a title.');
      return;
    }
    setTitleError(null);
    if (!listId) return;

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
        parentCardId: parentCardId || undefined,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
        participantIds: participantIds.length > 0 ? participantIds : undefined,
        watcherIds: watcherIds.length > 0 ? watcherIds : undefined,
        checklist:
          checklistItems.length > 0
            ? { title: checklistTitle.trim() || undefined, items: checklistItems }
            : undefined,
      };

      const res = await api.post('/cards', payload);
      onTaskCreated(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single close path (AGENTS.md §11) — requestClose is idempotent per open
  // session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen,
    onClose,
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        {/* ─── Fixed Header ─── */}
        <div className="p-5 border-b border-border/80 bg-card/90 backdrop-blur-md flex items-center justify-between shrink-0 pr-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              {isSubtask ? (
                <CornerDownRight className="w-4 h-4" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {isSubtask ? 'Create Subtask' : 'Create New Task'}
              </DialogTitle>{' '}
              <p className="text-xs text-muted-foreground">
                {isSubtask
                  ? 'Add a subtask to the current task'
                  : 'Add a new item to your Kanban board'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* ─── Scrollable Body ─── */}
          <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-4">
            {/* Parent Task (locked, subtask mode only) */}
            {isSubtask && (
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Parent Task
                </Label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground">
                  <CornerDownRight className="w-3.5 h-3.5 shrink-0 text-primary" />
                  <span className="truncate font-medium text-foreground">
                    {parentCardTitle || 'Current task'}
                  </span>
                </div>
              </div>
            )}

            {/* Target List & Title */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Board Column
                </Label>
                <ListSearchableSelect lists={lists} value={listId} onChange={setListId} />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Task Title <RequiredMark />
                </Label>
                <Input
                  autoFocus
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (titleError) setTitleError(null);
                  }}
                  aria-required="true"
                  aria-invalid={!!titleError}
                  aria-describedby={titleError ? 'composer-title-error' : undefined}
                  placeholder={
                    isSubtask
                      ? 'e.g. Write unit tests for the auth flow...'
                      : 'e.g. Implement authentication microservice...'
                  }
                  className={`h-9 text-xs ${titleError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                />
                {titleError ? (
                  <p
                    id="composer-title-error"
                    role="alert"
                    className="mt-1 text-[11px] font-medium text-destructive"
                  >
                    {titleError}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">Required</p>
                )}
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
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Primary Assignee
                </Label>
                {useAsyncMembers ? (
                  <AsyncMemberSearchableSelect
                    orgId={orgId}
                    currentUser={currentUser}
                    value={assigneeId}
                    onChange={setAssigneeId}
                    pinnedIds={assigneeId ? [assigneeId] : []}
                  />
                ) : (
                  <MemberSearchableSelect
                    members={members}
                    currentUser={currentUser}
                    value={assigneeId}
                    onChange={setAssigneeId}
                  />
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Due Date
                </Label>
                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="No due date"
                  triggerClassName="h-9 text-xs"
                />
              </div>
            </div>

            {/* Points & Hours Estimate */}
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Story Points
                </Label>
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
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Estimated Hours
                </Label>
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

            {/* Labels */}
            {boardId && (
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" /> Labels
                </Label>
                {boardLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {boardLabels.map((lbl: any) => {
                      const selected = labelIds.includes(lbl.id);
                      return (
                        <button
                          key={lbl.id}
                          type="button"
                          onClick={() => setLabelIds(toggleId(labelIds, lbl.id))}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 border transition-all cursor-pointer"
                          style={
                            selected
                              ? {
                                  backgroundColor: `${lbl.color}25`,
                                  color: lbl.color,
                                  borderColor: `${lbl.color}60`,
                                }
                              : {
                                  backgroundColor: 'transparent',
                                  color: 'var(--muted-foreground)',
                                  borderColor: 'var(--border)',
                                }
                          }
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: lbl.color }}
                          />
                          <span className="truncate max-w-[110px]">{lbl.name}</span>
                          {selected && <Check className="w-3 h-3 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No labels on this board yet — create them from the task view after creating.
                  </p>
                )}
              </div>
            )}

            {/* People: participants + observers side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Participants */}
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" /> Participants
                </Label>
                {useAsyncMembers ? (
                  <AsyncMemberChipPicker
                    orgId={orgId}
                    selectedIds={participantIds}
                    onToggle={(id) => setParticipantIds(toggleId(participantIds, id))}
                  />
                ) : (
                  <MemberChipPicker
                    directory={directory}
                    selectedIds={participantIds}
                    onToggle={(id) => setParticipantIds(toggleId(participantIds, id))}
                    emptyText="No team members found."
                  />
                )}
              </div>

              {/* Observers */}
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" /> Observers
                </Label>
                {useAsyncMembers ? (
                  <AsyncMemberChipPicker
                    orgId={orgId}
                    selectedIds={watcherIds}
                    onToggle={(id) => setWatcherIds(toggleId(watcherIds, id))}
                  />
                ) : (
                  <MemberChipPicker
                    directory={directory}
                    selectedIds={watcherIds}
                    onToggle={(id) => setWatcherIds(toggleId(watcherIds, id))}
                    emptyText="No team members found."
                  />
                )}
              </div>
            </div>

            {/* Initial Checklist */}
            <div>
              <Label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-muted-foreground" /> Initial Checklist
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="space-y-2">
                <Input
                  value={checklistTitle}
                  onChange={(e) => setChecklistTitle(e.target.value)}
                  placeholder="Checklist title (e.g. Acceptance Criteria)..."
                  className="h-9 text-xs"
                />
                <textarea
                  rows={4}
                  value={checklistItemsText}
                  onChange={(e) => setChecklistItemsText(e.target.value)}
                  placeholder="One item per line — e.g. Write tests"
                  className="w-full text-xs rounded-lg border border-input bg-background p-3 outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground leading-relaxed"
                />
                {/* Live checkbox preview — exactly what will be created */}
                {checklistItems.length > 0 && (
                  <div className="rounded-lg border border-border/70 bg-muted/30 divide-y divide-border/50 overflow-hidden">
                    {checklistItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 group">
                        <span className="w-3.5 h-3.5 rounded border border-muted-foreground/50 shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-xs text-foreground">
                          {item}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {idx + 1}/{checklistItems.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeChecklistLine(idx)}
                          title="Remove item"
                          className="p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Fixed Bottom Footer ─── */}
          <div className="p-4 sm:px-6 border-t border-border/80 bg-card/90 backdrop-blur-md shrink-0 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="cursor-pointer text-xs"
            >
              Cancel
            </Button>
            <span
              className="inline-flex"
              title={!canCreateTask ? permissionReason('card.create') : undefined}
            >
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !canCreateTask}
                title={
                  !canCreateTask
                    ? permissionReason('card.create')
                    : !title.trim()
                      ? 'Enter a task title to continue'
                      : undefined
                }
                aria-describedby={!canCreateTask ? 'create-task-modal-perm' : undefined}
                className="gap-1.5 cursor-pointer text-xs px-5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : isSubtask ? 'Create Subtask' : 'Create & Open Task'}
              </Button>
            </span>
            <span id="create-task-modal-perm" className="sr-only">
              {permissionReason('card.create')}
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
