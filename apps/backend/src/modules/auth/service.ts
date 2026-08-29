/**
 * Auth service — sign-up, sign-in, token refresh, sign-out, getMe.
 *
 * All DB interactions accept an explicit `db` parameter so tests can inject
 * the test database without monkey-patching the module-level singleton.
 */
import { eq, and, isNull, gt } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import type { Database } from '../../db/index';
import {
  users,
  organizations,
  organizationMembers,
  refreshTokens as refreshTokensTable,
  invitations,
  auditLog,
} from '../../db/schema/index';
import { signAccessToken } from '../../middleware/auth';
import { env } from '../../lib/env';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseExpiresIn(duration: string): Date {
  const now = Date.now();
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const [, amount, unit] = match;
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return new Date(now + Number(amount) * (multipliers[unit!] ?? 0));
}

export async function issueTokenPair(db: Database, userId: string, organizationId: string, isPlatformAdmin: boolean = false) {
  const accessToken = await signAccessToken({ userId, organizationId, isPlatformAdmin });

  // Opaque refresh token — store its hash in DB
  const rawRefreshToken = randomBytes(48).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = parseExpiresIn(env.REFRESH_TOKEN_EXPIRES_IN);

  await db.insert(refreshTokensTable).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

// ─── signUp ───────────────────────────────────────────────────────────────────
export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  orgName: string;
  orgSlug: string;
}

export async function signUp(db: Database, input: SignUpInput) {
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

  // Create user + org + membership in a transaction
  const result = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({ name, email: email.toLowerCase(), passwordHash })
      .returning();

    const [newOrg] = await tx
      .insert(organizations)
      .values({ name: orgName, slug: orgSlug })
      .returning();

    await tx.insert(organizationMembers).values({
      organizationId: newOrg!.id,
      userId: newUser!.id,
      role: 'org_owner',
      status: 'active',
    });

    return { user: newUser!, organization: newOrg! };
  });

  const tokens = await issueTokenPair(db, result.user.id, result.organization.id, result.user.isPlatformAdmin);

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

export async function signIn(db: Database, input: SignInInput) {
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
    .where(
      and(
        eq(organizationMembers.userId, user.id),
        isNull(organizationMembers.deletedAt)
      )
    )
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
  const tokens = await issueTokenPair(db, user.id, organizationId, user.isPlatformAdmin);

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

// ─── refreshTokens ────────────────────────────────────────────────────────────
export async function refreshTokens(db: Database, rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(
      and(
        eq(refreshTokensTable.tokenHash, tokenHash),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!stored) {
    throw httpError(401, 'Invalid or expired refresh token');
  }

  // Rotate: revoke old token
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: now })
    .where(eq(refreshTokensTable.id, stored.id));

  // Get user + org context
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);

  if (!user) {
    throw httpError(401, 'User not found');
  }

  if (user.deactivatedAt) {
    throw httpError(403, 'Your account has been deactivated.');
  }

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId, status: organizationMembers.status })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, user.id), isNull(organizationMembers.deletedAt)))
    .limit(1);

  if (membership && membership.status === 'deactivated') {
    throw httpError(403, 'Your account in this organization has been deactivated.');
  }

  const organizationId = membership?.organizationId ?? '';
  return issueTokenPair(db, user.id, organizationId, user.isPlatformAdmin);
}

// ─── signOut ──────────────────────────────────────────────────────────────────
export async function signOut(db: Database, rawToken: string, _userId: string) {
  const tokenHash = hashToken(rawToken);
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.tokenHash, tokenHash));
}

// ─── getMe ────────────────────────────────────────────────────────────────────
export async function getMe(db: Database, userId: string) {
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
    .where(
      and(
        eq(organizationMembers.userId, userId),
        isNull(organizationMembers.deletedAt)
      )
    )
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

  return await getMe(db, userId);
}

// ─── changePassword ────────────────────────────────────────────────────────
export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
}

export async function changePassword(db: Database, userId: string, input: ChangePasswordInput) {
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

  const newHash = await Bun.password.hash(input.newPassword, { algorithm: 'bcrypt', cost: 10 });
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));
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
  const roleTitle =
    user.isPlatformAdmin
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
  const { permissions: permsTable, roles: rolesTable, rolePermissions: rpTable } = await import('../../db/schema/index');
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
      .where(eq(rolesTable.name, matchedRoleName));

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
    { label: string; icon: string; items: Array<{ key: string; description: string; granted: boolean }> }
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

// ─── getInvitationInfo ────────────────────────────────────────────────────────
export async function getInvitationInfo(db: Database, token: string) {
  if (!token || !token.trim()) {
    throw httpError(400, 'Invitation token is required.');
  }

  const [invitation] = await db
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      email: invitations.email,
      role: invitations.role,
      token: invitations.token,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(eq(invitations.token, token.trim()))
    .limit(1);

  if (!invitation) {
    throw httpError(404, 'Invitation not found or link has already been used.');
  }

  const now = new Date();
  if (invitation.expiresAt < now) {
    throw httpError(410, 'This invitation link has expired. Please ask your administrator to resend the invite.');
  }

  // Fetch organization info
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      logoUrl: organizations.logoUrl,
      primaryColor: organizations.primaryColor,
    })
    .from(organizations)
    .where(eq(organizations.id, invitation.organizationId))
    .limit(1);

  if (!org) {
    throw httpError(404, 'Organization associated with this invitation was not found.');
  }

  // Check if a user with this email already exists
  const [existingUser] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, invitation.email.toLowerCase()))
    .limit(1);

  return {
    valid: true,
    token: invitation.token,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      primaryColor: org.primaryColor,
    },
    user: {
      id: existingUser?.id ?? null,
      name: existingUser?.name ?? null,
      hasPassword: Boolean(existingUser?.passwordHash && existingUser.passwordHash.trim().length > 0),
    },
  };
}

// ─── acceptInvitation ─────────────────────────────────────────────────────────
export interface AcceptInvitationInput {
  token: string;
  name?: string;
  password?: string;
}

export async function acceptInvitation(db: Database, input: AcceptInvitationInput) {
  const { token, name, password } = input;
  if (!token || !token.trim()) {
    throw httpError(400, 'Invitation token is required.');
  }

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, token.trim()))
    .limit(1);

  if (!invitation) {
    throw httpError(404, 'Invitation not found or link has already been used.');
  }

  const now = new Date();
  if (invitation.expiresAt < now) {
    throw httpError(410, 'This invitation link has expired. Please ask your administrator to resend the invite.');
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, invitation.organizationId))
    .limit(1);

  if (!org) {
    throw httpError(404, 'Organization associated with this invitation was not found.');
  }

  const normalizedEmail = invitation.email.toLowerCase().trim();

  const user = await db.transaction(async (tx) => {
    let [existingUser] = await tx
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    let passwordHash: string | undefined;
    if (password && password.trim().length > 0) {
      if (password.length < 8) {
        throw httpError(400, 'Password must be at least 8 characters long.');
      }
      passwordHash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 12 });
    }

    if (!existingUser) {
      if (!passwordHash) {
        throw httpError(400, 'Please set a password for your new account.');
      }
      const fallbackName = normalizedEmail.split('@')[0] || 'User';
      const [newUser] = await tx
        .insert(users)
        .values({
          name: name?.trim() || fallbackName,
          email: normalizedEmail,
          passwordHash,
        })
        .returning();
      existingUser = newUser!;
    } else {
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (name && name.trim()) updateData.name = name.trim();
      if (passwordHash) updateData.passwordHash = passwordHash;

      const [updatedUser] = await tx
        .update(users)
        .set(updateData)
        .where(eq(users.id, existingUser.id))
        .returning();
      if (updatedUser) existingUser = updatedUser;
    }

    // Upsert or update organization membership to active
    const [existingMember] = await tx
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invitation.organizationId),
          eq(organizationMembers.userId, existingUser.id)
        )
      )
      .limit(1);

    if (existingMember) {
      await tx
        .update(organizationMembers)
        .set({
          role: invitation.role,
          status: 'active',
          deletedAt: null,
          deactivationReason: null,
          deactivatedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(organizationMembers.id, existingMember.id));
    } else {
      await tx
        .insert(organizationMembers)
        .values({
          organizationId: invitation.organizationId,
          userId: existingUser.id,
          role: invitation.role,
          status: 'active',
        });
    }

    // Delete the consumed invitation
    await tx
      .delete(invitations)
      .where(eq(invitations.token, token.trim()));

    // Audit log
    await tx
      .insert(auditLog)
      .values({
        organizationId: invitation.organizationId,
        actorId: existingUser.id,
        action: 'member.invitation.accept',
        target: normalizedEmail,
        targetId: existingUser.id,
        metadata: { role: invitation.role, name: existingUser.name },
      })
      .catch(() => {});

    return existingUser;
  });

  // Issue access + refresh token pair
  const tokens = await issueTokenPair(db, user.id, invitation.organizationId, user.isPlatformAdmin ?? false);

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: org.id,
      role: invitation.role,
      isPlatformAdmin: user.isPlatformAdmin ?? false,
      avatarUrl: user.avatarUrl ?? null,
      timezone: user.timezone ?? 'UTC',
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      createdAt: user.createdAt,
    },
    organization: {
      id: org.id,
      slug: org.slug,
      name: org.name,
    },
  };
}

