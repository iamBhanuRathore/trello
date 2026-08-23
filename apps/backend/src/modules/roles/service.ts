import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  roles,
  permissions,
  rolePermissions,
} from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

const DEFAULT_SYSTEM_PERMISSIONS = [
  { key: 'org.read', description: 'View organization details and members' },
  { key: 'org.update', description: 'Update organization settings' },
  { key: 'org.delete', description: 'Delete or archive organization' },
  { key: 'org.member.invite', description: 'Invite new members to organization' },
  { key: 'org.member.remove', description: 'Remove members from organization' },
  { key: 'workspace.create', description: 'Create new workspaces' },
  { key: 'workspace.read', description: 'View workspaces and projects' },
  { key: 'workspace.update', description: 'Update workspace settings' },
  { key: 'workspace.delete', description: 'Delete workspaces' },
  { key: 'project.create', description: 'Create projects within workspaces' },
  { key: 'project.read', description: 'View project boards and tasks' },
  { key: 'project.update', description: 'Update project configuration' },
  { key: 'project.delete', description: 'Delete projects' },
  { key: 'board.create', description: 'Create boards' },
  { key: 'board.read', description: 'View boards and task columns' },
  { key: 'board.update', description: 'Update board layout and properties' },
  { key: 'board.delete', description: 'Delete boards' },
  { key: 'card.create', description: 'Create cards/tasks' },
  { key: 'card.read', description: 'View cards, comments, and subtasks' },
  { key: 'card.update', description: 'Edit cards, move lists, and change status' },
  { key: 'card.delete', description: 'Archive or delete cards' },
  { key: 'card.watch', description: 'Watch or unwatch cards for notifications' },
  { key: 'card.time_log.create', description: 'Log time entries on tasks' },
  { key: 'card.time_log.delete', description: 'Delete time entries' },
  { key: 'reports.view', description: 'Access project analytics and burndown reports' },
  { key: 'audit.view', description: 'Access organization compliance audit logs' },
  { key: 'webhook.manage', description: 'Create and configure webhooks' },
  { key: 'automation.manage', description: 'Create and configure automation rules' },
  { key: 'docs.manage', description: 'Create and manage project wiki documents' },
];

export async function ensurePermissionsSeeded(db: Database) {
  const existing = await db.select().from(permissions);
  if (existing.length === 0) {
    await db.insert(permissions).values(DEFAULT_SYSTEM_PERMISSIONS).onConflictDoNothing();
  }
}

export async function getAvailablePermissions(db: Database) {
  await ensurePermissionsSeeded(db);
  return await db.select().from(permissions);
}

export async function listRoles(db: Database, organizationId: string) {
  await ensurePermissionsSeeded(db);

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

  // Fetch permissions for each role
  const results = [];
  for (const r of uniqueRoles) {
    const perms = await db
      .select({
        id: permissions.id,
        key: permissions.key,
        description: permissions.description,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, r.id));

    results.push({
      ...r,
      permissions: perms,
    });
  }

  return results;
}

export async function createCustomRole(
  db: Database,
  organizationId: string,
  input: {
    name: string;
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
      isSystemRole: false,
    })
    .returning();

  if (!newRole) throw httpError(500, 'Failed to create role');

  if (input.permissionIds && input.permissionIds.length > 0) {
    const links = input.permissionIds.map((pid) => ({
      roleId: newRole.id,
      permissionId: pid,
    }));
    await db.insert(rolePermissions).values(links).onConflictDoNothing();
  }

  const perms = input.permissionIds?.length
    ? await db
        .select()
        .from(permissions)
        .where(inArray(permissions.id, input.permissionIds))
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

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  const [deleted] = await db.delete(roles).where(eq(roles.id, roleId)).returning();

  return deleted;
}
