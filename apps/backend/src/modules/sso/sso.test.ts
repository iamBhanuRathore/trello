import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import {
  getSSOConfig,
  updateSSOConfig,
  generateSSOLoginUrl,
  processSSOCallback,
  processSCIMWebhook,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Enterprise SSO & SCIM Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let domain: string;
  let scimToken: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = `sso_admin_${Date.now()}@example.com`;
    domain = `enterprise-${Date.now()}.com`;
    const slug = `sso-org-${Date.now()}`;

    const { organization } = await signUp(db, {
      name: 'SSO Admin',
      email,
      password: 'pass',
      orgName: 'Enterprise Corp',
      orgSlug: slug,
    });
    orgId = organization.id;
  });

  afterAll(async () => {
    await db
      .delete(schema.ssoConfigurations)
      .where(eq(schema.ssoConfigurations.organizationId, orgId));
    await db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, orgId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await client.end();
  });

  it('should return default empty config for unconfigured org', async () => {
    const config = await getSSOConfig(db, orgId);
    expect(config.domain).toBe('');
    expect(config.enforceSSO).toBe(false);
  });

  it('should configure Okta SSO with SCIM directory sync', async () => {
    const config = await updateSSOConfig(db, orgId, {
      provider: 'okta',
      domain,
      idpMetadataUrl: 'https://okta.enterprise.com/metadata',
      clientId: 'okta_client_123',
      clientSecret: 'secret_456',
      scimEnabled: true,
      enforceSSO: true,
    });

    expect(config.domain).toBe(domain);
    expect(config.provider).toBe('okta');
    expect(config.scimEnabled).toBe(true);
    // Raw token is returned once at generation time; storage holds the hash.
    expect(config.scimToken).toContain('scim_');
    scimToken = config.scimToken!;
  });

  it('should generate IdP authorization redirect URL by domain', async () => {
    const login = await generateSSOLoginUrl(db, domain);
    expect(login.provider).toBe('okta');
    expect(login.loginUrl).toContain(domain);
    expect(login.loginUrl).toContain('response_type=code');
    expect(login.loginUrl).toContain('state=');
  });

  it('should authenticate and auto-provision user on SSO callback', async () => {
    // Test-only WorkOS mock code (honored because bun test sets NODE_ENV=test).
    const mockCode = `mock_test_engineer${Date.now()}_${domain}`;
    const res = await processSSOCallback(db, { code: mockCode });

    expect(res.user.id).toBeDefined();
    expect(res.user.email).toContain(`@${domain}`);
    expect(res.tokens.accessToken).toBeDefined();
    expect(res.organization.id).toBe(orgId);
  });

  it('should provision and deactivate users via SCIM webhook events', async () => {
    const scimUserEmail = `scim_user_${Date.now()}@${domain}`;

    // 1. SCIM User Create
    const createRes = await processSCIMWebhook(db, scimToken, {
      action: 'user.create',
      email: scimUserEmail,
      name: 'SCIM Synced User',
    });
    expect(createRes.status).toBe('synced');
    expect(createRes.userId).toBeDefined();

    // 2. SCIM User Delete (Deactivate)
    const deleteRes = await processSCIMWebhook(db, scimToken, {
      action: 'user.delete',
      email: scimUserEmail,
    });
    expect(deleteRes.status).toBe('deactivated');
  });
});
