import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  users,
  organizations,
  organizationMembers,
  invitations,
  auditLog,
} from '../../db/schema/index';
import { httpError, type RefreshContext } from './auth-common';
import { issueTokenPair } from './auth-tokens';

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
    throw httpError(
      410,
      'This invitation link has expired. Please ask your administrator to resend the invite.'
    );
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
      hasPassword: Boolean(
        existingUser?.passwordHash && existingUser.passwordHash.trim().length > 0
      ),
    },
  };
}

// ─── acceptInvitation ─────────────────────────────────────────────────────────
export interface AcceptInvitationInput {
  token: string;
  name?: string;
  password?: string;
}

export async function acceptInvitation(
  db: Database,
  input: AcceptInvitationInput,
  ctx: RefreshContext = {}
) {
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
    throw httpError(
      410,
      'This invitation link has expired. Please ask your administrator to resend the invite.'
    );
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

  // Hash BEFORE opening the transaction: bcrypt at cost 12 is ~300ms of CPU,
  // and it used to hold a pooled connection for the whole hash.
  let passwordHash: string | undefined;
  if (password && password.trim().length > 0) {
    if (password.length < 8) {
      throw httpError(400, 'Password must be at least 8 characters long.');
    }
    passwordHash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 12 });
  }

  const user = await db.transaction(async (tx) => {
    let [existingUser] = await tx
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
      .limit(1);

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
      await tx.insert(organizationMembers).values({
        organizationId: invitation.organizationId,
        userId: existingUser.id,
        role: invitation.role,
        status: 'active',
      });
    }

    // Delete the consumed invitation
    await tx.delete(invitations).where(eq(invitations.token, token.trim()));

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
  const tokens = await issueTokenPair(
    db,
    user.id,
    invitation.organizationId,
    user.isPlatformAdmin ?? false,
    { userAgent: ctx.userAgent, ip: ctx.ip }
  );

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
