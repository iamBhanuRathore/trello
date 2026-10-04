import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CopyPlus, Layers, ListChecks, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Label } from '@boardly/ui/label';
import { DatePicker } from '@boardly/ui';
import { Dialog, DialogContent, DialogTitle } from '@boardly/ui/dialog';
import { api } from '../../../lib/api';
import { useDialogClose } from '../../../hooks/useDialogClose';
import { usePermissions, permissionReason } from '../../../hooks/usePermissions';
import { MemberSearchableSelect, ListSearchableSelect } from '../../ui/SearchableSelect';
import { AsyncMemberSearchableSelect } from '../../ui/AsyncMemberSelect';

export type CloneMode = 'clone' | 'subtask';

export interface CloneCardDialogProps {
  open: boolean;
  onClose: () => void;
  /** Source card. Every editable field starts from this card's value. */
  card: any;
  mode: CloneMode;
  lists: any[];
  priorities: any[];
  stages: any[];
  members: any[];
  currentUser: any;
  orgId?: string;
  /** Set in subtask mode — the clone is parented here. */
  parentCardId?: string;
  parentCardTitle?: string;
  onCloned: (newCard: any) => void;
}

const toDateInput = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

/**
 * Review-before-clone.
 *
 * Clone used to fire straight from the overflow menu: the title was templated
 * (`"${title} (Copy)"`) and persisted on click, so there was no moment at which
 * the caller could correct a title, list, assignee or due date. This opens a
 * prefilled draft instead and only calls the clone endpoint on submit.
 *
 * Submits to `POST /cards/:id/clone` rather than `POST /cards` so checklists,
 * cover image and position keep their clone semantics — the review step should
 * not quietly downgrade a clone to a fresh card. Fields the user did not touch
 * are still sent, because the endpoint falls back per field.
 */
export function CloneCardDialog({
  open,
  onClose,
  card,
  mode,
  lists,
  priorities,
  stages,
  members,
  currentUser,
  orgId,
  parentCardId,
  parentCardTitle,
  onCloned,
}: CloneCardDialogProps) {
  const { can } = usePermissions();
  const canCreate = can('card.create');
  const isSubtask = mode === 'subtask';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [listId, setListId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [stageId, setStageId] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);

  // Re-seed from the source card each time the dialog opens, so a second clone
  // never inherits edits made in the first.
  useEffect(() => {
    if (!open || !card) return;
    setTitle(isSubtask ? `Subtask: ${card.title || 'Task'}` : `${card.title || 'Task'} (Copy)`);
    setDescription(card.description || '');
    setListId(card.listId || '');
    setAssigneeId(card.assignee?.id || '');
    setDueDate(toDateInput(card.dueDate));
    setPriorityId(card.priorityId || '');
    setStageId(card.stageId || '');
    setStoryPoints(card.storyPoints != null ? String(card.storyPoints) : '');
    setLabelIds((card.labels || []).map((l: any) => l.id));
  }, [open, card, isSubtask]);

  const { data: boardLabels = [] } = useQuery({
    queryKey: ['boardLabels', card?.boardId],
    queryFn: async () => (await api.get(`/boards/${card?.boardId}/labels`)).data,
    enabled: open && !!card?.boardId,
    staleTime: 300_000,
  });

  const checklistSummary = useMemo(() => {
    const list = card?.checklists || [];
    const items = list.reduce((n: number, c: any) => n + (c.items?.length || 0), 0);
    return { lists: list.length, items };
  }, [card]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/cards/${card.id}/clone`, {
        title: title.trim(),
        description: description.trim(),
        listId,
        parentCardId: isSubtask ? parentCardId : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        priorityId: priorityId || null,
        stageId: stageId || null,
        storyPoints: storyPoints === '' ? null : Number(storyPoints),
        assigneeId: assigneeId || null,
        labelIds,
      });
      return res.data;
    },
    onSuccess: (cloned) => {
      toast.success(isSubtask ? 'Subtask created' : 'Task cloned successfully');
      onCloned(cloned);
    },
    onError: (err: unknown) => {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Unable to clone the task.'
      );
    },
  });

  const { requestClose, handleOpenChange } = useDialogClose({
    isOpen: open,
    onClose,
    isDirty: mutation.isPending,
  });

  const toggleLabel = (id: string) =>
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate || !title.trim() || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        <div className="p-5 border-b border-border/80 flex items-center justify-between shrink-0 pr-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              {isSubtask ? <Layers className="w-4 h-4" /> : <CopyPlus className="w-4 h-4" />}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {isSubtask ? 'Clone as Subtask' : 'Clone Task'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Review the copied details, then create. Nothing is saved until you click{' '}
                {isSubtask ? 'Create Subtask' : 'Clone Task'}.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 pt-0 space-y-4">
            {isSubtask && parentCardTitle && (
              <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Parent task
                </p>
                <p className="text-xs font-semibold text-foreground truncate">{parentCardTitle}</p>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                Description
              </Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Add more detail…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-y"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">List</Label>
                <ListSearchableSelect
                  lists={lists}
                  value={listId}
                  onChange={(v) => setListId(v || '')}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Assignee
                </Label>
                {orgId ? (
                  <AsyncMemberSearchableSelect
                    orgId={orgId}
                    currentUser={currentUser}
                    value={assigneeId}
                    onChange={(v) => setAssigneeId(v || '')}
                    pinnedIds={assigneeId ? [assigneeId] : []}
                  />
                ) : (
                  <MemberSearchableSelect
                    members={members}
                    currentUser={currentUser}
                    value={assigneeId}
                    onChange={(v) => setAssigneeId(v || '')}
                  />
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Due date
                </Label>
                <DatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Story points
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                  Priority
                </Label>
                <select
                  value={priorityId}
                  onChange={(e) => setPriorityId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">No priority</option>
                  {priorities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">Status</Label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">No status</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {boardLabels.length > 0 && (
              <div>
                <Label className="text-xs font-semibold text-foreground mb-1.5 block">Labels</Label>
                <div className="flex flex-wrap gap-1.5">
                  {boardLabels.map((l: any) => {
                    const on = labelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => toggleLabel(l.id)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          on
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        {l.name}
                        {on && <X className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {checklistSummary.lists > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
                <ListChecks className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  {checklistSummary.lists} checklist{checklistSummary.lists === 1 ? '' : 's'} (
                  {checklistSummary.items} item{checklistSummary.items === 1 ? '' : 's'}) will be
                  copied with the tasks reset to not done.
                </p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border/80 flex items-center justify-between gap-3 shrink-0">
            <p className="text-[11px] text-muted-foreground">
              Copied from <span className="font-semibold">{card?.key || 'this task'}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!canCreate || !title.trim() || mutation.isPending}
                title={
                  !canCreate
                    ? permissionReason('card.create')
                    : !title.trim()
                      ? 'Enter a title to continue'
                      : undefined
                }
                className="gap-1.5 cursor-pointer text-xs px-5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? 'Creating…' : isSubtask ? 'Create Subtask' : 'Clone Task'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
