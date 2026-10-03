import { eq, and, or, isNull } from 'drizzle-orm';
import type { Database } from '../db/index';
import {
  users,
  organizationMembers,
  organizationRoleMembers,
  roles,
  rolePermissions,
  permissions,
} from '../db/schema/index';
import type { PermissionKey } from '@boardly/shared-types';

/** Distinct code so the dashboard can tell permission 403s apart from other 403s. */
export const PERMISSION_DENIED_CODE = 'PERMISSION_DENIED';

/**
 * Alias map — a check for the key passes when ANY of the listed keys is granted.
 * Single source of truth shared by requirePermission() and the UI's can().
 */
export const PERMISSION_ALIASES: Record<string, PermissionKey[]> = {
  'card.move': ['card.move', 'card.update'],
  'card.archive': ['card.archive', 'card.delete'],
  'board.archive': ['board.archive', 'board.delete'],
};

/** Body for permission denials — additive `details` object (never an array). */
export function permissionDenied(permissionKey: string): {
  error: string;
  details: { code: string; permission: string };
} {
  return {
    error: `Forbidden — missing permission: ${permissionKey}`,
    details: { code: PERMISSION_DENIED_CODE, permission: permissionKey },
  };
}

/** True when the granted set satisfies a single-key check (alias-aware). */
export function satisfiesPermission(granted: Set<string>, key: string): boolean {
  const aliases = PERMISSION_ALIASES[key];
  if (aliases) return aliases.some((k) => granted.has(k));
  return granted.has(key);
}

function roleTitleFor(rawRole: string): string {
  if (rawRole === 'viewer') return 'Viewer';
  if (rawRole === 'billing_manager') return 'Billing Manager';
  if (rawRole === 'workspace_admin') return 'Workspace Admin';
  return 'Member';
}

/**
 * Single resolver for the middleware, GET /auth/me and GET /auth/permissions.
 * Returns the EFFECTIVE set (base grants + alias-implied keys), so a single-key
 * `has()` on the result matches requirePermission() semantics.
 */
export async function resolveUserPermissions(
  db: Database,
  userId: string,
  organizationId: string
): Promise<Set<string>> {
  const [[user], [membership]] = await Promise.all([
    db
      .select({ isPlatformAdmin: users.isPlatformAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1),
  ]);

  const rawRole = (membership?.role as string) || 'member';

  // The `permissions` registry is seeded once at boot (see backend/src/index.ts),
  // never per request — this resolver runs on every authenticated route.
  let granted: Set<string>;
  if (user?.isPlatformAdmin || rawRole === 'org_owner' || rawRole === 'org_admin') {
    // Only the all-access branch needs the full registry scan; members resolve
    // through their role joins below.
    const allPerms = await db.select({ key: permissions.key }).from(permissions);
    granted = new Set(allPerms.map((p) => p.key));
  } else {
    const matchedRoleName = roleTitleFor(rawRole);
    const [roleRows, extraRows] = await Promise.all([
      db
        .select({ permKey: permissions.key })
        .from(rolePermissions)
        .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          and(
            eq(roles.name, matchedRoleName),
            or(
              eq(roles.organizationId, organizationId),
              and(eq(roles.isSystemRole, true), isNull(roles.organizationId))
            )
          )
        ),
      // Team-role extras: union of organizationRoleMembers grants.
      db
        .select({ permKey: permissions.key })
        .from(organizationRoleMembers)
        .innerJoin(roles, eq(roles.id, organizationRoleMembers.roleId))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          and(
            eq(organizationRoleMembers.organizationId, organizationId),
            eq(organizationRoleMembers.userId, userId)
          )
        ),
    ]);
    granted = new Set(roleRows.map((r) => r.permKey));
    for (const r of extraRows) granted.add(r.permKey);

    if (rawRole === 'member') {
      [
        'card.create',
        'card.read',
        'card.update',
        'card.watch',
        'card.time_log.create',
        'board.read',
        'project.read',
        'workspace.read',
      ].forEach((k) => granted.add(k));
    } else if (rawRole === 'viewer') {
      ['card.read', 'board.read', 'project.read', 'workspace.read'].forEach((k) => granted.add(k));
    }
  }

  // Expand alias-implied keys so single-key has() matches requirePermission().
  if (granted.has('card.update')) granted.add('card.move');
  if (granted.has('card.delete')) granted.add('card.archive');
  if (granted.has('board.delete')) granted.add('board.archive');
  return granted;
}
