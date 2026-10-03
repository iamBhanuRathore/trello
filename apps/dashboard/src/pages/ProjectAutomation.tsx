import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  History,
  AlertTriangle,
  FlaskConical,
  Tags,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@boardly/ui/button';
import { Switch } from '@boardly/ui/switch';
import { SearchableSelect } from '@boardly/ui/searchable-select';
import { QueryError } from '../components/common/QueryError';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { RuleEditor } from '../components/automation/RuleEditor';
import { RuleRunsDrawer } from '../components/automation/RuleRunsDrawer';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useAuthStore } from '../store/authStore';
import { getApiErrorMessage } from '../lib/api';
import {
  automationService,
  describeRule,
  newActionId,
  reasonLabel,
  type ProjectAutomationRule,
  type RulePayload,
} from '../lib/automationService';
import { useDialogClose } from '../hooks/useDialogClose';

const LABEL_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length]!;
}

function blankDraft(): RulePayload {
  return {
    name: '',
    isEnabled: true,
    trigger: { event: 'card.moved' },
    condition: { labelNames: [] },
    actions: [],
  };
}

function labelRouterTemplate(): RulePayload {
  return {
    name: 'Label router — front-end',
    isEnabled: true,
    trigger: { event: 'card.labeled' },
    condition: { labelNames: ['front-end'] },
    actions: [{ id: newActionId(), type: 'assign_user', overrideExisting: false }],
  };
}

function testingHandoffTemplate(): RulePayload {
  return {
    name: 'Testing handoff',
    isEnabled: true,
    trigger: { event: 'card.moved', listName: 'Testing' },
    condition: { labelNames: [] },
    actions: [
      {
        id: newActionId(),
        type: 'create_subtask',
        titleTemplate: 'Test: {{parentTitle}}',
        pool: { kind: 'users', userIds: [] },
      },
    ],
  };
}

type EditorState =
  { mode: 'new'; draft: RulePayload } | { mode: 'edit'; rule: ProjectAutomationRule };

export function ProjectAutomation() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const sessionUser = useAuthStore((s) => s.user);
  const orgId = sessionUser?.organizationId;
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [runsRule, setRunsRule] = useState<ProjectAutomationRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectAutomationRule | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const rulesKey = ['projectAutomationRules', projectId];
  const rulesQuery = useQuery({
    queryKey: rulesKey,
    queryFn: () => automationService.listRules(projectId!),
    enabled: !!projectId,
  });
  const contextQuery = useQuery({
    queryKey: ['automationContext', projectId],
    queryFn: () => automationService.getContext(projectId!),
    enabled: !!projectId,
  });

  const invalidateRules = () => queryClient.invalidateQueries({ queryKey: rulesKey });
  const openEditor = (s: EditorState) => {
    setEditor(s);
    requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const saveMutation = useMutation({
    mutationFn: (payload: RulePayload) =>
      editor?.mode === 'edit'
        ? automationService.updateRule(projectId!, editor.rule.id, payload)
        : automationService.createRule(projectId!, payload),
    onSuccess: () => {
      invalidateRules();
      setEditor(null);
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, 'Failed to save rule. Please try again.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => automationService.deleteRule(projectId!, ruleId),
    onSuccess: (_data, ruleId) => {
      invalidateRules();
      setDeleteTarget(null);
      // Don't leave a ghost editor behind when its rule was just deleted.
      setEditor((ed) => (ed?.mode === 'edit' && ed.rule.id === ruleId ? null : ed));
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, 'Failed to delete rule. Please try again.')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, isEnabled }: { ruleId: string; isEnabled: boolean }) =>
      automationService.toggleRule(projectId!, ruleId, isEnabled),
    onSuccess: invalidateRules,
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to update rule. Please try again.'));
      invalidateRules();
    },
  });

  const fixLabelsMutation = useMutation({
    mutationFn: async ({ names, boardIds }: { names: string[]; boardIds: string[] }) => {
      for (const name of names) {
        for (const boardId of boardIds) {
          await automationService.createBoardLabel(boardId, name, colorFor(name)).catch((err) => {
            // 409 (already exists — someone beat us to it) is fine.
            if (err?.response?.status !== 409) throw err;
          });
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automationContext', projectId] }),
    onError: (err) =>
      toast.error(getApiErrorMessage(err, 'Failed to create labels. Please try again.')),
  });

  const forbidden =
    (rulesQuery.error as { response?: { status?: number } } | null)?.response?.status === 403 ||
    (contextQuery.error as { response?: { status?: number } } | null)?.response?.status === 403;

  const editorInitial: RulePayload | null = useMemo(() => {
    if (!editor) return null;
    if (editor.mode === 'new') return editor.draft;
    const r = editor.rule;
    return {
      name: r.name,
      isEnabled: r.isEnabled,
      trigger: r.triggerJson,
      condition: r.conditionJson ?? { labelNames: [] },
      actions: r.actionJson ?? [],
    };
  }, [editor]);

  // Single close path (AGENTS.md §11) — requestClose is idempotent per
  // open session, so X / backdrop / Esc cannot double-close.
  const { handleOpenChange } = useDialogClose({
    isOpen: !!deleteTarget,
    onClose: () => setDeleteTarget(null),
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-16 px-4 sm:px-6 lg:px-8 pt-6">
      <header className="flex flex-col gap-3 justify-between border-b pb-5 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Zap className="h-5 w-5 text-amber-500" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">Project Automation</h1>
            <p className="text-sm text-muted-foreground truncate">
              One configuration point per project — routes cards automatically.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => openEditor({ mode: 'new', draft: labelRouterTemplate() })}
            className="cursor-pointer"
          >
            <Tags className="h-4 w-4 mr-1.5" /> Label router
          </Button>
          <Button
            variant="outline"
            onClick={() => openEditor({ mode: 'new', draft: testingHandoffTemplate() })}
            className="cursor-pointer"
          >
            <ClipboardCheck className="h-4 w-4 mr-1.5" /> Testing handoff
          </Button>
          <Button
            onClick={() => openEditor({ mode: 'new', draft: blankDraft() })}
            className="cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-1.5" /> New rule
          </Button>
        </div>
      </header>

      {forbidden ? (
        <div className="rounded-xl border p-8 text-center space-y-2" role="alert">
          <p className="font-medium">
            Automation management needs the automation.manage permission.
          </p>
          <p className="text-sm text-muted-foreground">Ask a project admin to grant access.</p>
        </div>
      ) : rulesQuery.isLoading ? (
        <div className="space-y-3" aria-label="Loading rules">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : rulesQuery.isError ? (
        <QueryError
          message={getApiErrorMessage(rulesQuery.error, 'Could not load automation rules.')}
          onRetry={() => rulesQuery.refetch()}
        />
      ) : (rulesQuery.data ?? []).length === 0 && !editor ? (
        <div className="rounded-xl border border-dashed p-10 text-center space-y-3">
          <Zap className="h-8 w-8 text-amber-500 mx-auto" aria-hidden />
          <p className="font-medium">No automation rules yet</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Start from a template above — e.g. Testing handoff creates a round-robin tester subtask
            whenever a card enters Testing, on every board.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Automation rules">
          {(rulesQuery.data ?? []).map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              toggling={toggleMutation.isPending}
              onToggle={(isEnabled) => toggleMutation.mutate({ ruleId: rule.id, isEnabled })}
              onEdit={() => openEditor({ mode: 'edit', rule })}
              onHistory={() => setRunsRule(rule)}
              onDelete={() => setDeleteTarget(rule)}
            />
          ))}
        </ul>
      )}

      {editor && editorInitial && (
        <div ref={editorRef} className="scroll-mt-4 space-y-4">
          <h2 className="text-base font-semibold">
            {editor.mode === 'new' ? 'New rule' : `Edit — ${editor.rule.name}`}
          </h2>
          <RuleEditor
            key={editor.mode === 'edit' ? editor.rule.id + editor.rule.updatedAt : 'new'}
            orgId={orgId}
            context={
              contextQuery.data ?? {
                boards: [],
                labels: [],
                roles: [],
                members: { items: [], page: 1, limit: 20, total: 0 },
              }
            }
            initial={editorInitial}
            isSaving={saveMutation.isPending}
            onSave={(payload) => saveMutation.mutate(payload)}
            onCancel={() => setEditor(null)}
            onCreateMissingLabels={(names, boardIds) => {
              // Union board ids across all warned labels for a one-click fix.
              fixLabelsMutation.mutate({ names, boardIds });
            }}
            isFixingLabels={fixLabelsMutation.isPending}
          />
          {editor.mode === 'edit' && <RuleTestPanel projectId={projectId!} rule={editor.rule} />}
        </div>
      )}

      {runsRule && (
        <RuleRunsDrawer projectId={projectId!} rule={runsRule} onClose={() => setRunsRule(null)} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={handleOpenChange}
        title={`Delete “${deleteTarget?.name}”?`}
        description="Run history is kept for the audit log. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

function RuleRow({
  rule,
  toggling,
  onToggle,
  onEdit,
  onHistory,
  onDelete,
}: {
  rule: ProjectAutomationRule;
  toggling: boolean;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`rounded-xl border border-border bg-card p-4 space-y-2 ${rule.isEnabled ? '' : 'opacity-70'}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{rule.name}</p>
            {rule.needsAttention && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px] font-medium shrink-0"
                title={rule.attentionReason ?? 'Needs attention'}
              >
                <AlertTriangle className="h-3 w-3" aria-hidden /> Needs attention
              </span>
            )}
            {!rule.isEnabled && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground shrink-0">
                Off
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{describeRule(rule)}</p>
          <p className="text-xs text-muted-foreground">
            {rule.executionCount} run{rule.executionCount === 1 ? '' : 's'}
            {rule.lastExecutedAt
              ? ` · last ${formatDistanceToNow(new Date(rule.lastExecutedAt), { addSuffix: true })}`
              : ' · never run'}
          </p>
        </div>
        <Switch
          checked={rule.isEnabled}
          onCheckedChange={onToggle}
          disabled={toggling}
          aria-label={`${rule.isEnabled ? 'Disable' : 'Enable'} rule ${rule.name}`}
          className="shrink-0 mt-1"
        />
      </div>
      {rule.needsAttention && rule.attentionReason && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{rule.attentionReason}</p>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button variant="ghost" size="sm" onClick={onEdit} className="cursor-pointer">
          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onHistory} className="cursor-pointer">
          <History className="h-3.5 w-3.5 mr-1" /> History
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="cursor-pointer hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
        </Button>
      </div>
    </li>
  );
}

function RuleTestPanel({ projectId, rule }: { projectId: string; rule: ProjectAutomationRule }) {
  const [boardId, setBoardId] = useState('');
  const [listId, setListId] = useState('');
  const [cardId, setCardId] = useState('');
  const contextQuery = useQuery({
    queryKey: ['automationContext', projectId],
    queryFn: () => automationService.getContext(projectId),
  });
  const boards = contextQuery.data?.boards ?? [];
  const lists = boards.find((b) => b.id === boardId)?.lists ?? [];
  const cardsQuery = useQuery({
    queryKey: ['automationTestCards', listId],
    queryFn: () => automationService.listCards(listId),
    enabled: !!listId,
  });
  const dryRunMutation = useMutation({
    mutationFn: (id: string) => automationService.dryRun(projectId, rule.id, id),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Dry-run failed. Please try again.')),
  });
  useEscapeKey(() => dryRunMutation.reset(), !!dryRunMutation.data);

  const result = dryRunMutation.data;

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4"
      aria-label="Dry-run test"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical className="h-4 w-4" aria-hidden /> Test this rule (dry-run — changes nothing)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <SearchableSelect
          options={boards.map((b) => ({ value: b.id, label: b.name }))}
          value={boardId}
          onChange={(v) => {
            setBoardId(v);
            setListId('');
            setCardId('');
          }}
          placeholder="Board…"
        />
        <SearchableSelect
          options={lists.map((l) => ({ value: l.id, label: l.name }))}
          value={listId}
          onChange={(v) => {
            setListId(v);
            setCardId('');
          }}
          placeholder="List…"
          disabled={!boardId}
        />
        <SearchableSelect
          options={(cardsQuery.data ?? []).map((c) => ({ value: c.id, label: c.title }))}
          value={cardId}
          onChange={setCardId}
          placeholder={cardsQuery.isLoading ? 'Loading cards…' : 'Card…'}
          disabled={!listId}
          isLoadingOptions={cardsQuery.isLoading}
        />
      </div>
      <Button
        variant="outline"
        disabled={!cardId || dryRunMutation.isPending}
        onClick={() => dryRunMutation.mutate(cardId)}
        className="cursor-pointer"
      >
        {dryRunMutation.isPending ? 'Testing…' : 'Run test'}
      </Button>
      {result && (
        <div className="rounded-lg bg-muted/60 p-3 space-y-2 text-sm" role="status">
          <p>
            <strong>{result.fired ? 'Would fire' : 'Would not fire'}</strong>
            {!result.fired && (
              <span className="text-muted-foreground">
                {' '}
                —{' '}
                {result.triggerMatched.length === 0
                  ? 'trigger does not match this card’s list'
                  : 'label condition not met'}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Card “{result.card.title}” in {result.card.listName}
            {result.card.labelNames.length > 0
              ? ` · labeled ${result.card.labelNames.join(', ')}`
              : ''}
          </p>
          <ul className="space-y-1">
            {result.previews.map((p) => (
              <li key={p.actionId} className="text-xs rounded bg-background px-2 py-1.5">
                <span className="font-medium">{p.type}</span> —{' '}
                {p.outcome === 'would_execute' ? p.detail : `${reasonLabel(p.reason)}: ${p.detail}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
