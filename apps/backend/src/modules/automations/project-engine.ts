import { AsyncLocalStorage } from 'node:async_hooks';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  projectAutomationRules,
  automationRuleCursors,
  automationRuleRuns,
  cards,
  lists,
  boards,
  projects,
  labels,
  cardLabels,
  cardAssignees,
  users,
  roles,
  organizationMembers,
  organizationRoleMembers,
  comments,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { logger } from '../../lib/logger';
import { httpError } from '../organizations/service';
import { attachLabelToCard, assignUserToCard, createCard, isValidUuid } from '../cards/service';
import type { AutomationTrigger, AutomationAction } from '@boardly/shared-types';

// ─── System actor + loop-guard context ──────────────────────────────────────
// Automation writes must not borrow the triggering user's permissions and must
// be visibly automated. Every automation DB mutation emits card events with
// actor `automation:{ruleId}`; those events never retrigger (checked below).
// Two layers because depth handles A→B→A chains and the actor convention
// handles direct self-triggers.
export const AUTOMATION_ACTOR_PREFIX = 'automation:';
export const AUTOMATION_MAX_DEPTH = 3;

export function systemActorForRule(ruleId: string): string {
  return `${AUTOMATION_ACTOR_PREFIX}${ruleId}`;
}

export function isAutomationActor(actorId?: string | null): boolean {
  return !!actorId && actorId.startsWith(AUTOMATION_ACTOR_PREFIX);
}

interface AutomationStore {
  depth: number;
  chain: string[];
}

const automationStore = new AsyncLocalStorage<AutomationStore>();

export function getAutomationStore(): AutomationStore {
  return automationStore.getStore() ?? { depth: 0, chain: [] };
}

export function runWithAutomationContext<T>(ruleId: string, fn: () => Promise<T>): Promise<T> {
  const cur = getAutomationStore();
  return automationStore.run({ depth: cur.depth + 1, chain: [...cur.chain, ruleId] }, fn);
}

// ─── Pure matchers (unit-tested) ────────────────────────────────────────────
export function matchTrigger(
  trigger: AutomationTrigger,
  event: string,
  listName?: string | null
): boolean {
  if (trigger.event !== event) return false;
  // List name makes "Testing" work on every board of the project.
  if (trigger.listName) {
    if (!listName) return false;
    return listName.toLowerCase() === trigger.listName.toLowerCase();
  }
  return true;
}

export function matchCondition(
  condition: { labelNames?: string[] } | undefined | null,
  cardLabelNames: string[]
): boolean {
  const wanted = condition?.labelNames ?? [];
  if (wanted.length === 0) return true;
  const have = new Set(cardLabelNames.map((n) => n.toLowerCase()));
  return wanted.some((w) => have.has(w.toLowerCase()));
}

// ─── Hydration ──────────────────────────────────────────────────────────────
export interface HydratedCard {
  cardId: string;
  organizationId: string;
  boardId: string;
  projectId: string;
  listId: string;
  listName: string;
  title: string;
  parentCardId: string | null;
  isArchived: boolean;
  isDeleted: boolean;
  labelNames: string[];
  assigneeIds: string[];
}

export async function hydrateCard(
  db: Database,
  cardId: string,
  organizationId: string
): Promise<HydratedCard | null> {
  if (!isValidUuid(cardId)) return null;
  const [row] = await db
    .select({
      cardId: cards.id,
      organizationId: cards.organizationId,
      listId: cards.listId,
      listName: lists.name,
      boardId: boards.id,
      projectId: boards.projectId,
      title: cards.title,
      parentCardId: cards.parentCardId,
      isArchived: cards.isArchived,
      deletedAt: cards.deletedAt,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;

  const [labelRows, assigneeRows] = await Promise.all([
    db
      .select({ name: labels.name })
      .from(cardLabels)
      .innerJoin(labels, eq(labels.id, cardLabels.labelId))
      .where(eq(cardLabels.cardId, cardId)),
    db
      .select({ userId: cardAssignees.userId })
      .from(cardAssignees)
      .where(eq(cardAssignees.cardId, cardId)),
  ]);
  return {
    cardId: row.cardId,
    organizationId: row.organizationId,
    boardId: row.boardId,
    projectId: row.projectId,
    listId: row.listId,
    listName: row.listName,
    title: row.title,
    parentCardId: row.parentCardId,
    isArchived: row.isArchived,
    isDeleted: row.deletedAt !== null,
    labelNames: labelRows.map((l) => l.name),
    assigneeIds: assigneeRows.map((a) => a.userId),
  };
}

// ─── Live pool resolution (deactivated members are never picked) ────────────
async function activeOrgMemberIds(db: Database, organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, 'active'),
        isNull(organizationMembers.deletedAt),
        isNull(users.deactivatedAt)
      )
    );
  return new Set(rows.map((r) => r.userId));
}

/** All active holders of a team role, stable order (oldest grant first). */
export async function resolveRolePool(
  db: Database,
  organizationId: string,
  roleId: string
): Promise<string[]> {
  if (!isValidUuid(roleId)) return [];
  const rows = await db
    .select({
      userId: organizationRoleMembers.userId,
      grantedAt: organizationRoleMembers.createdAt,
    })
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
    .innerJoin(users, eq(users.id, organizationRoleMembers.userId))
    .where(
      and(
        eq(organizationRoleMembers.organizationId, organizationId),
        eq(organizationRoleMembers.roleId, roleId),
        isNull(users.deactivatedAt)
      )
    );
  rows.sort(
    (a, b) =>
      (a.grantedAt?.getTime() ?? 0) - (b.grantedAt?.getTime() ?? 0) ||
      (a.userId < b.userId ? -1 : 1)
  );
  return rows.map((r) => r.userId);
}

/** Explicit user pool filtered to live members (preserves configured order). */
export async function resolveExplicitPool(
  db: Database,
  organizationId: string,
  userIds: string[]
): Promise<string[]> {
  const active = await activeOrgMemberIds(db, organizationId);
  return userIds.filter((id) => active.has(id));
}

// ─── Locked round-robin ─────────────────────────────────────────────────────
// INSERT cursor … ON CONFLICT DO NOTHING + SELECT … FOR UPDATE serializes
// pickers: two simultaneous moves can't read the same cursor. Pool is
// re-resolved from live membership each time; empty pool leaves the cursor
// untouched. Wrap-around via modulo so pool shrink/growth can't strand it.
export async function pickRoundRobinMember(
  db: Database,
  ruleId: string,
  actionId: string,
  pool: string[]
): Promise<string | null> {
  if (pool.length === 0) return null;
  return db.transaction(async (tx) => {
    await tx
      .insert(automationRuleCursors)
      .values({ ruleId, actionId, position: 0 })
      .onConflictDoNothing({
        target: [automationRuleCursors.ruleId, automationRuleCursors.actionId],
      });
    const [cursor] = await tx
      .select({ position: automationRuleCursors.position })
      .from(automationRuleCursors)
      .where(
        and(eq(automationRuleCursors.ruleId, ruleId), eq(automationRuleCursors.actionId, actionId))
      )
      .for('update');
    const pos = cursor?.position ?? 0;
    const picked = pool[pos % pool.length]!;
    await tx
      .update(automationRuleCursors)
      .set({ position: pos + 1, lastUserId: picked, updatedAt: new Date() })
      .where(
        and(eq(automationRuleCursors.ruleId, ruleId), eq(automationRuleCursors.actionId, actionId))
      );
    return picked;
  });
}

/** Peek the next member without advancing (dry-run preview). */
export async function peekRoundRobinMember(
  db: Database,
  ruleId: string,
  actionId: string,
  pool: string[]
): Promise<string | null> {
  if (pool.length === 0) return null;
  const [cursor] = await db
    .select({ position: automationRuleCursors.position })
    .from(automationRuleCursors)
    .where(
      and(eq(automationRuleCursors.ruleId, ruleId), eq(automationRuleCursors.actionId, actionId))
    )
    .limit(1);
  return pool[(cursor?.position ?? 0) % pool.length] ?? null;
}

// ─── Action results ─────────────────────────────────────────────────────────
export type ActionResult =
  | { actionId: string; type: string; outcome: 'executed'; detail: string }
  | { actionId: string; type: string; outcome: 'skipped'; reason: string; detail: string };

async function writeRuleHistory(
  db: Database,
  cardId: string,
  dbActor: string | undefined,
  body: string
): Promise<void> {
  if (!dbActor || !isValidUuid(dbActor)) return;
  await db
    .insert(comments)
    .values({ cardId, userId: dbActor, body })
    .catch(() => {});
}

async function getDisplayName(db: Database, userId: string): Promise<string> {
  const [u] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.name || u?.email || 'Someone';
}

async function runAssignAction(
  db: Database,
  rule: { id: string; name: string; createdBy: string | null },
  action: Extract<AutomationAction, { type: 'assign_user' }>,
  card: HydratedCard
): Promise<ActionResult> {
  const base = { actionId: action.id, type: 'assign_user' as const };
  if (card.assigneeIds.length > 0 && !action.overrideExisting) {
    return {
      ...base,
      outcome: 'skipped',
      reason: 'ALREADY_ASSIGNED',
      detail: 'card already assigned',
    };
  }
  let target: string | null = null;
  if (action.userId) {
    const active = await activeOrgMemberIds(db, card.organizationId);
    target = active.has(action.userId) ? action.userId : null;
  } else if (action.roleId) {
    const pool = await resolveRolePool(db, card.organizationId, action.roleId);
    target = pool[0] ?? null;
  }
  if (!target) {
    return {
      ...base,
      outcome: 'skipped',
      reason: 'ASSIGNEE_NOT_FOUND',
      detail: 'no live assignee',
    };
  }
  const eventActor = systemActorForRule(rule.id);
  // Service calls receive the system actor so nested card events carry it and
  // never retrigger (cards/service coerces FK columns to NULL for non-uuid
  // actors; human-readable history is written below with the rule creator).
  await assignUserToCard(db, card.cardId, card.organizationId, target, eventActor);
  const dbActor = rule.createdBy ?? undefined;
  await writeRuleHistory(
    db,
    card.cardId,
    dbActor,
    `🤖 Rule '${rule.name}' assigned **${await getDisplayName(db, target)}**`
  );
  return { ...base, outcome: 'executed', detail: target };
}

async function runSubtaskAction(
  db: Database,
  rule: { id: string; name: string; createdBy: string | null },
  action: Extract<AutomationAction, { type: 'create_subtask' }>,
  card: HydratedCard
): Promise<ActionResult> {
  const base = { actionId: action.id, type: 'create_subtask' as const };
  const pool =
    action.pool.kind === 'role'
      ? await resolveRolePool(db, card.organizationId, action.pool.roleId)
      : await resolveExplicitPool(db, card.organizationId, action.pool.userIds);
  if (pool.length === 0) {
    return {
      ...base,
      outcome: 'skipped',
      reason: 'EMPTY_POOL',
      detail: 'pool has no active members',
    };
  }
  const picked = await pickRoundRobinMember(db, rule.id, action.id, pool);
  if (!picked) {
    return {
      ...base,
      outcome: 'skipped',
      reason: 'EMPTY_POOL',
      detail: 'pool has no active members',
    };
  }
  // Bounce guard (app-level fast path; the partial unique index is the real
  // enforcer — a same-millisecond loser gets 23505 below).
  const [existing] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(
        eq(cards.parentCardId, card.cardId),
        eq(cards.sourceRuleId, rule.id),
        eq(cards.sourceActionId, action.id),
        eq(cards.isArchived, false),
        isNull(cards.deletedAt)
      )
    )
    .limit(1);
  if (existing) {
    return {
      ...base,
      outcome: 'skipped',
      reason: 'OPEN_SUBTASK',
      detail: 'open subtask already exists',
    };
  }
  const title = action.titleTemplate.replaceAll('{{parentTitle}}', card.title);
  // System actor on the way in → nested card.created carries it and never
  // retriggers (FK columns are coerced to NULL for non-uuid actors).
  const eventActor = systemActorForRule(rule.id);
  const dbActor = rule.createdBy && isValidUuid(rule.createdBy) ? rule.createdBy : undefined;
  try {
    const sub = await createCard(db, card.organizationId, {
      listId: card.listId,
      title,
      parentCardId: card.cardId,
      assigneeId: picked,
      actorId: eventActor,
      sourceRuleId: rule.id,
      sourceActionId: action.id,
    });
    await writeRuleHistory(
      db,
      card.cardId,
      dbActor,
      `🤖 Rule '${rule.name}' created subtask **${title}** for **${await getDisplayName(db, picked)}**`
    );
    return { ...base, outcome: 'executed', detail: (sub as { id: string }).id };
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return { ...base, outcome: 'skipped', reason: 'OPEN_SUBTASK', detail: 'race lost (23505)' };
    }
    throw err;
  }
}

async function runAddLabelAction(
  db: Database,
  rule: { id: string; name: string; createdBy: string | null },
  action: Extract<AutomationAction, { type: 'add_label' }>,
  card: HydratedCard
): Promise<ActionResult> {
  const base = { actionId: action.id, type: 'add_label' as const };
  const boardLabels = await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(eq(labels.boardId, card.boardId));
  const match = boardLabels.find((l) => l.name.toLowerCase() === action.labelName.toLowerCase());
  if (!match) {
    return { ...base, outcome: 'skipped', reason: 'LABEL_NOT_FOUND', detail: action.labelName };
  }
  await attachLabelToCard(
    db,
    card.cardId,
    card.organizationId,
    match.id,
    systemActorForRule(rule.id)
  );
  await writeRuleHistory(
    db,
    card.cardId,
    rule.createdBy ?? undefined,
    `🤖 Rule '${rule.name}' added label **${match.name}**`
  );
  return { ...base, outcome: 'executed', detail: match.name };
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string; cause?: { code?: string } })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  if (code === '23505') return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('23505') || msg.includes('duplicate key');
}

// ─── Rule execution ─────────────────────────────────────────────────────────
export interface AutomationEvent {
  event: string;
  payload: { cardId?: string; eventId?: string; [k: string]: unknown };
  actorId: string;
  organizationId: string;
}

export async function executeRuleForCard(
  db: Database,
  rule: {
    id: string;
    name: string;
    organizationId: string;
    projectId: string;
    createdBy: string | null;
    triggerJson: unknown;
    conditionJson: unknown;
    actionJson: unknown;
  },
  card: HydratedCard,
  event: string,
  eventId?: string
): Promise<void> {
  const condition = (rule.conditionJson ?? {}) as { labelNames?: string[] };
  const actions = (rule.actionJson ?? []) as AutomationAction[];

  // Redelivery idempotency: same event → same rule runs once.
  if (eventId) {
    const [seen] = await db
      .select({ id: automationRuleRuns.id })
      .from(automationRuleRuns)
      .where(and(eq(automationRuleRuns.ruleId, rule.id), eq(automationRuleRuns.eventId, eventId)))
      .limit(1);
    if (seen) {
      await recordRun(db, rule, card.cardId, null, 'skipped', 'DUPLICATE_EVENT', {
        event,
        duplicateOf: eventId,
      });
      return;
    }
  }

  if (!matchCondition(condition, card.labelNames)) {
    await recordRun(db, rule, card.cardId, eventId ?? null, 'skipped', 'CONDITION_UNMET', {
      event,
      labelNames: card.labelNames,
      wanted: condition?.labelNames ?? [],
    });
    return;
  }

  const results: ActionResult[] = [];
  let threw = false;
  await runWithAutomationContext(rule.id, async () => {
    for (const action of actions) {
      try {
        if (action.type === 'assign_user')
          results.push(await runAssignAction(db, rule, action, card));
        else if (action.type === 'create_subtask')
          results.push(await runSubtaskAction(db, rule, action, card));
        else if (action.type === 'add_label')
          results.push(await runAddLabelAction(db, rule, action, card));
        else
          results.push({
            actionId: (action as { id: string }).id,
            type: 'unknown',
            outcome: 'skipped',
            reason: 'CONDITION_UNMET',
            detail: 'unknown action type',
          });
      } catch (err) {
        // Nesting rejection (subtask-of-subtask) lands here: the rule run is
        // FAILED, not a crash — other rules still execute.
        threw = true;
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          actionId: action.id,
          type: action.type,
          outcome: 'skipped',
          reason: 'ERROR',
          detail: `failed: ${message}`.slice(0, 500),
        });
        logger.error({ err, ruleId: rule.id, actionId: action.id }, 'Automation action failed');
      }
    }
  });

  const executed = results.filter((r) => r.outcome === 'executed');
  const firstSkip = results.find((r) => r.outcome === 'skipped');
  const status = executed.length > 0 ? 'executed' : threw ? 'failed' : 'skipped';
  try {
    await db.insert(automationRuleRuns).values({
      ruleId: rule.id,
      organizationId: rule.organizationId,
      projectId: rule.projectId,
      cardId: card.cardId,
      eventId: eventId ?? null,
      status,
      reason:
        status === 'executed'
          ? null
          : firstSkip && 'reason' in firstSkip
            ? firstSkip.reason
            : 'CONDITION_UNMET',
      details: { event, listName: card.listName, results },
    });
  } catch (err) {
    // Lost the redelivery race after executing: convert to DUPLICATE_EVENT note.
    if (eventId && isUniqueViolation(err)) {
      await recordRun(db, rule, card.cardId, null, 'skipped', 'DUPLICATE_EVENT', {
        event,
        duplicateOf: eventId,
      });
      return;
    }
    throw err;
  }
  await db
    .update(projectAutomationRules)
    .set({
      lastExecutedAt: new Date(),
      executionCount: sql`${projectAutomationRules.executionCount} + 1`,
    })
    .where(eq(projectAutomationRules.id, rule.id))
    .catch(() => {});
}

async function recordRun(
  db: Database,
  rule: { id: string; organizationId: string; projectId: string },
  cardId: string | null,
  eventId: string | null,
  status: 'executed' | 'skipped' | 'failed',
  reason: string | null,
  details: Record<string, unknown>
): Promise<void> {
  await db
    .insert(automationRuleRuns)
    .values({
      ruleId: rule.id,
      organizationId: rule.organizationId,
      projectId: rule.projectId,
      cardId,
      eventId,
      status,
      reason,
      details,
    })
    .catch(() => {});
  if (status !== 'skipped' || reason === 'LOOP_GUARD') {
    await db
      .update(projectAutomationRules)
      .set({
        lastExecutedAt: new Date(),
        executionCount: sql`${projectAutomationRules.executionCount} + 1`,
      })
      .where(eq(projectAutomationRules.id, rule.id))
      .catch(() => {});
  }
}

// ─── Event entrypoint ───────────────────────────────────────────────────────
const SUPPORTED_EVENTS = new Set(['card.moved', 'card.created', 'card.labeled']);

export async function handleProjectAutomationEvent(
  db: Database,
  msg: AutomationEvent
): Promise<void> {
  const { event, actorId, organizationId } = msg;
  const cardId = msg.payload.cardId;
  if (!SUPPORTED_EVENTS.has(event)) return;
  // System-actor events never retrigger (direct self-trigger layer).
  if (isAutomationActor(actorId)) return;
  if (!cardId || !isValidUuid(cardId)) return;

  const card = await hydrateCard(db, cardId, organizationId).catch(() => null);
  if (!card) return;
  // No automation on trashed cards (bounce-guard index only covers open cards).
  if (card.isArchived || card.isDeleted) return;

  let rules: Array<typeof projectAutomationRules.$inferSelect> = [];
  try {
    rules = await db
      .select()
      .from(projectAutomationRules)
      .where(
        and(
          eq(projectAutomationRules.projectId, card.projectId),
          eq(projectAutomationRules.organizationId, organizationId),
          eq(projectAutomationRules.isEnabled, true),
          isNull(projectAutomationRules.deletedAt)
        )
      );
  } catch (err) {
    logger.error({ err, projectId: card.projectId }, 'Project automation rule lookup failed');
    return;
  }
  if (rules.length === 0) return;

  const store = getAutomationStore();
  const eventId = typeof msg.payload.eventId === 'string' ? msg.payload.eventId : undefined;

  for (const rule of rules) {
    try {
      const trigger = rule.triggerJson as AutomationTrigger;
      if (!matchTrigger(trigger, event, card.listName)) continue; // silent: rule watches another event
      // Loop-guard layer: depth handles chains, chain handles A→B→A.
      if (store.depth >= AUTOMATION_MAX_DEPTH || store.chain.includes(rule.id)) {
        await recordRun(db, rule, card.cardId, null, 'skipped', 'LOOP_GUARD', {
          event,
          depth: store.depth,
          chain: store.chain,
        });
        continue;
      }
      await executeRuleForCard(db, rule, card, event, eventId);
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, 'Project automation rule failed');
      await recordRun(db, rule, card.cardId, null, 'failed', 'ERROR', {
        event,
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    }
  }
}

export function setupProjectAutomationEngine(db: Database) {
  eventBus.on('internal', async (data: unknown) => {
    try {
      const msg = data as AutomationEvent;
      if (!msg || typeof msg.event !== 'string') return;
      await handleProjectAutomationEvent(db, msg);
    } catch (err) {
      logger.error({ err }, 'Error in project automation engine');
    }
  });
}

// ─── Stale-reference flagging ───────────────────────────────────────────────
// Called when a role/user is deleted or deactivated: any enabled rule still
// referencing it announces itself via needs_attention instead of silently dying.
export async function flagStaleRules(
  db: Database,
  organizationId: string,
  kind: 'role' | 'user',
  refId: string
): Promise<number> {
  const rules = await db
    .select({ id: projectAutomationRules.id, actionJson: projectAutomationRules.actionJson })
    .from(projectAutomationRules)
    .where(
      and(
        eq(projectAutomationRules.organizationId, organizationId),
        eq(projectAutomationRules.isEnabled, true),
        isNull(projectAutomationRules.deletedAt)
      )
    );
  let flagged = 0;
  for (const rule of rules) {
    const actions = (rule.actionJson ?? []) as AutomationAction[];
    const hits = actions.some((a) => {
      if (a.type === 'assign_user')
        return kind === 'role' ? a.roleId === refId : a.userId === refId;
      if (a.type === 'create_subtask' && a.pool.kind === 'role' && kind === 'role')
        return a.pool.roleId === refId;
      if (a.type === 'create_subtask' && a.pool.kind === 'users' && kind === 'user')
        return a.pool.userIds.includes(refId);
      return false;
    });
    if (hits) {
      await db
        .update(projectAutomationRules)
        .set({
          needsAttention: true,
          attentionReason: `Referenced ${kind} ${refId} was removed or deactivated`,
          updatedAt: new Date(),
        })
        .where(eq(projectAutomationRules.id, rule.id))
        .catch(() => {});
      flagged++;
    }
  }
  return flagged;
}

export async function getProjectRuleCount(db: Database, projectId: string): Promise<number> {
  const rows = await db
    .select({ id: projectAutomationRules.id })
    .from(projectAutomationRules)
    .where(
      and(eq(projectAutomationRules.projectId, projectId), isNull(projectAutomationRules.deletedAt))
    );
  return rows.length;
}

export { httpError };
export async function assertProjectAccess(
  db: Database,
  projectId: string,
  organizationId: string
): Promise<{ id: string }> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!row) throw httpError(404, 'Project not found or access denied');
  return row;
}

export async function assertRoleInOrg(
  db: Database,
  organizationId: string,
  roleId: string
): Promise<void> {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw httpError(422, `Role ${roleId} does not exist`);
  const inOrg =
    role.organizationId === organizationId || role.organizationId === null || role.isSystemRole;
  if (!inOrg) throw httpError(422, `Role ${roleId} is outside this organization`);
}

export async function assertUserActiveInOrg(
  db: Database,
  organizationId: string,
  userId: string
): Promise<void> {
  const active = await activeOrgMemberIds(db, organizationId);
  if (!active.has(userId))
    throw httpError(422, `User ${userId} is not an active member of this organization`);
}

/** Write-time reference validation: rejects references outside the project's org. */
export async function validateRuleReferences(
  db: Database,
  organizationId: string,
  actions: AutomationAction[]
): Promise<void> {
  const roleIds = new Set<string>();
  const userIds = new Set<string>();
  for (const a of actions) {
    if (a.type === 'assign_user') {
      if (a.roleId) roleIds.add(a.roleId);
      if (a.userId) userIds.add(a.userId);
    } else if (a.type === 'create_subtask' && a.pool.kind === 'role') {
      roleIds.add(a.pool.roleId);
    } else if (a.type === 'create_subtask' && a.pool.kind === 'users') {
      for (const u of a.pool.userIds) userIds.add(u);
    }
  }
  for (const r of roleIds) await assertRoleInOrg(db, organizationId, r);
  // All referenced users must be active members now (fast feedback); pools are
  // still re-resolved from live membership on every fire, so mid-rotation
  // deactivations degrade to skips instead of stale picks.
  for (const u of userIds) await assertUserActiveInOrg(db, organizationId, u);
}
