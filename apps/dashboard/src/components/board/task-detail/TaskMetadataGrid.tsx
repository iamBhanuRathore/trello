import React, { useState, useRef, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { DatePicker } from '@boardly/ui';
import { SearchableSelect, ListSearchableSelect } from '../../ui/SearchableSelect';
import { MemberPicker } from '../MemberPicker';
import { LabelPicker } from '../LabelPicker';
import { copyTextToClipboard } from '../../../utils/taskIdentifier';
import { sprintsService } from '../../../lib/sprintsService';
import {
  Calendar,
  Hourglass,
  FolderGit2,
  Copy,
  Plus,
  X,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';

interface TaskMetadataGridProps {
  card: any;
  lists: any[];
  priorities: any[];
  stageTemplates?: any[];
  sprints?: any[];
  phases?: any[];
  orgId?: string;
  currentUser?: any;
  taskIdentifier: string;
  onUpdateCard: (data: any) => void;
  onMoveCard: (listId: string) => void;
  onAssignUser: (userId: string) => void;
  onRemoveUser: (userId: string) => void;
  onAddParticipant: (userId: string) => void;
  onRemoveParticipant: (userId: string) => void;
  onWatchCard: (userId: string) => void;
  onUnwatchCard: (userId: string) => void;
  onUpdateWatchers: (data: { add: string[]; remove: string[]; staged: any[] }) => void;
  isUpdatingWatchers?: boolean;
  onToggleLabel: (data: { labelId: string; hasLabel: boolean }) => void;
}

export const TaskMetadataGrid: React.FC<TaskMetadataGridProps> = ({
  card,
  lists,
  priorities,
  stageTemplates,
  sprints,
  phases,
  orgId,
  currentUser,
  taskIdentifier,
  onUpdateCard,
  onMoveCard,
  onAssignUser,
  onRemoveUser,
  onAddParticipant,
  onRemoveParticipant,
  onWatchCard,
  onUnwatchCard,
  onUpdateWatchers,
  isUpdatingWatchers,
  onToggleLabel,
}) => {
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [showParticipantPicker, setShowParticipantPicker] = useState(false);
  const [showWatcherPicker, setShowWatcherPicker] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const assigneePickerRef = useRef<HTMLDivElement>(null);
  const participantPickerRef = useRef<HTMLDivElement>(null);
  const watcherPickerRef = useRef<HTMLDivElement>(null);
  const labelPickerRef = useRef<HTMLDivElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        showAssigneePicker &&
        assigneePickerRef.current &&
        !assigneePickerRef.current.contains(target)
      ) {
        setShowAssigneePicker(false);
      }
      if (
        showParticipantPicker &&
        participantPickerRef.current &&
        !participantPickerRef.current.contains(target)
      ) {
        setShowParticipantPicker(false);
      }
      if (
        showWatcherPicker &&
        watcherPickerRef.current &&
        !watcherPickerRef.current.contains(target)
      ) {
        setShowWatcherPicker(false);
      }
      if (showLabelPicker && labelPickerRef.current && !labelPickerRef.current.contains(target)) {
        setShowLabelPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAssigneePicker, showParticipantPicker, showWatcherPicker, showLabelPicker]);

  const assignedUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (card?.assignee?.id) ids.add(card.assignee.id);
    return ids;
  }, [card?.assignee]);

  const participantUserIds = useMemo(() => {
    return new Set<string>(card?.participants?.map((p: any) => p.id) || []);
  }, [card?.participants]);

  const watcherUserIds = useMemo(() => {
    return new Set<string>(card?.watchers?.map((w: any) => w.id) || []);
  }, [card?.watchers]);

  const cardLabelIds = useMemo(() => {
    return card?.labels?.map((l: any) => l.id) || [];
  }, [card?.labels]);

  const isCurrentUserWatching = useMemo(() => {
    if (!currentUser?.id || !card?.watchers) return false;
    return card.watchers.some((w: any) => w.id === currentUser.id);
  }, [currentUser?.id, card?.watchers]);

  const isDueOverdue = card.dueDate ? new Date(card.dueDate) < new Date() : false;

  return (
    <div className="space-y-4">
      {/* ─── CARD 1: CORE METADATA GRID (Owner, Assignee, Deadline, Status, Created) ─── */}
      <div className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs relative">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6 text-xs">
          {/* Task Owner */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Task owner:</span>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                {card.creatorName
                  ? card.creatorName.substring(0, 2).toUpperCase()
                  : currentUser?.name?.substring(0, 2).toUpperCase() || 'TO'}
              </div>
              <span className="font-semibold text-foreground truncate">
                {card.creatorName || currentUser?.name || 'System Owner'}
              </span>
            </div>
          </div>

          {/* Assignee with Floating Popover */}
          <div className="flex items-center gap-3 relative">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Assignee:</span>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {card.assignee ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {card.assignee.avatarUrl ? (
                    <img
                      src={card.assignee.avatarUrl}
                      alt={card.assignee.name}
                      className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-border"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {card.assignee.name ? card.assignee.name.substring(0, 2).toUpperCase() : 'U'}
                    </div>
                  )}
                  <span className="font-semibold text-foreground truncate">
                    {card.assignee.name || card.assignee.email}
                  </span>
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline font-medium ml-1 cursor-pointer"
                    onClick={() => setShowAssigneePicker(!showAssigneePicker)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  onClick={() => setShowAssigneePicker(true)}
                >
                  <UserPlus className="w-3.5 h-3.5" /> Assign owner
                </button>
              )}
            </div>

            {/* Floating Popover for Assignee */}
            {showAssigneePicker && orgId && (
              <div
                ref={assigneePickerRef}
                className="absolute z-50 top-full left-0 mt-1.5 w-80 sm:w-96"
              >
                <MemberPicker
                  orgId={orgId}
                  assignedUserIds={assignedUserIds}
                  onAssign={(userId) => {
                    onAssignUser(userId);
                  }}
                  onRemove={(userId) => {
                    onRemoveUser(userId);
                    setShowAssigneePicker(false);
                  }}
                  onClose={() => setShowAssigneePicker(false)}
                  currentUserId={currentUser?.id}
                  title="Assign Task Owner"
                  mode="single"
                />
              </div>
            )}
          </div>

          {/* Deadline / Due Date */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Deadline:</span>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-500 shrink-0" />
              <div
                className={`min-w-[150px] ${isDueOverdue ? '[&_button]:border-destructive [&_button]:text-destructive' : ''}`}
              >
                <DatePicker
                  value={card.dueDate ? card.dueDate.split('T')[0] : ''}
                  onChange={(v) =>
                    onUpdateCard({
                      dueDate: v ? new Date(v).toISOString() : null,
                    })
                  }
                  placeholder="Set deadline"
                  triggerClassName="h-7 px-2 bg-muted/40 border-border/80 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Status:</span>
            <div className="flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-amber-500 shrink-0" />
              <ListSearchableSelect
                lists={lists || []}
                value={card.listId}
                onChange={(val) => onMoveCard(val)}
                size="sm"
                triggerClassName="h-7 px-2.5 text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/25 rounded-md"
                className="w-auto min-w-[130px]"
              />
            </div>
          </div>

          {/* Created & Task ID */}
          <div className="flex items-center gap-3 sm:col-span-2 pt-2 border-t border-border/50 text-muted-foreground">
            <span className="w-24 font-medium shrink-0">Created:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span>
                {card.createdAt
                  ? format(new Date(card.createdAt), 'MMM d, yyyy · h:mm a')
                  : 'Recently'}
              </span>
              <span>/</span>
              <span className="font-mono font-semibold text-foreground">ID: {taskIdentifier}</span>
              <button
                type="button"
                onClick={async () => {
                  await copyTextToClipboard(taskIdentifier);
                  setCopiedId(true);
                  setTimeout(() => setCopiedId(false), 2000);
                }}
                className="hover:text-foreground cursor-pointer"
                title={copiedId ? 'Copied!' : 'Copy Task ID'}
              >
                {copiedId ? (
                  <span className="text-[11px] text-emerald-500 font-medium">Copied!</span>
                ) : (
                  <Copy className="w-3.5 h-3.5 text-primary" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── CARD 2: AGILE / SCRUM & PROJECT CONTEXT ─── */}
      <div
        id="section-project"
        className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6 text-xs">
          {/* Scrum / Project */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Scrum:</span>
            <div className="flex items-center gap-1.5 font-semibold text-foreground min-w-0 flex-1">
              <div className="w-5 h-5 rounded-md bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                <FolderGit2 className="w-3.5 h-3.5" />
              </div>
              <span className="truncate" title={card.boardName || 'DMS Dev Team'}>
                {card.boardName || 'DMS Dev Team'}
              </span>
            </div>
          </div>

          {/* Stage */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Stage:</span>
            <div className="flex-1 max-w-[200px] min-w-0">
              {stageTemplates && stageTemplates.length > 0 && stageTemplates[0].stages ? (
                <SearchableSelect
                  options={[
                    { value: '', label: 'No Stage Assigned' },
                    ...stageTemplates[0].stages.map((stg: any) => ({
                      value: stg.id,
                      label: stg.name,
                      sublabel: stg.category,
                    })),
                  ]}
                  value={card.stageId || ''}
                  onChange={(val) => onUpdateCard({ stageId: val || null })}
                  placeholder="Select stage..."
                  size="sm"
                  triggerClassName="h-7 bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300 font-semibold text-xs"
                />
              ) : (
                <span className="text-muted-foreground italic">Default Stage</span>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Priority:</span>
            <div className="flex-1 max-w-[200px] min-w-0">
              <SearchableSelect
                options={priorities.map((p: any) => ({
                  value: p.id,
                  label: `${p.name}${p.isDefault ? ' (default)' : ''}`,
                  badge: (
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: p.color }}
                    />
                  ),
                }))}
                value={card.priority?.id || card.priorityId || ''}
                onChange={(val) => onUpdateCard({ priorityId: val || null })}
                placeholder="Select priority..."
                size="sm"
                triggerClassName="h-7 bg-muted/40 text-xs font-semibold"
              />
            </div>
          </div>

          {/* Epic / Sprint */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Epic:</span>
            <div className="flex-1 max-w-[200px]">
              {sprints && sprints.length > 0 ? (
                <SearchableSelect
                  options={[
                    { value: '', label: 'Select epic / sprint...' },
                    ...sprints.map((sp: any) => ({
                      value: sp.id,
                      label: `Sprint: ${sp.name}`,
                    })),
                    ...(phases || []).map((ph: any) => ({
                      value: ph.id,
                      label: `Phase: ${ph.name}`,
                    })),
                  ]}
                  value=""
                  onChange={(val) => {
                    if (val) sprintsService.addCardToSprint(val, card.id);
                  }}
                  placeholder="Select epic"
                  size="sm"
                  triggerClassName="h-7 bg-muted/40 text-xs"
                />
              ) : (
                <span className="text-muted-foreground italic">No epic assigned</span>
              )}
            </div>
          </div>

          {/* Storypoints */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-muted-foreground font-medium shrink-0">Storypoints:</span>
            <input
              type="number"
              min="0"
              placeholder="-"
              className="w-16 h-7 px-2 text-xs rounded-md bg-muted/40 border border-border/80 text-center font-bold text-foreground outline-none"
              defaultValue={card.storyPoints ?? ''}
              onBlur={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                if (val !== card.storyPoints) onUpdateCard({ storyPoints: val });
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── CARD 3: PEOPLE / PARTICIPANTS & OBSERVERS ─── */}
      <div
        id="section-participants"
        className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3 relative"
      >
        {/* Participants */}
        <div className="flex items-start gap-3 text-xs relative">
          <span className="w-24 text-muted-foreground font-medium shrink-0 pt-1">
            Participants:
          </span>
          <div className="flex-1 flex flex-wrap items-center gap-2">
            {card.participants && card.participants.length > 0 ? (
              card.participants.map((p: any) => (
                <div
                  key={p.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-foreground"
                >
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt={p.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-blue-500/25 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[9px] font-bold">
                      {p.name ? p.name.substring(0, 1).toUpperCase() : 'U'}
                    </div>
                  )}
                  <span>{p.name || p.email}</span>
                  <button
                    type="button"
                    className="hover:text-destructive text-muted-foreground ml-0.5 cursor-pointer"
                    onClick={() => onRemoveParticipant(p.id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            ) : (
              <span className="text-muted-foreground italic text-xs py-1">No participants</span>
            )}
            <button
              type="button"
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer py-1"
              onClick={() => setShowParticipantPicker(!showParticipantPicker)}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {showParticipantPicker && orgId && (
            <div
              ref={participantPickerRef}
              className="absolute z-50 top-full left-0 mt-1.5 w-80 sm:w-96"
            >
              <MemberPicker
                orgId={orgId}
                assignedUserIds={participantUserIds}
                onAssign={(userId) => onAddParticipant(userId)}
                onRemove={(userId) => onRemoveParticipant(userId)}
                onClose={() => setShowParticipantPicker(false)}
                currentUserId={currentUser?.id}
                title="Add Participants"
                mode="multiple"
              />
            </div>
          )}
        </div>

        {/* Observers */}
        <div
          id="section-observers"
          className="flex items-start gap-3 text-xs pt-3 border-t border-border/50 relative"
        >
          <span className="w-24 text-muted-foreground font-medium shrink-0 pt-1">Observers:</span>
          <div className="flex-1 flex flex-wrap items-center gap-2">
            {card.watchers && card.watchers.length > 0 ? (
              card.watchers.map((w: any) => (
                <div
                  key={w.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-foreground"
                >
                  {w.avatarUrl ? (
                    <img
                      src={w.avatarUrl}
                      alt={w.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-teal-500/25 text-teal-600 dark:text-teal-400 flex items-center justify-center text-[9px] font-bold">
                      {w.name ? w.name.substring(0, 1).toUpperCase() : 'U'}
                    </div>
                  )}
                  <span>{w.name || w.email}</span>
                  <button
                    type="button"
                    className="hover:text-destructive text-muted-foreground ml-0.5 cursor-pointer"
                    onClick={() => onUnwatchCard(w.id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            ) : (
              <span className="text-muted-foreground italic text-xs py-1">No observers</span>
            )}

            {currentUser && (
              <button
                type="button"
                className="text-xs text-teal-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer py-1"
                onClick={() => {
                  if (isCurrentUserWatching) {
                    onUnwatchCard(currentUser.id);
                  } else {
                    onWatchCard(currentUser.id);
                  }
                }}
              >
                {isCurrentUserWatching ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Unwatch
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Watch
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer py-1"
              onClick={() => setShowWatcherPicker(!showWatcherPicker)}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {showWatcherPicker && orgId && (
            <div
              ref={watcherPickerRef}
              className="absolute z-50 top-full left-0 mt-1.5 w-80 sm:w-96"
            >
              <MemberPicker
                orgId={orgId}
                assignedUserIds={watcherUserIds}
                onAssign={(userId) => onWatchCard(userId)}
                onRemove={(userId) => onUnwatchCard(userId)}
                onClose={() => setShowWatcherPicker(false)}
                currentUserId={currentUser?.id}
                title="Add Observers"
                mode="multiple"
                submitLabel="Save"
                isSubmitting={isUpdatingWatchers}
                onSubmit={(selection) => {
                  const prevIds = new Set<string>(card?.watchers?.map((w: any) => w.id) || []);
                  const nextIds = new Set(selection.ids);
                  const add = selection.ids.filter((id) => !prevIds.has(id));
                  const remove = [...prevIds].filter((id) => !nextIds.has(id));
                  setShowWatcherPicker(false);
                  if (add.length === 0 && remove.length === 0) return;
                  const staged = selection.ids.map((id) => {
                    const existing = card?.watchers?.find((w: any) => w.id === id);
                    if (existing) return existing;
                    const m = selection.members.get(id);
                    return {
                      id,
                      name: m?.name ?? 'Team member',
                      email: m?.email ?? '',
                      avatarUrl: m?.avatarUrl ?? null,
                    };
                  });
                  onUpdateWatchers({ add, remove, staged });
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── CARD 4: TAGS ─── */}
      <div
        id="section-tags"
        className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs relative"
      >
        <div className="flex items-center gap-3 text-xs">
          <span className="w-24 text-muted-foreground font-medium shrink-0">Tags:</span>
          <div className="flex-1 flex flex-wrap items-center gap-1.5">
            {card.labels && card.labels.length > 0 ? (
              card.labels.map((lbl: any) => (
                <span
                  key={lbl.id}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold"
                  style={{
                    backgroundColor: `${lbl.color}18`,
                    color: lbl.color,
                    border: `1px solid ${lbl.color}35`,
                  }}
                >
                  <span>{lbl.name}</span>
                  <button
                    type="button"
                    className="hover:opacity-100 opacity-70 ml-0.5 cursor-pointer"
                    onClick={() => onToggleLabel({ labelId: lbl.id, hasLabel: true })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-muted-foreground italic text-xs">No tags</span>
            )}
            <button
              type="button"
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer ml-1"
              onClick={() => setShowLabelPicker(!showLabelPicker)}
            >
              <Plus className="w-3.5 h-3.5" /> Add tag
            </button>
          </div>
        </div>

        {showLabelPicker && (
          <div ref={labelPickerRef} className="absolute z-50 top-full left-0 mt-1.5 w-80">
            <LabelPicker
              boardId={card.boardId}
              cardId={card.id}
              cardLabelIds={cardLabelIds}
              onClose={() => setShowLabelPicker(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
