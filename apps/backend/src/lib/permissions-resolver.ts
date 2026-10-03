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
import {
  BOARD_PERMISSIONS,
  CARD_PERMISSIONS,
  OrgMemberRole,
  PROJECT_PERMISSIONS,
  WORKSPACE_PERMISSIONS,
} from '@boardly/shared-types';

/** Distinct code so the dashboard can tell permission 403s apart from other 403s. */
export const PERMISSION_DENIED_CODE = 'PERMISSION_DENIED';

/**
 * Alias map — a check for the key passes when ANY of the listed keys is granted.
 * Single source of truth shared by requirePermission() and the UI's can().
 *
 * Declared as `Partial<Record<PermissionKey, …>>` rather than
 * `Record<string, …>` on purpose. The old annotation type-checked the VALUES but
 * left the KEYS as bare strings, so `'card.mvoe'` compiled, passed CI, and
 * silently cost every caller the `card.update` → `card.move` fallback — a
 * runtime 403 with no build error. Keying the annotation by `PermissionKey`
 * (not `string`) checks both sides against the registry union, and every
 * consumer indexes it with a `PermissionKey`, so the wide-string escape hatch
 * is no longer needed.
 */
export const PERMISSION_ALIASES: Partial<Record<PermissionKey, readonly PermissionKey[]>> = {
  [CARD_PERMISSIONS.MOVE]: [CARD_PERMISSIONS.MOVE, CARD_PERMISSIONS.UPDATE],
  [CARD_PERMISSIONS.ARCHIVE]: [CARD_PERMISSIONS.ARCHIVE, CARD_PERMISSIONS.DELETE],
  [BOARD_PERMISSIONS.ARCHIVE]: [BOARD_PERMISSIONS.ARCHIVE, BOARD_PERMISSIONS.DELETE],
};

/**
 * Baseline grants that the role tables do not carry.
 *
 * Typed as `PermissionKey[]`, so a typo is a compile error. These used to be
 * inferred `string[]`, which meant a misspelling silently granted nothing and
 * surfaced as a 403 on that one action with no other symptom.
 */
const MEMBER_BASELINE_KEYS: readonly PermissionKey[] = [
  CARD_PERMISSIONS.CREATE,
  CARD_PERMISSIONS.READ,
  CARD_PERMISSIONS.UPDATE,
  CARD_PERMISSIONS.WATCH,
  CARD_PERMISSIONS.CREATE_TIME_LOG,
  BOARD_PERMISSIONS.READ,
  PROJECT_PERMISSIONS.READ,
  WORKSPACE_PERMISSIONS.READ,
];

const VIEWER_BASELINE_KEYS: readonly PermissionKey[] = [
  CARD_PERMISSIONS.READ,
  BOARD_PERMISSIONS.READ,
  PROJECT_PERMISSIONS.READ,
  WORKSPACE_PERMISSIONS.READ,
];

/** Baseline keys per raw org role — org members only. */
const ROLE_BASELINE_KEYS: Partial<Record<OrgMemberRole, readonly PermissionKey[]>> = {
  [OrgMemberRole.Member]: MEMBER_BASELINE_KEYS,
  [OrgMemberRole.Viewer]: VIEWER_BASELINE_KEYS,
};

/**
 * `roles.name` for a raw org role. These are display names that must match the
 * seeded system-role rows, so they are data rather than permission keys.
 */
const SYSTEM_ROLE_NAME_BY_ORG_ROLE: Partial<Record<OrgMemberRole, string>> = {
  [OrgMemberRole.OrgOwner]: 'Org Owner',
  [OrgMemberRole.OrgAdmin]: 'Org Admin',
  [OrgMemberRole.BillingManager]: 'Billing Manager',
  [OrgMemberRole.WorkspaceAdmin]: 'Workspace Admin',
  [OrgMemberRole.Member]: 'Member',
  [OrgMemberRole.Viewer]: 'Viewer',
};

/** Roles that hold every permission in the registry. */
const ALL_ACCESS_ROLES: readonly OrgMemberRole[] = [OrgMemberRole.OrgOwner, OrgMemberRole.OrgAdmin];

/** Body for permission denials — additive `details` object (never an array). */
export function permissionDenied(permissionKey: PermissionKey): {
  error: string;
  details: { code: string; permission: string };
} {
  return {
    error: `Forbidden — missing permission: ${permissionKey}`,
    details: { code: PERMISSION_DENIED_CODE, permission: permissionKey },
  };
}

/**
 * True when the granted set satisfies a single-key check (alias-aware).
 *
 * `key` is a `PermissionKey`, not a string: the alias lookup and the fallback
 * `granted.has()` below are both key-exact, so a misspelling would quietly
 * degrade to "deny" instead of failing the build.
 */
export function satisfiesPermission(granted: ReadonlySet<string>, key: PermissionKey): boolean {
  const aliases = PERMISSION_ALIASES[key];
  if (aliases) return aliases.some((k) => granted.has(k));
  return granted.has(key);
}

function roleTitleFor(rawRole: string): string {
  return SYSTEM_ROLE_NAME_BY_ORG_ROLE[rawRole as OrgMemberRole] ?? 'Member';
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

  const rawRole = (membership?.role as OrgMemberRole) ?? OrgMemberRole.Member;

  // The `permissions` registry is seeded once at boot (see backend/src/index.ts),
  // never per request — this resolver runs on every authenticated route.
  let granted: Set<string>;
  if (user?.isPlatformAdmin || ALL_ACCESS_ROLES.includes(rawRole)) {
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

    for (const key of ROLE_BASELINE_KEYS[rawRole] ?? []) granted.add(key);
  }

  // Expand alias-implied keys so single-key has() matches requirePermission().
  // Derived from PERMISSION_ALIASES rather than hand-written: the three `if`
  // lines that used to live here duplicated the alias table with no compiler
  // link, so renaming a constant in one place silently broke the other.
  for (const [key, aliases] of Object.entries(PERMISSION_ALIASES)) {
    if (aliases.some((alias) => granted.has(alias))) granted.add(key);
  }
  return granted;
}
