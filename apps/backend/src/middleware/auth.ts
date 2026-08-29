import Elysia from 'elysia';
import { bearer } from '@elysiajs/bearer';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../lib/env';
import { db } from '../db/index';
import { organizationMembers, rolePermissions, roles, permissions } from '../db/schema/index';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import type { PermissionKey } from '@boardly/shared-types';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

export interface AuthContext {
  userId: string;
  organizationId: string;
  isPlatformAdmin: boolean;
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
 * Elysia plugin that parses the Bearer token and attaches the authenticated
 * user context to every request. Routes that use this plugin will have
 * `ctx.user` available.
 */
export const authPlugin = new Elysia({ name: 'auth' })
  .use(bearer())
  .derive({ as: 'global' }, async ({ bearer, set }) => {
    if (!bearer) {
      set.status = 401;
      throw Object.assign(new Error('Unauthorized — missing Bearer token'), { status: 401 });
    }

    try {
      const user = await verifyAccessToken(bearer);
      return { user };
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
  return async ({ user, set }: { user?: AuthContext; set: { status?: number | string } }): Promise<{ error: string } | undefined> => {
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
      permCondition = or(eq(permissions.key, 'card.move'), eq(permissions.key, 'card.update')) as any;
    } else if (permissionKey === 'card.archive') {
      permCondition = or(eq(permissions.key, 'card.archive'), eq(permissions.key, 'card.delete')) as any;
    } else if (permissionKey === 'board.archive') {
      permCondition = or(eq(permissions.key, 'board.archive'), eq(permissions.key, 'board.delete')) as any;
    }

    // Look up the user's role permissions for this org
    const result = await db
      .select({ permKey: permissions.key })
      .from(rolePermissions)
      .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, user.organizationId),
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
      .where(permCondition)
      .limit(1);

    if (result.length === 0) {
      set.status = 403;
      return { error: `Forbidden — missing permission: ${permissionKey}` };
    }

    return undefined;
  };
}

/**
 * requirePlatformAdmin — Elysia beforeHandle hook for platform admin check.
 */
export function requirePlatformAdmin() {
  return async ({ user, set }: { user?: AuthContext; set: { status?: number | string } }): Promise<{ error: string } | undefined> => {
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
