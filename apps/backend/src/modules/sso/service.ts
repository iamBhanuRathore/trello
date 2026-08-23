import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  ssoConfigurations,
  organizations,
  users,
  organizationMembers,
} from '../../db/schema/index';
import { issueTokenPair } from '../auth/service';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function getSSOConfig(db: Database, organizationId: string) {
  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.organizationId, organizationId))
    .limit(1);

  if (!config) {
    return {
      organizationId,
      provider: 'okta',
      domain: '',
      idpMetadataUrl: '',
      clientId: '',
      clientSecret: '',
      scimEnabled: false,
      scimToken: '',
      enforceSSO: false,
    };
  }

  return config;
}

export async function updateSSOConfig(
  db: Database,
  organizationId: string,
  input: {
    provider?: string;
    domain?: string;
    idpMetadataUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scimEnabled?: boolean;
    enforceSSO?: boolean;
  }
) {
  const [existing] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.organizationId, organizationId))
    .limit(1);

  const scimToken =
    input.scimEnabled && (!existing || !existing.scimToken)
      ? `scim_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`
      : existing?.scimToken || null;

  if (existing) {
    const [updated] = await db
      .update(ssoConfigurations)
      .set({
        provider: input.provider ?? existing.provider,
        domain: input.domain !== undefined ? input.domain.trim().toLowerCase() : existing.domain,
        idpMetadataUrl: input.idpMetadataUrl ?? existing.idpMetadataUrl,
        clientId: input.clientId ?? existing.clientId,
        clientSecret: input.clientSecret ?? existing.clientSecret,
        scimEnabled: input.scimEnabled ?? existing.scimEnabled,
        scimToken: input.scimEnabled ? scimToken : null,
        enforceSSO: input.enforceSSO ?? existing.enforceSSO,
        updatedAt: new Date(),
      })
      .where(eq(ssoConfigurations.organizationId, organizationId))
      .returning();

    // Also update org ssoEnabled flag
    if (input.enforceSSO !== undefined) {
      await db
        .update(organizations)
        .set({ ssoEnabled: input.enforceSSO, updatedAt: new Date() })
        .where(eq(organizations.id, organizationId));
    }

    return updated!;
  } else {
    if (!input.domain || input.domain.trim().length === 0) {
      throw httpError(400, 'Corporate email domain is required for SSO setup (e.g. acme.com)');
    }

    const [created] = await db
      .insert(ssoConfigurations)
      .values({
        organizationId,
        provider: input.provider || 'okta',
        domain: input.domain.trim().toLowerCase(),
        idpMetadataUrl: input.idpMetadataUrl || null,
        clientId: input.clientId || null,
        clientSecret: input.clientSecret || null,
        scimEnabled: input.scimEnabled ?? false,
        scimToken: input.scimEnabled ? scimToken : null,
        enforceSSO: input.enforceSSO ?? false,
      })
      .returning();

    return created!;
  }
}

export async function generateSSOLoginUrl(db: Database, domain: string) {
  const cleanDomain = domain.trim().toLowerCase();
  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.domain, cleanDomain))
    .limit(1);

  if (!config) {
    throw httpError(404, `No enterprise Single Sign-On configured for domain @${cleanDomain}`);
  }

  // Generate simulated IdP Redirect URL
  const state = `sso_${Date.now().toString(36)}`;
  const loginUrl = `https://login.boardly.com/sso/authorize?provider=${config.provider}&domain=${cleanDomain}&client_id=${config.clientId || 'boardly_enterprise'}&state=${state}`;

  return {
    provider: config.provider,
    domain: cleanDomain,
    loginUrl,
    state,
  };
}

export async function processSSOCallback(
  db: Database,
  input: {
    domain: string;
    email: string;
    name: string;
  }
) {
  const cleanDomain = input.domain.trim().toLowerCase();
  const cleanEmail = input.email.trim().toLowerCase();

  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.domain, cleanDomain))
    .limit(1);

  if (!config) {
    throw httpError(404, 'SSO configuration not found for domain');
  }

  // 1. Find or Provision User
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, cleanEmail))
    .limit(1);

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({
        email: cleanEmail,
        name: input.name || cleanEmail.split('@')[0]!,
        passwordHash: null, // SSO-managed credentials
      })
      .returning();
    user = newUser!;
  }

  // 2. Ensure Organization Membership
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, config.organizationId),
        eq(organizationMembers.userId, user.id)
      )
    )
    .limit(1);

  if (!member) {
    await db
      .insert(organizationMembers)
      .values({
        organizationId: config.organizationId,
        userId: user.id,
        role: 'member',
        status: 'active',
      })
      .onConflictDoNothing();
  }

  // 3. Generate Auth Tokens
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, config.organizationId))
    .limit(1);

  const tokens = await issueTokenPair(db, user.id, config.organizationId, user.isPlatformAdmin);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    organization: org!,
    tokens,
  };
}

export async function processSCIMWebhook(
  db: Database,
  scimToken: string,
  event: {
    action: 'user.create' | 'user.update' | 'user.delete';
    email: string;
    name?: string;
  }
) {
  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(and(eq(ssoConfigurations.scimToken, scimToken), eq(ssoConfigurations.scimEnabled, true)))
    .limit(1);

  if (!config) {
    throw httpError(401, 'Invalid or disabled SCIM bearer token');
  }

  const cleanEmail = event.email.trim().toLowerCase();

  if (event.action === 'user.create' || event.action === 'user.update') {
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: cleanEmail,
          name: event.name || cleanEmail.split('@')[0]!,
        })
        .returning();
      user = newUser!;
    } else if (event.name) {
      await db.update(users).set({ name: event.name, updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    await db
      .insert(organizationMembers)
      .values({
        organizationId: config.organizationId,
        userId: user.id,
        role: 'member',
        status: 'active',
      })
      .onConflictDoNothing();

    return { status: 'synced', userId: user.id };
  } else if (event.action === 'user.delete') {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    if (user) {
      await db
        .update(organizationMembers)
        .set({ status: 'deactivated', updatedAt: new Date() })
        .where(
          and(
            eq(organizationMembers.organizationId, config.organizationId),
            eq(organizationMembers.userId, user.id)
          )
        );
    }

    return { status: 'deactivated' };
  }

  return { status: 'ignored' };
}
