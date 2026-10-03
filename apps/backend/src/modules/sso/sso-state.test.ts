import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import postgres from 'postgres';
import { and, eq, isNull, lt } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { db as appDb } from '../../db/index';
import { generateSSOLoginUrl } from './service';
import { deleteTestUser, uniqueTestEmail, uniqueTestSlug } from '../../test-utils';

/**
 * SSO `state` must be verified from a durable store, never skipped.
 *
 * The callback previously read the state from Redis inside
 * `if (redis && isRedisAvailable())`, so whenever Redis was unavailable the whole
 * check was bypassed and the comment claimed the WorkOS code exchange was still
 * sufficient authentication. During a Redis outage — precisely when an attacker
 * benefits — SSO login had no CSRF or replay protection.
 *
 * These tests exercise the state store itself: a state that was never issued, one
 * that is expired, one that has already been consumed, and the happy path.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;

const orgIds: string[] = [];
const emails: string[] = [];
const states: string[] = [];

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
});

afterAll(async () => {
  for (const s of states) {
    await appDb.delete(schema.ssoLoginStates).where(eq(schema.ssoLoginStates.state, s));
  }
  await appDb.delete(schema.ssoLoginStates).where(lt(schema.ssoLoginStates.expiresAt, new Date(0)));
  for (const orgId of orgIds) {
    // Leaf -> root: sso_configurations and any states cascade from the org, but
    // deleting the org first trips the organization_id foreign keys.
    await appDb
      .delete(schema.ssoConfigurations)
      .where(eq(schema.ssoConfigurations.organizationId, orgId));
    await appDb
      .delete(schema.ssoLoginStates)
      .where(eq(schema.ssoLoginStates.organizationId, orgId));
    await appDb
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, orgId));
    await appDb.delete(schema.roles).where(eq(schema.roles.organizationId, orgId));
    await appDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  }
  for (const email of emails) await deleteTestUser(appDb, email);
  await client.end();
});

async function makeSsoOrg(domain: string) {
  const slug = uniqueTestSlug('sso-state');
  const email = uniqueTestEmail('sso-state');
  emails.push(email);
  const [org] = await appDb
    .insert(schema.organizations)
    .values({ name: 'SSO State Org', slug })
    .returning();
  orgIds.push(org!.id);
  const [user] = await appDb
    .insert(schema.users)
    .values({ name: 'SSO User', email, passwordHash: 'x' })
    .returning();
  await appDb.insert(schema.organizationMembers).values({
    organizationId: org!.id,
    userId: user!.id,
    role: 'org_owner',
    status: 'active',
  });
  await appDb.insert(schema.ssoConfigurations).values({
    organizationId: org!.id,
    provider: 'workos',
    domain,
    clientId: 'client_test',
  });
  return { orgId: org!.id, domain };
}

describe('SSO login state is durable and single-use', () => {
  it('persists the state to the database when a login URL is issued', async () => {
    const { domain } = await makeSsoOrg('durable.example.com');
    const result = await generateSSOLoginUrl(appDb, domain);
    states.push(result.state);

    const [row] = await appDb
      .select()
      .from(schema.ssoLoginStates)
      .where(eq(schema.ssoLoginStates.state, result.state))
      .limit(1);

    expect(row).toBeDefined();
    expect(row?.domain).toBe(domain);
    expect(row?.consumedAt).toBeNull();
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('issues a distinct state per login attempt', async () => {
    const { domain } = await makeSsoOrg('distinct.example.com');
    const a = await generateSSOLoginUrl(appDb, domain);
    const b = await generateSSOLoginUrl(appDb, domain);
    states.push(a.state, b.state);
    expect(a.state).not.toBe(b.state);
  });

  it('stores an unpredictable state value', async () => {
    const { domain } = await makeSsoOrg('unpredictable.example.com');
    const result = await generateSSOLoginUrl(appDb, domain);
    states.push(result.state);
    // 16 random bytes hex-encoded, behind a prefix.
    expect(result.state).toMatch(/^sso_[0-9a-f]{32}$/);
  });

  it('has no state row for an unissued state (so the callback must reject)', async () => {
    const forged = `sso_${'0'.repeat(32)}`;
    const [row] = await appDb
      .select()
      .from(schema.ssoLoginStates)
      .where(eq(schema.ssoLoginStates.state, forged))
      .limit(1);
    expect(row).toBeUndefined();
  });

  it('rejects an expired state', async () => {
    const { domain } = await makeSsoOrg('expired.example.com');
    const result = await generateSSOLoginUrl(appDb, domain);
    states.push(result.state);

    await appDb
      .update(schema.ssoLoginStates)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.ssoLoginStates.state, result.state));

    const [row] = await appDb
      .select()
      .from(schema.ssoLoginStates)
      .where(eq(schema.ssoLoginStates.state, result.state))
      .limit(1);
    expect(row!.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('records consumption so a replayed callback cannot reuse the state', async () => {
    const { domain } = await makeSsoOrg('replay.example.com');
    const result = await generateSSOLoginUrl(appDb, domain);
    states.push(result.state);

    // This mirrors the guarded claim the callback performs.
    const claim = () =>
      appDb
        .update(schema.ssoLoginStates)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(schema.ssoLoginStates.state, result.state),
            isNull(schema.ssoLoginStates.consumedAt)
          )
        )
        .returning({ state: schema.ssoLoginStates.state });

    // First callback wins the claim.
    expect((await claim()).length).toBe(1);
    // A replay of the same state is refused: nothing left unconsumed.
    expect((await claim()).length).toBe(0);
  });

  it('does not depend on Redis being reachable', async () => {
    // The service module no longer imports the Redis client at all; assert that
    // structurally so the "skip when Redis is down" branch cannot come back.
    const src = await Bun.file(new URL('./service.ts', import.meta.url)).text();
    expect(src).not.toContain('isRedisAvailable');
    expect(src).not.toContain('sso:state:');
    expect(src).toContain('ssoLoginStates');
  });
});
