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
import { eq, and, or, isNull, sql, type SQL } from 'drizzle-orm';
import { type PermissionKey, PlanTier } from '@boardly/shared-types';
import { getDataClient, isRedisAvailable } from '../redis/client';
import { getCachedAllow, setCachedAllow, isFamilyBurned } from '../lib/cache';
import { logger } from '../lib/logger';
import { PERMISSION_ALIASES, permissionDenied } from '../lib/permissions-resolver';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const JWT_ISSUER = 'boardly';
const JWT_AUDIENCE = 'boardly-api';

export interface AuthContext {
  userId: string;
  organizationId: string;
  isPlatformAdmin: boolean;
  /** Refresh-token family id — absent on pre-family (legacy) tokens. */
  sid?: string;
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
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT access token and returns the payload.
 * Rejects tokens with wrong issuer/audience and malformed payloads.
 * NOTE: pre-existing tokens issued without iss/aud are rejected (re-login required).
 */
export async function verifyAccessToken(token: string): Promise<AuthContext> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  const { userId, organizationId, isPlatformAdmin, sid } = payload as {
    userId?: unknown;
    organizationId?: unknown;
    isPlatformAdmin?: unknown;
    sid?: unknown;
  };
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Invalid token payload: userId');
  }
  if (organizationId !== undefined && typeof organizationId !== 'string') {
    throw new Error('Invalid token payload: organizationId');
  }
  if (sid !== undefined && (typeof sid !== 'string' || sid.length === 0)) {
    throw new Error('Invalid token payload: sid');
  }
  return {
    userId,
    organizationId: organizationId ?? '',
    isPlatformAdmin: isPlatformAdmin === true,
    ...(typeof sid === 'string' ? { sid } : {}),
  };
}

/**
 * Confirms the token holder is still an active member of the token's org.
 * Cached 60s (strict improvement over the 15m token lifetime).
 * Exported for the realtime WS handshake, which verifies tokens manually.
 */
export async function assertActiveOrgMembership(userId: string, orgId: string): Promise<boolean> {
  const { cachedTTL } = await import('../lib/cache');
  const { data } = await cachedTTL(`auth:membership:${orgId}:${userId}`, 60, async () => {
    const [row] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, orgId),
          isNull(organizationMembers.deletedAt),
          eq(organizationMembers.status, 'active')
        )
      )
      .limit(1);
    return { active: Boolean(row) };
  });
  return (data as { active: boolean }).active;
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
const PUBLIC_PATH_PREFIXES = [
  '/v1/invite/',
  '/v1/calendar/google/callback',
  '/v1/git/webhooks/',
  '/v1/inbound/email',
  // Realtime WebSocket: browsers can't send Authorization headers on the
  // upgrade handshake, so the token travels in ?token= and open() validates
  // it via verifyAccessToken (closing on failure). Rejecting here would kill
  // every socket (presence heartbeats, typing, live messages) with a 401.
  '/v1/realtime/ws',
];

/**
 * Routes where a burned refresh family kills the access token immediately.
 * Everywhere else the ≤15m access-token expiry bounds the window (avoids an
 * extra Redis RTT on the hot path).
 */
const SENSITIVE_PATH_PREFIXES = [
  '/v1/auth/change-password',
  '/v1/sso',
  '/v1/billing',
  '/v1/developer',
  '/v1/organizations',
  '/v1/superadmin',
];

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

    // Only a genuine token-verification failure is a 401. Everything after it
    // has its own status: a missing/!active membership is 403 and an
    // infrastructure failure is 503. Previously one broad `catch` rewrote all
    // three to 401, which told the client "re-login" for a deprovisioned user
    // or a database blip, hid the outage signal, and made 403 branches below
    // unreachable.
    let user: AuthContext;
    try {
      user = await verifyAccessToken(bearer);
    } catch {
      set.status = 401;
      throw Object.assign(new Error('Unauthorized — invalid or expired token'), { status: 401 });
    }

    try {
      // Token claims are not trusted blindly: the holder must still be an
      // active member of the claimed org (kills reused JWTs after removal).
      if (user.organizationId && !user.isPlatformAdmin) {
        const active = await assertActiveOrgMembership(user.userId, user.organizationId);
        if (!active) {
          set.status = 403;
          throw Object.assign(new Error('Forbidden — no active membership in organization'), {
            status: 403,
          });
        }
      }
      // Burned refresh families kill access tokens immediately, but only on
      // sensitive routes — one extra Redis RTT per request everywhere would
      // tax the hot path. Elsewhere the ≤15m access expiry bounds the window.
      if (user.sid && SENSITIVE_PATH_PREFIXES.some((p) => path.startsWith(p))) {
        if (await isFamilyBurned(user.sid)) {
          set.status = 401;
          throw Object.assign(new Error('Unauthorized — session revoked'), { status: 401 });
        }
      }
      const planTier = user.organizationId
        ? await resolveOrgPlanTier(user.organizationId)
        : ('free' as PlanTier);

      return { user, planTier };
    } catch (err: unknown) {
      // Preserve a deliberate status (401 revoked / 403 membership); anything
      // else is an infrastructure failure and must not masquerade as 401.
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        set.status = status;
        throw err;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: errMsg, path, user_id: user.userId, organization_id: user.organizationId },
        'Auth middleware infrastructure failure'
      );
      set.status = 503;
      throw Object.assign(new Error('Service unavailable — could not verify session'), {
        status: 503,
      });
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
  }): Promise<{ error: string; details?: { code: string; permission: string } } | undefined> => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized — missing Bearer token' };
    }

    // Platform admins have all permissions
    if (user.isPlatformAdmin) {
      return undefined;
    }

    // Alias-aware check — single source of truth in permissions-resolver.
    const aliasKeys = PERMISSION_ALIASES[permissionKey];
    let permCondition: SQL | undefined = eq(permissions.key, permissionKey);
    if (aliasKeys) {
      permCondition = or(...aliasKeys.map((k) => eq(permissions.key, k)));
    }

    // If user.organizationId is undefined/empty, fall back to an active membership.
    //
    // STEP 1 (current): log-only. Picking "the first active membership" is not
    // deterministic for multi-org users, so this grants whatever org the
    // database happens to return first — privilege drift. It is instrumented
    // rather than removed so we can see real traffic before turning it into a
    // 400, which would otherwise lock out users who authenticate fine but have
    // no active membership (see `auth-lifecycle.ts` login and
    // `auth-tokens.ts` assertRefreshGate, both of which can mint an empty-org
    // token). Caller inventory found no dashboard/mobile/API-key client that
    // depends on this path, and no webhook caller reaches it (HMAC-authed).
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
      logger.warn(
        { user_id: user.userId, resolved_org_id: orgId ?? null, permissionKey },
        'Empty-org token resolved permissions via first-active-membership fallback'
      );
    }

    if (!orgId) {
      set.status = 403;
      return {
        error: 'Forbidden — user does not belong to an active organization',
        details: { code: 'PERMISSION_DENIED', permission: permissionKey },
      };
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
        return permissionDenied(permissionKey);
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
