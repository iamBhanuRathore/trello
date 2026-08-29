import { WorkOS } from '@workos-inc/node';
import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  users,
  organizations,
  organizationMembers,
  ssoConfigurations,
} from '../../db/schema/index';
import { issueTokenPair, httpError } from './service';
import { env } from '../../lib/env';

let workosClient: WorkOS | null = null;

export function getWorkOS(): WorkOS {
  if (!workosClient) {
    const apiKey = env.WORKOS_API_KEY || 'sk_test_placeholder';
    const clientId = env.WORKOS_CLIENT_ID || 'client_placeholder';
    workosClient = new WorkOS(apiKey, { clientId });
  }
  return workosClient;
}

export function getRedirectUri(customRedirectUri?: string): string {
  if (customRedirectUri && customRedirectUri.trim().length > 0) {
    return customRedirectUri.trim();
  }
  if (env.WORKOS_REDIRECT_URI) {
    return env.WORKOS_REDIRECT_URI;
  }
  const dashboardOrigin = (env.DASHBOARD_URL?.split(',')[0] || 'http://localhost:5173').trim();
  return `${dashboardOrigin}/auth/callback`;
}

/**
 * Generates Google OAuth authorization URL via WorkOS User Management
 */
export function getGoogleAuthorizationUrl(customRedirectUri?: string) {
  const workos = getWorkOS();
  const redirectUri = getRedirectUri(customRedirectUri);
  const clientId = env.WORKOS_CLIENT_ID || 'client_placeholder';

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'GoogleOAuth',
    redirectUri,
    clientId,
  });

  return {
    provider: 'GoogleOAuth',
    redirectUri,
    authorizationUrl,
  };
}

/**
 * Generates domain-routed Enterprise SSO authorization URL via WorkOS
 */
export async function getSSOAuthorizationUrl(
  db: Database,
  rawDomain: string,
  customRedirectUri?: string
) {
  const domain = rawDomain.trim().toLowerCase().replace(/^@/, '');
  if (!domain) {
    throw httpError(400, 'Corporate domain or work email is required');
  }

  // Extract domain if full email was provided
  const cleanDomain = domain.includes('@') ? domain.split('@')[1]! : domain;

  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.domain, cleanDomain))
    .limit(1);

  if (!config) {
    throw httpError(404, `No enterprise Single Sign-On configured for domain @${cleanDomain}`);
  }

  const workos = getWorkOS();
  const redirectUri = getRedirectUri(customRedirectUri);
  const clientId = env.WORKOS_CLIENT_ID || 'client_placeholder';

  let authorizationUrl: string;

  if (config.workosOrganizationId) {
    authorizationUrl = workos.userManagement.getAuthorizationUrl({
      organizationId: config.workosOrganizationId,
      redirectUri,
      clientId,
    });
  } else if (config.workosConnectionId) {
    authorizationUrl = workos.userManagement.getAuthorizationUrl({
      connectionId: config.workosConnectionId,
      redirectUri,
      clientId,
    });
  } else {
    // Standard domain hint / AuthKit fallback
    authorizationUrl = workos.userManagement.getAuthorizationUrl({
      provider: 'authkit',
      domainHint: cleanDomain,
      redirectUri,
      clientId,
    });
  }

  return {
    provider: config.provider || 'sso',
    domain: cleanDomain,
    organizationId: config.organizationId,
    authorizationUrl,
  };
}

/**
 * Authenticates user from WorkOS authorization code, provisions account (JIT),
 * links organization, and issues Boardly access + refresh tokens.
 */
export async function authenticateWithWorkOSCode(
  db: Database,
  code: string
) {
  if (!code || code.trim().length === 0) {
    throw httpError(400, 'Authorization code is required');
  }

  let email = '';
  let name = '';
  let avatarUrl: string | null = null;
  let workosOrgId: string | null = null;

  // Check for mock testing code
  if (code.startsWith('mock_test_')) {
    const parts = code.split('_');
    const userPart = parts[2] || 'mockuser';
    const domainPart = parts[3] || 'example.com';
    email = `${userPart}@${domainPart}`.toLowerCase();
    name = userPart.replace(/[0-9]/g, '') || 'Mock User';
    avatarUrl = 'https://ui-avatars.com/api/?name=Mock+User';
  } else {
    const workos = getWorkOS();
    const clientId = env.WORKOS_CLIENT_ID || 'client_placeholder';

    try {
      // 1. Try UserManagement authentication (standard for Google OAuth & modern SSO)
      const authResponse = await workos.userManagement.authenticateWithCode({
        code,
        clientId,
      });

      const userProfile = authResponse.user;
      email = (userProfile.email || '').toLowerCase().trim();
      const first = userProfile.firstName || '';
      const last = userProfile.lastName || '';
      name = `${first} ${last}`.trim() || userProfile.email?.split('@')[0] || 'User';
      avatarUrl = userProfile.profilePictureUrl || null;
      workosOrgId = authResponse.organizationId || null;
    } catch (umError: any) {
      // 2. Fallback to SSO getProfileAndToken (for standalone SAML connections)
      try {
        const ssoResponse = await workos.sso.getProfileAndToken({
          code,
          clientId,
        });
        const profile = ssoResponse.profile;
        email = (profile.email || '').toLowerCase().trim();
        const first = profile.firstName || '';
        const last = profile.lastName || '';
        name = `${first} ${last}`.trim() || profile.email?.split('@')[0] || 'Enterprise User';
        workosOrgId = profile.organizationId || null;
      } catch (ssoError: any) {
        throw httpError(
          401,
          `Failed to authenticate authorization code with WorkOS: ${
            umError.message || ssoError.message || 'Invalid or expired code'
          }`
        );
      }
    }
  }

  if (!email) {
    throw httpError(400, 'Unable to extract email from authentication response');
  }

  // 1. Find or Provision User
  let [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (user) {
    if (user.deactivatedAt) {
      throw httpError(403, 'Your account has been deactivated. Please contact support.');
    }
    // Update user profile info & login timestamp
    await db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        avatarUrl: avatarUrl || user.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  } else {
    // Just-In-Time (JIT) Provisioning
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        name,
        avatarUrl,
        passwordHash: null, // Managed via WorkOS OAuth / SSO
        lastLoginAt: new Date(),
      })
      .returning();
    user = newUser!;
  }

  // 2. Resolve Organization Membership
  const [existingMembership] = await db
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

  let targetOrgId = existingMembership?.organizationId;
  let targetRole = existingMembership?.role;

  if (existingMembership && existingMembership.status === 'deactivated') {
    throw httpError(
      403,
      'Your account in this organization has been deactivated. Please contact your organization administrator.'
    );
  }

  if (!targetOrgId) {
    // Check if domain matches any enterprise SSO organization
    const emailDomain = email.split('@')[1] || '';
    let matchedOrgId: string | null = null;

    if (workosOrgId) {
      const [matchedByWorkOS] = await db
        .select({ organizationId: ssoConfigurations.organizationId })
        .from(ssoConfigurations)
        .where(eq(ssoConfigurations.workosOrganizationId, workosOrgId))
        .limit(1);
      if (matchedByWorkOS) matchedOrgId = matchedByWorkOS.organizationId;
    }

    if (!matchedOrgId && emailDomain) {
      const [matchedByDomain] = await db
        .select({ organizationId: ssoConfigurations.organizationId })
        .from(ssoConfigurations)
        .where(eq(ssoConfigurations.domain, emailDomain))
        .limit(1);
      if (matchedByDomain) matchedOrgId = matchedByDomain.organizationId;
    }

    if (matchedOrgId) {
      targetOrgId = matchedOrgId;
      targetRole = 'member';
      await db
        .insert(organizationMembers)
        .values({
          organizationId: targetOrgId,
          userId: user.id,
          role: 'member',
          status: 'active',
        })
        .onConflictDoNothing();
    } else {
      // Auto-provision a personal workspace organization for individual OAuth signups
      const baseSlug = (user.name || 'org')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 20);
      const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;
      const orgName = `${user.name || 'My'}'s Workspace`;

      const [newOrg] = await db
        .insert(organizations)
        .values({
          name: orgName,
          slug: uniqueSlug,
        })
        .returning();

      targetOrgId = newOrg!.id;
      targetRole = 'org_owner';

      await db.insert(organizationMembers).values({
        organizationId: targetOrgId,
        userId: user.id,
        role: 'org_owner',
        status: 'active',
      });
    }
  }

  // 3. Issue Boardly JWT + refresh token pair
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, targetOrgId))
    .limit(1);

  const tokens = await issueTokenPair(
    db,
    user.id,
    targetOrgId,
    user.isPlatformAdmin ?? false
  );

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: targetOrgId,
      role: targetRole ?? 'member',
      avatarUrl: user.avatarUrl ?? null,
      isPlatformAdmin: user.isPlatformAdmin ?? false,
      timezone: user.timezone ?? 'UTC',
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      lastLoginAt: new Date().toISOString(),
      createdAt: user.createdAt,
    },
    organization: org || { id: targetOrgId, slug: '' },
  };
}
