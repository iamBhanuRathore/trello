import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  User as UserIcon,
  Users,
  Tag,
  ListPlus,
  X,
  Zap,
  ListFilter,
  Play,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Input } from '@boardly/ui/input';
import { Switch } from '@boardly/ui/switch';
import { SearchableSelect } from '@boardly/ui/searchable-select';
import { AsyncMemberSearchableSelect } from '../ui/AsyncMemberSelect';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  newActionId,
  type AutomationAction,
  type AutomationContext,
  type AutomationEvent,
  type RulePayload,
} from '../../lib/automationService';

export interface RuleEditorProps {
  orgId?: string;
  context: AutomationContext;
  initial: RulePayload;
  isSaving: boolean;
  onSave: (payload: RulePayload) => void;
  onCancel: () => void;
  onCreateMissingLabels: (labelNames: string[], boardIds: string[]) => void;
  isFixingLabels: boolean;
}

const EVENT_OPTIONS = [
  { value: 'card.moved', label: 'Card moved', sublabel: 'Fires when a card changes column' },
  { value: 'card.created', label: 'Card created', sublabel: 'Fires when a card is added' },
  { value: 'card.labeled', label: 'Card labeled', sublabel: 'Fires when a label is attached' },
];

type ActionKind = AutomationAction['type'];

const ACTION_OPTIONS: Array<{ value: ActionKind; label: string; sublabel: string }> = [
  { value: 'assign_user', label: 'Assign user', sublabel: 'Set the card assignee' },
  { value: 'create_subtask', label: 'Create subtask', sublabel: 'Round-robin test handoff' },
  { value: 'add_label', label: 'Add label', sublabel: 'Attach a label by name' },
];

function actionLabel(a: AutomationAction): string {
  if (a.type === 'assign_user') return 'Assign user';
  if (a.type === 'create_subtask') return 'Create subtask';
  return 'Add label';
}

/** Live plain-language summary of the draft (Jira-style). */
function describeDraft(d: RulePayload): string {
  const when =
    d.trigger.event === 'card.moved'
      ? `card moved${d.trigger.listName ? ` to ${d.trigger.listName}` : ''}`
      : d.trigger.event === 'card.created'
        ? 'card created'
        : 'card labeled';
  const labels = d.condition?.labelNames ?? [];
  const ifPart = labels.length > 0 ? `, if labeled ${labels.join(', ')}` : '';
  const thenPart =
    d.actions.length === 0
      ? 'then nothing yet'
      : `then ${d.actions
          .map((a) =>
            a.type === 'assign_user'
              ? 'assign user'
              : a.type === 'create_subtask'
                ? 'create subtask'
                : `add label ${a.labelName || '…'}`
          )
          .join(' → ')}`;
  return `When ${when}${ifPart}, ${thenPart}.`;
}

/** Numbered step shell: badge + connecting rail + content panel. */
function Step({
  n,
  icon,
  title,
  hint,
  badge,
  children,
  last = false,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  hint?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3 sm:gap-4" role="region" aria-label={title}>
      <div className="flex flex-col items-center shrink-0" aria-hidden>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        {!last && <span className="w-px flex-1 min-h-4 bg-border" />}
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 mb-2 min-w-0">
          <span className="text-[11px] font-bold text-muted-foreground">0{n}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider truncate">{title}</h3>
          {badge}
        </div>
        {hint && <p className="text-xs text-muted-foreground mb-2">{hint}</p>}
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  );
}

export function RuleEditor({
  orgId,
  context,
  initial,
  isSaving,
  onSave,
  onCancel,
  onCreateMissingLabels,
  isFixingLabels,
}: RuleEditorProps) {
  const [name, setName] = useState(initial.name);
  const [isEnabled, setIsEnabled] = useState(initial.isEnabled ?? true);
  const [event, setEvent] = useState<AutomationEvent>(initial.trigger.event);
  const [listName, setListName] = useState(initial.trigger.listName ?? '');
  const [labelNames, setLabelNames] = useState<string[]>(initial.condition?.labelNames ?? []);
  const [customLabel, setCustomLabel] = useState('');
  const [actions, setActions] = useState<AutomationAction[]>(initial.actions);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Reset when switching rules.
  useEffect(() => {
    setName(initial.name);
    setIsEnabled(initial.isEnabled ?? true);
    setEvent(initial.trigger.event);
    setListName(initial.trigger.listName ?? '');
    setLabelNames(initial.condition?.labelNames ?? []);
    setActions(initial.actions);
    setCustomLabel('');
  }, [initial]);

  const draft: RulePayload = useMemo(
    () => ({
      name: name.trim(),
      isEnabled,
      trigger: { event, ...(listName ? { listName } : {}) },
      condition: { labelNames },
      actions,
    }),
    [name, isEnabled, event, listName, labelNames, actions]
  );
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(true);
    else onCancel();
  };
  useEscapeKey(requestCancel, true);

  const listNameOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const b of context.boards)
      for (const l of b.lists) seen.set(l.name, (seen.get(l.name) ?? 0) + 1);
    return [...seen.entries()].map(([n, c]) => ({
      value: n,
      label: n,
      sublabel:
        c === context.boards.length ? 'All boards' : `${c} of ${context.boards.length} boards`,
    }));
  }, [context]);

  const coverageByName = useMemo(() => {
    const m = new Map<string, (typeof context.labels)[number]>();
    for (const l of context.labels) m.set(l.name.toLowerCase(), l);
    return m;
  }, [context.labels]);

  // Coverage warnings: every referenced label name mapped to boards missing it.
  const coverageWarnings = useMemo(() => {
    const names = new Set<string>();
    for (const n of labelNames) names.add(n);
    for (const a of actions)
      if (a.type === 'add_label' && a.labelName.trim()) names.add(a.labelName.trim());
    const out: Array<{ name: string; missingBoardIds: string[] }> = [];
    for (const n of names) {
      const hit = coverageByName.get(n.toLowerCase());
      const missing = hit ? hit.missingBoardIds : context.boards.map((b) => b.id);
      if (missing.length > 0) out.push({ name: n, missingBoardIds: missing });
    }
    return out;
  }, [labelNames, actions, coverageByName, context.boards]);

  const updateAction = (id: string, patch: Partial<AutomationAction>) =>
    setActions((prev) =>
      prev.map((a) => (a.id === id ? ({ ...a, ...patch } as AutomationAction) : a))
    );

  const addCustomLabel = () => {
    const v = customLabel.trim();
    if (v && !labelNames.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setLabelNames((p) => (p.length >= 20 ? p : [...p, v]));
    }
    setCustomLabel('');
  };

  const addAction = (kind: ActionKind) => {
    if (actions.length >= 10) return;
    const id = newActionId();
    if (kind === 'assign_user') setActions((p) => [...p, { id, type: 'assign_user' }]);
    else if (kind === 'create_subtask')
      setActions((p) => [
        ...p,
        {
          id,
          type: 'create_subtask',
          titleTemplate: 'Test: {{parentTitle}}',
          pool: { kind: 'users', userIds: [] },
        },
      ]);
    else setActions((p) => [...p, { id, type: 'add_label', labelName: '' }]);
  };

  const moveAction = (id: string, dir: -1 | 1) =>
    setActions((prev) => {
      const i = prev.findIndex((a) => a.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const actionProblems = (a: AutomationAction): string | null => {
    if (a.type === 'assign_user' && !a.userId && !a.roleId) return 'Pick a user or role';
    if (a.type === 'create_subtask') {
      if (a.pool.kind === 'role' && !a.pool.roleId) return 'Pick a role pool';
      if (a.pool.kind === 'users' && a.pool.userIds.length === 0) return 'Add at least one member';
      if (!a.titleTemplate.trim()) return 'Title template is required';
    }
    if (a.type === 'add_label' && !a.labelName.trim()) return 'Label name is required';
    return null;
  };

  const problems = actions.map(actionProblems);
  const canSave =
    name.trim().length > 0 &&
    actions.length > 0 &&
    actions.length <= 10 &&
    problems.every((p) => p === null);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSave || isSaving) return;
    onSave(draft);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-5"
      aria-label="Rule editor"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule name, e.g. Testing handoff"
          maxLength={200}
          className="flex-1 min-w-0"
          aria-label="Rule name"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground shrink-0 min-h-[36px]">
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} aria-label="Rule enabled" />
          Enabled
        </label>
      </div>
      <p
        className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-[13px] text-muted-foreground"
        aria-live="polite"
      >
        {describeDraft(draft)}
      </p>

      <div className="space-y-1">
        <Step
          n={1}
          icon={<Zap className="h-4 w-4" />}
          title="When"
          hint="List names match across every board — “Testing” fires on all of them."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SearchableSelect
              options={EVENT_OPTIONS}
              value={event}
              onChange={(v) => setEvent(v as AutomationEvent)}
              placeholder="Event…"
            />
            <SearchableSelect
              options={listNameOptions}
              value={listName}
              onChange={setListName}
              placeholder="Any list (or pick one)…"
              clearable
              emptyText={
                context.boards.length === 0 ? 'No boards in this project' : 'No matching lists'
              }
            />
          </div>
        </Step>

        <Step
          n={2}
          icon={<ListFilter className="h-4 w-4" />}
          title="If"
          hint="Optional — the card must carry any of these labels."
          badge={
            labelNames.length > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary shrink-0">
                {labelNames.length}
              </span>
            ) : undefined
          }
        >
          {labelNames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {labelNames.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary min-h-[32px]"
                >
                  <Tag className="h-3 w-3" aria-hidden />
                  <span className="truncate max-w-40">{n}</span>
                  <button
                    type="button"
                    onClick={() => setLabelNames((p) => p.filter((x) => x !== n))}
                    className="rounded-full p-1 hover:bg-background cursor-pointer"
                    aria-label={`Remove label condition ${n}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {context.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Existing labels quick pick">
              {context.labels.slice(0, 12).map((l) => {
                const active = labelNames.some((x) => x.toLowerCase() === l.name.toLowerCase());
                return (
                  <button
                    key={l.name}
                    type="button"
                    onClick={() =>
                      setLabelNames((p) =>
                        active
                          ? p.filter((x) => x.toLowerCase() !== l.name.toLowerCase())
                          : p.length >= 20
                            ? p
                            : [...p, l.name]
                      )
                    }
                    aria-pressed={active}
                    className={`rounded-full border px-2.5 py-1 text-[11px] min-h-[32px] cursor-pointer transition-colors ${
                      active
                        ? 'border-primary/50 bg-primary/10 font-medium text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                    }`}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Or type a custom label name…"
              maxLength={100}
              aria-label="Add label condition"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customLabel.trim()) {
                  e.preventDefault();
                  addCustomLabel();
                }
              }}
              className="flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!customLabel.trim()}
              onClick={addCustomLabel}
              className="shrink-0 min-h-[36px] cursor-pointer"
            >
              Add
            </Button>
          </div>
        </Step>

        <Step
          n={3}
          icon={<Play className="h-4 w-4" />}
          title="Then"
          hint="Actions run in order, top to bottom."
          last
          badge={
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground shrink-0">
              {actions.length}/10
            </span>
          }
        >
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
              No actions yet — add one below.
            </p>
          )}
          <ol className="space-y-3">
            {actions.map((a, i) => (
              <li key={a.id} className="rounded-lg border border-border bg-card p-3 space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground w-5 shrink-0">
                    {i + 1}.
                  </span>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">
                    {actionLabel(a)}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveAction(a.id, -1)}
                    disabled={i === 0}
                    className="rounded-md p-2 hover:bg-muted disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    aria-label="Move action up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveAction(a.id, 1)}
                    disabled={i === actions.length - 1}
                    className="rounded-md p-2 hover:bg-muted disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    aria-label="Move action down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActions((p) => p.filter((x) => x.id !== a.id))}
                    className="rounded-md p-2 hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                    aria-label="Remove action"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <ActionFields
                  action={a}
                  context={context}
                  orgId={orgId}
                  onPatch={(patch) => updateAction(a.id, patch)}
                />
                {problems[i] && <p className="text-xs text-destructive">{problems[i]}</p>}
              </li>
            ))}
          </ol>
          <AddActionRow onAdd={addAction} disabled={actions.length >= 10} />
        </Step>
      </div>

      {/* Coverage warnings */}
      {coverageWarnings.length > 0 && (
        <section
          className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2"
          aria-label="Label coverage warnings"
        >
          {coverageWarnings.map((w) => (
            <div key={w.name} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
              <p className="flex items-start gap-2 flex-1 min-w-0">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
                <span>
                  Label <strong>“{w.name}”</strong> is missing on {w.missingBoardIds.length} of{' '}
                  {context.boards.length} board{w.missingBoardIds.length === 1 ? '' : 's'} — rules
                  referencing it silently skip there.
                </span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isFixingLabels}
                onClick={() => onCreateMissingLabels([w.name], w.missingBoardIds)}
                className="shrink-0 cursor-pointer"
              >
                <ListPlus className="h-3.5 w-3.5 mr-1" />
                Create on {w.missingBoardIds.length} board
                {w.missingBoardIds.length === 1 ? '' : 's'}
              </Button>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={requestCancel} className="cursor-pointer">
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave || !dirty || isSaving} className="cursor-pointer">
          {isSaving ? 'Saving…' : 'Save rule'}
        </Button>
      </div>
      {!canSave && (
        <p className="text-xs text-muted-foreground sm:text-right">
          {name.trim().length === 0
            ? 'Give the rule a name.'
            : actions.length === 0
              ? 'Add at least one action.'
              : 'Complete every action above.'}
        </p>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description="Your rule edits will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="warning"
        onConfirm={() => {
          setConfirmDiscard(false);
          onCancel();
        }}
      />
    </form>
  );
}

function AddActionRow({ onAdd, disabled }: { onAdd: (k: ActionKind) => void; disabled: boolean }) {
  const [kind, setKind] = useState<ActionKind>('assign_user');
  const selected = ACTION_OPTIONS.find((o) => o.value === kind);
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Action type">
        {ACTION_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setKind(o.value)}
            aria-pressed={kind === o.value}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium min-h-[36px] cursor-pointer transition-colors border ${
              kind === o.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {selected && <p className="text-xs text-muted-foreground">{selected.sublabel}.</p>}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onAdd(kind)}
        className="w-full sm:w-auto cursor-pointer"
      >
        <Plus className="h-4 w-4 mr-1" /> Add {selected?.label.toLowerCase()}
      </Button>
    </div>
  );
}

function TargetToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 gap-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium min-h-[36px] cursor-pointer transition-colors ${
            value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ActionFields({
  action,
  context,
  orgId,
  onPatch,
}: {
  action: AutomationAction;
  context: AutomationContext;
  orgId?: string;
  onPatch: (patch: Partial<AutomationAction>) => void;
}) {
  if (action.type === 'assign_user') {
    const mode = action.roleId ? 'role' : 'user';
    return (
      <div className="space-y-2.5">
        <TargetToggle
          value={mode}
          onChange={(m) =>
            onPatch(
              m === 'role'
                ? { userId: undefined, roleId: action.roleId ?? '' }
                : { roleId: undefined, userId: action.userId ?? '' }
            )
          }
          options={[
            { value: 'user', label: 'User', icon: <UserIcon className="h-3.5 w-3.5" /> },
            { value: 'role', label: 'Role', icon: <Users className="h-3.5 w-3.5" /> },
          ]}
        />
        {mode === 'user' ? (
          <AsyncMemberSearchableSelect
            orgId={orgId}
            value={action.userId ?? ''}
            onChange={(userId) => onPatch({ userId })}
            allowUnassigned={false}
            placeholder="Pick assignee…"
            pinnedIds={action.userId ? [action.userId] : []}
          />
        ) : (
          <SearchableSelect
            options={context.roles.map((r) => ({
              value: r.id,
              label: r.name,
              sublabel: `${r.memberCount} member${r.memberCount === 1 ? '' : 's'}`,
            }))}
            value={action.roleId ?? ''}
            onChange={(roleId) => onPatch({ roleId })}
            placeholder="Pick role…"
            emptyText={
              context.roles.length === 0 ? 'No roles in this organization' : 'No matching roles'
            }
          />
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground min-h-[36px] cursor-pointer">
          <Switch
            checked={action.overrideExisting ?? false}
            onCheckedChange={(v) => onPatch({ overrideExisting: v })}
            aria-label="Replace current assignee"
          />
          Replace current assignee (default: only assign when unassigned)
        </label>
      </div>
    );
  }

  if (action.type === 'create_subtask') {
    const pool = action.pool;
    const poolMode = pool.kind;
    return (
      <div className="space-y-2.5">
        <Input
          value={action.titleTemplate}
          onChange={(e) => onPatch({ titleTemplate: e.target.value })}
          placeholder="Test: {{parentTitle}}"
          maxLength={500}
          aria-label="Subtask title template"
        />
        <p className="-mt-1 text-xs text-muted-foreground">
          {'{{parentTitle}}'} inserts the parent card title.
        </p>
        <TargetToggle
          value={poolMode}
          onChange={(m) =>
            onPatch(
              m === 'role'
                ? { pool: { kind: 'role', roleId: '' } }
                : { pool: { kind: 'users', userIds: [] } }
            )
          }
          options={[
            { value: 'role', label: 'Role pool', icon: <Users className="h-3.5 w-3.5" /> },
            { value: 'users', label: 'Members', icon: <UserIcon className="h-3.5 w-3.5" /> },
          ]}
        />
        {pool.kind === 'role' ? (
          <SearchableSelect
            options={context.roles.map((r) => ({
              value: r.id,
              label: r.name,
              sublabel: `${r.memberCount} member${r.memberCount === 1 ? '' : 's'} — rotates round-robin`,
            }))}
            value={pool.roleId}
            onChange={(roleId) => onPatch({ pool: { kind: 'role', roleId } })}
            placeholder="Pick rotation pool…"
            emptyText={
              context.roles.length === 0 ? 'No roles in this organization' : 'No matching roles'
            }
          />
        ) : (
          <UserPoolPicker
            orgId={orgId}
            userIds={pool.userIds}
            onChange={(userIds) => onPatch({ pool: { kind: 'users', userIds } })}
          />
        )}
      </div>
    );
  }

  const matchedLabel = context.labels.find(
    (l) => l.name.toLowerCase() === action.labelName.trim().toLowerCase()
  );
  return (
    <div className="space-y-2">
      {context.labels.length > 0 && (
        <SearchableSelect
          options={context.labels.map((l) => ({
            value: l.name,
            label: l.name,
            sublabel:
              l.boardCount === l.totalBoards
                ? 'All boards'
                : `${l.boardCount} of ${l.totalBoards} boards`,
          }))}
          value={matchedLabel?.name ?? ''}
          onChange={(v) => onPatch({ labelName: v })}
          placeholder="Pick an existing label…"
          clearable
        />
      )}
      <Input
        value={action.labelName}
        onChange={(e) => onPatch({ labelName: e.target.value })}
        placeholder={
          context.labels.length > 0 ? 'Or type a custom name…' : 'Label name, e.g. front-end'
        }
        maxLength={100}
        aria-label="Label name"
      />
    </div>
  );
}

function UserPoolPicker({
  orgId,
  userIds,
  onChange,
}: {
  orgId?: string;
  userIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [pick, setPick] = useState('');
  return (
    <div className="space-y-2">
      {userIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {userIds.map((id) => (
            <PoolMemberChip
              key={id}
              orgId={orgId}
              userId={id}
              onRemove={() => onChange(userIds.filter((x) => x !== id))}
            />
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <AsyncMemberSearchableSelect
            orgId={orgId}
            value={pick}
            onChange={setPick}
            allowUnassigned={false}
            placeholder="Pick member to add…"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!pick || userIds.includes(pick)}
          onClick={() => {
            if (pick && !userIds.includes(pick)) onChange([...userIds, pick]);
            setPick('');
          }}
          className="shrink-0 cursor-pointer"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function PoolMemberChip({
  orgId,
  userId,
  onRemove,
}: {
  orgId?: string;
  userId: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted pl-1 pr-2 py-1 text-xs min-h-[36px]">
      <MemberAvatar orgId={orgId} userId={userId} />
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-1 hover:bg-background cursor-pointer"
        aria-label="Remove pool member"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function MemberAvatar({ orgId, userId }: { orgId?: string; userId: string }) {
  const [label, setLabel] = useState(userId.slice(0, 8));
  useEffect(() => {
    let live = true;
    if (!orgId) return;
    import('../../lib/orgService').then(({ orgService }) =>
      orgService
        .getMembers(orgId, { userIds: [userId] })
        .then((rows: Array<{ name?: string; email?: string }>) => {
          if (live && rows[0]) setLabel(rows[0].name || rows[0].email || userId.slice(0, 8));
        })
        .catch(() => {})
    );
    return () => {
      live = false;
    };
  }, [orgId, userId]);
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-medium truncate max-w-32">
      {label}
    </span>
  );
}
