import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { deleteTestOrg, deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';
import { generateApiKey, listApiKeys, verifyApiKeyWithScopes } from '../developer/service';
import { consumeGlobalHit, consumeModuleHit } from './quota';
import { requireApiScope, type PublicApiContext } from './api-key-auth';
import { pickAllowed, readFields, validateWriteBody, writeFields } from './serializers';
import { publicApiRoutes } from './routes';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Public API enforcement', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let userEmail: string;
  let keyId: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = uniqueTestEmail('public_api');
    userEmail = email;
    const { organization } = await signUp(db, {
      name: 'Public API Admin',
      email,
      password: 'pass',
      orgName: 'Public API Org',
      orgSlug: uniqueTestSlug('public-api-org'),
    });
    orgId = organization.id;

    const key = await generateApiKey(db, orgId, {
      name: 'Enforcement key',
      moduleScopes: [
        { module: 'cards', read: true, write: true, fields: ['title', 'description'] },
        { module: 'boards', read: true, hitLimit: 1 },
      ],
    });
    keyId = key.id;
  });

  afterAll(async () => {
    await deleteTestOrg(db, orgId);
    await deleteTestUser(db, userEmail);
    await client.end();
  });

  it('verifies a key and returns its module scopes', async () => {
    const listed = (await listApiKeys(db, orgId)).find((k) => k.id === keyId)!;
    const raw = await generateApiKey(db, orgId, {
      name: 'Verification key',
      moduleScopes: [{ module: 'projects', read: true }],
    });
    const verified = await verifyApiKeyWithScopes(db, raw.rawKey);
    expect(verified).not.toBeNull();
    expect(verified!.key.id).toBe(raw.id);
    expect(verified!.moduleScopes).toHaveLength(1);
    expect(verified!.moduleScopes[0]).toMatchObject({
      module: 'projects',
      read: true,
      write: false,
      fields: null,
      hitLimit: null,
    });
    expect(listed.moduleScopes.length).toBe(2);
  });

  it('denies a scope the key does not hold with 403 and no quota burn', async () => {
    const listed = (await listApiKeys(db, orgId)).find((k) => k.id === keyId)!;
    const apiKey: PublicApiContext = {
      id: listed.id,
      organizationId: orgId,
      name: listed.name,
      keyPrefix: listed.keyPrefix,
      moduleScopes: listed.moduleScopes,
    };
    const set: { status?: number | string; headers?: Record<string, string> } = {};
    const result = await requireApiScope('projects', 'read')({ apiKey, set: set as never });
    expect(result).toMatchObject({ details: { code: 'SCOPE_DENIED' } });
    expect(set.status).toBe(403);
  });

  it('allows a granted scope and increments both counters', async () => {
    const listed = (await listApiKeys(db, orgId)).find((k) => k.id === keyId)!;
    const apiKey: PublicApiContext = {
      id: listed.id,
      organizationId: orgId,
      name: listed.name,
      keyPrefix: listed.keyPrefix,
      moduleScopes: listed.moduleScopes,
    };
    const set: { status?: number | string; headers?: Record<string, string> } = {};
    const result = await requireApiScope('cards', 'read')({ apiKey, set: set as never });
    expect(result).toBeUndefined();
    expect(set.status).toBeUndefined();

    const usage = (await listApiKeys(db, orgId)).find((k) => k.id === keyId)!;
    expect(Number(usage.hits)).toBeGreaterThanOrEqual(1);
  });

  it('enforces the global monthly limit atomically', async () => {
    const key = await generateApiKey(db, orgId, {
      name: 'Limited key',
      hitLimit: 2,
      moduleScopes: [{ module: 'cards', read: true }],
    });
    expect((await consumeGlobalHit(db, key.id)).allowed).toBe(true);
    expect((await consumeGlobalHit(db, key.id)).allowed).toBe(true);
    const third = await consumeGlobalHit(db, key.id);
    expect(third.allowed).toBe(false);
    expect(third.resetAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('enforces per-module limits independently of other modules', async () => {
    // boards has hitLimit 1 from the setup key.
    expect((await consumeModuleHit(db, keyId, 'boards')).allowed).toBe(true);
    expect((await consumeModuleHit(db, keyId, 'boards')).allowed).toBe(false);
    // cards has no limit.
    expect((await consumeModuleHit(db, keyId, 'cards')).allowed).toBe(true);
  });

  it('filters reads by the field allowlist', () => {
    const scopes = [
      { module: 'cards', read: true, write: true, fields: ['title'], hitLimit: null },
    ];
    const allowed = readFields('cards', scopes);
    expect([...allowed]).toContain('title');
    expect([...allowed]).not.toContain('description');
    expect(pickAllowed({ title: 'A', description: 'B', id: 'c' }, allowed)).toEqual({
      title: 'A',
    });
  });

  it('rejects unknown, read-only, out-of-scope and missing required fields', () => {
    const scopes = [
      {
        module: 'cards',
        read: true,
        write: true,
        fields: ['title', 'listId', 'description'],
        hitLimit: null,
      },
    ];
    const allowed = writeFields('cards', scopes);

    expect(() => validateWriteBody('cards', { nope: 1 }, allowed, 'create')).toThrow(
      /Unknown field/
    );
    expect(() =>
      validateWriteBody(
        'cards',
        { id: 'x', title: 'T', listId: crypto.randomUUID() },
        allowed,
        'create'
      )
    ).toThrow(/read-only/);
    expect(() =>
      validateWriteBody(
        'cards',
        { title: 'T', listId: crypto.randomUUID(), isArchived: true },
        allowed,
        'create'
      )
    ).toThrow(/not permitted/);
    expect(() => validateWriteBody('cards', { title: 'T' }, allowed, 'create')).toThrow(
      /Missing required field: listId/
    );
    expect(() =>
      validateWriteBody('cards', { title: 5, listId: crypto.randomUUID() }, allowed, 'create')
    ).toThrow(/title must be a string/);

    const ok = validateWriteBody(
      'cards',
      { title: 'T', listId: crypto.randomUUID(), description: null },
      allowed,
      'create'
    );
    expect(ok.title).toBe('T');
    expect(ok.description).toBeNull();
  });
});

describe('Public API route registration', () => {
  it('mounts a scope guard on every public route except the whoami probe', () => {
    const routes = publicApiRoutes.routes.filter((route) => route.path.startsWith('/public/'));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      if (route.path === '/public/whoami') continue;
      expect({ path: route.path, beforeHandle: route.hooks?.beforeHandle?.length ?? 0 }).toEqual({
        path: route.path,
        beforeHandle: 1,
      });
    }
  });

  it('keeps the inbound token receiver off the API-key surface', () => {
    const paths = publicApiRoutes.routes.map((route) => route.path);
    expect(paths.includes('/public/inbound/:token')).toBe(false);
  });
});
