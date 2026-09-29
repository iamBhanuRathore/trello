import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/index';
import {
  organizations,
  users,
  organizationMembers,
  workspaces,
  projects,
  boards,
  lists,
  cards,
  labels,
  cardLabels,
  cardAssignees,
  comments,
  roles,
  organizationRoleMembers,
  projectAutomationRules,
  automationRuleCursors,
  automationRuleRuns,
} from '../../db/schema/index';
import {
  handleProjectAutomationEvent,
  matchTrigger,
  matchCondition,
  pickRoundRobinMember,
  resolveRolePool,
  runWithAutomationContext,
  systemActorForRule,
  flagStaleRules,
} from './project-engine';
import { createProjectRule } from './project-service';
import { formatErrorResponse } from '../../lib/errors';

let n = 0;
const uniq = (p: string) => `${p}-${Date.now()}-${n++}`;

interface Fixture {
  orgId: string;
  projectId: string;
  boardId: string;
  testingId: string;
  backlogId: string;
  cardId: string;
  qa: string[];
  roleId: string;
  labelId: string;
}

async function setupFixture(): Promise<Fixture> {
  const [org] = await db
    .insert(organizations)
    .values({ name: 'PA Org', slug: uniq('pa-org') })
    .returning();
  const qa: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [u] = await db
      .insert(users)
      .values({ email: uniq(`qa${i}`) + '@x.test', name: `QA ${i}` })
      .returning();
    qa.push(u!.id);
    await db.insert(organizationMembers).values({
      organizationId: org!.id,
      userId: u!.id,
      role: 'member',
      status: 'active',
    });
  }
  const [ws] = await db
    .insert(workspaces)
    .values({ organizationId: org!.id, name: 'PA WS' })
    .returning();
  const [proj] = await db
    .insert(projects)
    .values({ organizationId: org!.id, workspaceId: ws!.id, name: 'PA Proj' })
    .returning();
  const [board] = await db
    .insert(boards)
    .values({ organizationId: org!.id, projectId: proj!.id, name: 'PA Board' })
    .returning();
  const [backlog] = await db
    .insert(lists)
    .values({ boardId: board!.id, name: 'Backlog', position: 1 })
    .returning();
  const [testing] = await db
    .insert(lists)
    .values({ boardId: board!.id, name: 'Testing', position: 2 })
    .returning();
  const [card] = await db
    .insert(cards)
    .values({ organizationId: org!.id, listId: backlog!.id, title: 'Feature X', position: 1 })
    .returning();
  const [role] = await db
    .insert(roles)
    .values({ organizationId: org!.id, name: 'QA Lead' })
    .returning();
  for (const userId of qa) {
    await db.insert(organizationRoleMembers).values({
      organizationId: org!.id,
      roleId: role!.id,
      userId,
    });
  }
  const [label] = await db
    .insert(labels)
    .values({ boardId: board!.id, name: 'front-end', color: '#ff0000' })
    .returning();
  return {
    orgId: org!.id,
    projectId: proj!.id,
    boardId: board!.id,
    testingId: testing!.id,
    backlogId: backlog!.id,
    cardId: card!.id,
    qa,
    roleId: role!.id,
    labelId: label!.id,
  };
}

async function teardownFixture(f: Fixture) {
  const { orgId } = f;
  // Scope sub-resource deletes to this fixture's cards — never wipe shared tables.
  const ownCards = await db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.organizationId, orgId))
    .catch(() => []);
  const ownCardIds = ownCards.map((c) => c.id);
  if (ownCardIds.length > 0) {
    await db
      .delete(comments)
      .where(inArray(comments.cardId, ownCardIds))
      .catch(() => {});
    await db
      .delete(cardAssignees)
      .where(inArray(cardAssignees.cardId, ownCardIds))
      .catch(() => {});
    await db
      .delete(cardLabels)
      .where(inArray(cardLabels.cardId, ownCardIds))
      .catch(() => {});
  }
  await db
    .delete(automationRuleRuns)
    .where(eq(automationRuleRuns.organizationId, orgId))
    .catch(() => {});
  const ruleRows = await db
    .select({ id: projectAutomationRules.id })
    .from(projectAutomationRules)
    .where(eq(projectAutomationRules.organizationId, orgId));
  for (const r of ruleRows) {
    await db
      .delete(automationRuleCursors)
      .where(eq(automationRuleCursors.ruleId, r.id))
      .catch(() => {});
  }
  await db
    .delete(comments)
    .where(inArray(comments.cardId, ownCardIds))
    .catch(() => {});
  await db
    .delete(cardAssignees)
    .where(inArray(cardAssignees.cardId, ownCardIds))
    .catch(() => {});
  await db
    .delete(cardLabels)
    .where(inArray(cardLabels.cardId, ownCardIds))
    .catch(() => {});
  await db
    .delete(cards)
    .where(eq(cards.organizationId, orgId))
    .catch(() => {});
  await db
    .delete(organizationRoleMembers)
    .where(eq(organizationRoleMembers.organizationId, orgId))
    .catch(() => {});
  await db
    .delete(roles)
    .where(eq(roles.organizationId, orgId))
    .catch(() => {});
  await db
    .delete(projectAutomationRules)
    .where(eq(projectAutomationRules.organizationId, orgId))
    .catch(() => {});
  const projRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.organizationId, orgId));
  for (const p of projRows) {
    const bRows = await db.select({ id: boards.id }).from(boards).where(eq(boards.projectId, p.id));
    for (const b of bRows) {
      await db
        .delete(labels)
        .where(eq(labels.boardId, b.id))
        .catch(() => {});
      await db
        .delete(lists)
        .where(eq(lists.boardId, b.id))
        .catch(() => {});
      await db
        .delete(boards)
        .where(eq(boards.id, b.id))
        .catch(() => {});
    }
    await db
      .delete(projects)
      .where(eq(projects.id, p.id))
      .catch(() => {});
  }
  await db
    .delete(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId))
    .catch(() => {});
  const wsRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.organizationId, orgId));
  for (const w of wsRows)
    await db
      .delete(workspaces)
      .where(eq(workspaces.id, w.id))
      .catch(() => {});
  const memEmails = await db
    .select({ id: users.id })
    .from(users)
    .limit(0)
    .catch(() => []);
  void memEmails;
  for (const userId of f.qa)
    await db
      .delete(users)
      .where(eq(users.id, userId))
      .catch(() => {});
  await db
    .delete(organizations)
    .where(eq(organizations.id, orgId))
    .catch(() => {});
}

async function makeRule(
  f: Fixture,
  overrides: { trigger?: unknown; condition?: unknown; actions?: unknown[]; name?: string } = {}
) {
  const [rule] = await db
    .insert(projectAutomationRules)
    .values({
      organizationId: f.orgId,
      projectId: f.projectId,
      name: overrides.name ?? 'Test rule',
      triggerJson: overrides.trigger ?? { event: 'card.moved', listName: 'Testing' },
      conditionJson: overrides.condition ?? {},
      actionJson: overrides.actions ?? [
        {
          id: randomUUID(),
          type: 'create_subtask',
          titleTemplate: 'Test: {{parentTitle}}',
          pool: { kind: 'users', userIds: f.qa },
        },
      ],
      createdBy: f.qa[0]!,
    })
    .returning();
  return rule!;
}

async function runsFor(ruleId: string) {
  return db.select().from(automationRuleRuns).where(eq(automationRuleRuns.ruleId, ruleId));
}

describe('Project Automation Engine', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await setupFixture();
  });

  afterEach(async () => {
    await teardownFixture(f);
  });

  it('matchTrigger: event + case-insensitive list name', () => {
    expect(
      matchTrigger({ event: 'card.moved', listName: 'Testing' }, 'card.moved', 'testing')
    ).toBe(true);
    expect(matchTrigger({ event: 'card.moved', listName: 'Testing' }, 'card.moved', 'Done')).toBe(
      false
    );
    expect(
      matchTrigger({ event: 'card.moved', listName: 'Testing' }, 'card.created', 'Testing')
    ).toBe(false);
    expect(matchTrigger({ event: 'card.created' }, 'card.created', 'Anything')).toBe(true);
  });

  it('matchCondition: label names case-insensitive, empty passes', () => {
    expect(matchCondition({ labelNames: ['Front-End'] }, ['front-end'])).toBe(true);
    expect(matchCondition({ labelNames: ['back-end'] }, ['front-end'])).toBe(false);
    expect(matchCondition({ labelNames: [] }, [])).toBe(true);
    expect(matchCondition({}, ['x'])).toBe(true);
  });

  it('label router assigns on card.labeled; fill-if-unassigned wins second time', async () => {
    const rule = await makeRule(f, {
      trigger: { event: 'card.labeled' },
      condition: { labelNames: ['front-end'] },
      actions: [{ id: randomUUID(), type: 'assign_user', userId: f.qa[0]! }],
    });
    await db.insert(cardLabels).values({ cardId: f.cardId, labelId: f.labelId });
    const e1 = randomUUID();
    await handleProjectAutomationEvent(db, {
      event: 'card.labeled',
      payload: { cardId: f.cardId, eventId: e1 },
      actorId: 'some-user',
      organizationId: f.orgId,
    });
    const assignees = await db
      .select()
      .from(cardAssignees)
      .where(eq(cardAssignees.cardId, f.cardId));
    expect(assignees.map((a) => a.userId)).toEqual([f.qa[0]!]);
    // Second label event: already assigned → ALREADY_ASSIGNED, assignee unchanged.
    await db
      .insert(cardLabels)
      .values({ cardId: f.cardId, labelId: f.labelId })
      .onConflictDoNothing();
    await handleProjectAutomationEvent(db, {
      event: 'card.labeled',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'some-user',
      organizationId: f.orgId,
    });
    const assignees2 = await db
      .select()
      .from(cardAssignees)
      .where(eq(cardAssignees.cardId, f.cardId));
    expect(assignees2.map((a) => a.userId)).toEqual([f.qa[0]!]);
    const runs = await runsFor(rule.id);
    expect(runs.some((r) => r.status === 'executed')).toBe(true);
    expect(runs.some((r) => r.reason === 'ALREADY_ASSIGNED')).toBe(true);
    // 🤖 history line visible.
    const history = await db.select().from(comments).where(eq(comments.cardId, f.cardId));
    expect(history.some((c) => c.body.includes(`Rule '${rule.name}'`))).toBe(true);
  });

  it('Testing handoff round-robins across the pool in order', async () => {
    const rule = await makeRule(f);
    await db.update(cards).set({ listId: f.testingId }).where(eq(cards.id, f.cardId));
    for (let i = 0; i < 3; i++) {
      await handleProjectAutomationEvent(db, {
        event: 'card.moved',
        payload: { cardId: f.cardId, eventId: randomUUID() },
        actorId: 'some-user',
        organizationId: f.orgId,
      });
      // Consume the bounce guard between rotations: archive prior subtask.
      if (i < 2) {
        await db
          .update(cards)
          .set({ isArchived: true })
          .where(and(eq(cards.parentCardId, f.cardId), eq(cards.isArchived, false)));
      }
    }
    const subs = await db
      .select({ assignee: cardAssignees.userId, title: cards.title })
      .from(cards)
      .leftJoin(cardAssignees, eq(cardAssignees.cardId, cards.id))
      .where(eq(cards.parentCardId, f.cardId));
    expect(subs.map((s) => s.assignee)).toEqual(f.qa);
    expect(subs.every((s) => s.title.startsWith('Test: '))).toBe(true);
    const [cursor] = await db
      .select()
      .from(automationRuleCursors)
      .where(eq(automationRuleCursors.ruleId, rule.id));
    expect(cursor?.position).toBe(3);
  });

  it('parallel moves create exactly one subtask (bounce guard)', async () => {
    const rule = await makeRule(f);
    await db.update(cards).set({ listId: f.testingId }).where(eq(cards.id, f.cardId));
    await Promise.all([
      handleProjectAutomationEvent(db, {
        event: 'card.moved',
        payload: { cardId: f.cardId, eventId: randomUUID() },
        actorId: 'u1',
        organizationId: f.orgId,
      }),
      handleProjectAutomationEvent(db, {
        event: 'card.moved',
        payload: { cardId: f.cardId, eventId: randomUUID() },
        actorId: 'u2',
        organizationId: f.orgId,
      }),
    ]);
    const subs = await db.select().from(cards).where(eq(cards.parentCardId, f.cardId));
    expect(subs.length).toBe(1);
    const runs = await runsFor(rule.id);
    expect(runs.some((r) => r.status === 'executed')).toBe(true);
    expect(runs.some((r) => r.reason === 'OPEN_SUBTASK')).toBe(true);
  });

  it('deactivation mid-rotation skips the member; empty pool leaves cursor alone', async () => {
    const rule = await makeRule(f);
    await db.update(cards).set({ listId: f.testingId }).where(eq(cards.id, f.cardId));
    // Rotation 1 → qa[0]; archive so the guard doesn't block.
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'u',
      organizationId: f.orgId,
    });
    await db.update(cards).set({ isArchived: true }).where(eq(cards.parentCardId, f.cardId));
    // Deactivate qa[1] mid-rotation.
    await db
      .update(organizationMembers)
      .set({ status: 'deactivated' })
      .where(
        and(
          eq(organizationMembers.organizationId, f.orgId),
          eq(organizationMembers.userId, f.qa[1]!)
        )
      );
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'u',
      organizationId: f.orgId,
    });
    const subs = await db
      .select({ assignee: cardAssignees.userId })
      .from(cards)
      .leftJoin(cardAssignees, eq(cardAssignees.cardId, cards.id))
      .where(and(eq(cards.parentCardId, f.cardId), eq(cards.isArchived, false)));
    // Live pool is [qa0, qa2]; cursor was 1 → pool[1 % 2] = qa[2].
    expect(subs.map((s) => s.assignee)).toEqual([f.qa[2]!]);
    expect((await runsFor(rule.id)).filter((r) => r.status === 'executed').length).toBe(2);

    // Empty pool: bypass write-time validation with a direct insert.
    const ghost = randomUUID();
    const emptyRule = await makeRule(f, {
      name: 'empty',
      actions: [
        { id: randomUUID(), type: 'create_subtask', pool: { kind: 'users', userIds: [ghost] } },
      ],
    });
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'u',
      organizationId: f.orgId,
    });
    const emptyRuns = await runsFor(emptyRule.id);
    expect(emptyRuns.some((r) => r.reason === 'EMPTY_POOL')).toBe(true);
    const emptyCursor = await db
      .select()
      .from(automationRuleCursors)
      .where(eq(automationRuleCursors.ruleId, emptyRule.id));
    expect(emptyCursor.length).toBe(0);
  });

  it('role pool resolves live holders; removed cursor user does not break rotation', async () => {
    const holders = await resolveRolePool(db, f.orgId, f.roleId);
    expect(new Set(holders)).toEqual(new Set(f.qa));
    const rule = await makeRule(f, {
      actions: [
        { id: randomUUID(), type: 'create_subtask', pool: { kind: 'role', roleId: f.roleId } },
      ],
    });
    const actionId = ((rule.actionJson as unknown[])[0] as { id: string }).id;
    // Simulate a cursor pointing at a removed user: position arithmetic only.
    const first = await pickRoundRobinMember(db, rule.id, actionId, f.qa);
    expect(first).not.toBeNull();
    expect(f.qa).toContain(first!);
    // Remove the picked user from the pool; rotation continues over survivors.
    const survivors = f.qa.filter((u) => u !== first);
    const second = await pickRoundRobinMember(db, rule.id, actionId, survivors);
    expect(second).not.toBeNull();
    expect(survivors).toContain(second!);
  });

  it('system roles resolve enum holders (Member role finds org members)', async () => {
    // System roles live on organizationMembers.role, never in the grants table.
    // Reuse the seeded role when present (unique partial index on the name).
    let sysRole = (await db.select().from(roles).where(eq(roles.name, 'Member')).limit(1))[0];
    let owned = false;
    if (!sysRole) {
      [sysRole] = await db
        .insert(roles)
        .values({ organizationId: null, name: 'Member', isSystemRole: true })
        .returning();
      owned = true;
    }
    const holders = await resolveRolePool(db, f.orgId, sysRole!.id);
    // Fixture members carry the member enum tier → all three resolve.
    expect(new Set(holders)).toEqual(new Set(f.qa));
    if (owned)
      await db
        .delete(roles)
        .where(eq(roles.id, sysRole!.id))
        .catch(() => {});
  });

  it('system-actor events never retrigger; depth overflow records LOOP_GUARD', async () => {
    const rule = await makeRule(f, {
      trigger: { event: 'card.moved' },
      actions: [{ id: randomUUID(), type: 'add_label', labelName: 'front-end' }],
    });
    await handleProjectAutomationEvent(db, {
      event: 'card.created',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: systemActorForRule(rule.id),
      organizationId: f.orgId,
    });
    expect(await runsFor(rule.id)).toEqual([]);
    // Force depth overflow.
    await runWithAutomationContext('other-rule', () =>
      runWithAutomationContext('third', () =>
        runWithAutomationContext('fourth', () =>
          handleProjectAutomationEvent(db, {
            event: 'card.moved',
            payload: { cardId: f.cardId, eventId: randomUUID() },
            actorId: 'human',
            organizationId: f.orgId,
          })
        )
      )
    );
    const runs = await runsFor(rule.id);
    expect(runs.some((r) => r.reason === 'LOOP_GUARD')).toBe(true);
  });

  it('redelivery of the same event records DUPLICATE_EVENT once', async () => {
    const rule = await makeRule(f, {
      trigger: { event: 'card.created' },
      actions: [{ id: randomUUID(), type: 'add_label', labelName: 'front-end' }],
    });
    const eventId = randomUUID();
    const msg = {
      event: 'card.created',
      payload: { cardId: f.cardId, eventId },
      actorId: 'human',
      organizationId: f.orgId,
    };
    await handleProjectAutomationEvent(db, msg);
    await handleProjectAutomationEvent(db, msg);
    const runs = await runsFor(rule.id);
    expect(runs.filter((r) => r.status === 'executed').length).toBe(1);
    expect(runs.some((r) => r.reason === 'DUPLICATE_EVENT')).toBe(true);
  });

  it('subtask-of-subtask nesting rejects to a FAILED run, not a crash', async () => {
    // Parent P with child S; rule fires create_subtask on S (itself a subtask).
    const [sub] = await db
      .insert(cards)
      .values({
        organizationId: f.orgId,
        listId: f.testingId,
        parentCardId: f.cardId,
        title: 'Child',
        position: 1,
      })
      .returning();
    const rule = await makeRule(f, {
      trigger: { event: 'card.moved', listName: 'Testing' },
    });
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: sub!.id, eventId: randomUUID() },
      actorId: 'human',
      organizationId: f.orgId,
    });
    const runs = await runsFor(rule.id);
    expect(runs.some((r) => r.status === 'failed')).toBe(true);
  });

  it('flagStaleRules marks rules referencing a deleted role', async () => {
    const rule = await makeRule(f, {
      actions: [
        { id: randomUUID(), type: 'create_subtask', pool: { kind: 'role', roleId: f.roleId } },
      ],
    });
    const flagged = await flagStaleRules(db, f.orgId, 'role', f.roleId);
    expect(flagged).toBe(1);
    const [row] = await db
      .select()
      .from(projectAutomationRules)
      .where(eq(projectAutomationRules.id, rule.id));
    expect(row?.needsAttention).toBe(true);
  });

  it('condition unmet records a skip with reason', async () => {
    const rule = await makeRule(f, {
      trigger: { event: 'card.moved', listName: 'Testing' },
      condition: { labelNames: ['back-end'] },
    });
    await db.update(cards).set({ listId: f.testingId }).where(eq(cards.id, f.cardId));
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'human',
      organizationId: f.orgId,
    });
    const runs = await runsFor(rule.id);
    expect(runs.length).toBe(1);
    expect(runs[0]?.reason).toBe('CONDITION_UNMET');
    const subs = await db.select().from(cards).where(eq(cards.parentCardId, f.cardId));
    expect(subs.length).toBe(0);
  });

  it('disabled rules stay silent', async () => {
    const rule = await makeRule(f);
    await db
      .update(projectAutomationRules)
      .set({ isEnabled: false })
      .where(eq(projectAutomationRules.id, rule.id));
    await db.update(cards).set({ listId: f.testingId }).where(eq(cards.id, f.cardId));
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'human',
      organizationId: f.orgId,
    });
    expect(await runsFor(rule.id)).toEqual([]);
    expect(isNull).toBeDefined();
  });

  it('automation-created subtasks never retrigger other rules (actor propagation)', async () => {
    await makeRule(f); // Rule A: moved→Testing, creates RR subtask.
    const ruleB = await makeRule(f, {
      name: 'creator watcher',
      trigger: { event: 'card.created' },
      actions: [
        { id: randomUUID(), type: 'assign_user', userId: f.qa[2]!, overrideExisting: true },
      ],
    });
    await db.update(cards).set({ listId: f.testingId }).where(eq(cards.id, f.cardId));
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'human',
      organizationId: f.orgId,
    });
    const subs = await db.select().from(cards).where(eq(cards.parentCardId, f.cardId));
    expect(subs.length).toBe(1);
    // Rule B must not have fired on the automation-created subtask.
    expect(await runsFor(ruleB.id)).toEqual([]);
  });

  it('archived cards do not trigger rules', async () => {
    const rule = await makeRule(f);
    await db
      .update(cards)
      .set({ listId: f.testingId, isArchived: true })
      .where(eq(cards.id, f.cardId));
    await handleProjectAutomationEvent(db, {
      event: 'card.moved',
      payload: { cardId: f.cardId, eventId: randomUUID() },
      actorId: 'human',
      organizationId: f.orgId,
    });
    expect(await runsFor(rule.id)).toEqual([]);
  });

  it('invalid rule bodies fail validation with 422, not 500', async () => {
    const err = await createProjectRule(
      db,
      f.orgId,
      f.projectId,
      { name: 'bad', trigger: { event: 'nope' }, actions: [] },
      f.qa[0]!
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).not.toBeNull();
    expect(formatErrorResponse(err).status).toBe(422);
  });
});
