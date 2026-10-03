import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@boardly/ui/dialog';
import { Plus, Trash, Zap, Briefcase, User as UserIcon, ShieldCheck } from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { SearchableSelect, ListSearchableSelect } from '@boardly/ui/searchable-select';
import { AsyncMemberSearchableSelect } from '../ui/AsyncMemberSelect';
import { useDialogClose } from '../../hooks/useDialogClose';
import { useAuthStore } from '../../store/authStore';
import { permissionReason } from '../../hooks/usePermissions';

interface AutomationsModalProps {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
  lists: Array<{ id: string; name: string; cards?: unknown[] }>;
  /** Current board's project — preselected in the Project Defaults tab (Jira-style). */
  projectId?: string;
  /** Org scope for server-side member search. Falls back to the session user. */
  orgId?: string;
}

type Tab = 'board' | 'project';

const ACTION_OPTIONS = [
  { value: 'assign_user', label: 'Assign user', sublabel: 'Set the card assignee' },
  { value: 'add_label', label: 'Add label', sublabel: 'Attach a board label' },
];

export function AutomationsModal({
  boardId,
  isOpen,
  onClose,
  lists,
  projectId,
  orgId,
}: AutomationsModalProps) {
  const queryClient = useQueryClient();
  const sessionUser = useAuthStore((s) => s.user);
  const effectiveOrgId = orgId || sessionUser?.organizationId;
  const [tab, setTab] = useState<Tab>('board');
  const [isAdding, setIsAdding] = useState(false);

  // Rule builder state
  const [triggerListId, setTriggerListId] = useState('');
  const [actionType, setActionType] = useState('assign_user');
  const [actionValue, setActionValue] = useState('');

  const builderDirty = Boolean(triggerListId || actionValue || isAdding);
  const { requestClose, handleOpenChange } = useDialogClose({
    isOpen,
    onClose,
    // First Esc/backdrop collapses the open builder instead of losing it.
    isDirty: builderDirty,
    onDirtyRequest: () => {
      setIsAdding(false);
      setTriggerListId('');
      setActionValue('');
    },
  });

  const { data: automations = [] } = useQuery({
    queryKey: ['automations', boardId],
    queryFn: async () => (await api.get(`/boards/${boardId}/automations`)).data,
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      await api.post(`/boards/${boardId}/automations`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', boardId] });
      setIsAdding(false);
      setTriggerListId('');
      setActionValue('');
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to save rule. Please try again.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/boards/${boardId}/automations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', boardId] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to delete rule. Please try again.'));
    },
  });

  const listNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lists || []) m.set(l.id, l.name);
    return m;
  }, [lists]);

  const handleCreate = () => {
    if (!triggerListId || !actionValue) return;
    const listName = listNameById.get(triggerListId) || 'a list';
    const actionLabel = actionType === 'add_label' ? 'add label' : 'assign user';
    createMutation.mutate({
      name: `When card moved to ${listName}, then ${actionLabel}`,
      triggerJson: { type: 'card_moved', listId: triggerListId },
      actionJson: {
        type: actionType,
        [actionType === 'add_label' ? 'labelId' : 'userId']: actionValue,
      },
    });
  };

  const ruleDescription = (auto: any) => {
    const listId = auto?.triggerJson?.listId;
    const listName = (listId && listNameById.get(listId)) || 'a list';
    const action = auto?.actionJson?.type === 'add_label' ? 'adds a label' : 'assigns a user';
    return `When a card moves to ${listName}, this rule ${action}.`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl max-h-[90vh] h-[85vh] p-0 flex flex-col overflow-hidden bg-card border border-border rounded-2xl shadow-2xl">
        <DialogHeader className="p-5 sm:px-6 border-b border-border/80 bg-card/90 backdrop-blur-md shrink-0 space-y-1">
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold truncate">
              <Zap className="h-5 w-5 text-amber-500 shrink-0" />
              <span className="truncate">Board Automations &amp; Rules</span>
            </DialogTitle>
            {tab === 'board' && (
              <Button
                size="sm"
                variant={isAdding ? 'outline' : 'default'}
                onClick={() => setIsAdding(!isAdding)}
                className="text-xs gap-1.5 cursor-pointer shrink-0"
              >
                {isAdding ? (
                  'Cancel'
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" /> New Rule
                  </>
                )}
              </Button>
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Butler-style board rules run when cards move between lists. Project defaults auto-assign
            every new card in a project, Jira-style.
          </DialogDescription>
          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Automation scope"
            className="flex items-center gap-1 pt-2"
          >
            <button
              role="tab"
              aria-selected={tab === 'board'}
              type="button"
              onClick={() => setTab('board')}
              className={`flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'board'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Zap className="h-3.5 w-3.5" /> Board Rules
            </button>
            <button
              role="tab"
              aria-selected={tab === 'project'}
              type="button"
              onClick={() => setTab('project')}
              className={`flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'project'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" /> Project Defaults
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {tab === 'board' ? (
            <BoardRulesPanel
              lists={lists}
              automations={automations}
              isAdding={isAdding}
              triggerListId={triggerListId}
              actionType={actionType}
              actionValue={actionValue}
              isSaving={createMutation.isPending}
              orgId={effectiveOrgId}
              currentUser={sessionUser}
              onTriggerChange={setTriggerListId}
              onActionTypeChange={(v) => {
                setActionType(v);
                setActionValue('');
              }}
              onActionValueChange={setActionValue}
              onCancelBuilder={() => {
                setIsAdding(false);
                setTriggerListId('');
                setActionValue('');
              }}
              onSave={handleCreate}
              onDelete={(id) => deleteMutation.mutate(id)}
              describeRule={ruleDescription}
            />
          ) : (
            <ProjectDefaultsPanel
              orgId={effectiveOrgId}
              currentUser={sessionUser}
              initialProjectId={projectId}
            />
          )}
        </div>

        <div className="p-4 sm:px-6 border-t border-border/80 bg-card/90 backdrop-blur-md shrink-0 flex items-center justify-end">
          <Button onClick={requestClose} size="sm" className="px-6 cursor-pointer">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Board rules (Butler-style, event-driven) ─────────────────────────────── */

function BoardRulesPanel(props: {
  lists: Array<{ id: string; name: string; cards?: unknown[] }>;
  automations: any[];
  isAdding: boolean;
  triggerListId: string;
  actionType: string;
  actionValue: string;
  isSaving: boolean;
  orgId?: string;
  currentUser?: any;
  onTriggerChange: (v: string) => void;
  onActionTypeChange: (v: string) => void;
  onActionValueChange: (v: string) => void;
  onCancelBuilder: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  describeRule: (auto: any) => string;
}) {
  const {
    lists,
    automations,
    isAdding,
    triggerListId,
    actionType,
    actionValue,
    isSaving,
    orgId,
    currentUser,
  } = props;
  const canSave = Boolean(triggerListId && actionValue) && !isSaving;

  return (
    <>
      {isAdding && (
        <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <span className="font-bold text-primary shrink-0">WHEN</span>
            <span className="text-muted-foreground shrink-0">a card is moved to</span>
            <div className="flex-1 min-w-0">
              <ListSearchableSelect
                lists={lists}
                value={triggerListId}
                onChange={props.onTriggerChange}
                placeholder="Select list..."
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <span className="font-bold text-primary shrink-0">THEN</span>
            <div className="w-full sm:w-44 shrink-0">
              <SearchableSelect
                options={ACTION_OPTIONS}
                value={actionType}
                onChange={props.onActionTypeChange}
                placeholder="Select action..."
                searchPlaceholder="Search actions..."
              />
            </div>

            <div className="flex-1 min-w-0">
              {actionType === 'add_label' ? (
                <input
                  type="text"
                  placeholder="Enter label name or ID..."
                  className="h-9 w-full rounded-lg border border-input px-3 bg-background text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                  value={actionValue}
                  onChange={(e) => props.onActionValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSave) props.onSave();
                    if (e.key === 'Escape') props.onCancelBuilder();
                  }}
                />
              ) : orgId ? (
                <AsyncMemberSearchableSelect
                  orgId={orgId}
                  currentUser={currentUser}
                  value={actionValue}
                  onChange={props.onActionValueChange}
                  allowUnassigned={false}
                  placeholder="Select user..."
                  pinnedIds={actionValue ? [actionValue] : []}
                />
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Member search is unavailable for this session.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <Button
              size="sm"
              variant="ghost"
              onClick={props.onCancelBuilder}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={props.onSave}
              disabled={!canSave}
              title={canSave ? undefined : permissionReason('board.update')}
              className="text-xs px-4 cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Rule'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Configured Rules
          </h3>
          <span className="text-[11px] text-muted-foreground">{automations.length} active</span>
        </div>

        {automations.length === 0 && !isAdding && (
          <div className="text-center py-12 text-muted-foreground border rounded-2xl border-dashed bg-card/20 space-y-2">
            <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs font-medium">No automations configured yet.</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Automations trigger actions like auto-assigning team members or adding labels when
              cards change lists.
            </p>
          </div>
        )}

        {automations.map((auto: any) => (
          <div
            key={auto.id}
            className="flex justify-between items-center gap-2 p-3.5 border border-border rounded-xl bg-card shadow-xs"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                <Zap className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-foreground block truncate">
                  {auto.name}
                </span>
                <span className="text-[10px] text-muted-foreground block truncate">
                  {props.describeRule(auto)}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete rule ${auto.name}`}
              className="text-muted-foreground hover:text-destructive h-8 w-8 rounded-lg shrink-0 cursor-pointer"
              onClick={() => props.onDelete(auto.id)}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── Project defaults (Jira-style default assignee) ─────────────────────────
 * One mapping per project: new cards created anywhere in the project are
 * auto-assigned to the mapped user (or to the holder of the mapped team
 * role). Backed by PUT/GET/DELETE /v1/components/assignment-rules with a
 * projectId scope — no new backend needed. Resolution precedence on create:
 * component rule > component lead > board rule > project rule > org rule.
 */

interface TreeProject {
  id: string;
  name: string;
  key?: string;
  workspaceId: string;
}

function ProjectDefaultsPanel(props: {
  orgId?: string;
  currentUser?: any;
  initialProjectId?: string;
}) {
  const { orgId, currentUser, initialProjectId } = props;
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || '');
  const [targetKind, setTargetKind] = useState<'user' | 'role'>('user');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const { data: tree = [] } = useQuery({
    queryKey: ['workspaceTree'],
    queryFn: async () => (await api.get('/workspaces/tree')).data,
    staleTime: 30_000,
  });

  const projects: TreeProject[] = useMemo(() => {
    const out: TreeProject[] = [];
    for (const ws of tree || []) {
      for (const p of ws.projects || []) out.push(p);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [tree]);

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        value: p.id,
        label: p.name,
        sublabel: p.key ? `${p.key}` : undefined,
        icon: <Briefcase className="w-3.5 h-3.5 text-primary" />,
        keywords: [p.name, p.key || ''],
      })),
    [projects]
  );

  // Keep the current board's project selected when it arrives late.
  useEffect(() => {
    if (!selectedProjectId && initialProjectId) setSelectedProjectId(initialProjectId);
  }, [selectedProjectId, initialProjectId]);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['assignmentRules'],
    queryFn: async () => (await api.get('/components/assignment-rules')).data,
    staleTime: 30_000,
  });

  const projectRules = useMemo(
    () => (rules || []).filter((r: any) => r.projectId && !r.boardId && !r.componentId),
    [rules]
  );

  const ruleByProject = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of projectRules) m.set(r.projectId, r);
    return m;
  }, [projectRules]);

  const { data: roles = [] } = useQuery({
    queryKey: ['teamRoles'],
    queryFn: async () => (await api.get('/roles')).data,
    staleTime: 5 * 60 * 1000,
  });

  const teamRoles = useMemo(() => (roles || []).filter((r: any) => !r.isSystemRole), [roles]);

  const roleOptions = useMemo(
    () =>
      teamRoles.map((r: any) => ({
        value: r.id,
        label: r.name,
        sublabel: r.description || undefined,
        icon: <ShieldCheck className="w-3.5 h-3.5 text-primary" />,
        keywords: [r.name],
      })),
    [teamRoles]
  );

  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of teamRoles) m.set(r.id, r.name);
    return m;
  }, [teamRoles]);

  const selectedRule = selectedProjectId ? ruleByProject.get(selectedProjectId) : undefined;
  const pendingValue = targetKind === 'user' ? selectedUserId : selectedRoleId;
  const isSameAsSaved =
    selectedRule &&
    ((targetKind === 'user' && selectedRule.defaultUserId === selectedUserId) ||
      (targetKind === 'role' && selectedRule.defaultRoleId === selectedRoleId));
  const canSave = Boolean(selectedProjectId && pendingValue && !isSameAsSaved);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put('/components/assignment-rules', {
        projectId: selectedProjectId,
        ...(targetKind === 'user'
          ? { defaultUserId: selectedUserId }
          : { defaultRoleId: selectedRoleId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignmentRules'] });
      setSelectedUserId('');
      setSelectedRoleId('');
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to save project default. Please try again.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/components/assignment-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignmentRules'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to remove project default. Please try again.'));
    },
  });

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">If project is X, assign Y.</span> Every new
        card created in the selected project is auto-assigned — no board rule needed. A user assigns
        one person directly; a role assigns whoever currently holds that team role (e.g. Developer).
        More specific scopes still win: component → board → project → org.
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-foreground">Project</label>
            {selectedRule && (
              <span className="text-[10px] text-muted-foreground">
                Current default:{' '}
                <span className="font-semibold text-foreground">
                  {selectedRule.defaultUserId
                    ? 'a specific user'
                    : roleNameById.get(selectedRule.defaultRoleId) || 'a team role'}
                </span>
              </span>
            )}
          </div>
          <SearchableSelect
            options={projectOptions}
            value={selectedProjectId}
            onChange={(v) => {
              setSelectedProjectId(v);
              setSelectedUserId('');
              setSelectedRoleId('');
            }}
            placeholder={projects.length ? 'Select project...' : 'Loading projects...'}
            searchPlaceholder="Search projects..."
            emptyText="No matching projects"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-foreground">
              New cards are assigned to
            </label>
            <div
              role="group"
              aria-label="Assignee type"
              className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => setTargetKind('user')}
                aria-pressed={targetKind === 'user'}
                className={`flex items-center gap-1 px-2.5 h-8 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  targetKind === 'user'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <UserIcon className="h-3 w-3" /> User
              </button>
              <button
                type="button"
                onClick={() => setTargetKind('role')}
                aria-pressed={targetKind === 'role'}
                className={`flex items-center gap-1 px-2.5 h-8 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  targetKind === 'role'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShieldCheck className="h-3 w-3" /> Role
              </button>
            </div>
          </div>
          {targetKind === 'user' ? (
            orgId ? (
              <AsyncMemberSearchableSelect
                orgId={orgId}
                currentUser={currentUser}
                value={selectedUserId}
                onChange={setSelectedUserId}
                allowUnassigned={false}
                placeholder="Select user..."
                pinnedIds={selectedUserId ? [selectedUserId] : []}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Member search is unavailable for this session.
              </p>
            )
          ) : (
            <SearchableSelect
              options={roleOptions}
              value={selectedRoleId}
              onChange={setSelectedRoleId}
              placeholder={teamRoles.length ? 'Select team role...' : 'Loading roles...'}
              searchPlaceholder="Search roles..."
              emptyText="No team roles yet — create Lead/Developer/Tester under Admin → Roles"
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            className="text-xs px-4 cursor-pointer"
            title={canSave ? undefined : permissionReason('board.update')}
          >
            {saveMutation.isPending
              ? 'Saving...'
              : selectedRule
                ? 'Update Default'
                : 'Save Default'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Project Defaults
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {projectRules.length} configured
          </span>
        </div>

        {rulesLoading ? (
          <div className="flex flex-col gap-2" aria-label="Loading project defaults">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-14 rounded-xl border border-border/60 bg-card/40 animate-pulse"
              />
            ))}
          </div>
        ) : projectRules.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border rounded-2xl border-dashed bg-card/20 space-y-2">
            <Briefcase className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs font-medium">No project defaults yet.</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Pick a project above and assign a user or role — new cards there will auto-assign on
              creation.
            </p>
          </div>
        ) : (
          projectRules.map((r: any) => {
            const project = projects.find((p) => p.id === r.projectId);
            return (
              <div
                key={r.id}
                className="flex justify-between items-center gap-2 p-3.5 border border-border rounded-xl bg-card shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground block truncate">
                      {project?.name || 'Project'} →{' '}
                      {r.defaultUserId
                        ? 'assigned user'
                        : roleNameById.get(r.defaultRoleId) || 'assigned role'}
                    </span>
                    <span className="text-[10px] text-muted-foreground block truncate">
                      New cards in this project auto-assign on creation
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove project default"
                  className="text-muted-foreground hover:text-destructive h-8 w-8 rounded-lg shrink-0 cursor-pointer"
                  onClick={() => deleteMutation.mutate(r.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
