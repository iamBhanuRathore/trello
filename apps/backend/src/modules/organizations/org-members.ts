import { eq, and, isNull, or, ilike, asc, gte, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  organizations,
  organizationMembers,
  users,
  workspaceMembers,
  workspaces,
  cards,
  cardAssignees,
  timeLogs,
  auditLog,
} from '../../db/schema/index';
import { sendEmail } from '../../lib/email';
import { clampLimit } from '../../lib/pagination';
import { logger } from '../../lib/logger';
import { cachedTTL, bumpUserCache, bumpOrgPermVersion } from '../../lib/cache';
import {
  renderAccountDeactivatedEmail,
  renderAccountReactivatedEmail,
} from '../../lib/emailTemplates';
import { revokeAllUserSessions } from '../auth/service';
import { httpError, ALLOWED_ORG_ROLES } from './org-common';

export interface ListMembersOptions {
  search?: string;
  limit?: number;
  offset?: number;
  role?: string;
  status?: string;
  userIds?: string[];
}

function buildMemberConditions(orgId: string, options: ListMembersOptions = {}): SQL[] {
  const conditions: SQL[] = [
    eq(organizationMembers.organizationId, orgId),
    isNull(organizationMembers.deletedAt),
  ];

  if (options.role) {
    if (options.role === 'admin') {
      conditions.push(
        inArray(organizationMembers.role, ['org_owner', 'org_admin', 'workspace_admin'])
      );
    } else if ((ALLOWED_ORG_ROLES as readonly string[]).includes(options.role)) {
      conditions.push(eq(organizationMembers.role, options.role as any));
    }
  }

  if (options.status && options.status !== 'all') {
    conditions.push(eq(organizationMembers.status, options.status as any));
  }

  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term)) as SQL);
  }

  if (options.userIds && options.userIds.length > 0) {
    conditions.push(inArray(organizationMembers.userId, options.userIds));
  }

  return conditions;
}

// ─── listMembers ──────────────────────────────────────────────────────────────
/** Cache key for member listings. userIds MUST be part of the key: per-id
 * lookups (member chips, pinned selections) otherwise share one entry and
 * every lookup returns whoever cached first. */
export function memberListCacheKey(orgId: string, options: ListMembersOptions = {}): string {
  const userKey =
    options.userIds && options.userIds.length > 0 ? [...options.userIds].sort().join(',') : '';
  return `m:${orgId}:${options.search ?? ''}:${options.role ?? ''}:${options.status ?? ''}:${options.limit ?? ''}:${options.offset ?? ''}:${userKey}`;
}

export async function listMembers(db: Database, orgId: string, options: ListMembersOptions = {}) {
  const { data } = await cachedTTL(memberListCacheKey(orgId, options), 30, () =>
    loadMembers(db, orgId, options)
  );
  return data;
}

async function loadMembers(db: Database, orgId: string, options: ListMembersOptions = {}) {
  const conditions = buildMemberConditions(orgId, options);

  let query = db
    .select({
      id: organizationMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: organizationMembers.role,
      status: organizationMembers.status,
      joinedAt: organizationMembers.createdAt,
      lastLoginAt: users.lastLoginAt,
      lastActiveAt: organizationMembers.lastActiveAt,
      deactivationReason: organizationMembers.deactivationReason,
      deactivatedBy: organizationMembers.deactivatedBy,
      invitedBy: organizationMembers.invitedBy,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(...conditions))
    .orderBy(asc(users.name));

  // Bound the page. This endpoint previously applied `.limit()` only when the
  // caller passed one, so a large org streamed every member row into a single
  // response. The default is deliberately higher than the shared DEFAULT_LIMIT
  // (50): several callers use this endpoint as a member picker scoped by
  // `userIds` with no limit at all, and truncating a picker is worse than
  // returning a larger page. 500 still removes the unbounded case.
  const limit = clampLimit(options.limit, { def: 500, max: 1000 });
  const offset = Math.max(options.offset ?? 0, 0);
  query = query.limit(limit).offset(offset) as any;

  return await query;
}

// ─── countMembers ─────────────────────────────────────────────────────────────
export async function countMembers(
  db: Database,
  orgId: string,
  options: Omit<ListMembersOptions, 'limit' | 'offset'> = {}
): Promise<number> {
  const conditions = buildMemberConditions(orgId, options);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(...conditions));

  return result?.count ?? 0;
}

// ─── updateMemberRole ─────────────────────────────────────────────────────────
export async function updateMemberRole(
  db: Database,
  orgId: string,
  memberId: string,
  role: string,
  actorId?: string
) {
  const [member] = await db
    .update(organizationMembers)
    .set({ role: role as any, updatedAt: new Date() })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .returning();

  if (!member) throw httpError(404, 'Member not found');

  if (actorId) {
    await db.insert(auditLog).values({
      organizationId: orgId,
      actorId,
      action: 'member.role.update',
      target: memberId,
      targetId: member.id,
      metadata: { newRole: role },
    });
  }

  // Role change alters the effective permission set — drop cached profile +
  // bump the org permission epoch so stale allows die immediately (not in 60s).
  await bumpUserCache(member.userId);
  await bumpOrgPermVersion(orgId);

  return member;
}

// ─── deactivateMember (Soft Delete) ───────────────────────────────────────────
export async function deactivateMember(
  db: Database,
  orgId: string,
  memberId: string,
  actorId: string,
  reason?: string
) {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  // Prevent self-deactivation or deactivation of the last owner if critical
  if (member.userId === actorId) {
    throw httpError(400, 'You cannot deactivate your own account.');
  }

  const [updated] = await db
    .update(organizationMembers)
    .set({
      status: 'deactivated',
      deactivationReason: reason || 'Deactivated by administrator',
      deactivatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(organizationMembers.id, memberId))
    .returning();

  // Invalidate any active refresh tokens for this user so current sessions are revoked
  await revokeAllUserSessions(db, member.userId);

  // Write to audit log
  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'member.deactivate',
    target: member.userId,
    targetId: member.id,
    metadata: { reason: reason || 'No reason provided' },
  });

  // Asynchronously dispatch deactivation notice email (fire-and-forget)
  (async () => {
    try {
      const [targetUser] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, member.userId))
        .limit(1);

      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      let adminName = 'An administrator';
      if (actorId) {
        const [actor] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, actorId))
          .limit(1);
        if (actor?.name) adminName = actor.name;
      }

      if (targetUser?.email) {
        const orgName = org?.name || 'Boardly';
        const emailContent = renderAccountDeactivatedEmail({
          toName: targetUser.name,
          toEmail: targetUser.email,
          orgName,
          adminName,
          reason,
        });

        await sendEmail({
          to: targetUser.email,
          toName: targetUser.name,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Deactivation email notification failed silently');
    }
  })();

  // Flag project automation rules that pool this user (needs_attention).
  const { flagStaleRules } = await import('../automations/project-engine');
  await flagStaleRules(db, orgId, 'user', member.userId).catch(() => {});

  await bumpUserCache(member.userId);
  await bumpOrgPermVersion(orgId);

  return updated;
}

// ─── reactivateMember ─────────────────────────────────────────────────────────
export async function reactivateMember(
  db: Database,
  orgId: string,
  memberId: string,
  actorId: string
) {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  const [updated] = await db
    .update(organizationMembers)
    .set({
      status: 'active',
      deactivationReason: null,
      deactivatedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(organizationMembers.id, memberId))
    .returning();

  // Write to audit log
  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'member.reactivate',
    target: member.userId,
    targetId: member.id,
  });

  await bumpUserCache(member.userId);
  await bumpOrgPermVersion(orgId);

  // Asynchronously dispatch reactivation notice email (fire-and-forget)
  (async () => {
    try {
      const [targetUser] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, member.userId))
        .limit(1);

      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      let adminName = 'An administrator';
      if (actorId) {
        const [actor] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, actorId))
          .limit(1);
        if (actor?.name) adminName = actor.name;
      }

      if (targetUser?.email) {
        const orgName = org?.name || 'Boardly';
        const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
        const loginUrl = `${appUrl}/sign-in`;

        const emailContent = renderAccountReactivatedEmail({
          toName: targetUser.name,
          toEmail: targetUser.email,
          orgName,
          adminName,
          loginUrl,
        });

        await sendEmail({
          to: targetUser.email,
          toName: targetUser.name,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Reactivation email notification failed silently');
    }
  })();

  return updated;
}

// ─── forceLogoutUser ──────────────────────────────────────────────────────────
export async function forceLogoutUser(
  db: Database,
  orgId: string,
  memberId: string,
  actorId: string
) {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  // Invalidate all refresh tokens for this user
  await revokeAllUserSessions(db, member.userId);

  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'user.force_logout',
    target: member.userId,
    targetId: member.id,
    metadata: { memberId },
  });

  return { success: true, message: 'All active sessions for user have been terminated.' };
}

// ─── getMemberActivitySummary ─────────────────────────────────────────────────
export async function getMemberActivitySummary(db: Database, orgId: string, memberId: string) {
  const [member] = await db
    .select({
      id: organizationMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: organizationMembers.role,
      status: organizationMembers.status,
      lastLoginAt: users.lastLoginAt,
      lastActiveAt: organizationMembers.lastActiveAt,
      deactivationReason: organizationMembers.deactivationReason,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  // 1. Workspace memberships within this org
  const userWorkspaces = await db
    .select({
      workspaceId: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, member.userId),
        eq(workspaces.organizationId, orgId),
        isNull(workspaces.deletedAt)
      )
    );

  // 2. Assigned cards count
  const assignedCards = await db
    .select({
      cardId: cards.id,
      isArchived: cards.isArchived,
    })
    .from(cardAssignees)
    .innerJoin(cards, eq(cards.id, cardAssignees.cardId))
    .where(
      and(
        eq(cardAssignees.userId, member.userId),
        eq(cards.organizationId, orgId),
        isNull(cards.deletedAt)
      )
    );

  const totalCards = assignedCards.length;
  const activeCards = assignedCards.filter((c) => !c.isArchived).length;
  const archivedCards = assignedCards.filter((c) => c.isArchived).length;

  // 3. Time logged in past 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]!;

  const logs = await db
    .select({
      minutes: timeLogs.minutes,
      isBillable: timeLogs.isBillable,
    })
    .from(timeLogs)
    .innerJoin(cards, eq(cards.id, timeLogs.cardId))
    .where(
      and(
        eq(timeLogs.userId, member.userId),
        eq(cards.organizationId, orgId),
        gte(timeLogs.loggedDate, thirtyDaysAgoStr)
      )
    );

  const totalMinutes = logs.reduce((acc, l) => acc + (l.minutes || 0), 0);
  const billableMinutes = logs
    .filter((l) => l.isBillable)
    .reduce((acc, l) => acc + (l.minutes || 0), 0);

  return {
    member,
    workspaces: userWorkspaces,
    stats: {
      totalCardsAssigned: totalCards,
      activeCardsCount: activeCards,
      archivedCardsCount: archivedCards,
      timeLogged30dHours: Number((totalMinutes / 60).toFixed(1)),
      billableTime30dHours: Number((billableMinutes / 60).toFixed(1)),
    },
  };
}

// ─── removeMember (Soft Delete) ───────────────────────────────────────────────
export async function removeMember(
  db: Database,
  orgId: string,
  memberId: string,
  actorId?: string
) {
  const [member] = await db
    .update(organizationMembers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        or(eq(organizationMembers.id, memberId), eq(organizationMembers.userId, memberId)),
        eq(organizationMembers.organizationId, orgId)
      )
    )
    .returning();

  if (!member) throw httpError(404, 'Member not found');

  if (actorId) {
    await db.insert(auditLog).values({
      organizationId: orgId,
      actorId,
      action: 'member.remove',
      target: member.userId,
      targetId: member.id,
    });
  }

  await bumpUserCache(member.userId);
  await bumpOrgPermVersion(orgId);

  return member;
}
