import { eq, and, isNull, gte, desc } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import type { Database } from '../../db/index';
import {
  organizations,
  organizationMembers,
  users,
  workspaceMembers,
  workspaces,
  invitations,
  auditLog,
} from '../../db/schema/index';
import { sendEmail } from '../../lib/email';
import { logger } from '../../lib/logger';
import { renderInviteEmail } from '../../lib/emailTemplates';
import { checkAndReserveSeatSlot } from '../billing/service';
import { errorMessage, errorStatus } from '../../lib/errors';
import type { RefreshContext } from '../auth/service';
import { httpError, ALLOWED_ORG_ROLES, type AllowedOrgRole, hashInviteToken } from './org-common';

// ─── inviteMember ───────────────────────────────────────────────────────────────────
export async function inviteMember(
  db: Database,
  orgId: string,
  email: string,
  role: string,
  invitedBy: string,
  name?: string,
  workspaceIds?: string[]
) {
  const normalizedEmail = email?.toLowerCase().trim();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw httpError(400, 'Please provide a valid email address.');
  }

  const normalizedRole = (role?.toLowerCase().trim() || 'member') as AllowedOrgRole;
  if (!ALLOWED_ORG_ROLES.includes(normalizedRole)) {
    throw httpError(
      400,
      `Invalid organization role: "${role}". Allowed roles are: Org Admin (org_admin), Member (member), Viewer (viewer), Workspace Admin (workspace_admin), Billing Manager (billing_manager), Org Owner (org_owner).`
    );
  }

  // Verify that the organization exists
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1);

  if (!org) {
    throw httpError(404, 'Organization not found.');
  }

  // Resolve inviter name
  let inviterName = 'A team member';
  if (invitedBy) {
    const [actor] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, invitedBy))
      .limit(1);
    if (actor?.name) inviterName = actor.name;
  }

  // Validate workspace IDs if provided
  let validWorkspaceIds: string[] = [];
  if (workspaceIds && workspaceIds.length > 0) {
    const existingWorkspaces = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.organizationId, orgId), isNull(workspaces.deletedAt)));
    const validSet = new Set(existingWorkspaces.map((w) => w.id));
    validWorkspaceIds = workspaceIds.filter((id) => validSet.has(id));
  }

  // Check seat capacity and guest quotas
  const seatCheck = await checkAndReserveSeatSlot(orgId, normalizedRole);
  if (!seatCheck.allowed) {
    if (seatCheck.requiresProration) {
      throw httpError(
        402,
        seatCheck.message || 'Seat limit reached. Adding a billable member requires seat expansion.'
      );
    }
    if (seatCheck.requiresGuestOverage) {
      throw httpError(402, seatCheck.message || 'Guest limit reached on your plan.');
    }
  }

  const result = await db.transaction(async (tx) => {
    let [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

    const isExistingUser = !!user;

    // If user does not exist, provision a skeleton account
    if (!user) {
      const fallbackName = name?.trim() || normalizedEmail.split('@')[0] || 'User';
      const [newUser] = await tx
        .insert(users)
        .values({
          name: fallbackName as string,
          email: normalizedEmail,
          passwordHash: null,
        })
        .returning();
      user = newUser;
    } else if (name && name.trim() && user.name === user.email.split('@')[0]) {
      const [updatedUser] = await tx
        .update(users)
        .set({ name: name.trim(), updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      if (updatedUser) user = updatedUser;
    }

    if (!user) {
      throw httpError(500, 'Failed to provision user profile.');
    }

    // Check if member already in org
    const [existingMember] = await tx
      .select()
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, user.id))
      )
      .limit(1);

    if (existingMember && !existingMember.deletedAt && existingMember.status === 'active') {
      throw httpError(
        409,
        `User "${normalizedEmail}" is already an active member of this organization.`
      );
    }

    const initialStatus = 'invited';

    let memberRecord: any = null;

    if (existingMember) {
      const [restored] = await tx
        .update(organizationMembers)
        .set({
          role: normalizedRole,
          status: initialStatus,
          deletedAt: null,
          deactivationReason: null,
          deactivatedBy: null,
          invitedBy: invitedBy || null,
          updatedAt: new Date(),
        })
        .where(eq(organizationMembers.id, existingMember.id))
        .returning();
      memberRecord = restored;
    } else {
      const [newMember] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: orgId,
          userId: user.id,
          role: normalizedRole,
          status: initialStatus,
          invitedBy: invitedBy || null,
        })
        .returning();
      memberRecord = newMember;
    }

    if (!memberRecord) {
      throw httpError(500, 'Failed to save organization member record.');
    }

    // Assign initial workspaces if provided — one multi-row insert instead of one
    // round trip per workspace, all inside the invitation transaction.
    if (validWorkspaceIds.length > 0) {
      await tx
        .insert(workspaceMembers)
        .values(
          validWorkspaceIds.map((wsId) => ({
            workspaceId: wsId,
            userId: user.id,
            role: 'member' as const,
          }))
        )
        .onConflictDoNothing();
    }

    // Create invitation record
    const inviteToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await tx
      .insert(invitations)
      .values({
        organizationId: orgId,
        email: normalizedEmail,
        role: normalizedRole,
        token: hashInviteToken(inviteToken),
        status: 'pending',
        invitedByUserId: invitedBy || null,
        invitedByName: inviterName,
        expiresAt,
      })
      .catch(() => {});

    // Log to audit log
    if (invitedBy) {
      await tx
        .insert(auditLog)
        .values({
          organizationId: orgId,
          actorId: invitedBy,
          action: 'member.invite',
          target: normalizedEmail,
          targetId: memberRecord.id,
          metadata: { role: normalizedRole, name: user.name, emailSent: true },
        })
        .catch(() => {});
    }

    return {
      ...memberRecord,
      inviteToken,
      isExistingUser,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    };
  });

  // Fire-and-forget email send (after transaction commits)
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  const inviteUrl = `${appUrl}/invite?token=${result.inviteToken}`;

  sendEmail({
    to: normalizedEmail,
    toName: result.user.name,
    subject: (
      await renderInviteEmail({
        toName: result.user.name,
        toEmail: normalizedEmail,
        inviterName,
        orgName: org.name,
        role: normalizedRole,
        inviteUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    ).subject,
    html: (
      await renderInviteEmail({
        toName: result.user.name,
        toEmail: normalizedEmail,
        inviterName,
        orgName: org.name,
        role: normalizedRole,
        inviteUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    ).html,
    text: (
      await renderInviteEmail({
        toName: result.user.name,
        toEmail: normalizedEmail,
        inviterName,
        orgName: org.name,
        role: normalizedRole,
        inviteUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    ).text,
  }).catch((err: unknown) => logger.error({ err }, 'Invite email send failed silently'));

  return result;
}

// ─── bulkInviteMembers ────────────────────────────────────────────────────────
export async function bulkInviteMembers(
  db: Database,
  orgId: string,
  invites: Array<{ email: string; name?: string; role?: string; workspaceIds?: string[] }>,
  invitedBy: string
) {
  const successful: any[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const item of invites) {
    const emailStr = (item.email || '').trim();
    try {
      if (!emailStr || !emailStr.includes('@')) {
        failed.push({ email: emailStr || 'Unknown', error: 'Invalid email address provided.' });
        continue;
      }
      const member = await inviteMember(
        db,
        orgId,
        emailStr,
        item.role || 'member',
        invitedBy,
        item.name,
        item.workspaceIds
      );
      successful.push(member);
    } catch (err: unknown) {
      const status = errorStatus(err);
      const message = errorMessage(err, '');
      const errMsg =
        status !== undefined && status < 500 && message ? message : 'Failed to invite user.';
      failed.push({ email: emailStr, error: errMsg });
    }
  }

  return {
    total: invites.length,
    successfulCount: successful.length,
    failedCount: failed.length,
    successful,
    failed,
  };
}

// ─── listPendingInvitations ─────────────────────────────────────────────────────────────
export async function listPendingInvitations(db: Database, orgId: string) {
  const now = new Date();
  const list = await db
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      invitedByName: invitations.invitedByName,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(and(eq(invitations.organizationId, orgId), gte(invitations.expiresAt, now)))
    .orderBy(desc(invitations.createdAt));

  return list.map((row) => ({ ...row, token: '' }));
}

// ─── resendInvitation ─────────────────────────────────────────────────────────────────
export async function resendInvitation(
  db: Database,
  orgId: string,
  invitationId: string,
  actorId: string
) {
  const newToken = randomBytes(32).toString('hex');
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(invitations)
    .set({
      token: hashInviteToken(newToken),
      expiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, orgId)))
    .returning();

  if (!updated) throw httpError(404, 'Invitation not found');

  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'member.invitation.resend',
    target: updated.email,
    targetId: updated.id,
    metadata: { role: updated.role },
  });

  return { ...updated, token: newToken };
}

// ─── revokeInvitation ─────────────────────────────────────────────────────────
export async function revokeInvitation(
  db: Database,
  orgId: string,
  invitationId: string,
  actorId: string
) {
  const [deleted] = await db
    .delete(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, orgId)))
    .returning();

  if (!deleted) throw httpError(404, 'Invitation not found');

  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'member.invitation.revoke',
    target: deleted.email,
    targetId: deleted.id,
  });

  return { success: true };
}

// ─── previewInvitation ───────────────────────────────────────────────────────
export async function previewInvitation(db: Database, token: string) {
  const now = new Date();
  const [invite] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      invitedByName: invitations.invitedByName,
      expiresAt: invitations.expiresAt,
      organizationId: invitations.organizationId,
    })
    .from(invitations)
    .where(eq(invitations.token, hashInviteToken(token)))
    .limit(1);

  if (!invite)
    throw httpError(404, 'Invitation not found. It may have been revoked or never existed.');
  if (invite.status === 'accepted')
    throw httpError(410, 'This invitation has already been accepted.');
  if (invite.status === 'revoked')
    throw httpError(410, 'This invitation has been revoked by an admin.');
  if (invite.expiresAt < now)
    throw httpError(
      410,
      'This invitation has expired. Please contact your admin for a new invite.'
    );

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId))
    .limit(1);

  const [existingUser] = await db
    .select({ id: users.id, name: users.name, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.email, invite.email), isNull(users.deletedAt)))
    .limit(1);

  return {
    email: invite.email,
    role: invite.role,
    status: invite.status,
    inviterName: invite.invitedByName ?? 'A team member',
    orgName: org?.name ?? 'Unknown Organization',
    orgSlug: org?.slug ?? '',
    expiresAt: invite.expiresAt,
    isExistingUser: !!existingUser,
    hasPassword: !!existingUser?.passwordHash,
  };
}

// ─── acceptInvitation ────────────────────────────────────────────────────────
export async function acceptInvitation(
  db: Database,
  token: string,
  name?: string,
  password?: string,
  ctx: RefreshContext = {}
) {
  const now = new Date();

  const [invite] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, hashInviteToken(token)))
    .limit(1);

  if (!invite) throw httpError(404, 'Invitation not found.');
  if (invite.status === 'accepted')
    throw httpError(410, 'This invitation has already been accepted.');
  if (invite.status === 'revoked') throw httpError(410, 'This invitation has been revoked.');
  if (invite.expiresAt < now) throw httpError(410, 'This invitation has expired.');

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, invite.email), isNull(users.deletedAt)))
    .limit(1);

  if (!user) throw httpError(404, 'User account not found for this invitation.');

  const hasExistingPassword = !!(user.passwordHash && user.passwordHash.trim().length > 0);

  // New users must set a password; existing users skip password step
  if (!hasExistingPassword) {
    if (!password || password.length < 8) {
      throw httpError(400, 'Password must be at least 8 characters long.');
    }
  }

  // Hash BEFORE opening the transaction: bcrypt at cost 10 is ~100ms of pure CPU,
  // and it used to run inside db.transaction(), pinning a pooled connection for
  // the duration of a deliberately slow operation.
  let passwordHash: string | null = null;
  if (!hasExistingPassword && password) {
    passwordHash = await Bun.password.hash(password, {
      algorithm: 'bcrypt',
      cost: 10,
    });
  }

  await db.transaction(async (tx) => {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name?.trim() && name.trim() !== user.name) updateData.name = name.trim();
    if (passwordHash) {
      updateData.passwordHash = passwordHash;
    }
    await tx.update(users).set(updateData).where(eq(users.id, user.id));

    // Activate membership
    await tx
      .update(organizationMembers)
      .set({ status: 'active', updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.userId, user.id)
        )
      );

    // Mark invitation accepted
    await tx
      .update(invitations)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(invitations.id, invite.id));

    // Audit log
    await tx
      .insert(auditLog)
      .values({
        organizationId: invite.organizationId,
        actorId: user.id,
        action: 'member.invite.accepted',
        target: user.email,
        targetId: user.id,
        metadata: { role: invite.role },
      })
      .catch(() => {});
  });

  // Auto-issue tokens for immediate login
  const { issueTokenPair } = await import('../auth/service');
  const tokens = await issueTokenPair(
    db,
    user.id,
    invite.organizationId,
    user.isPlatformAdmin ?? false,
    {
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    }
  );

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: user.id,
      name: (name?.trim() || user.name) ?? user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
    },
    organizationId: invite.organizationId,
    role: invite.role,
  };
}
