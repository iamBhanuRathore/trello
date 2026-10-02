import { eq, and, isNull, or } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { users, organizationMembers } from '../../db/schema/index';
import { cachedTTL, userCacheKey, bumpUserCache } from '../../lib/cache';
import { httpError } from './auth-common';
import { revokeAllUserSessions } from './auth-tokens';

// ─── getMe ────────────────────────────────────────────────────────────────────
export async function getMe(db: Database, userId: string) {
  // Hot app-load read (fired 2× on boot via StrictMode): 1 Redis RTT on hit.
  const { data } = await cachedTTL(userCacheKey(userId), 60, () => loadMe(db, userId));
  return data;
}

async function loadMe(db: Database, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      passwordHash: users.passwordHash,
      isPlatformAdmin: users.isPlatformAdmin,
      twoFactorEnabled: users.twoFactorEnabled,
      timezone: users.timezone,
      lastLoginAt: users.lastLoginAt,
      deactivatedAt: users.deactivatedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!user) {
    throw httpError(404, 'User not found');
  }

  if (user.deactivatedAt) {
    throw httpError(403, 'Your account has been deactivated.');
  }

  // Find the user's active organization membership
  const [membership] = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), isNull(organizationMembers.deletedAt)))
    .limit(1);

  if (membership && membership.status === 'deactivated') {
    throw httpError(403, 'Your account in this organization has been deactivated.');
  }

  const hasPassword = Boolean(user.passwordHash && user.passwordHash.trim().length > 0);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    isPlatformAdmin: user.isPlatformAdmin,
    twoFactorEnabled: user.twoFactorEnabled,
    timezone: user.timezone,
    lastLoginAt: user.lastLoginAt,
    deactivatedAt: user.deactivatedAt,
    createdAt: user.createdAt,
    hasPassword,
    organizationId: membership?.organizationId ?? null,
    role: membership?.role ?? null,
    status: membership?.status ?? 'active',
  };
}

// ─── updateProfile ───────────────────────────────────────────────────────────
export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string | null;
  timezone?: string | null;
}

export async function updateProfile(db: Database, userId: string, input: UpdateProfileInput) {
  const updateData: Record<string, any> = {};
  if (input.name !== undefined && input.name.trim()) updateData.name = input.name.trim();
  if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
  if (input.timezone !== undefined) updateData.timezone = input.timezone;

  if (Object.keys(updateData).length > 0) {
    await db.update(users).set(updateData).where(eq(users.id, userId));
  }

  await bumpUserCache(userId);
  return await getMe(db, userId);
}

// ─── changePassword ────────────────────────────────────────────────────────
export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
}

export async function changePassword(
  db: Database,
  userId: string,
  input: ChangePasswordInput,
  opts: { keepFamilyId?: string } = {}
) {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!user) throw httpError(404, 'User not found');

  const hasExistingPassword = Boolean(user.passwordHash && user.passwordHash.trim().length > 0);

  if (hasExistingPassword) {
    if (!input.currentPassword) {
      throw httpError(400, 'Current password is required to change password');
    }
    const valid = await Bun.password.verify(input.currentPassword, user.passwordHash!);
    if (!valid) throw httpError(400, 'Current password is incorrect');
  }

  if (!input.newPassword || input.newPassword.length < 8) {
    throw httpError(400, 'New password must be at least 8 characters long');
  }

  const newHash = await Bun.password.hash(input.newPassword, { algorithm: 'bcrypt', cost: 12 });
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
  // A password change burns every other session — the caller's own family survives.
  await revokeAllUserSessions(db, userId, { exceptFamilyId: opts.keepFamilyId });
  return {
    success: true,
    message: hasExistingPassword ? 'Password updated successfully' : 'Password set successfully',
  };
}

// ─── getMyPermissions ────────────────────────────────────────────────────────
export async function getMyPermissions(db: Database, userId: string, organizationId: string) {
  // 1. Get user details & active role
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isPlatformAdmin: users.isPlatformAdmin,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw httpError(404, 'User not found');

  const [membership] = await db
    .select({
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
        isNull(organizationMembers.deletedAt)
      )
    )
    .limit(1);

  const rawRole = (membership?.role as string) || 'member';
  const roleTitle = user.isPlatformAdmin
    ? 'Platform Super Admin'
    : rawRole === 'org_owner'
      ? 'Organization Owner'
      : rawRole === 'org_admin'
        ? 'Organization Admin'
        : rawRole === 'viewer'
          ? 'Viewer'
          : 'Member';

  // 2. Ensure permissions are available and fetch
  const { ensurePermissionsSeeded } = await import('../roles/service');
  await ensurePermissionsSeeded(db);
  const {
    permissions: permsTable,
    roles: rolesTable,
    rolePermissions: rpTable,
  } = await import('../../db/schema/index');
  const allPerms = await db.select().from(permsTable);

  // 3. If superadmin or org owner/admin, they have all permissions
  let grantedKeys: Set<string>;
  if (user.isPlatformAdmin || rawRole === 'org_owner' || rawRole === 'org_admin') {
    grantedKeys = new Set(allPerms.map((p) => p.key));
  } else {
    // Look up rolePermissions for their role
    const matchedRoleName =
      rawRole === 'viewer'
        ? 'Viewer'
        : rawRole === 'billing_manager'
          ? 'Billing Manager'
          : rawRole === 'workspace_admin'
            ? 'Workspace Admin'
            : 'Member';
    const roleRows = await db
      .select({ permKey: permsTable.key })
      .from(rpTable)
      .innerJoin(rolesTable, eq(rolesTable.id, rpTable.roleId))
      .innerJoin(permsTable, eq(permsTable.id, rpTable.permissionId))
      .where(
        and(
          eq(rolesTable.name, matchedRoleName),
          or(
            eq(rolesTable.organizationId, organizationId),
            and(eq(rolesTable.isSystemRole, true), isNull(rolesTable.organizationId))
          )
        )
      );

    grantedKeys = new Set(roleRows.map((r) => r.permKey));
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
      ].forEach((k) => grantedKeys.add(k));
    } else if (rawRole === 'viewer') {
      ['card.read', 'board.read', 'project.read', 'workspace.read'].forEach((k) =>
        grantedKeys.add(k)
      );
    }
  }

  // 4. Group permissions into categories
  const categories: Record<
    string,
    {
      label: string;
      icon: string;
      items: Array<{ key: string; description: string; granted: boolean }>;
    }
  > = {
    workspace_project: {
      label: 'Workspaces & Projects',
      icon: 'Building2',
      items: [],
    },
    board_list: {
      label: 'Boards & Columns',
      icon: 'Layout',
      items: [],
    },
    task_card: {
      label: 'Tasks & Collaboration',
      icon: 'CheckSquare',
      items: [],
    },
    admin_governance: {
      label: 'Administration & Governance',
      icon: 'ShieldCheck',
      items: [],
    },
  };

  allPerms.forEach((perm) => {
    const isGranted = grantedKeys.has(perm.key);
    let catKey = 'task_card';
    if (
      perm.key.startsWith('org.') ||
      perm.key.startsWith('audit.') ||
      perm.key.startsWith('webhook.') ||
      perm.key.startsWith('automation.')
    ) {
      catKey = 'admin_governance';
    } else if (
      perm.key.startsWith('workspace.') ||
      perm.key.startsWith('project.') ||
      perm.key.startsWith('docs.')
    ) {
      catKey = 'workspace_project';
    } else if (perm.key.startsWith('board.') || perm.key.startsWith('reports.')) {
      catKey = 'board_list';
    }

    const targetCategory = categories[catKey] ?? categories.task_card!;
    targetCategory.items.push({
      key: perm.key,
      description: perm.description || perm.key,
      granted: isGranted,
    });
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: rawRole,
      roleTitle,
      isPlatformAdmin: user.isPlatformAdmin,
    },
    totalGranted: grantedKeys.size,
    totalPermissions: allPerms.length,
    categories,
  };
}
