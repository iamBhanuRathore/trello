import Elysia from 'elysia';
import { bearer } from '@elysiajs/bearer';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../lib/env';
import { db } from '../db/index';
import { organizationMembers, rolePermissions, roles, permissions } from '../db/schema/index';
import { eq, and, isNull, sql } from 'drizzle-orm';
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
 * requirePermission — Elysia derive plugin for RBAC permission checks.
 *
 * Usage:
 *   .use(requirePermission('card.delete'))
 *   .delete('/cards/:id', handler)
 *
 * Platform admins bypass all permission checks.
 * Uses DB-level role_permissions lookup — results should be cached in Redis
 * once that layer is in place.
 */
export function requirePermission(permissionKey: PermissionKey) {
  return new Elysia({ name: `permission:${permissionKey}` })
    .use(authPlugin)
    .derive({ as: 'local' }, async ({ user, set }) => {
      // Platform admins have all permissions
      if (user.isPlatformAdmin) {
        return { hasPermission: true };
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
            sql`(CASE 
              WHEN ${organizationMembers.role} = 'org_owner' THEN 'Org Owner'
              WHEN ${organizationMembers.role} = 'org_admin' THEN 'Org Admin'
              WHEN ${organizationMembers.role} = 'billing_manager' THEN 'Billing Manager'
              WHEN ${organizationMembers.role} = 'workspace_admin' THEN 'Workspace Admin'
              WHEN ${organizationMembers.role} = 'member' THEN 'Member'
              WHEN ${organizationMembers.role} = 'viewer' THEN 'Viewer'
            END) = ${roles.name}`
          )
        )
        .where(eq(permissions.key, permissionKey))
        .limit(1);

      if (result.length === 0) {
        set.status = 403;
        throw new Error(`Forbidden — missing permission: ${permissionKey}`);
      }

      return { hasPermission: true };
    });
}

/**
 * requirePlatformAdmin — Elysia derive plugin for platform admin check.
 */
export function requirePlatformAdmin() {
  return new Elysia({ name: 'requirePlatformAdmin' })
    .use(authPlugin)
    .derive({ as: 'local' }, async ({ user, set }) => {
      if (!user.isPlatformAdmin) {
        set.status = 403;
        throw new Error('Forbidden — platform admin required');
      }
      return { isPlatformAdmin: true };
    });
}
