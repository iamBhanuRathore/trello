import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import {
  getGoogleAuthorizationUrl,
  getSSOAuthorizationUrl,
  authenticateWithWorkOSCode,
} from './workos.service';
import { signUp } from './service';
import { updateSSOConfig } from '../sso/service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('WorkOS OAuth & Enterprise SSO Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let testDomain: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = `workos_owner_${Date.now()}@example.com`;
    testDomain = `workos-enterprise-${Date.now()}.com`;
    const slug = `workos-org-${Date.now()}`;

    const { organization } = await signUp(db, {
      name: 'WorkOS Test Owner',
      email,
      password: 'StrongPassword123!',
      orgName: 'WorkOS Enterprise Inc',
      orgSlug: slug,
    });
    orgId = organization.id;

    // Configure SSO with WorkOS Org ID
    await updateSSOConfig(db, orgId, {
      provider: 'google_workspace',
      domain: testDomain,
      workosOrganizationId: 'org_01H123456789WORKOS',
      enforceSSO: true,
    });
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

  it('should generate Google OAuth authorization URL', () => {
    const result = getGoogleAuthorizationUrl();
    expect(result.provider).toBe('GoogleOAuth');
    expect(result.authorizationUrl).toContain('provider=GoogleOAuth');
    expect(result.authorizationUrl).toContain('response_type=code');
    expect(result.authorizationUrl).toContain('auth%2Fcallback');
  });

  it('should generate domain-routed SSO URL for configured enterprise tenant', async () => {
    const result = await getSSOAuthorizationUrl(db, testDomain);
    expect(result.domain).toBe(testDomain);
    expect(result.organizationId).toBe(orgId);
    expect(result.authorizationUrl).toContain('org_01H123456789WORKOS');
    expect(result.authorizationUrl).toContain('response_type=code');
  });

  it('should throw 404 for unconfigured SSO domain', async () => {
    try {
      await getSSOAuthorizationUrl(db, 'non-existent-company-domain.io');
      expect(true).toBe(false); // Should not reach here
    } catch (err: unknown) {
      const httpErr = err as { status?: unknown; message?: unknown };
      expect(httpErr.status).toBe(404);
      expect(String(httpErr.message)).toContain('No enterprise Single Sign-On configured');
    }
  });

  it('should authenticate user and auto-provision membership in matched SSO organization', async () => {
    const randomUser = `emp${Date.now()}`;
    const code = `mock_test_${randomUser}_${testDomain}`;

    const res = await authenticateWithWorkOSCode(db, code);

    expect(res.user).toBeDefined();
    expect(res.user.email).toBe(`${randomUser}@${testDomain}`);
    expect(res.user.organizationId).toBe(orgId);
    expect(res.accessToken).toBeDefined();
    expect(res.refreshToken).toBeDefined();
    expect(res.user.role).toBe('member');
  });

  it('should authenticate individual user and auto-create default workspace if no domain matches', async () => {
    const randomUser = `solo${Date.now()}`;
    const code = `mock_test_${randomUser}_independent.com`;

    const res = await authenticateWithWorkOSCode(db, code);

    expect(res.user).toBeDefined();
    expect(res.user.email).toBe(`${randomUser}@independent.com`);
    expect(res.user.organizationId).toBeDefined();
    expect(res.user.role).toBe('org_owner');
    expect(res.accessToken).toBeDefined();
    expect(res.refreshToken).toBeDefined();
  });

  it('should authenticate existing user on repeated login without creating duplicate user or org', async () => {
    const randomUser = `repeat${Date.now()}`;
    const code = `mock_test_${randomUser}_test`;

    const first = await authenticateWithWorkOSCode(db, code);
    const second = await authenticateWithWorkOSCode(db, code);

    expect(second.user.id).toBe(first.user.id);
    expect(second.user.organizationId).toBe(first.user.organizationId);
  });
});
