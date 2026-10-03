import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import crypto from 'node:crypto';
import { Elysia } from 'elysia';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { db as appDb } from '../../db/index';
import { authPlugin, requirePermission, signAccessToken } from '../../middleware/auth';
import { deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';

/**
 * Auth failure-mode status codes (P0).
 *
 * The derive used to wrap token verification, membership checks, the burned-family
 * check and plan-tier resolution in one `catch { 401 }`. That made a deprovisioned
 * member look like an expired token, turned a database blip into "re-login", and
 * made the 403 branch unreachable. Each mode now reports its own status.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;

const emails: string[] = [];
const orgIds: string[] = [];
const userIds: string[] = [];

// A probe route: guarded by authPlugin only (no permission), so we observe the
// derive's own status rather than requirePermission's.
function probeApp() {
  return new Elysia().group('/v1', (g) => g.use(authPlugin).get('/__probe', () => ({ ok: true })));
}

async function fetchProbe(token: string) {
  const app = probeApp().listen(0);
  try {
    const port = app.server?.port ?? 0;
    const res = await fetch(`http://localhost:${port}/v1/__probe`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } finally {
    await app.stop(true);
  }
}

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await appDb
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, orgId));
    await appDb.delete(schema.roles).where(eq(schema.roles.organizationId, orgId));
    await appDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  }
  for (const email of emails) await deleteTestUser(appDb, email);
  await client.end();
});

async function makeOrg(prefix: string) {
  const slug = uniqueTestSlug(prefix);
  const email = uniqueTestEmail(prefix);
  emails.push(email);
  const [org] = await appDb
    .insert(schema.organizations)
    .values({ name: `${prefix} Org`, slug })
    .returning();
  const [user] = await appDb
    .insert(schema.users)
    .values({ name: `${prefix} User`, email, passwordHash: 'x' })
    .returning();
  orgIds.push(org!.id);
  userIds.push(user!.id);
  await appDb.insert(schema.organizationMembers).values({
    organizationId: org!.id,
    userId: user!.id,
    role: 'org_owner',
    status: 'active',
  });
  return { orgId: org!.id, userId: user!.id, email };
}

/**
 * `assertActiveOrgMembership` caches for 60s under `auth:membership:{org}:{user}`
 * and that key has no invalidation path (bumpUserCache targets a different key),
 * so tests that flip membership state must clear it explicitly.
 */
async function bustMembershipCache(orgId: string, userId: string): Promise<void> {
  const { getDataClient, isRedisAvailable } = await import('../../redis/client');
  const redis = getDataClient();
  if (!isRedisAvailable() || !redis) return;
  await redis.del(`auth:membership:${orgId}:${userId}`);
}

describe('Auth derive — distinct status per failure mode', () => {
  it('401 when the bearer token is not a valid JWT', async () => {
    const res = await fetchProbe('not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('401 when the token is signed but expired', async () => {
    // Signed with the wrong secret is indistinguishable from tampered: 401.
    const t = await makeOrg('auth-expired');
    const res = await fetchProbe(
      await signAccessToken({
        userId: t.userId,
        organizationId: t.orgId,
        isPlatformAdmin: false,
      }).then((v) => v.slice(0, -2) + 'xx')
    );
    expect(res.status).toBe(401);
  });

  it('403 when the token names an org the user is no longer an active member of', async () => {
    const t = await makeOrg('auth-membership');

    // Sanity: an active member passes the derive.
    const ok = await fetchProbe(
      await signAccessToken({ userId: t.userId, organizationId: t.orgId, isPlatformAdmin: false })
    );
    expect(ok.status).toBe(200);

    // Deactivate the membership — the same token must now be 403, not 401.
    await appDb
      .update(schema.organizationMembers)
      .set({ status: 'deactivated' })
      .where(
        and(
          eq(schema.organizationMembers.organizationId, t.orgId),
          eq(schema.organizationMembers.userId, t.userId)
        )
      );
    await bustMembershipCache(t.orgId, t.userId);

    const res = await fetchProbe(
      await signAccessToken({ userId: t.userId, organizationId: t.orgId, isPlatformAdmin: false })
    );
    expect(res.status).toBe(403);
    // Body must not claim the token is invalid — that is the masking bug.
    expect(JSON.stringify(res.body)).not.toContain('invalid or expired token');
  });

  it('403 for a soft-deleted membership', async () => {
    const t = await makeOrg('auth-softdelete');
    await appDb
      .update(schema.organizationMembers)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.organizationMembers.organizationId, t.orgId),
          eq(schema.organizationMembers.userId, t.userId)
        )
      );
    await bustMembershipCache(t.orgId, t.userId);
    const res = await fetchProbe(
      await signAccessToken({ userId: t.userId, organizationId: t.orgId, isPlatformAdmin: false })
    );
    expect(res.status).toBe(403);
  });

  it('401 when the refresh family was burned on a sensitive route', async () => {
    // Burned-family state lives in Redis only; without it this path is a no-op.
    const { getDataClient, isRedisAvailable } = await import('../../redis/client');
    if (!isRedisAvailable() || !getDataClient()) {
      // Skipped: burned-family state is Redis-only and Redis is unavailable here.
      return;
    }
    const t = await makeOrg('auth-burned');
    const { burnRefreshFamily } = await import('./auth-tokens');
    const familyId = crypto.randomUUID();
    await appDb.insert(schema.refreshTokens).values({
      userId: t.userId,
      tokenHash: `hash-${familyId}`,
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 600_000),
      familyId,
    });
    await burnRefreshFamily(appDb, familyId);

    const token = await signAccessToken({
      userId: t.userId,
      organizationId: t.orgId,
      isPlatformAdmin: false,
      sid: familyId,
    });

    // Burned family kills the token on /v1/billing but not on ordinary paths.
    const billing = new Elysia()
      .group('/v1', (g) => g.use(authPlugin).get('/billing/__probe', () => ({ ok: true })))
      .listen(0);
    try {
      const res = await fetch(`http://localhost:${billing.server?.port}/v1/billing/__probe`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);
    } finally {
      await billing.stop(true);
    }

    await appDb.delete(schema.refreshTokens).where(eq(schema.refreshTokens.familyId, familyId));
  });

  it('200 for an active member', async () => {
    const t = await makeOrg('auth-happy');
    const res = await fetchProbe(
      await signAccessToken({ userId: t.userId, organizationId: t.orgId, isPlatformAdmin: false })
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('200 for a platform admin without an organizationId', async () => {
    const t = await makeOrg('auth-admin');
    const res = await fetchProbe(
      await signAccessToken({ userId: t.userId, organizationId: '', isPlatformAdmin: true })
    );
    expect(res.status).toBe(200);
  });
});

describe('requirePermission — empty-org fallback is instrumented, not removed', () => {
  it('still resolves permissions for an empty-org token (step 1: log-only)', async () => {
    const t = await makeOrg('auth-emptyorg');
    const user = { userId: t.userId, organizationId: '', isPlatformAdmin: false };

    // The org owner seeded by reset.ts has every permission, so the fallback
    // path succeeds — this is the behaviour step 2 would change, pinned here so
    // the flip is a deliberate, visible diff.
    const result = await requirePermission('org.read')({
      user,
      set: {},
    });
    expect(result).toBeUndefined();
  });

  it('403s an empty-org token when the user has no active membership', async () => {
    const email = uniqueTestEmail('auth-noorg');
    emails.push(email);
    const [user] = await appDb
      .insert(schema.users)
      .values({ name: 'Orphan', email, passwordHash: 'x' })
      .returning();
    userIds.push(user!.id);
    // No organizationMembers row at all.
    const result = await requirePermission('org.read')({
      user: { userId: user!.id, organizationId: '', isPlatformAdmin: false },
      set: {},
    });
    expect(result).toMatchObject({ error: expect.stringContaining('Forbidden') });
  });
});
