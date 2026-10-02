import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  users,
  organizations,
  organizationMembers,
  plans,
  subscriptions,
} from '../../db/schema/index';
import { httpError, type RefreshContext } from './auth-common';
import { issueTokenPair } from './auth-tokens';

// ─── signUp ───────────────────────────────────────────────────────────────────
export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  orgName: string;
  orgSlug: string;
}

export async function signUp(db: Database, input: SignUpInput, ctx: RefreshContext = {}) {
  const { name, email, password, orgName, orgSlug } = input;

  // Check duplicate email
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (existingUser.length > 0) {
    throw httpError(409, 'Email already registered');
  }

  // Check duplicate org slug
  const existingOrg = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);
  if (existingOrg.length > 0) {
    throw httpError(409, 'Organization slug already taken');
  }

  // Hash password
  const passwordHash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 12 });

  // Create user + org + membership + default subscription in a transaction
  const result = await db.transaction(async (tx) => {
    let [freePlan] = await tx.select().from(plans).where(eq(plans.tier, 'free')).limit(1);
    if (!freePlan) {
      const [createdPlan] = await tx
        .insert(plans)
        .values({
          name: 'Free Plan',
          tier: 'free',
          maxSeats: 5,
          maxWorkspaces: 1,
          maxBoards: 3,
          maxStorageGb: 1,
        })
        .returning();
      freePlan = createdPlan;
    }

    const [newUser] = await tx
      .insert(users)
      .values({ name, email: email.toLowerCase(), passwordHash })
      .returning();

    const [newOrg] = await tx
      .insert(organizations)
      .values({ name: orgName, slug: orgSlug, planId: freePlan?.id })
      .returning();

    await tx.insert(organizationMembers).values({
      organizationId: newOrg!.id,
      userId: newUser!.id,
      role: 'org_owner',
      status: 'active',
    });

    if (freePlan) {
      await tx.insert(subscriptions).values({
        organizationId: newOrg!.id,
        planId: freePlan.id,
        status: 'active',
        seatCount: 5,
        billingInterval: 'monthly',
      });
    }

    return { user: newUser!, organization: newOrg! };
  });

  const tokens = await issueTokenPair(
    db,
    result.user.id,
    result.organization.id,
    result.user.isPlatformAdmin,
    { userAgent: ctx.userAgent, ip: ctx.ip }
  );

  // Best-effort: seed Lead/Developer/Tester team roles. Never fails signup.
  try {
    const { seedOrgTeamRoles } = await import('../roles/service');
    await seedOrgTeamRoles(db, result.organization.id);
  } catch (err) {
    const { logger } = await import('../../lib/logger');
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        organizationId: result.organization.id,
      },
      'Team role seeding failed — roles can be created via API'
    );
  }

  return {
    ...tokens,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      organizationId: result.organization.id,
      role: 'org_owner',
      isPlatformAdmin: result.user.isPlatformAdmin ?? false,
      avatarUrl: result.user.avatarUrl ?? null,
      timezone: result.user.timezone ?? 'UTC',
      twoFactorEnabled: result.user.twoFactorEnabled ?? false,
      createdAt: result.user.createdAt,
    },
    organization: { id: result.organization.id, slug: result.organization.slug },
  };
}

// ─── signIn ───────────────────────────────────────────────────────────────────
export interface SignInInput {
  email: string;
  password: string;
}

export async function signIn(db: Database, input: SignInInput, ctx: RefreshContext = {}) {
  const { email, password } = input;

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  if (!user || !user.passwordHash) {
    throw httpError(401, 'Invalid email or password');
  }

  if (user.deactivatedAt) {
    throw httpError(403, 'Your account has been deactivated. Please contact support.');
  }

  const passwordValid = await Bun.password.verify(password, user.passwordHash);
  if (!passwordValid) {
    throw httpError(401, 'Invalid email or password');
  }

  // Find the user's primary organization (their first active org membership)
  const [membership] = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, user.id), isNull(organizationMembers.deletedAt)))
    .limit(1);

  if (membership && membership.status === 'deactivated') {
    throw httpError(
      403,
      'Your account in this organization has been deactivated. Please contact your organization administrator.'
    );
  }

  // Update lastLoginAt on user and lastActiveAt on membership
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  if (membership) {
    await db
      .update(organizationMembers)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.organizationId, membership.organizationId)
        )
      );
  }

  const organizationId = membership?.organizationId ?? '';
  const tokens = await issueTokenPair(db, user.id, organizationId, user.isPlatformAdmin, {
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId,
      role: membership?.role ?? null,
      avatarUrl: user.avatarUrl ?? null,
      isPlatformAdmin: user.isPlatformAdmin ?? false,
      timezone: user.timezone ?? 'UTC',
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      lastLoginAt: new Date().toISOString(),
      createdAt: user.createdAt,
    },
  };
}
