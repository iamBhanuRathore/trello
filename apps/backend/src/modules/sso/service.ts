import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  ssoConfigurations,
  organizations,
  users,
  organizationMembers,
} from '../../db/schema/index';
import { issueTokenPair } from '../auth/service';
import { getWorkOS, getRedirectUri, verifyWorkOSCode } from '../auth/workos.service';
import { getDataClient, isRedisAvailable } from '../../redis/client';
import { env } from '../../lib/env';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** SCIM bearer tokens: 256-bit CSPRNG, sha256-hashed at rest, shown once. */
function generateScimToken(): { raw: string; hash: string } {
  const raw = `scim_${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashScimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
      workosOrganizationId: '',
      workosConnectionId: '',
      scimEnabled: false,
      scimToken: '',
      enforceSSO: false,
    };
  }

  // Never leak the stored token hash to clients; the raw token is only
  // returned once at generation time (see updateSSOConfig below).
  return { ...config, scimToken: '' };
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
    workosOrganizationId?: string;
    workosConnectionId?: string;
    scimEnabled?: boolean;
    enforceSSO?: boolean;
  }
) {
  const [existing] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.organizationId, organizationId))
    .limit(1);

  const shouldRegenerate = input.scimEnabled && (!existing || !existing.scimToken);
  const generated = shouldRegenerate ? generateScimToken() : null;
  const scimTokenHash = generated?.hash ?? existing?.scimToken ?? null;

  if (existing) {
    const [updated] = await db
      .update(ssoConfigurations)
      .set({
        provider: input.provider ?? existing.provider,
        domain:
          input.domain !== undefined
            ? input.domain.trim().toLowerCase().replace(/^@/, '')
            : existing.domain,
        idpMetadataUrl: input.idpMetadataUrl ?? existing.idpMetadataUrl,
        clientId: input.clientId ?? existing.clientId,
        clientSecret: input.clientSecret ?? existing.clientSecret,
        workosOrganizationId:
          input.workosOrganizationId !== undefined
            ? input.workosOrganizationId.trim()
            : existing.workosOrganizationId,
        workosConnectionId:
          input.workosConnectionId !== undefined
            ? input.workosConnectionId.trim()
            : existing.workosConnectionId,
        scimEnabled: input.scimEnabled ?? existing.scimEnabled,
        scimToken: input.scimEnabled ? scimTokenHash : null,
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

    // Show-once: return the raw token only at generation time.
    return { ...updated!, scimToken: generated?.raw ?? '' };
  } else {
    if (!input.domain || input.domain.trim().length === 0) {
      throw httpError(400, 'Corporate email domain is required for SSO setup (e.g. acme.com)');
    }

    const [created] = await db
      .insert(ssoConfigurations)
      .values({
        organizationId,
        provider: input.provider || 'okta',
        domain: input.domain.trim().toLowerCase().replace(/^@/, ''),
        idpMetadataUrl: input.idpMetadataUrl || null,
        clientId: input.clientId || null,
        clientSecret: input.clientSecret || null,
        workosOrganizationId: input.workosOrganizationId || null,
        workosConnectionId: input.workosConnectionId || null,
        scimEnabled: input.scimEnabled ?? false,
        scimToken: input.scimEnabled ? scimTokenHash : null,
        enforceSSO: input.enforceSSO ?? false,
      })
      .returning();

    // Show-once: return the raw token only at generation time.
    return { ...created!, scimToken: generated?.raw ?? '' };
  }
}

export async function generateSSOLoginUrl(
  db: Database,
  domain: string,
  customRedirectUri?: string
) {
  const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.domain, cleanDomain))
    .limit(1);

  if (!config) {
    throw httpError(404, `No enterprise Single Sign-On configured for domain @${cleanDomain}`);
  }

  const redirectUri = getRedirectUri(customRedirectUri);
  // Unpredictable CSRF state, bound to the domain server-side (Redis, 10min TTL).
  const state = `sso_${randomBytes(16).toString('hex')}`;
  const redis = getDataClient();
  if (redis && isRedisAvailable()) {
    try {
      await redis.set(`sso:state:${state}`, cleanDomain, 'EX', 600);
    } catch {
      // Best-effort: the WorkOS code exchange below remains the primary auth.
    }
  }
  let loginUrl: string;

  try {
    const workos = getWorkOS();
    const clientId = env.WORKOS_CLIENT_ID || 'client_placeholder';

    if (config.workosOrganizationId) {
      loginUrl = workos.userManagement.getAuthorizationUrl({
        organizationId: config.workosOrganizationId,
        redirectUri,
        clientId,
        state,
      });
    } else if (config.workosConnectionId) {
      loginUrl = workos.userManagement.getAuthorizationUrl({
        connectionId: config.workosConnectionId,
        redirectUri,
        clientId,
        state,
      });
    } else {
      loginUrl = workos.userManagement.getAuthorizationUrl({
        provider: 'authkit',
        domainHint: cleanDomain,
        redirectUri,
        clientId,
        state,
      });
    }
  } catch {
    loginUrl = `https://login.boardly.com/sso/authorize?provider=${config.provider}&domain=${cleanDomain}&client_id=${config.clientId || 'boardly_enterprise'}&state=${state}`;
  }

  return {
    provider: config.provider,
    domain: cleanDomain,
    loginUrl,
    state,
    redirectUri,
  };
}

/**
 * Enterprise SSO callback — exchanges a WorkOS authorization code for a verified
 * identity, then provisions membership in the org that owns the email domain.
 * Self-asserted `{domain,email,name}` bodies are NOT accepted: the IdP-signed
 * code response is the sole source of identity.
 */
export async function processSSOCallback(
  db: Database,
  input: {
    code: string;
    state?: string;
  }
) {
  if (input.state) {
    const redis = getDataClient();
    if (redis && isRedisAvailable()) {
      let expected: string | null = null;
      try {
        expected = await redis.get(`sso:state:${input.state}`);
      } catch {
        expected = null;
      }
      if (!expected) {
        throw httpError(401, 'Invalid or expired SSO state');
      }
      try {
        await redis.del(`sso:state:${input.state}`);
      } catch {
        // Single-use best-effort; TTL expiry bounds reuse.
      }
    }
    // Without Redis the WorkOS code exchange below is still required auth.
  }

  const { email: cleanEmail, name } = await verifyWorkOSCode(input.code);
  if (!cleanEmail) {
    throw httpError(400, 'Unable to extract email from authentication response');
  }
  const emailDomain = cleanEmail.split('@')[1] || '';

  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(eq(ssoConfigurations.domain, emailDomain))
    .limit(1);

  if (!config) {
    throw httpError(404, 'SSO configuration not found for domain');
  }

  // 1. Find or Provision User
  let [user] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0]!,
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
  if (!scimToken) {
    throw httpError(401, 'Invalid or disabled SCIM bearer token');
  }
  // Tokens are sha256-hashed at rest: hash the presented value, look up the
  // digest, then constant-time compare. Pre-hash-rotation plaintext rows no
  // longer match — re-save SSO config to generate a new token.
  const presentedHash = hashScimToken(scimToken);
  const [config] = await db
    .select()
    .from(ssoConfigurations)
    .where(
      and(eq(ssoConfigurations.scimToken, presentedHash), eq(ssoConfigurations.scimEnabled, true))
    )
    .limit(1);

  if (
    !config?.scimToken ||
    config.scimToken.length !== presentedHash.length ||
    !timingSafeEqual(Buffer.from(config.scimToken), Buffer.from(presentedHash))
  ) {
    throw httpError(401, 'Invalid or disabled SCIM bearer token');
  }

  const cleanEmail = event.email.trim().toLowerCase();

  if (event.action === 'user.create' || event.action === 'user.update') {
    let [user] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

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
      await db
        .update(users)
        .set({ name: event.name, updatedAt: new Date() })
        .where(eq(users.id, user.id));
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
    const [user] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

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
