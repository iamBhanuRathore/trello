import { eq, and, isNull, desc, count, inArray, or } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  projectAutomationRules,
  automationRuleRuns,
  boards,
  lists,
  labels,
  roles,
  users,
  organizationMembers,
  organizationRoleMembers,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';
import {
  CreateProjectAutomationRuleSchema,
  UpdateProjectAutomationRuleSchema,
  type AutomationAction,
  type CreateProjectAutomationRuleInput,
  type UpdateProjectAutomationRuleInput,
} from '@boardly/shared-types';
import {
  assertProjectAccess,
  validateRuleReferences,
  getProjectRuleCount,
  hydrateCard,
  matchTrigger,
  matchCondition,
  resolveRolePool,
  resolveExplicitPool,
  peekRoundRobinMember,
  systemRoleName,
} from './project-engine';
import { isValidUuid } from '../cards/service';

export const MAX_RULES_PER_PROJECT = 50;

function ruleWhere(orgId: string, projectId: string, ruleId: string) {
  return and(
    eq(projectAutomationRules.id, ruleId),
    eq(projectAutomationRules.projectId, projectId),
    eq(projectAutomationRules.organizationId, orgId),
    isNull(projectAutomationRules.deletedAt)
  );
}

export async function listProjectRules(db: Database, orgId: string, projectId: string) {
  await assertProjectAccess(db, projectId, orgId);
  return db
    .select()
    .from(projectAutomationRules)
    .where(
      and(
        eq(projectAutomationRules.projectId, projectId),
        eq(projectAutomationRules.organizationId, orgId),
        isNull(projectAutomationRules.deletedAt)
      )
    )
    .orderBy(desc(projectAutomationRules.createdAt));
}

export async function getProjectRule(
  db: Database,
  orgId: string,
  projectId: string,
  ruleId: string
) {
  await assertProjectAccess(db, projectId, orgId);
  const [rule] = await db
    .select()
    .from(projectAutomationRules)
    .where(ruleWhere(orgId, projectId, ruleId))
    .limit(1);
  if (!rule) throw httpError(404, 'Automation rule not found');
  return rule;
}

export async function createProjectRule(
  db: Database,
  orgId: string,
  projectId: string,
  raw: unknown,
  createdBy: string
) {
  await assertProjectAccess(db, projectId, orgId);
  const input = CreateProjectAutomationRuleSchema.parse(raw) as CreateProjectAutomationRuleInput;
  const existing = await getProjectRuleCount(db, projectId);
  if (existing >= MAX_RULES_PER_PROJECT) throw httpError(422, 'Project rule limit reached (50)');
  await validateRuleReferences(db, orgId, input.actions);
  const [rule] = await db
    .insert(projectAutomationRules)
    .values({
      organizationId: orgId,
      projectId,
      name: input.name,
      isEnabled: input.isEnabled ?? true,
      triggerJson: input.trigger,
      conditionJson: input.condition ?? {},
      actionJson: input.actions,
      createdBy: isValidUuid(createdBy) ? createdBy : undefined,
    })
    .returning();
  return rule;
}

export async function updateProjectRule(
  db: Database,
  orgId: string,
  projectId: string,
  ruleId: string,
  raw: unknown
) {
  await getProjectRule(db, orgId, projectId, ruleId);
  const input = UpdateProjectAutomationRuleSchema.parse(raw) as UpdateProjectAutomationRuleInput;
  if (input.actions) await validateRuleReferences(db, orgId, input.actions);
  const [rule] = await db
    .update(projectAutomationRules)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      ...(input.trigger !== undefined ? { triggerJson: input.trigger } : {}),
      ...(input.condition !== undefined ? { conditionJson: input.condition } : {}),
      ...(input.actions !== undefined
        ? {
            actionJson: input.actions,
            // Re-validated references clear the attention flag.
            needsAttention: false,
            attentionReason: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(ruleWhere(orgId, projectId, ruleId))
    .returning();
  if (!rule) throw httpError(404, 'Automation rule not found');
  return rule;
}

export async function deleteProjectRule(
  db: Database,
  orgId: string,
  projectId: string,
  ruleId: string
) {
  await getProjectRule(db, orgId, projectId, ruleId);
  // Soft delete: run history survives for the audit log.
  await db
    .update(projectAutomationRules)
    .set({ deletedAt: new Date(), isEnabled: false })
    .where(ruleWhere(orgId, projectId, ruleId));
  return { success: true };
}

export async function toggleProjectRule(
  db: Database,
  orgId: string,
  projectId: string,
  ruleId: string,
  isEnabled: boolean
) {
  await getProjectRule(db, orgId, projectId, ruleId);
  const [rule] = await db
    .update(projectAutomationRules)
    .set({ isEnabled, updatedAt: new Date() })
    .where(ruleWhere(orgId, projectId, ruleId))
    .returning();
  return rule;
}

export async function listRuleRuns(
  db: Database,
  orgId: string,
  projectId: string,
  ruleId: string,
  opts: { page?: number; limit?: number; status?: string }
) {
  await getProjectRule(db, orgId, projectId, ruleId);
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const conds = [
    eq(automationRuleRuns.ruleId, ruleId),
    eq(automationRuleRuns.organizationId, orgId),
  ];
  if (opts.status === 'executed' || opts.status === 'skipped' || opts.status === 'failed') {
    conds.push(eq(automationRuleRuns.status, opts.status));
  }
  const where = and(...conds);
  const [countRows, items] = await Promise.all([
    db.select({ total: count() }).from(automationRuleRuns).where(where),
    db
      .select()
      .from(automationRuleRuns)
      .where(where)
      .orderBy(desc(automationRuleRuns.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);
  return { items, page, limit, total: Number(countRows[0]?.total ?? 0) };
}

// ─── Dry-run ────────────────────────────────────────────────────────────────
// Live preview without mutating: trigger/condition evaluation plus per-action
// "would …" previews, including the round-robin peek ("next up @alex").
export interface DryRunPreview {
  actionId: string;
  type: string;
  outcome: 'would_execute' | 'would_skip';
  reason?: string;
  detail: string;
}

export async function dryRunRule(
  db: Database,
  orgId: string,
  projectId: string,
  ruleId: string,
  cardId: string
) {
  const rule = await getProjectRule(db, orgId, projectId, ruleId);
  const trigger = rule.triggerJson as { event: string; listName?: string };
  const condition = (rule.conditionJson ?? {}) as { labelNames?: string[] };
  const actions = (rule.actionJson ?? []) as AutomationAction[];

  const card = await hydrateCard(db, cardId, orgId);
  if (!card) throw httpError(404, 'Card not found or access denied');

  // Dry-run evaluates the rule's own trigger against the card's current list
  // for each supported event so the builder can show per-event firing.
  const triggerMatched = (['card.moved', 'card.created', 'card.labeled'] as const).filter((e) =>
    matchTrigger(
      trigger as { event: 'card.moved' | 'card.created' | 'card.labeled'; listName?: string },
      e,
      card.listName
    )
  );
  const conditionMatched = matchCondition(condition, card.labelNames);
  const previews: DryRunPreview[] = [];
  if (triggerMatched.length > 0 && conditionMatched) {
    for (const action of actions) {
      previews.push(await previewAction(db, rule.id, action, card));
    }
  }
  return {
    fired: triggerMatched.length > 0 && conditionMatched,
    triggerMatched,
    conditionMatched,
    card: {
      id: card.cardId,
      title: card.title,
      listName: card.listName,
      labelNames: card.labelNames,
      assigneeIds: card.assigneeIds,
    },
    previews,
  };
}

async function displayName(db: Database, userId: string): Promise<string> {
  const [u] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.name || u?.email || userId;
}

async function previewAction(
  db: Database,
  ruleId: string,
  action: AutomationAction,
  card: { cardId: string; organizationId: string; boardId: string; assigneeIds: string[] }
): Promise<DryRunPreview> {
  const base = { actionId: action.id, type: action.type };
  if (action.type === 'assign_user') {
    if (card.assigneeIds.length > 0 && !action.overrideExisting) {
      return {
        ...base,
        outcome: 'would_skip',
        reason: 'ALREADY_ASSIGNED',
        detail: 'card already assigned',
      };
    }
    let target: string | null = null;
    if (action.userId) {
      const [m] = await db
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, card.organizationId),
            eq(organizationMembers.userId, action.userId),
            eq(organizationMembers.status, 'active'),
            isNull(organizationMembers.deletedAt)
          )
        )
        .limit(1);
      target = m?.userId ?? null;
    } else if (action.roleId) {
      target = (await resolveRolePool(db, card.organizationId, action.roleId))[0] ?? null;
    }
    if (!target)
      return {
        ...base,
        outcome: 'would_skip',
        reason: 'ASSIGNEE_NOT_FOUND',
        detail: 'no live assignee',
      };
    return {
      ...base,
      outcome: 'would_execute',
      detail: `assign to @${await displayName(db, target)}`,
    };
  }
  if (action.type === 'create_subtask') {
    const pool =
      action.pool.kind === 'role'
        ? await resolveRolePool(db, card.organizationId, action.pool.roleId)
        : await resolveExplicitPool(db, card.organizationId, action.pool.userIds);
    if (pool.length === 0)
      return {
        ...base,
        outcome: 'would_skip',
        reason: 'EMPTY_POOL',
        detail: 'pool has no active members',
      };
    const next = await peekRoundRobinMember(db, ruleId, action.id, pool);
    if (!next)
      return {
        ...base,
        outcome: 'would_skip',
        reason: 'EMPTY_POOL',
        detail: 'pool has no active members',
      };
    return {
      ...base,
      outcome: 'would_execute',
      detail: `create subtask assigned to next in rotation: @${await displayName(db, next)} (approximate — cursor advances on fire)`,
    };
  }
  const boardLabels = await db
    .select({ name: labels.name })
    .from(labels)
    .where(eq(labels.boardId, card.boardId));
  const match = boardLabels.find((l) => l.name.toLowerCase() === action.labelName.toLowerCase());
  if (!match)
    return {
      ...base,
      outcome: 'would_skip',
      reason: 'LABEL_NOT_FOUND',
      detail: `board has no '${action.labelName}' label`,
    };
  return { ...base, outcome: 'would_execute', detail: `add label '${match.name}'` };
}

// ─── Builder context ────────────────────────────────────────────────────────
// One call giving the builder everything: boards→lists, label names with
// per-board coverage (warns "Board B has no front-end label"), roles with
// member counts, paged members. Avoids N+1 from the frontend.
export async function getAutomationContext(
  db: Database,
  orgId: string,
  projectId: string,
  memberPage = 1,
  memberLimit = 20
) {
  await assertProjectAccess(db, projectId, orgId);
  const projectBoards = await db
    .select({ id: boards.id, name: boards.name })
    .from(boards)
    .where(and(eq(boards.projectId, projectId), eq(boards.organizationId, orgId)));
  const boardIds = projectBoards.map((b) => b.id);

  const [scopedLists, scopedLabels, orgRoles] = await Promise.all([
    boardIds.length > 0
      ? db
          .select({ id: lists.id, boardId: lists.boardId, name: lists.name })
          .from(lists)
          .where(inArray(lists.boardId, boardIds))
      : Promise.resolve([] as { id: string; boardId: string; name: string }[]),
    boardIds.length > 0
      ? db
          .select({ id: labels.id, boardId: labels.boardId, name: labels.name })
          .from(labels)
          .where(inArray(labels.boardId, boardIds))
      : Promise.resolve([] as { id: string; boardId: string; name: string }[]),
    db
      .select()
      .from(roles)
      .where(or(eq(roles.organizationId, orgId), eq(roles.isSystemRole, true))),
  ]);

  // Label coverage: name → boards carrying it.
  const coverage = new Map<string, { name: string; boardIds: string[] }>();
  for (const l of scopedLabels) {
    const key = l.name.toLowerCase();
    const entry = coverage.get(key) ?? { name: l.name, boardIds: [] };
    if (!entry.boardIds.includes(l.boardId)) entry.boardIds.push(l.boardId);
    coverage.set(key, entry);
  }
  const labelCoverage = [...coverage.values()].map((c) => ({
    name: c.name,
    boardIds: c.boardIds,
    boardCount: c.boardIds.length,
    totalBoards: boardIds.length,
    missingBoardIds: boardIds.filter((id) => !c.boardIds.includes(id)),
  }));

  // Roles visible to this org (org roles + system roles) with live member counts.
  // Counts cover both systems: team-role grants AND system-role enum holders
  // (Org Owner/Admin/Member/Viewer live on organizationMembers.role).
  const visibleRoles = orgRoles.filter(
    (r) => r.organizationId === orgId || r.organizationId === null || r.isSystemRole
  );
  const counts = new Map<string, number>();
  const [holderRows, sysHolderRows] = await Promise.all([
    db
      .select({ roleId: organizationRoleMembers.roleId, userId: organizationRoleMembers.userId })
      .from(organizationRoleMembers)
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, organizationRoleMembers.organizationId),
          eq(organizationMembers.userId, organizationRoleMembers.userId),
          eq(organizationMembers.status, 'active'),
          isNull(organizationMembers.deletedAt)
        )
      )
      .where(eq(organizationRoleMembers.organizationId, orgId)),
    db
      .select({ memberRole: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.status, 'active'),
          isNull(organizationMembers.deletedAt),
          isNull(users.deactivatedAt)
        )
      ),
  ]);
  for (const h of holderRows) {
    counts.set(h.roleId, (counts.get(h.roleId) ?? 0) + 1);
  }
  const sysTotals = new Map<string, number>();
  for (const s of sysHolderRows) {
    const name = systemRoleName(s.memberRole);
    sysTotals.set(name, (sysTotals.get(name) ?? 0) + 1);
  }
  for (const r of visibleRoles) {
    if (r.isSystemRole || r.organizationId === null) {
      counts.set(r.id, (counts.get(r.id) ?? 0) + (sysTotals.get(r.name) ?? 0));
    }
  }

  const mp = Math.max(1, Number(memberPage) || 1);
  const ml = Math.min(100, Math.max(1, Number(memberLimit) || 20));
  const [memberRows, memberCountRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.status, 'active'),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(ml)
      .offset((mp - 1) * ml),
    db
      .select({ total: count() })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.status, 'active'),
          isNull(organizationMembers.deletedAt)
        )
      ),
  ]);

  return {
    boards: projectBoards.map((b) => ({
      ...b,
      lists: scopedLists.filter((l) => l.boardId === b.id),
    })),
    labels: labelCoverage,
    roles: visibleRoles.map((r) => ({
      id: r.id,
      name: r.name,
      memberCount: counts.get(r.id) ?? 0,
    })),
    members: {
      items: memberRows,
      page: mp,
      limit: ml,
      total: Number(memberCountRows[0]?.total ?? 0),
    },
  };
}
