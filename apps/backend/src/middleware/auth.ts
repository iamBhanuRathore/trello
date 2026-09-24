import Elysia from 'elysia';
import { bearer } from '@elysiajs/bearer';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../lib/env';
import { db } from '../db/index';
import {
  organizationMembers,
  rolePermissions,
  roles,
  permissions,
  organizations,
  plans,
} from '../db/schema/index';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { type PermissionKey, PlanTier } from '@boardly/shared-types';
import { getDataClient, isRedisAvailable } from '../redis/client';
import { getCachedAllow, setCachedAllow } from '../lib/cache';
import { logger } from '../lib/logger';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

export interface AuthContext {
  userId: string;
  organizationId: string;
  isPlatformAdmin: boolean;
}

/**
 * Resolves the plan tier for an organization.
 * Uses Redis cache (`org:meta:{orgId}`) with a 300s TTL,
 * falling back to a database lookup on cache miss.
 */
export async function resolveOrgPlanTier(orgId: string): Promise<PlanTier> {
  const redis = getDataClient();
  const cacheKey = `org:meta:${orgId}`;

  if (isRedisAvailable() && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return cached as PlanTier;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: errMsg, org_id: orgId }, 'Redis org metadata cache read failed');
    }
  }

  try {
    const org = await db
      .select({ tier: plans.tier })
      .from(organizations)
      .leftJoin(plans, eq(plans.id, organizations.planId))
      .where(eq(organizations.id, orgId))
      .limit(1);

    const tier: PlanTier = (org[0]?.tier as PlanTier) || PlanTier.Free;

    if (isRedisAvailable() && redis) {
      try {
        await redis.set(cacheKey, tier, 'EX', 300);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ err: errMsg, org_id: orgId }, 'Redis org metadata cache write failed');
      }
    }

    return tier;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg, org_id: orgId }, 'Failed to resolve org plan tier from database');
    return PlanTier.Free;
  }
}

/**
 * Signs a JWT access token for an authenticated user.
 */
export async function signAccessToken(payload: AuthContext): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT access token and returns the payload.
 */
export async function verifyAccessToken(token: string): Promise<AuthContext> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as AuthContext;
}

/**
 * Elysia plugin that parses the Bearer token, attaches the authenticated
 * user context, and resolves the tenant's planTier.
 *
 * NOTE: the derive is registered `{ as: 'global' }`, so it runs for every
 * route in the app — including instances that never `.use(authPlugin)`.
 * Genuinely public paths (browser OAuth redirects, share links) must be
 * listed in PUBLIC_PATH_PREFIXES to bypass the Bearer check.
 */
const PUBLIC_PATH_PREFIXES = ['/v1/invite/', '/v1/calendar/google/callback', '/v1/git/webhooks/'];

export const authPlugin = new Elysia({ name: 'auth' })
  .use(bearer())
  .derive({ as: 'global' }, async ({ bearer, set, path }) => {
    if (PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(p))) {
      // Public path: no user. Cast keeps `user` non-optional for the 99%
      // authed case; handlers on these paths must not touch `user`.
      return { user: undefined as unknown as AuthContext, planTier: PlanTier.Free };
    }
    if (!bearer) {
      set.status = 401;
      throw Object.assign(new Error('Unauthorized — missing Bearer token'), { status: 401 });
    }

    try {
      const user = await verifyAccessToken(bearer);
      const planTier = user.organizationId
        ? await resolveOrgPlanTier(user.organizationId)
        : ('free' as PlanTier);

      return { user, planTier };
    } catch {
      set.status = 401;
      throw Object.assign(new Error('Unauthorized — invalid or expired token'), { status: 401 });
    }
  });

/**
 * requirePermission — Elysia beforeHandle hook for RBAC permission checks.
 *
 * Usage:
 *   .delete('/cards/:id', handler, { beforeHandle: requirePermission('card.delete') })
 *
 * Platform admins bypass all permission checks.
 * Uses DB-level role_permissions lookup.
 */
export function requirePermission(permissionKey: PermissionKey) {
  return async ({
    user,
    set,
  }: {
    user?: AuthContext;
    set: { status?: number | string };
  }): Promise<{ error: string } | undefined> => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized — missing Bearer token' };
    }

    // Platform admins have all permissions
    if (user.isPlatformAdmin) {
      return undefined;
    }

    // Map alias keys if granular permission isn't directly seeded
    let permCondition = eq(permissions.key, permissionKey);
    if (permissionKey === 'card.move') {
      permCondition = or(
        eq(permissions.key, 'card.move'),
        eq(permissions.key, 'card.update')
      ) as any;
    } else if (permissionKey === 'card.archive') {
      permCondition = or(
        eq(permissions.key, 'card.archive'),
        eq(permissions.key, 'card.delete')
      ) as any;
    } else if (permissionKey === 'board.archive') {
      permCondition = or(
        eq(permissions.key, 'board.archive'),
        eq(permissions.key, 'board.delete')
      ) as any;
    }

    // If user.organizationId is undefined/null, look up their active organization membership
    let orgId: string | undefined = user.organizationId;
    if (!orgId) {
      const [membership] = await db
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, user.userId),
            isNull(organizationMembers.deletedAt),
            eq(organizationMembers.status, 'active')
          )
        )
        .limit(1);
      orgId = membership?.organizationId;
    }

    if (!orgId) {
      set.status = 403;
      return { error: 'Forbidden — user does not belong to an active organization' };
    }

    const activeOrgId = orgId;

    // Cached allow: 1 Redis RTT instead of a 4-table Neon join per request.
    // Denials are never cached; 60s TTL bounds stale allows after role changes.
    if (await getCachedAllow(activeOrgId, user.userId, permissionKey)) {
      return undefined;
    }

    try {
      // Look up the user's role permissions for this org
      const result = await db
        .select({ permKey: permissions.key })
        .from(rolePermissions)
        .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .innerJoin(
          organizationMembers,
          and(
            eq(organizationMembers.organizationId, activeOrgId),
            eq(organizationMembers.userId, user.userId),
            isNull(organizationMembers.deletedAt),
            eq(organizationMembers.status, 'active'),
            sql`(CASE 
              WHEN ${organizationMembers.role}::text = 'org_owner' THEN 'Org Owner'
              WHEN ${organizationMembers.role}::text = 'org_admin' THEN 'Org Admin'
              WHEN ${organizationMembers.role}::text = 'billing_manager' THEN 'Billing Manager'
              WHEN ${organizationMembers.role}::text = 'workspace_admin' THEN 'Workspace Admin'
              WHEN ${organizationMembers.role}::text = 'member' THEN 'Member'
              WHEN ${organizationMembers.role}::text = 'viewer' THEN 'Viewer'
              ELSE 'Member'
            END) = ${roles.name}`
          )
        )
        .where(
          and(
            permCondition,
            or(
              eq(roles.organizationId, activeOrgId),
              and(eq(roles.isSystemRole, true), isNull(roles.organizationId))
            )
          )
        )
        .limit(1);

      if (result.length === 0) {
        set.status = 403;
        return { error: `Forbidden — missing permission: ${permissionKey}` };
      }

      await setCachedAllow(activeOrgId, user.userId, permissionKey);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: errMsg, permissionKey, userId: user.userId },
        'Error checking permissions'
      );
      set.status = 500;
      return { error: 'Internal error verifying user permissions' };
    }

    return undefined;
  };
}

/**
 * requirePlatformAdmin — Elysia beforeHandle hook for platform admin check.
 */
export function requirePlatformAdmin() {
  return async ({
    user,
    set,
  }: {
    user?: AuthContext;
    set: { status?: number | string };
  }): Promise<{ error: string } | undefined> => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized — missing Bearer token' };
    }
    if (!user.isPlatformAdmin) {
      set.status = 403;
      return { error: 'Forbidden — platform admin required' };
    }
    return undefined;
  };
}
