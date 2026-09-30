/**
 * Sliding refresh-family tests — written alongside the implementation.
 * Run: bun test src/modules/auth/refresh.test.ts
 *
 * Covers: family/absolute preservation, idle clamp, concurrent-race grace
 * siblings, past-window burn scope (per-family), UA mismatch, grace cap,
 * absolute expiry, sign-out burn, change-password keep-current.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createHash } from 'crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import {
  signUp,
  signIn,
  refreshTokens,
  signOut,
  changePassword,
  issueTokenPair,
  refreshReuseWindow,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await db.delete(schema.refreshTokens);
  // FK-safe teardown: seeded team roles reference the org without cascade.
  const [org] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, 'refresh-corp'))
    .limit(1);
  if (org) {
    const orgRoles = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.organizationId, org.id));
    for (const r of orgRoles) {
      await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, r.id));
      await db.delete(schema.roles).where(eq(schema.roles.id, r.id));
    }
    await db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, org.id));
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, org.id));
    await db
      .delete(schema.ssoConfigurations)
      .where(eq(schema.ssoConfigurations.organizationId, org.id));
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, org.id));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, org.id));
  }
  await db.delete(schema.users).where(eq(schema.users.email, 'refresh@test.example'));
});

const validSignUp = {
  name: 'Refresh Test',
  email: 'refresh@test.example',
  password: 'SecurePass1',
  orgName: 'Refresh Corp',
  orgSlug: 'refresh-corp',
};

function hash(rt: string): string {
  return createHash('sha256').update(rt).digest('hex');
}

async function rowsForUser(userId: string) {
  return db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.userId, userId));
}

describe('sliding rotation', () => {
  it('keeps the family + absolute expiry and extends the idle window', async () => {
    const { refreshToken: rt1 } = await signUp(db, validSignUp);
    const [parent] = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hash(rt1)));
    expect(parent!.familyId).toBeString();
    expect(parent!.absoluteExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const res = await refreshTokens(db, rt1);
    expect(res.refreshToken).not.toBe(rt1);

    const [revoked] = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hash(rt1)));
    const [child] = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hash(res.refreshToken)));
    expect(revoked!.revokedAt).not.toBeNull();
    expect(child!.revokedAt).toBeNull();
    expect(child!.familyId).toBe(parent!.familyId);
    expect(child!.absoluteExpiresAt.getTime()).toBe(parent!.absoluteExpiresAt.getTime());
    expect(child!.parentHash).toBe(hash(rt1));
    expect(child!.expiresAt.getTime()).toBeGreaterThanOrEqual(parent!.expiresAt.getTime());
  });

  it('clamps the idle expiry to the absolute cap', async () => {
    const { user, organization } = await signUp(db, validSignUp);
    const nearAbsolute = new Date(Date.now() + 60 * 60 * 1000);
    const pair = await issueTokenPair(db, user.id, organization.id, false, {
      absoluteExpiresAt: nearAbsolute,
    });
    const res = await refreshTokens(db, pair.refreshToken);
    const [child] = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hash(res.refreshToken)));
    expect(child!.expiresAt.getTime()).toBeLessThanOrEqual(nearAbsolute.getTime());
    expect(child!.absoluteExpiresAt.getTime()).toBe(nearAbsolute.getTime());
  });
});

describe('reuse grace (race path)', () => {
  it('two back-to-back refreshes with the same token both succeed', async () => {
    const { refreshToken, user } = await signUp(db, validSignUp);
    const r1 = await refreshTokens(db, refreshToken);
    // Simulates the 2-tab / StrictMode race: the parent is already rotated.
    const r2 = await refreshTokens(db, refreshToken);
    expect(r2.refreshToken).not.toBe(r1.refreshToken);

    // Family intact: both children remain usable.
    const r3 = await refreshTokens(db, r1.refreshToken);
    const r4 = await refreshTokens(db, r2.refreshToken);
    expect(r3.accessToken).toBeString();
    expect(r4.accessToken).toBeString();

    const rows = await rowsForUser(user.id);
    const live = rows.filter((r) => !r.revokedAt);
    expect(live.length).toBe(2);
    expect(new Set(live.map((r) => r.familyId)).size).toBe(1);
  });

  it('past-window reuse burns only that family; a second device survives', async () => {
    const a = await signUp(db, validSignUp);
    const b = await signIn(db, { email: validSignUp.email, password: validSignUp.password });
    expect(b.refreshToken).not.toBe(a.refreshToken);

    await refreshTokens(db, a.refreshToken);
    // Age the revoked parent past the grace window.
    await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date(Date.now() - 120_000) })
      .where(eq(schema.refreshTokens.tokenHash, hash(a.refreshToken)));

    await expect(refreshTokens(db, a.refreshToken)).rejects.toMatchObject({ status: 401 });

    // Family A fully burned…
    const rowsA = await db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hash(a.refreshToken)));
    expect(rowsA[0]!.revokedAt).not.toBeNull();

    // …but family B (second login) still rotates fine.
    const b2 = await refreshTokens(db, b.refreshToken);
    expect(b2.accessToken).toBeString();
  });

  it('UA mismatch on reuse burns the family', async () => {
    const { refreshToken } = await signUp(db, validSignUp, { userAgent: 'UA-A' });
    // r1's row is bound to UA-A.
    const r1 = await refreshTokens(db, refreshToken, { userAgent: 'UA-A' });
    // Same-UA reuse of the rotated parent takes the grace path…
    const r2 = await refreshTokens(db, refreshToken, { userAgent: 'UA-A' });
    expect(r2.refreshToken).not.toBe(r1.refreshToken);
    // Rotate r1 itself so its UA-bound row becomes revoked…
    const r1b = await refreshTokens(db, r1.refreshToken, { userAgent: 'UA-A' });
    expect(r1b.accessToken).toBeString();
    // …then re-presenting revoked r1 from another UA burns the family.
    await expect(refreshTokens(db, r1.refreshToken, { userAgent: 'UA-B' })).rejects.toMatchObject({
      status: 401,
    });
    await expect(refreshTokens(db, r2.refreshToken)).rejects.toMatchObject({ status: 401 });
    await expect(refreshTokens(db, r1b.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('exhausted grace uses burn the family', async () => {
    const { refreshToken } = await signUp(db, validSignUp);
    await refreshTokens(db, refreshToken);
    const { maxUses } = refreshReuseWindow();
    await db
      .update(schema.refreshTokens)
      .set({ graceUses: maxUses })
      .where(eq(schema.refreshTokens.tokenHash, hash(refreshToken)));
    await expect(refreshTokens(db, refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});

describe('absolute expiry + revocation', () => {
  it('absolute-expired tokens burn the family and return 401', async () => {
    const { refreshToken, user } = await signUp(db, validSignUp);
    const past = new Date(Date.now() - 60_000);
    await db
      .update(schema.refreshTokens)
      .set({ expiresAt: past, absoluteExpiresAt: past })
      .where(eq(schema.refreshTokens.tokenHash, hash(refreshToken)));
    await expect(refreshTokens(db, refreshToken)).rejects.toMatchObject({ status: 401 });
    const rows = await rowsForUser(user.id);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('sign-out burns the family — immediate reuse fails', async () => {
    const { refreshToken, user } = await signUp(db, validSignUp);
    const r1 = await refreshTokens(db, refreshToken);
    await signOut(db, r1.refreshToken, user.id);
    await expect(refreshTokens(db, r1.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('password change revokes other families but keeps the current one', async () => {
    const a = await signUp(db, validSignUp);
    const b = await signIn(db, { email: validSignUp.email, password: validSignUp.password });
    const [bRow] = await db
      .select({ familyId: schema.refreshTokens.familyId })
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, hash(b.refreshToken)));

    await changePassword(
      db,
      a.user.id,
      { currentPassword: 'SecurePass1', newPassword: 'NewSecurePass2' },
      { keepFamilyId: bRow!.familyId }
    );

    await expect(refreshTokens(db, a.refreshToken)).rejects.toMatchObject({ status: 401 });
    const b2 = await refreshTokens(db, b.refreshToken);
    expect(b2.accessToken).toBeString();
  });
});
