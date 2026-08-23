import { eq, and, isNull, or, ilike, asc, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { organizations, organizationMembers, users, workspaceMembers } from '../../db/schema/index';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── getOrg ───────────────────────────────────────────────────────────────────
export async function getOrg(db: Database, orgId: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1);

  if (!org) throw httpError(404, 'Organization not found');

  // Fetch plan if it exists
  let plan = null;
  if (org.planId) {
    const { plans } = await import('../../db/schema/index');
    const [p] = await db.select().from(plans).where(eq(plans.id, org.planId)).limit(1);
    plan = p || null;
  }

  return { ...org, plan };
}

// ─── updateOrg ────────────────────────────────────────────────────────────────
export async function updateOrg(
  db: Database,
  orgId: string,
  input: { name?: string; logoUrl?: string | null; primaryColor?: string | null }
) {
  const [org] = await db
    .update(organizations)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .returning();

  if (!org) throw httpError(404, 'Organization not found');
  return org;
}

export interface ListMembersOptions {
  search?: string;
  limit?: number;
  offset?: number;
  role?: string;
}

// ─── listMembers ──────────────────────────────────────────────────────────────
export async function listMembers(
  db: Database,
  orgId: string,
  options: { search?: string; limit?: number; offset?: number; role?: string } = {}
) {
  const conditions: SQL[] = [
    eq(organizationMembers.organizationId, orgId),
    isNull(organizationMembers.deletedAt),
  ];

  if (options.role) {
    conditions.push(eq(organizationMembers.role, options.role as any));
  }

  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term)) as SQL);
  }

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
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(...conditions))
    .orderBy(asc(users.name));

  if (options.limit) {
    query = query.limit(options.limit) as any;
  }
  if (options.offset) {
    query = query.offset(options.offset) as any;
  }

  return await query;
}

// ─── inviteMember ─────────────────────────────────────────────────────────────
export async function inviteMember(
  db: Database,
  orgId: string,
  email: string,
  role: string,
  _invitedBy: string,
  name?: string,
  workspaceIds?: string[]
) {
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  // If user does not exist, auto-provision user account
  if (!user) {
    const defaultPasswordHash = await Bun.password.hash('Password123!', { algorithm: 'bcrypt', cost: 10 });
    const fallbackName = email.split('@')[0] || 'User';
    const [newUser] = await db
      .insert(users)
      .values({
        name: (name?.trim() || fallbackName) as string,
        email: email.toLowerCase().trim(),
        passwordHash: defaultPasswordHash,
      })
      .returning();
    user = newUser;
  }

  if (!user) throw httpError(500, 'Failed to provision user');

  // Check if already in org
  const [existing] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, user.id)))
    .limit(1);

  if (existing && !existing.deletedAt) {
    throw httpError(409, 'User is already a member of this organization');
  }

  if (existing && existing.deletedAt) {
    const [restored] = await db
      .update(organizationMembers)
      .set({ role: role as any, status: 'active', deletedAt: null, updatedAt: new Date() })
      .where(eq(organizationMembers.id, existing.id))
      .returning();
    if (!restored) throw httpError(500, 'Failed to restore member');
    return restored;
  }

  const [newMember] = await db
    .insert(organizationMembers)
    .values({
      organizationId: orgId,
      userId: user.id,
      role: role as any,
      status: 'active',
    })
    .returning();

  if (!newMember) throw httpError(500, 'Failed to insert member');

  // Assign initial workspaces if provided
  if (workspaceIds && workspaceIds.length > 0) {
    for (const wsId of workspaceIds) {
      await db
        .insert(workspaceMembers)
        .values({
          workspaceId: wsId,
          userId: user.id,
          role: 'member',
        })
        .onConflictDoNothing();
    }
  }

  return {
    ...newMember,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  };
}

// ─── updateMemberRole ─────────────────────────────────────────────────────────
export async function updateMemberRole(db: Database, orgId: string, memberId: string, role: string) {
  const [member] = await db
    .update(organizationMembers)
    .set({ role: role as any, updatedAt: new Date() })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .returning();

  if (!member) throw httpError(404, 'Member not found');
  return member;
}

// ─── removeMember ─────────────────────────────────────────────────────────────
export async function removeMember(db: Database, orgId: string, memberId: string) {
  const [member] = await db
    .update(organizationMembers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .returning();

  if (!member) throw httpError(404, 'Member not found');
  return member;
}
