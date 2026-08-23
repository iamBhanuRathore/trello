/**
 * Auth service tests — written BEFORE the implementation (TDD).
 * Run: bun test src/modules/auth/auth.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp, signIn, refreshTokens, signOut, getMe } from './service';
import { eq } from 'drizzle-orm';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ?? 'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

// Clean test users between tests
beforeEach(async () => {
  await db.delete(schema.refreshTokens);
  await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, (await db.select().from(schema.organizations).where(eq(schema.organizations.slug, 'alice-corp')).then(r => r[0]?.id || '00000000-0000-0000-0000-000000000000'))));
  await db.delete(schema.organizations).where(eq(schema.organizations.slug, 'alice-corp'));
  await db.delete(schema.organizations).where(eq(schema.organizations.slug, 'alice-corp-2'));
  await db.delete(schema.users).where(eq(schema.users.email, 'alice@test.example'));
  await db.delete(schema.users).where(eq(schema.users.email, 'alice2@test.example'));
});

const validSignUp = {
  name: 'Alice Test',
  email: 'alice@test.example',
  password: 'SecurePass1',
  orgName: 'Alice Corp',
  orgSlug: 'alice-corp',
};

describe('signUp', () => {
  it('creates user, org, and owner membership — returns token pair', async () => {
    const result = await signUp(db, validSignUp);
    expect(result.accessToken).toBeString();
    expect(result.refreshToken).toBeString();
    expect(result.user.email).toBe('alice@test.example');
    expect(result.user.name).toBe('Alice Test');
    expect(result.organization.slug).toBe('alice-corp');

    // Verify DB records
    const users = await db.select().from(schema.users).where(eq(schema.users.email, 'alice@test.example'));
    expect(users).toHaveLength(1);
    expect(users[0]!.passwordHash).not.toBe('SecurePass1'); // must be hashed

    const orgs = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, 'alice-corp'));
    expect(orgs).toHaveLength(1);

    const members = await db.select().from(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, result.organization.id));
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe('org_owner');
    expect(members[0]!.status).toBe('active');
  });

  it('returns 409 conflict for duplicate email', async () => {
    await signUp(db, validSignUp);
    await expect(signUp(db, validSignUp)).rejects.toMatchObject({ status: 409 });
  });

  it('returns 409 conflict for duplicate org slug', async () => {
    await signUp(db, validSignUp);
    await expect(
      signUp(db, { ...validSignUp, email: 'bob@test.example' })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('signIn', () => {
  it('returns token pair for valid credentials', async () => {
    await signUp(db, validSignUp);
    const result = await signIn(db, { email: validSignUp.email, password: validSignUp.password });
    expect(result.accessToken).toBeString();
    expect(result.refreshToken).toBeString();
  });

  it('throws 401 for wrong password', async () => {
    await signUp(db, validSignUp);
    await expect(
      signIn(db, { email: validSignUp.email, password: 'WrongPass99' })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 for non-existent email', async () => {
    await expect(
      signIn(db, { email: 'nobody@test.example', password: 'SomePass1' })
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('refreshTokens', () => {
  it('returns new access token for valid refresh token', async () => {
    const { refreshToken } = await signUp(db, validSignUp);
    const result = await refreshTokens(db, refreshToken);
    expect(result.accessToken).toBeString();
    expect(result.refreshToken).toBeString();
  });

  it('throws 401 for revoked refresh token', async () => {
    const { refreshToken, user } = await signUp(db, validSignUp);
    // Revoke it
    await signOut(db, refreshToken, user.id);
    await expect(refreshTokens(db, refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 for non-existent token', async () => {
    await expect(refreshTokens(db, 'made-up-token-that-doesnt-exist')).rejects.toMatchObject({ status: 401 });
  });
});

describe('signOut', () => {
  it('revokes refresh token so it cannot be used again', async () => {
    const { refreshToken, user } = await signUp(db, validSignUp);
    await signOut(db, refreshToken, user.id);
    await expect(refreshTokens(db, refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});

describe('getMe', () => {
  it('returns user + organization data for authenticated user', async () => {
    const { user, organization } = await signUp(db, validSignUp);
    const result = await getMe(db, user.id);
    expect(result.id).toBe(user.id);
    expect(result.email).toBe('alice@test.example');
    expect(result.organizationId).toBe(organization.id);
    expect(result.role).toBe('org_owner');
  });
});
