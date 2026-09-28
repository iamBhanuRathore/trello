import { eq, and, isNull, asc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  boards,
  cards,
  projects,
  components,
  cardComponents,
  assignmentRules,
  organizationMembers,
  organizationRoleMembers,
  organizations,
  roles,
} from '../../db/schema/index';
import { httpError } from '../organizations/service';

export interface ComponentScope {
  projectId?: string | null;
  boardId?: string | null;
  componentIds?: string[];
}

// ─── Internal guards ─────────────────────────────────────────────────────────

async function verifyBoardOrg(db: Database, boardId: string, organizationId: string) {
  const [board] = await db
    .select({ id: boards.id, projectId: boards.projectId })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.organizationId, organizationId)))
    .limit(1);
  if (!board) throw httpError(404, 'Board not found or access denied');
  return board;
}

async function requireActiveMember(db: Database, organizationId: string, userId: string) {
  const [m] = await db
    .select({ userId: organizationMembers.userId, status: organizationMembers.status })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
        isNull(organizationMembers.deletedAt)
      )
    )
    .limit(1);
  if (!m || m.status === 'deactivated')
    throw httpError(403, 'User is not an active member of this organization');
  return m;
}

// ─── Components ──────────────────────────────────────────────────────────────

export async function createComponent(
  db: Database,
  organizationId: string,
  boardId: string,
  input: { name: string; description?: string; leadUserId?: string }
) {
  if (!input.name?.trim()) throw httpError(400, 'Component name is required');
  await verifyBoardOrg(db, boardId, organizationId);
  if (input.leadUserId) await requireActiveMember(db, organizationId, input.leadUserId);
  const [component] = await db
    .insert(components)
    .values({
      organizationId,
      boardId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      leadUserId: input.leadUserId || null,
    })
    .returning();
  if (!component) throw httpError(500, 'Failed to create component');
  return component;
}

export async function listComponents(db: Database, organizationId: string, boardId: string) {
  await verifyBoardOrg(db, boardId, organizationId);
  return db
    .select()
    .from(components)
    .where(
      and(
        eq(components.boardId, boardId),
        eq(components.organizationId, organizationId),
        isNull(components.deletedAt)
      )
    )
    .orderBy(asc(components.name));
}

export async function updateComponent(
  db: Database,
  organizationId: string,
  componentId: string,
  input: { name?: string; description?: string | null; leadUserId?: string | null }
) {
  const [existing] = await db
    .select()
    .from(components)
    .where(and(eq(components.id, componentId), eq(components.organizationId, organizationId)))
    .limit(1);
  if (!existing) throw httpError(404, 'Component not found or access denied');
  if (input.leadUserId) await requireActiveMember(db, organizationId, input.leadUserId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw httpError(400, 'Component name is required');
    patch['name'] = input.name.trim();
  }
  if (input.description !== undefined) patch['description'] = input.description?.trim() || null;
  if (input.leadUserId !== undefined) patch['leadUserId'] = input.leadUserId || null;
  const [updated] = await db
    .update(components)
    .set(patch)
    .where(eq(components.id, componentId))
    .returning();
  return updated;
}

export async function deleteComponent(db: Database, organizationId: string, componentId: string) {
  const [existing] = await db
    .select({ id: components.id })
    .from(components)
    .where(and(eq(components.id, componentId), eq(components.organizationId, organizationId)))
    .limit(1);
  if (!existing) throw httpError(404, 'Component not found or access denied');
  await db.delete(cardComponents).where(eq(cardComponents.componentId, componentId));
  await db.delete(assignmentRules).where(eq(assignmentRules.componentId, componentId));
  await db.delete(components).where(eq(components.id, componentId));
  return { success: true };
}

// ─── Card ↔ Component links ──────────────────────────────────────────────────

export async function addComponentToCard(
  db: Database,
  organizationId: string,
  cardId: string,
  componentId: string,
  actorId: string
) {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!card) throw httpError(404, 'Card not found or access denied');
  const [component] = await db
    .select({ id: components.id })
    .from(components)
    .where(and(eq(components.id, componentId), eq(components.organizationId, organizationId)))
    .limit(1);
  if (!component) throw httpError(404, 'Component not found or access denied');
  await db
    .insert(cardComponents)
    .values({ cardId, componentId, addedBy: actorId })
    .onConflictDoNothing();
  return { success: true };
}

export async function removeComponentFromCard(
  db: Database,
  organizationId: string,
  cardId: string,
  componentId: string
) {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!card) throw httpError(404, 'Card not found or access denied');
  await db
    .delete(cardComponents)
    .where(and(eq(cardComponents.cardId, cardId), eq(cardComponents.componentId, componentId)));
  return { success: true };
}

export async function listCardComponents(db: Database, organizationId: string, cardId: string) {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, organizationId)))
    .limit(1);
  if (!card) throw httpError(404, 'Card not found or access denied');
  return db
    .select({ component: components })
    .from(cardComponents)
    .innerJoin(components, eq(components.id, cardComponents.componentId))
    .where(eq(cardComponents.cardId, cardId));
}

// ─── Assignment Rules ────────────────────────────────────────────────────────

export interface RuleScope {
  projectId?: string | null;
  boardId?: string | null;
  componentId?: string | null;
}

export async function setAssignmentRule(
  db: Database,
  organizationId: string,
  scope: RuleScope,
  input: { defaultRoleId?: string | null; defaultUserId?: string | null },
  actorId: string
) {
  if (!input.defaultRoleId && !input.defaultUserId)
    throw httpError(400, 'Provide defaultRoleId or defaultUserId');

  // Every scope object must belong to this org — no cross-org rule planting.
  if (scope.projectId) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, scope.projectId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!p) throw httpError(404, 'Project not found or access denied');
  }
  if (scope.boardId) await verifyBoardOrg(db, scope.boardId, organizationId);
  if (scope.componentId) {
    const [c] = await db
      .select({ id: components.id })
      .from(components)
      .where(
        and(eq(components.id, scope.componentId), eq(components.organizationId, organizationId))
      )
      .limit(1);
    if (!c) throw httpError(404, 'Component not found or access denied');
  }
  if (input.defaultRoleId) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.id, input.defaultRoleId),
          eq(roles.organizationId, organizationId),
          eq(roles.isSystemRole, false)
        )
      )
      .limit(1);
    if (!r) throw httpError(404, 'Team role not found in this organization');
  }
  if (input.defaultUserId) await requireActiveMember(db, organizationId, input.defaultUserId);

  // Upsert by exact scope. The scope match must be NULL-safe: a plain
  // `eq()` on the present columns alone also matches deeper rules (an org rule
  // query would hit a board rule), so repeats of the same call inserted a fresh
  // duplicate every time. `isNull` for absent dimensions + a partial unique
  // index (0030) makes this exact and race-proof.
  const conditions = [
    eq(assignmentRules.organizationId, organizationId),
    scope.projectId
      ? eq(assignmentRules.projectId, scope.projectId)
      : isNull(assignmentRules.projectId),
    scope.boardId ? eq(assignmentRules.boardId, scope.boardId) : isNull(assignmentRules.boardId),
    scope.componentId
      ? eq(assignmentRules.componentId, scope.componentId)
      : isNull(assignmentRules.componentId),
  ];
  const [existing] = await db
    .select()
    .from(assignmentRules)
    .where(and(...conditions))
    .limit(1);
  const values = {
    organizationId,
    projectId: scope.projectId || null,
    boardId: scope.boardId || null,
    componentId: scope.componentId || null,
    defaultRoleId: input.defaultRoleId || null,
    defaultUserId: input.defaultUserId || null,
    updatedBy: actorId,
    updatedAt: new Date(),
  };
  if (existing) {
    const [updated] = await db
      .update(assignmentRules)
      .set(values)
      .where(eq(assignmentRules.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(assignmentRules).values(values).returning();
  return created;
}

export async function listAssignmentRules(db: Database, organizationId: string) {
  return db
    .select()
    .from(assignmentRules)
    .where(
      and(eq(assignmentRules.organizationId, organizationId), isNull(assignmentRules.deletedAt))
    );
}

export async function deleteAssignmentRule(db: Database, organizationId: string, ruleId: string) {
  const [existing] = await db
    .select({ id: assignmentRules.id })
    .from(assignmentRules)
    .where(and(eq(assignmentRules.id, ruleId), eq(assignmentRules.organizationId, organizationId)))
    .limit(1);
  if (!existing) throw httpError(404, 'Assignment rule not found or access denied');
  await db.delete(assignmentRules).where(eq(assignmentRules.id, ruleId));
  return { success: true };
}

// ─── Resolver ────────────────────────────────────────────────────────────────
// Precedence: component rule > component lead > board rule > project rule >
// org rule > org default user > null (caller applies allowUnassigned policy).
// Role targets resolve to the earliest-assigned active holder (static, documented).

export interface ResolvedAssignee {
  userId: string | null;
  source: string;
}

async function resolveRoleHolder(
  db: Database,
  organizationId: string,
  roleId: string
): Promise<string | null> {
  const [holder] = await db
    .select({ userId: organizationRoleMembers.userId })
    .from(organizationRoleMembers)
    .innerJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, organizationRoleMembers.organizationId),
        eq(organizationMembers.userId, organizationRoleMembers.userId),
        isNull(organizationMembers.deletedAt)
      )
    )
    .where(
      and(
        eq(organizationRoleMembers.organizationId, organizationId),
        eq(organizationRoleMembers.roleId, roleId)
      )
    )
    .orderBy(asc(organizationRoleMembers.createdAt))
    .limit(1);
  return holder?.userId ?? null;
}

async function applyRule(
  db: Database,
  organizationId: string,
  rule: typeof assignmentRules.$inferSelect | undefined,
  source: string
): Promise<ResolvedAssignee | null> {
  if (!rule) return null;
  if (rule.defaultUserId) {
    // Re-validate membership at resolve time (user may have left since).
    const [m] = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, rule.defaultUserId),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);
    if (m) return { userId: rule.defaultUserId, source };
    // Stale user target — fall through to role target, then to next level.
  }
  if (rule.defaultRoleId) {
    const holder = await resolveRoleHolder(db, organizationId, rule.defaultRoleId);
    if (holder) return { userId: holder, source: `${source}:role` };
  }
  return null;
}

export async function resolveDefaultAssignee(
  db: Database,
  organizationId: string,
  scope: ComponentScope
): Promise<ResolvedAssignee> {
  const rules = await db
    .select()
    .from(assignmentRules)
    .where(
      and(eq(assignmentRules.organizationId, organizationId), isNull(assignmentRules.deletedAt))
    );

  // 1. Component rule (first matching component wins — card components are ordered by add time client-side).
  for (const componentId of scope.componentIds || []) {
    const hit = await applyRule(
      db,
      organizationId,
      rules.find((r) => r.componentId === componentId),
      'component-rule'
    );
    if (hit) return hit;
    // 2. Component lead fallback.
    const [component] = await db
      .select({ leadUserId: components.leadUserId })
      .from(components)
      .where(and(eq(components.id, componentId), eq(components.organizationId, organizationId)))
      .limit(1);
    if (component?.leadUserId) {
      const [m] = await db
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, component.leadUserId),
            isNull(organizationMembers.deletedAt)
          )
        )
        .limit(1);
      if (m) return { userId: component.leadUserId, source: 'component-lead' };
    }
  }

  // 3. Board rule.
  if (scope.boardId) {
    const hit = await applyRule(
      db,
      organizationId,
      rules.find((r) => r.boardId === scope.boardId && !r.componentId),
      'board-rule'
    );
    if (hit) return hit;
  }

  // 4. Project rule.
  if (scope.projectId) {
    const hit = await applyRule(
      db,
      organizationId,
      rules.find((r) => r.projectId === scope.projectId && !r.boardId && !r.componentId),
      'project-rule'
    );
    if (hit) return hit;
  }

  // 5. Org rule (all scope columns null).
  const orgHit = await applyRule(
    db,
    organizationId,
    rules.find((r) => !r.projectId && !r.boardId && !r.componentId),
    'org-rule'
  );
  if (orgHit) return orgHit;

  // 6. Org static default user.
  const [org] = await db
    .select({
      defaultAssigneeId: organizations.defaultAssigneeId,
      allowUnassigned: organizations.allowUnassigned,
      strategy: organizations.defaultAssigneeStrategy,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (org?.defaultAssigneeId) {
    const [m] = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, org.defaultAssigneeId),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);
    if (m) return { userId: org.defaultAssigneeId, source: 'org-default' };
  }

  return { userId: null, source: 'unassigned' };
}

/** Org assignment policy for the card composer/admin UI. */
export async function getAssignmentPolicy(db: Database, organizationId: string) {
  const [org] = await db
    .select({
      allowUnassigned: organizations.allowUnassigned,
      defaultAssigneeStrategy: organizations.defaultAssigneeStrategy,
      defaultAssigneeId: organizations.defaultAssigneeId,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) throw httpError(404, 'Organization not found');
  return org;
}

export async function updateAssignmentPolicy(
  db: Database,
  organizationId: string,
  input: {
    allowUnassigned?: boolean;
    defaultAssigneeStrategy?: string;
    defaultAssigneeId?: string | null;
  }
) {
  if (
    input.defaultAssigneeStrategy !== undefined &&
    !['lead', 'unassigned'].includes(input.defaultAssigneeStrategy)
  ) {
    throw httpError(400, "defaultAssigneeStrategy must be 'lead' or 'unassigned'");
  }
  if (input.defaultAssigneeId)
    await requireActiveMember(db, organizationId, input.defaultAssigneeId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.allowUnassigned !== undefined) patch['allowUnassigned'] = input.allowUnassigned;
  if (input.defaultAssigneeStrategy !== undefined)
    patch['defaultAssigneeStrategy'] = input.defaultAssigneeStrategy;
  if (input.defaultAssigneeId !== undefined)
    patch['defaultAssigneeId'] = input.defaultAssigneeId || null;
  const [updated] = await db
    .update(organizations)
    .set(patch)
    .where(eq(organizations.id, organizationId))
    .returning();
  return updated;
}
