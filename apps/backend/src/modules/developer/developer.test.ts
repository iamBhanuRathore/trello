import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
  verifyApiKey,
  listMarketplaceApps,
  getMarketplaceApp,
  installMarketplaceApp,
  updateInstalledApp,
  uninstallMarketplaceApp,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Developer API Keys & Marketplace Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userEmail: string;
  let createdKeyId: string;
  let rawGeneratedKey: string;
  let sampleAppId: string;
  let installedRecordId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = uniqueTestEmail('dev_admin');
    userEmail = email;
    const slug = uniqueTestSlug('dev-org');

    const { organization } = await signUp(db, {
      name: 'Developer Admin',
      email,
      password: 'pass',
      orgName: 'Developer Labs',
      orgSlug: slug,
    });
    orgId = organization.id;
  });

  afterAll(async () => {
    await deleteTestOrg(db, orgId);
    await deleteTestUser(db, userEmail);
    await client.end();
  });

  it('should generate a secret developer API key with hash and prefix', async () => {
    const key = await generateApiKey(db, orgId, {
      name: 'CI/CD Pipeline Key',
      scopes: ['cards:read', 'cards:write'],
      expiresInDays: 30,
    });

    expect(key.id).toBeDefined();
    expect(key.rawKey).toBeDefined();
    expect(key.rawKey.startsWith('bk_live_')).toBe(true);
    expect(key.keyPrefix.startsWith('bk_live_')).toBe(true);
    expect(key.scopes).toEqual(['cards:read', 'cards:write']);

    createdKeyId = key.id;
    rawGeneratedKey = key.rawKey;
  });

  it('should list API keys without exposing secret hashes', async () => {
    const keys = await listApiKeys(db, orgId);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const found = keys.find((k) => k.id === createdKeyId);
    expect(found).toBeDefined();
    expect((found as any).rawKey).toBeUndefined();
    expect((found as any).keyHash).toBeUndefined();
  });

  it('should verify valid API key and update lastUsedAt', async () => {
    const verified = await verifyApiKey(db, rawGeneratedKey);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(createdKeyId);
    expect(verified?.organizationId).toBe(orgId);

    const invalid = await verifyApiKey(db, 'bk_live_invalidkey123456');
    expect(invalid).toBeNull();
  });

  it('should seed and list marketplace apps with installation state', async () => {
    const apps = await listMarketplaceApps(db, orgId);
    expect(apps.length).toBeGreaterThanOrEqual(5);

    const githubApp = apps.find((a) => a.slug === 'github-sync');
    expect(githubApp).toBeDefined();
    expect(githubApp!.isInstalled).toBe(false);
    sampleAppId = githubApp!.id;
  });

  it('should install a marketplace app to organization', async () => {
    const installed = await installMarketplaceApp(db, orgId, {
      appId: sampleAppId,
      config: { repo: 'org/repo-name', autoMoveOnMerge: true },
    });

    expect(installed.id).toBeDefined();
    expect(installed.appId).toBe(sampleAppId);
    expect(installed.isEnabled).toBe(true);
    installedRecordId = installed.id;

    // Verify isInstalled flag
    const appDetail = await getMarketplaceApp(db, orgId, sampleAppId);
    expect(appDetail.isInstalled).toBe(true);
  });

  it('should update installed app configuration', async () => {
    const updated = await updateInstalledApp(db, orgId, installedRecordId, {
      config: { repo: 'org/new-repo', autoMoveOnMerge: false },
      isEnabled: false,
    });

    expect(updated.isEnabled).toBe(false);
    expect((updated.config as any).repo).toBe('org/new-repo');
  });

  it('should reject unknown modules and fields', async () => {
    await expect(
      generateApiKey(db, orgId, {
        name: 'Bad module',
        moduleScopes: [{ module: 'invoices', read: true }],
      } as never)
    ).rejects.toThrow(/Unknown API module/);

    await expect(
      generateApiKey(db, orgId, {
        name: 'Bad field',
        moduleScopes: [{ module: 'cards', read: true, fields: ['nope'] }],
      })
    ).rejects.toThrow(/Unknown fields for cards/);
  });

  it('should lock required create fields into write scopes', async () => {
    const key = await generateApiKey(db, orgId, {
      name: 'Restricted cards key',
      moduleScopes: [{ module: 'cards', write: true, fields: ['description'], hitLimit: 5 }],
    });

    const listed = (await listApiKeys(db, orgId)).find((k) => k.id === key.id)!;
    const cardsScope = listed.moduleScopes.find((s) => s.module === 'cards')!;
    expect(cardsScope.fields).toContain('title');
    expect(cardsScope.fields).toContain('listId');
    expect(cardsScope.hitLimit).toBe(5);
    await deleteApiKey(db, orgId, key.id);
  });

  it('should uninstall marketplace app and revoke API key', async () => {
    const uninstallRes = await uninstallMarketplaceApp(db, orgId, installedRecordId);
    expect(uninstallRes.success).toBe(true);

    const revokeRes = await revokeApiKey(db, orgId, createdKeyId);
    expect(revokeRes.success).toBe(true);

    // Revocation is soft: the row stays for audit, but it can no longer authenticate.
    const keysAfter = await listApiKeys(db, orgId);
    const revoked = keysAfter.find((k) => k.id === createdKeyId);
    expect(revoked?.revokedAt).not.toBeNull();
    expect(await verifyApiKey(db, rawGeneratedKey)).toBeNull();
  });

  it('should hard delete a revoked key', async () => {
    const res = await deleteApiKey(db, orgId, createdKeyId);
    expect(res.success).toBe(true);
    const keysAfter = await listApiKeys(db, orgId);
    expect(keysAfter.find((k) => k.id === createdKeyId)).toBeUndefined();
  });
});
