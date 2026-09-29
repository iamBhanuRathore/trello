import { eq, and, isNull, or, ilike, asc, desc, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import type { Database } from '../../db/index';
import {
  organizations,
  organizationMembers,
  users,
  workspaceMembers,
  workspaces,
  cards,
  cardAssignees,
  timeLogs,
  invitations,
  refreshTokens,
  auditLog,
} from '../../db/schema/index';
import { sendEmail } from '../../lib/email';
import { logger } from '../../lib/logger';
import { cachedTTL, invalidateTTL, bumpOrgCache } from '../../lib/cache';
import {
  renderInviteEmail,
  renderAccountDeactivatedEmail,
  renderAccountReactivatedEmail,
} from '../../lib/emailTemplates';
import { checkAndReserveSeatSlot } from '../billing/service';
import { httpError, errorMessage, errorStatus } from '../../lib/errors';
export { httpError };

export const ALLOWED_ORG_ROLES = [
  'org_owner',
  'org_admin',
  'billing_manager',
  'workspace_admin',
  'member',
  'viewer',
] as const;

export type AllowedOrgRole = (typeof ALLOWED_ORG_ROLES)[number];

/** Invite bearer tokens are sha256-hashed at rest (same convention as refresh tokens). */
function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── getOrg ───────────────────────────────────────────────────────────────────
export async function getOrg(db: Database, orgId: string) {
  const { data } = await cachedTTL(`org:${orgId}`, 60, () => loadOrg(db, orgId));
  return data;
}

async function loadOrg(db: Database, orgId: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1);

  if (!org) throw httpError(404, 'Organization not found');

  // Fetch plan if it exists
  let plan = null;
  if (org.planId) {
    const { plans } = await import('../../db/schema/index');
    const [p] = await db.select().from(plans).where(eq(plans.id, org.planId)).limit(1);
    plan = p || null;
  }

  return { ...org, plan };
}

// ─── updateOrg ────────────────────────────────────────────────────────────────
export async function updateOrg(
  db: Database,
  orgId: string,
  input: { name?: string; logoUrl?: string | null; primaryColor?: string | null }
) {
  // Explicit pick: never spread caller input into .set() (mass-assignment).
  const [org] = await db
    .update(organizations)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .returning();

  if (!org) throw httpError(404, 'Organization not found');
  await invalidateTTL(`org:${orgId}`);
  await bumpOrgCache(orgId);
  return org;
}

export interface ListMembersOptions {
  search?: string;
  limit?: number;
  offset?: number;
  role?: string;
  status?: string;
  userIds?: string[];
}

function buildMemberConditions(orgId: string, options: ListMembersOptions = {}): SQL[] {
  const conditions: SQL[] = [
    eq(organizationMembers.organizationId, orgId),
    isNull(organizationMembers.deletedAt),
  ];

  if (options.role) {
    if (options.role === 'admin') {
      conditions.push(
        inArray(organizationMembers.role, ['org_owner', 'org_admin', 'workspace_admin'])
      );
    } else if ((ALLOWED_ORG_ROLES as readonly string[]).includes(options.role)) {
      conditions.push(eq(organizationMembers.role, options.role as any));
    }
  }

  if (options.status && options.status !== 'all') {
    conditions.push(eq(organizationMembers.status, options.status as any));
  }

  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term)) as SQL);
  }

  if (options.userIds && options.userIds.length > 0) {
    conditions.push(inArray(organizationMembers.userId, options.userIds));
  }

  return conditions;
}

// ─── listMembers ──────────────────────────────────────────────────────────────
export async function listMembers(db: Database, orgId: string, options: ListMembersOptions = {}) {
  const key = `m:${orgId}:${options.search ?? ''}:${options.role ?? ''}:${options.status ?? ''}:${options.limit ?? ''}:${options.offset ?? ''}`;
  const { data } = await cachedTTL(key, 30, () => loadMembers(db, orgId, options));
  return data;
}

async function loadMembers(db: Database, orgId: string, options: ListMembersOptions = {}) {
  const conditions = buildMemberConditions(orgId, options);

  let query = db
    .select({
      id: organizationMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: organizationMembers.role,
      status: organizationMembers.status,
      joinedAt: organizationMembers.createdAt,
      lastLoginAt: users.lastLoginAt,
      lastActiveAt: organizationMembers.lastActiveAt,
      deactivationReason: organizationMembers.deactivationReason,
      deactivatedBy: organizationMembers.deactivatedBy,
      invitedBy: organizationMembers.invitedBy,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(...conditions))
    .orderBy(asc(users.name));

  if (options.limit) {
    query = query.limit(options.limit) as any;
  }
  if (options.offset) {
    query = query.offset(options.offset) as any;
  }

  return await query;
}

// ─── countMembers ─────────────────────────────────────────────────────────────
export async function countMembers(
  db: Database,
  orgId: string,
  options: Omit<ListMembersOptions, 'limit' | 'offset'> = {}
): Promise<number> {
  const conditions = buildMemberConditions(orgId, options);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(...conditions));

  return result?.count ?? 0;
}

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

    // If user does not exist, provision a skeleton account (no password — they set it during onboarding)
    if (!user) {
      const fallbackName = name?.trim() || normalizedEmail.split('@')[0] || 'User';
      const [newUser] = await tx
        .insert(users)
        .values({
          name: fallbackName as string,
          email: normalizedEmail,
          passwordHash: null, // No default password — user sets it during onboarding
        })
        .returning();
      user = newUser;
    } else if (name && name.trim() && user.name === user.email.split('@')[0]) {
      // Update name if it was previously just the email username fallback
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

    // For existing Boardly users being invited to a new org, set them pending (they confirm via wizard)
    // For brand-new users, they must go through onboarding
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

    // Assign initial workspaces if provided
    if (validWorkspaceIds.length > 0) {
      for (const wsId of validWorkspaceIds) {
        await tx
          .insert(workspaceMembers)
          .values({
            workspaceId: wsId,
            userId: user.id,
            role: 'member',
          })
          .onConflictDoNothing();
      }
    }

    // Create invitation record — the raw token goes into the email link only;
    // storage holds its sha256 so a DB dump can't be replayed as invites.
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
      .catch(() => {}); // Ignore duplicate invite token race

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

  // Token hashes are never exposed; admins copy links via create/resend (show-once).
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

// ─── updateMemberRole ─────────────────────────────────────────────────────────
export async function updateMemberRole(
  db: Database,
  orgId: string,
  memberId: string,
  role: string,
  actorId?: string
) {
  const [member] = await db
    .update(organizationMembers)
    .set({ role: role as any, updatedAt: new Date() })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .returning();

  if (!member) throw httpError(404, 'Member not found');

  if (actorId) {
    await db.insert(auditLog).values({
      organizationId: orgId,
      actorId,
      action: 'member.role.update',
      target: memberId,
      targetId: member.id,
      metadata: { newRole: role },
    });
  }

  return member;
}

// ─── deactivateMember (Soft Delete) ───────────────────────────────────────────
export async function deactivateMember(
  db: Database,
  orgId: string,
  memberId: string,
  actorId: string,
  reason?: string
) {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  // Prevent self-deactivation or deactivation of the last owner if critical
  if (member.userId === actorId) {
    throw httpError(400, 'You cannot deactivate your own account.');
  }

  const [updated] = await db
    .update(organizationMembers)
    .set({
      status: 'deactivated',
      deactivationReason: reason || 'Deactivated by administrator',
      deactivatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(organizationMembers.id, memberId))
    .returning();

  // Invalidate any active refresh tokens for this user so current sessions are revoked
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, member.userId), isNull(refreshTokens.revokedAt)));

  // Write to audit log
  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'member.deactivate',
    target: member.userId,
    targetId: member.id,
    metadata: { reason: reason || 'No reason provided' },
  });

  // Asynchronously dispatch deactivation notice email (fire-and-forget)
  (async () => {
    try {
      const [targetUser] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, member.userId))
        .limit(1);

      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      let adminName = 'An administrator';
      if (actorId) {
        const [actor] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, actorId))
          .limit(1);
        if (actor?.name) adminName = actor.name;
      }

      if (targetUser?.email) {
        const orgName = org?.name || 'Boardly';
        const emailContent = renderAccountDeactivatedEmail({
          toName: targetUser.name,
          toEmail: targetUser.email,
          orgName,
          adminName,
          reason,
        });

        await sendEmail({
          to: targetUser.email,
          toName: targetUser.name,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Deactivation email notification failed silently');
    }
  })();

  // Flag project automation rules that pool this user (needs_attention).
  const { flagStaleRules } = await import('../automations/project-engine');
  await flagStaleRules(db, orgId, 'user', member.userId).catch(() => {});

  return updated;
}

// ─── reactivateMember ─────────────────────────────────────────────────────────
export async function reactivateMember(
  db: Database,
  orgId: string,
  memberId: string,
  actorId: string
) {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  const [updated] = await db
    .update(organizationMembers)
    .set({
      status: 'active',
      deactivationReason: null,
      deactivatedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(organizationMembers.id, memberId))
    .returning();

  // Write to audit log
  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'member.reactivate',
    target: member.userId,
    targetId: member.id,
  });

  // Asynchronously dispatch reactivation notice email (fire-and-forget)
  (async () => {
    try {
      const [targetUser] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, member.userId))
        .limit(1);

      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      let adminName = 'An administrator';
      if (actorId) {
        const [actor] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, actorId))
          .limit(1);
        if (actor?.name) adminName = actor.name;
      }

      if (targetUser?.email) {
        const orgName = org?.name || 'Boardly';
        const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
        const loginUrl = `${appUrl}/sign-in`;

        const emailContent = renderAccountReactivatedEmail({
          toName: targetUser.name,
          toEmail: targetUser.email,
          orgName,
          adminName,
          loginUrl,
        });

        await sendEmail({
          to: targetUser.email,
          toName: targetUser.name,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Reactivation email notification failed silently');
    }
  })();

  return updated;
}

// ─── forceLogoutUser ──────────────────────────────────────────────────────────
export async function forceLogoutUser(
  db: Database,
  orgId: string,
  memberId: string,
  actorId: string
) {
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  // Invalidate all refresh tokens for this user
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, member.userId), isNull(refreshTokens.revokedAt)));

  await db.insert(auditLog).values({
    organizationId: orgId,
    actorId,
    action: 'user.force_logout',
    target: member.userId,
    targetId: member.id,
    metadata: { memberId },
  });

  return { success: true, message: 'All active sessions for user have been terminated.' };
}

// ─── getMemberActivitySummary ─────────────────────────────────────────────────
export async function getMemberActivitySummary(db: Database, orgId: string, memberId: string) {
  const [member] = await db
    .select({
      id: organizationMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: organizationMembers.role,
      status: organizationMembers.status,
      lastLoginAt: users.lastLoginAt,
      lastActiveAt: organizationMembers.lastActiveAt,
      deactivationReason: organizationMembers.deactivationReason,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, orgId)))
    .limit(1);

  if (!member) throw httpError(404, 'Member not found');

  // 1. Workspace memberships within this org
  const userWorkspaces = await db
    .select({
      workspaceId: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, member.userId),
        eq(workspaces.organizationId, orgId),
        isNull(workspaces.deletedAt)
      )
    );

  // 2. Assigned cards count
  const assignedCards = await db
    .select({
      cardId: cards.id,
      isArchived: cards.isArchived,
    })
    .from(cardAssignees)
    .innerJoin(cards, eq(cards.id, cardAssignees.cardId))
    .where(
      and(
        eq(cardAssignees.userId, member.userId),
        eq(cards.organizationId, orgId),
        isNull(cards.deletedAt)
      )
    );

  const totalCards = assignedCards.length;
  const activeCards = assignedCards.filter((c) => !c.isArchived).length;
  const archivedCards = assignedCards.filter((c) => c.isArchived).length;

  // 3. Time logged in past 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]!;

  const logs = await db
    .select({
      minutes: timeLogs.minutes,
      isBillable: timeLogs.isBillable,
    })
    .from(timeLogs)
    .innerJoin(cards, eq(cards.id, timeLogs.cardId))
    .where(
      and(
        eq(timeLogs.userId, member.userId),
        eq(cards.organizationId, orgId),
        gte(timeLogs.loggedDate, thirtyDaysAgoStr)
      )
    );

  const totalMinutes = logs.reduce((acc, l) => acc + (l.minutes || 0), 0);
  const billableMinutes = logs
    .filter((l) => l.isBillable)
    .reduce((acc, l) => acc + (l.minutes || 0), 0);

  return {
    member,
    workspaces: userWorkspaces,
    stats: {
      totalCardsAssigned: totalCards,
      activeCardsCount: activeCards,
      archivedCardsCount: archivedCards,
      timeLogged30dHours: Number((totalMinutes / 60).toFixed(1)),
      billableTime30dHours: Number((billableMinutes / 60).toFixed(1)),
    },
  };
}

// ─── removeMember (Soft Delete) ───────────────────────────────────────────────
export async function removeMember(
  db: Database,
  orgId: string,
  memberId: string,
  actorId?: string
) {
  const [member] = await db
    .update(organizationMembers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        or(eq(organizationMembers.id, memberId), eq(organizationMembers.userId, memberId)),
        eq(organizationMembers.organizationId, orgId)
      )
    )
    .returning();

  if (!member) throw httpError(404, 'Member not found');

  if (actorId) {
    await db.insert(auditLog).values({
      organizationId: orgId,
      actorId,
      action: 'member.remove',
      target: member.userId,
      targetId: member.id,
    });
  }

  return member;
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
  password?: string
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

  await db.transaction(async (tx) => {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name?.trim() && name.trim() !== user.name) updateData.name = name.trim();
    if (!hasExistingPassword && password) {
      updateData.passwordHash = await Bun.password.hash(password, {
        algorithm: 'bcrypt',
        cost: 10,
      });
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
  const tokens = await issueTokenPair(db, user.id, invite.organizationId);

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
