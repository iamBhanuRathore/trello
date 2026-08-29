import { eq, desc, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  organizations,
  plans,
  subscriptions,
  users,
  organizationMembers,
  refreshTokens,
} from '../../db/schema/index';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── listTenants ──────────────────────────────────────────────────────────────
export async function listTenants(db: Database) {
  const allOrgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      plan: {
        id: plans.id,
        name: plans.name,
        tier: plans.tier,
      },
      subscription: {
        status: subscriptions.status,
        seatCount: subscriptions.seatCount,
      },
    })
    .from(organizations)
    .leftJoin(plans, eq(plans.id, organizations.planId))
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
    .orderBy(desc(organizations.createdAt));

  // Also calculate active member counts for each tenant
  const members = await db
    .select({
      organizationId: organizationMembers.organizationId,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(isNull(organizationMembers.deletedAt));

  const orgMemberCountMap = new Map<string, { total: number; active: number; deactivated: number }>();
  for (const m of members) {
    const existing = orgMemberCountMap.get(m.organizationId) || { total: 0, active: 0, deactivated: 0 };
    existing.total += 1;
    if (m.status === 'active') existing.active += 1;
    if (m.status === 'deactivated') existing.deactivated += 1;
    orgMemberCountMap.set(m.organizationId, existing);
  }

  return allOrgs.map((org) => {
    const counts = orgMemberCountMap.get(org.id) || { total: 0, active: 0, deactivated: 0 };
    return {
      ...org,
      memberCounts: counts,
    };
  });
}

// ─── updateTenantDatabase ──────────────────────────────────────────────────
export async function updateTenantDatabase(
  db: Database,
  orgId: string,
  input: { isDedicatedDb: boolean; dedicatedDbUrl?: string | null }
) {
  const [org] = await db
    .update(organizations)
    .set({
      isDedicatedDb: input.isDedicatedDb,
      dedicatedDbUrl: input.isDedicatedDb ? input.dedicatedDbUrl : null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId))
    .returning();

  if (!org) throw httpError(404, 'Organization not found');
  return org;
}

// ─── listPlans ────────────────────────────────────────────────────────────────
export async function listPlans(db: Database) {
  const allPlans = await db.select().from(plans).orderBy(plans.name);
  return allPlans;
}

// ─── updatePlan ───────────────────────────────────────────────────────────────
export async function updatePlan(
  db: Database,
  planId: string,
  input: {
    maxWorkspaces?: number;
    maxBoards?: number;
    maxStorageGb?: number;
    maxSeats?: number;
    featureFlags?: any;
  }
) {
  const [plan] = await db
    .update(plans)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(plans.id, planId))
    .returning();

  if (!plan) throw httpError(404, 'Plan not found');
  return plan;
}

// ─── listPlatformUsers (Cross-Organization User Intelligence) ────────────────
export async function listPlatformUsers(db: Database) {
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      isPlatformAdmin: users.isPlatformAdmin,
      lastLoginAt: users.lastLoginAt,
      deactivatedAt: users.deactivatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt));

  // Fetch all organization memberships
  const memberships = await db
    .select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      status: organizationMembers.status,
      lastActiveAt: organizationMembers.lastActiveAt,
      joinedAt: organizationMembers.createdAt,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(isNull(organizationMembers.deletedAt), isNull(organizations.deletedAt)));

  const userMembershipsMap = new Map<string, any[]>();
  for (const m of memberships) {
    const list = userMembershipsMap.get(m.userId) || [];
    list.push({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationSlug: m.organizationSlug,
      role: m.role,
      status: m.status,
      lastActiveAt: m.lastActiveAt,
      joinedAt: m.joinedAt,
    });
    userMembershipsMap.set(m.userId, list);
  }

  return allUsers.map((u) => {
    const orgs = userMembershipsMap.get(u.id) || [];
    return {
      ...u,
      organizations: orgs,
      organizationsCount: orgs.length,
      isMultiCompany: orgs.length > 1,
    };
  });
}

// ─── getPlatformUser ──────────────────────────────────────────────────────────
export async function getPlatformUser(db: Database, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      isPlatformAdmin: users.isPlatformAdmin,
      timezone: users.timezone,
      lastLoginAt: users.lastLoginAt,
      deactivatedAt: users.deactivatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!user) throw httpError(404, 'User not found');

  const memberships = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: organizationMembers.role,
      status: organizationMembers.status,
      deactivationReason: organizationMembers.deactivationReason,
      lastActiveAt: organizationMembers.lastActiveAt,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), isNull(organizationMembers.deletedAt)));

  return {
    user,
    organizations: memberships,
    totalOrganizations: memberships.length,
  };
}

// ─── forceLogoutPlatformUser ──────────────────────────────────────────────────
export async function forceLogoutPlatformUser(db: Database, userId: string, _actorId?: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

  return { success: true, message: 'All platform sessions for this user have been revoked.' };
}
