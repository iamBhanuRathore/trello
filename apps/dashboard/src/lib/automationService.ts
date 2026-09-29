import { api } from './api';

// ─── Types (mirror backend Zod shapes; validated server-side) ───────────────
export type AutomationEvent = 'card.moved' | 'card.created' | 'card.labeled';

export interface AutomationTrigger {
  event: AutomationEvent;
  listName?: string;
}

export interface AutomationCondition {
  labelNames?: string[];
}

export type AutomationAction =
  | {
      id: string;
      type: 'assign_user';
      userId?: string;
      roleId?: string;
      overrideExisting?: boolean;
    }
  | {
      id: string;
      type: 'create_subtask';
      titleTemplate: string;
      pool: { kind: 'role'; roleId: string } | { kind: 'users'; userIds: string[] };
    }
  | { id: string; type: 'add_label'; labelName: string };

export interface ProjectAutomationRule {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  isEnabled: boolean;
  schemaVersion: number;
  triggerJson: AutomationTrigger;
  conditionJson: AutomationCondition;
  actionJson: AutomationAction[];
  needsAttention: boolean;
  attentionReason: string | null;
  lastExecutedAt: string | null;
  executionCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RulePayload {
  name: string;
  isEnabled?: boolean;
  trigger: AutomationTrigger;
  condition?: AutomationCondition;
  actions: AutomationAction[];
}

export interface AutomationContextBoard {
  id: string;
  name: string;
  lists: Array<{ id: string; name: string }>;
}

export interface AutomationContextLabel {
  name: string;
  boardIds: string[];
  boardCount: number;
  totalBoards: number;
  missingBoardIds: string[];
}

export interface AutomationContextRole {
  id: string;
  name: string;
  memberCount: number;
}

export interface AutomationContext {
  boards: AutomationContextBoard[];
  labels: AutomationContextLabel[];
  roles: AutomationContextRole[];
  members: {
    items: Array<{ id: string; name: string; email: string }>;
    page: number;
    limit: number;
    total: number;
  };
}

export interface DryRunPreview {
  actionId: string;
  type: string;
  outcome: 'would_execute' | 'would_skip';
  reason?: string;
  detail: string;
}

export interface DryRunResult {
  fired: boolean;
  triggerMatched: AutomationEvent[];
  conditionMatched: boolean;
  card: {
    id: string;
    title: string;
    listName: string;
    labelNames: string[];
    assigneeIds: string[];
  };
  previews: DryRunPreview[];
}

export type RunStatus = 'executed' | 'skipped' | 'failed';

export interface RuleRun {
  id: string;
  ruleId: string;
  cardId: string | null;
  eventId: string | null;
  status: RunStatus;
  reason: string | null;
  details: {
    event?: string;
    listName?: string;
    results?: Array<{
      actionId: string;
      type: string;
      outcome: string;
      reason?: string;
      detail: string;
    }>;
    [k: string]: unknown;
  };
  createdAt: string;
}

export interface RunsPage {
  items: RuleRun[];
  page: number;
  limit: number;
  total: number;
}

export const newActionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `action-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

const base = (projectId: string) => `/projects/${projectId}/automation-rules`;

export const automationService = {
  listRules: async (projectId: string): Promise<ProjectAutomationRule[]> =>
    (await api.get(base(projectId))).data,

  getRule: async (projectId: string, ruleId: string): Promise<ProjectAutomationRule> =>
    (await api.get(`${base(projectId)}/${ruleId}`)).data,

  createRule: async (projectId: string, payload: RulePayload): Promise<ProjectAutomationRule> =>
    (await api.post(base(projectId), payload)).data,

  updateRule: async (
    projectId: string,
    ruleId: string,
    payload: Partial<RulePayload>
  ): Promise<ProjectAutomationRule> =>
    (await api.put(`${base(projectId)}/${ruleId}`, payload)).data,

  deleteRule: async (projectId: string, ruleId: string): Promise<void> => {
    await api.delete(`${base(projectId)}/${ruleId}`);
  },

  toggleRule: async (
    projectId: string,
    ruleId: string,
    isEnabled: boolean
  ): Promise<ProjectAutomationRule> =>
    (await api.post(`${base(projectId)}/${ruleId}/toggle`, { isEnabled })).data,

  listRuns: async (
    projectId: string,
    ruleId: string,
    opts: { page?: number; limit?: number; status?: string } = {}
  ): Promise<RunsPage> =>
    (
      await api.get(`${base(projectId)}/${ruleId}/runs`, {
        params: {
          page: opts.page ?? 1,
          limit: opts.limit ?? 20,
          ...(opts.status ? { status: opts.status } : {}),
        },
      })
    ).data,

  dryRun: async (projectId: string, ruleId: string, cardId: string): Promise<DryRunResult> =>
    (await api.post(`${base(projectId)}/${ruleId}/test`, { cardId })).data,

  getContext: async (projectId: string): Promise<AutomationContext> =>
    (await api.get(`/projects/${projectId}/automation-context`)).data,

  /** Cards of a list (for picking a dry-run target). */
  listCards: async (listId: string): Promise<Array<{ id: string; title: string }>> =>
    (await api.get('/cards', { params: { listId } })).data,

  /** Auto-fix: create a missing label on a board. */
  createBoardLabel: async (boardId: string, name: string, color: string) =>
    (await api.post(`/boards/${boardId}/labels`, { name, color })).data,
};

/** Human-readable rule summary, e.g. "When card moved to Testing, if labeled front-end, then 2 actions". */
export function describeRule(rule: ProjectAutomationRule): string {
  const t = rule.triggerJson;
  const when =
    t.event === 'card.moved'
      ? `card moved${t.listName ? ` to ${t.listName}` : ''}`
      : t.event === 'card.created'
        ? 'card created'
        : 'card labeled';
  const labels = rule.conditionJson?.labelNames ?? [];
  const ifPart = labels.length > 0 ? `, if labeled ${labels.join(', ')}` : '';
  const n = rule.actionJson?.length ?? 0;
  return `When ${when}${ifPart}, then ${n} action${n === 1 ? '' : 's'}`;
}

const REASON_LABELS: Record<string, string> = {
  CONDITION_UNMET: 'Condition not met',
  TRIGGER_UNMET: 'Trigger not matched',
  OPEN_SUBTASK: 'Subtask already open',
  LOOP_GUARD: 'Loop stopped',
  EMPTY_POOL: 'Pool empty',
  ALREADY_ASSIGNED: 'Already assigned',
  DUPLICATE_EVENT: 'Duplicate event',
  LABEL_NOT_FOUND: 'Label missing',
  ASSIGNEE_NOT_FOUND: 'Assignee missing',
  RULE_DISABLED: 'Rule disabled',
  ERROR: 'Error',
};

export function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return '—';
  return REASON_LABELS[reason] ?? reason;
}
