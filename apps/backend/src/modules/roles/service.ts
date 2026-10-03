import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  roles,
  permissions,
  rolePermissions,
  organizationMembers,
  organizationRoleMembers,
} from '../../db/schema/index';
import {
  ALL_PERMISSION_KEYS,
  ORG_PERMISSIONS,
  WORKSPACE_PERMISSIONS,
  PROJECT_PERMISSIONS,
  BOARD_PERMISSIONS,
  CARD_PERMISSIONS,
} from '@boardly/shared-types';
import { bumpUserCache, bumpOrgPermVersion } from '../../lib/cache';

/** Drop cached profiles + perm epoch for every holder of a custom role. */
async function bumpRoleHolders(db: Database, organizationId: string, roleId: string) {
  const holders = await db
    .select({ userId: organizationRoleMembers.userId })
    .from(organizationRoleMembers)
    .where(
      and(
        eq(organizationRoleMembers.organizationId, organizationId),
        eq(organizationRoleMembers.roleId, roleId)
      )
    );
  await Promise.all(holders.map((h) => bumpUserCache(h.userId)));
  await bumpOrgPermVersion(organizationId);
}

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/**
 * Backfill from the registry — insert-only-if-empty would never add keys
 * introduced after the first seed run. onConflictDoNothing keeps it idempotent.
 *
 * Memoized per process: this used to run on EVERY authenticated request (via
 * resolveUserPermissions), turning each one into a ~60-row INSERT plus a
 * full-table scan. Boot seeds it (backend/src/index.ts); `permissionsReset()`
 * clears the memo so a registry change takes effect without a restart.
 */
let permissionsSeed: Promise<void> | null = null;

export async function ensurePermissionsSeeded(db: Database): Promise<void> {
  if (!permissionsSeed) {
    permissionsSeed = db
      .insert(permissions)
      .values(ALL_PERMISSION_KEYS.map((key) => ({ key, description: key })))
      .onConflictDoNothing()
      .then(() => undefined)
      .catch((err) => {
        // Do not cache a transient failure — the next caller retries.
        permissionsSeed = null;
        throw err;
      });
  }
  return permissionsSeed;
}

/** Drops the seed memo so the next call re-runs the INSERT. */
export function permissionsReset(): void {
  permissionsSeed = null;
}

export async function getAvailablePermissions(db: Database) {
  await ensurePermissionsSeeded(db);
  return await db.select().from(permissions);
}

export async function listRoles(db: Database, organizationId: string) {
  await ensurePermissionsSeeded(db);

  // Self-healing backfill: orgs created before team roles existed get
  // Lead/Developer/Tester on first read (signup seeds new orgs directly).
  const hasCustom = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.isSystemRole, false)))
    .limit(1);
  if (hasCustom.length === 0) {
    try {
      await seedOrgTeamRoles(db, organizationId);
    } catch {
      // Best-effort; admin can retry via explicit seed call.
    }
  }

  // Fetch both system roles and custom roles for this organization
  const roleList = await db
    .select()
    .from(roles)
    .where(
      or(
        eq(roles.isSystemRole, true),
        isNull(roles.organizationId),
        eq(roles.organizationId, organizationId)
      )
    );

  // Deduplicate by name if multiple system roles with same name exist
  const seenSystemRoleNames = new Set<string>();
  const uniqueRoles = [];
  for (const r of roleList) {
    if (r.isSystemRole) {
      if (seenSystemRoleNames.has(r.name)) continue;
      seenSystemRoleNames.add(r.name);
    }
    uniqueRoles.push(r);
  }

  // Canonical ordering: Org Owner, Org Admin, Member, Viewer, then custom roles
  const systemOrder: Record<string, number> = {
    'Org Owner': 1,
    'Org Admin': 2,
    Member: 3,
    Viewer: 4,
  };
  uniqueRoles.sort((a, b) => {
    const orderA = a.isSystemRole ? (systemOrder[a.name] ?? 10) : 100;
    const orderB = b.isSystemRole ? (systemOrder[b.name] ?? 10) : 100;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  // Fetch permissions for every role in ONE query. This looped a
  // role_permissions join per role, so the page cost 6 system roles + N custom
  // roles round trips, serially.
  const permsByRole = new Map<string, { id: string; key: string; description: string | null }[]>();
  if (uniqueRoles.length > 0) {
    const permRows = await db
      .select({
        roleId: rolePermissions.roleId,
        id: permissions.id,
        key: permissions.key,
        description: permissions.description,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(
        inArray(
          rolePermissions.roleId,
          uniqueRoles.map((r) => r.id)
        )
      );

    for (const row of permRows) {
      const list = permsByRole.get(row.roleId);
      const entry = { id: row.id, key: row.key, description: row.description };
      if (list) list.push(entry);
      else permsByRole.set(row.roleId, [entry]);
    }
  }

  return uniqueRoles.map((r) => ({
    ...r,
    permissions: permsByRole.get(r.id) ?? [],
  }));
}

export async function createCustomRole(
  db: Database,
  organizationId: string,
  input: {
    name: string;
    description?: string;
    isDefault?: boolean;
    permissionIds?: string[];
  }
) {
  if (!input.name || input.name.trim().length === 0) {
    throw httpError(400, 'Role name is required');
  }

  const [newRole] = await db
    .insert(roles)
    .values({
      organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isDefault: !!input.isDefault,
      isSystemRole: false,
    })
    .returning();

  if (!newRole) throw httpError(500, 'Failed to create role');

  if (newRole.isDefault) {
    await db
      .update(roles)
      .set({ isDefault: false })
      .where(and(eq(roles.organizationId, organizationId), eq(roles.isSystemRole, false)));
    await db.update(roles).set({ isDefault: true }).where(eq(roles.id, newRole.id));
  }

  if (input.permissionIds && input.permissionIds.length > 0) {
    const links = input.permissionIds.map((pid) => ({
      roleId: newRole.id,
      permissionId: pid,
    }));
    await db.insert(rolePermissions).values(links).onConflictDoNothing();
  }

  const perms = input.permissionIds?.length
    ? await db.select().from(permissions).where(inArray(permissions.id, input.permissionIds))
    : [];

  return {
    ...newRole,
    permissions: perms,
  };
}

export async function updateCustomRole(
  db: Database,
  organizationId: string,
  roleId: string,
  input: {
    name?: string;
    description?: string | null;
    isDefault?: boolean;
    permissionIds?: string[];
  }
) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)))
    .limit(1);

  if (!role) throw httpError(404, 'Custom role not found');
  if (role.isSystemRole) throw httpError(403, 'Cannot modify system roles');

  if (input.name) {
    await db
      .update(roles)
      .set({ name: input.name.trim(), updatedAt: new Date() })
      .where(eq(roles.id, roleId));
  }

  if (input.description !== undefined) {
    await db
      .update(roles)
      .set({ description: input.description?.trim() || null, updatedAt: new Date() })
      .where(eq(roles.id, roleId));
  }

  if (input.isDefault !== undefined) {
    if (input.isDefault) {
      await db
        .update(roles)
        .set({ isDefault: false })
        .where(and(eq(roles.organizationId, organizationId), eq(roles.isSystemRole, false)));
    }
    await db.update(roles).set({ isDefault: !!input.isDefault }).where(eq(roles.id, roleId));
  }

  if (Array.isArray(input.permissionIds)) {
    // Delete existing links and re-insert
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (input.permissionIds.length > 0) {
      const links = input.permissionIds.map((pid) => ({
        roleId,
        permissionId: pid,
      }));
      await db.insert(rolePermissions).values(links).onConflictDoNothing();
    }
  }

  const perms = await db
    .select({
      id: permissions.id,
      key: permissions.key,
      description: permissions.description,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));

  const [updatedRole] = await db.select().from(roles).where(eq(roles.id, roleId));

  await bumpRoleHolders(db, organizationId, roleId);

  return {
    ...updatedRole!,
    permissions: perms,
  };
}

export async function deleteCustomRole(db: Database, organizationId: string, roleId: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)))
    .limit(1);

  if (!role) throw httpError(404, 'Custom role not found');
  if (role.isSystemRole) throw httpError(403, 'Cannot delete system roles');

  // Capture holders BEFORE the membership rows are deleted.
  const holders = await db
    .select({ userId: organizationRoleMembers.userId })
    .from(organizationRoleMembers)
    .where(
      and(
        eq(organizationRoleMembers.organizationId, organizationId),
        eq(organizationRoleMembers.roleId, roleId)
      )
    );

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  await db.delete(organizationRoleMembers).where(eq(organizationRoleMembers.roleId, roleId));
  const [deleted] = await db.delete(roles).where(eq(roles.id, roleId)).returning();

  // Project automation rules referencing this role announce themselves instead
  // of silently dying (best-effort, never breaks the deletion).
  const { flagStaleRules } = await import('../automations/project-engine');
  await flagStaleRules(db, organizationId, 'role', roleId).catch(() => {});

  await Promise.all(holders.map((h) => bumpUserCache(h.userId)));
  await bumpOrgPermVersion(organizationId);

  return deleted;
}

// ─── Team Roles (company-configurable Lead / Developer / Tester) ─────────────

// Member baseline mirrors db/seed.ts — task collaboration, no structural powers.
const MEMBER_BASE_KEYS = [
  ORG_PERMISSIONS.READ,
  WORKSPACE_PERMISSIONS.READ,
  PROJECT_PERMISSIONS.READ,
  BOARD_PERMISSIONS.READ,
  CARD_PERMISSIONS.READ,
  CARD_PERMISSIONS.CREATE,
  CARD_PERMISSIONS.UPDATE,
  CARD_PERMISSIONS.MOVE,
  CARD_PERMISSIONS.ASSIGN,
  CARD_PERMISSIONS.WATCH,
  CARD_PERMISSIONS.ADD_LABEL,
  CARD_PERMISSIONS.REMOVE_LABEL,
  CARD_PERMISSIONS.SET_DUE_DATE,
  CARD_PERMISSIONS.UPDATE_STAGE,
  CARD_PERMISSIONS.CREATE_SUBTASK,
  CARD_PERMISSIONS.CREATE_CHECKLIST,
  CARD_PERMISSIONS.UPDATE_CHECKLIST,
  CARD_PERMISSIONS.ADD_ATTACHMENT,
  CARD_PERMISSIONS.CREATE_COMMENT,
  CARD_PERMISSIONS.UPDATE_COMMENT,
  CARD_PERMISSIONS.CREATE_TIME_LOG,
  CARD_PERMISSIONS.UPDATE_TIME_LOG,
];

const TEAM_ROLE_DEFS = [
  {
    name: 'Lead',
    description: 'Team lead — full member powers plus board layout and card deletion.',
    keys: [
      ...MEMBER_BASE_KEYS,
      BOARD_PERMISSIONS.UPDATE,
      CARD_PERMISSIONS.DELETE,
      CARD_PERMISSIONS.ASSIGN_SPRINT,
    ],
  },
  {
    name: 'Developer',
    description: 'Builder — full task collaboration powers.',
    keys: MEMBER_BASE_KEYS,
  },
  {
    name: 'Tester',
    description: 'Verifier — read, watch, comment, checklists, and time logs.',
    keys: [
      ORG_PERMISSIONS.READ,
      WORKSPACE_PERMISSIONS.READ,
      PROJECT_PERMISSIONS.READ,
      BOARD_PERMISSIONS.READ,
      CARD_PERMISSIONS.READ,
      CARD_PERMISSIONS.WATCH,
      CARD_PERMISSIONS.CREATE_COMMENT,
      CARD_PERMISSIONS.UPDATE_COMMENT,
      CARD_PERMISSIONS.CREATE_CHECKLIST,
      CARD_PERMISSIONS.UPDATE_CHECKLIST,
      CARD_PERMISSIONS.ADD_ATTACHMENT,
      CARD_PERMISSIONS.CREATE_TIME_LOG,
      CARD_PERMISSIONS.UPDATE_TIME_LOG,
    ],
  },
];

/**
 * Seeds Lead/Developer/Tester custom roles for an organization. Idempotent —
 * safe to run on signup and as a backfill for existing orgs. Self-sufficient:
 * inserts any missing permission rows it references.
 */
export async function seedOrgTeamRoles(db: Database, organizationId: string) {
  const allKeys = [...new Set(TEAM_ROLE_DEFS.flatMap((d) => d.keys))];
  await db
    .insert(permissions)
    .values(allKeys.map((key) => ({ key, description: key })))
    .onConflictDoNothing();

  const permRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, allKeys));
  const permIdByKey = new Map(permRows.map((p) => [p.key, p.id]));

  for (const def of TEAM_ROLE_DEFS) {
    const [role] = await db
      .insert(roles)
      .values({ organizationId, name: def.name, description: def.description, isSystemRole: false })
      .onConflictDoNothing()
      .returning();
    const roleId =
      role?.id ??
      (
        await db
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.organizationId, organizationId), eq(roles.name, def.name)))
          .limit(1)
      )[0]?.id;
    if (!roleId) continue;
    const links = def.keys
      .map((key) => permIdByKey.get(key))
      .filter((id): id is string => !!id)
      .map((permissionId) => ({ roleId, permissionId }));
    if (links.length > 0) {
      await db.insert(rolePermissions).values(links).onConflictDoNothing();
    }
  }
}

/** Attach a team role to an org member (company admin only — route-gated). */
export async function assignTeamRole(
  db: Database,
  organizationId: string,
  userId: string,
  roleId: string,
  actorId: string
) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.id, roleId),
        eq(roles.organizationId, organizationId),
        eq(roles.isSystemRole, false)
      )
    )
    .limit(1);
  if (!role) throw httpError(404, 'Team role not found in this organization');

  const [member] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
        isNull(organizationMembers.deletedAt)
      )
    )
    .limit(1);
  if (!member) throw httpError(404, 'User is not a member of this organization');

  const [row] = await db
    .insert(organizationRoleMembers)
    .values({ organizationId, roleId, userId, assignedBy: actorId })
    .onConflictDoNothing()
    .returning();
  await bumpUserCache(userId);
  await bumpOrgPermVersion(organizationId);
  return row ?? { organizationId, roleId, userId };
}

export async function removeTeamRole(
  db: Database,
  organizationId: string,
  userId: string,
  roleId: string
) {
  await db
    .delete(organizationRoleMembers)
    .where(
      and(
        eq(organizationRoleMembers.organizationId, organizationId),
        eq(organizationRoleMembers.roleId, roleId),
        eq(organizationRoleMembers.userId, userId)
      )
    );
  await bumpUserCache(userId);
  await bumpOrgPermVersion(organizationId);
  return { success: true };
}

export async function listMemberTeamRoles(db: Database, organizationId: string, userId: string) {
  return db
    .select({ id: roles.id, name: roles.name, description: roles.description })
    .from(organizationRoleMembers)
    .innerJoin(roles, eq(roles.id, organizationRoleMembers.roleId))
    .where(
      and(
        eq(organizationRoleMembers.organizationId, organizationId),
        eq(organizationRoleMembers.userId, userId)
      )
    );
}
