import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import {
  getOrg,
  updateOrg,
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  deactivateMember,
  reactivateMember,
  memberListCacheKey,
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

describe('Organizations Service', () => {
  it('should get an organization by id', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@test.com`,
      password: 'pass',
      orgName: `My Org ${id}`,
      orgSlug: `my-org-${id}`,
    });

    const org = await getOrg(db, organization.id);
    expect(org.id).toBe(organization.id);
    expect(org.name).toBe(`My Org ${id}`);
  });

  it('should update organization name', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@test.com`,
      password: 'pass',
      orgName: `My Org ${id}`,
      orgSlug: `my-org-${id}`,
    });

    const updated = await updateOrg(db, organization.id, { name: 'Renamed Org' });
    expect(updated.name).toBe('Renamed Org');
  });

  it('should invite and list members', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@test.com`,
      password: 'pass',
      orgName: `My Org ${id}`,
      orgSlug: `my-org-${id}`,
    });

    const bobEmail = `bob_${id}@test.com`;
    // Create a secondary user to invite
    const [invitedUser] = await db
      .insert(schema.users)
      .values({ name: 'Bob', email: bobEmail, passwordHash: 'hash' })
      .returning();

    const member = await inviteMember(db, organization.id, bobEmail, 'member', owner.id);
    expect(member?.userId).toBe(invitedUser!.id);
    expect(member?.role).toBe('member');

    const members = await listMembers(db, organization.id);
    expect(members).toHaveLength(2); // Owner + Bob
  });

  it('should isolate per-userId member lookups in cache (no cross-talk)', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@test.com`,
      password: 'pass',
      orgName: `My Org ${id}`,
      orgSlug: `my-org-${id}`,
    });

    const bobEmail = `bob_${id}@test.com`;
    const [bob] = await db
      .insert(schema.users)
      .values({ name: 'Bob', email: bobEmail, passwordHash: 'hash' })
      .returning();
    await inviteMember(db, organization.id, bobEmail, 'member', owner.id);

    // Sequential per-id lookups must each return their own user even though
    // the list endpoint caches — the cache key includes userIds.
    const [first] = await listMembers(db, organization.id, { userIds: [owner.id] });
    const [second] = await listMembers(db, organization.id, { userIds: [bob!.id] });
    expect(first?.userId).toBe(owner.id);
    expect(second?.userId).toBe(bob!.id);
  });

  it('should key member-list cache entries by userIds', () => {
    const a = memberListCacheKey('org-1', { userIds: ['u-1'] });
    const b = memberListCacheKey('org-1', { userIds: ['u-2'] });
    const c = memberListCacheKey('org-1', { userIds: ['u-2', 'u-1'] });
    const c2 = memberListCacheKey('org-1', { userIds: ['u-1', 'u-2'] });
    const d = memberListCacheKey('org-1', {});
    expect(a).not.toBe(b);
    // Order-insensitive: same set → same entry.
    expect(c).toBe(c2);
    expect(a).not.toBe(d);
  });

  it('should update a member role', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@test.com`,
      password: 'pass',
      orgName: `My Org ${id}`,
      orgSlug: `my-org-${id}`,
    });

    const bobEmail = `bob_${id}@test.com`;
    await db
      .insert(schema.users)
      .values({ name: 'Bob', email: bobEmail, passwordHash: 'hash' })
      .returning();

    const member = await inviteMember(db, organization.id, bobEmail, 'member', owner.id);

    const updated = await updateMemberRole(db, organization.id, member!.id, 'org_admin');
    expect(updated.role).toBe('org_admin');
  });

  it('should deactivate and reactivate a member with email notifications', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@test.com`,
      password: 'pass',
      orgName: `My Org ${id}`,
      orgSlug: `my-org-${id}`,
    });

    const bobEmail = `bob_${id}@test.com`;
    await db
      .insert(schema.users)
      .values({ name: 'Bob Smith', email: bobEmail, passwordHash: 'hash' })
      .returning();

    const member = await inviteMember(db, organization.id, bobEmail, 'member', owner.id);

    // Deactivate member
    const deactivated = await deactivateMember(
      db,
      organization.id,
      member!.id,
      owner.id,
      'Temporary leave of absence'
    );
    expect(deactivated).toBeDefined();
    expect(deactivated?.status).toBe('deactivated');
    expect(deactivated?.deactivationReason).toBe('Temporary leave of absence');
    expect(deactivated?.deactivatedBy).toBe(owner.id);

    // Reactivate member
    const reactivated = await reactivateMember(db, organization.id, member!.id, owner.id);
    expect(reactivated).toBeDefined();
    expect(reactivated?.status).toBe('active');
    expect(reactivated?.deactivationReason).toBeNull();
    expect(reactivated?.deactivatedBy).toBeNull();
  });

  it('should soft-remove a member', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const { organization, user: owner } = await signUp(db, {
      name: 'Owner',
      email: `owner_${id}@test.com`,
      password: 'pass',
      orgName: `My Org ${id}`,
      orgSlug: `my-org-${id}`,
    });

    const bobEmail = `bob_${id}@test.com`;
    await db
      .insert(schema.users)
      .values({ name: 'Bob', email: bobEmail, passwordHash: 'hash' })
      .returning();

    const member = await inviteMember(db, organization.id, bobEmail, 'member', owner.id);

    await removeMember(db, organization.id, member!.id);

    const members = await listMembers(db, organization.id);
    expect(members).toHaveLength(1); // Only owner remains (soft-deleted Bob is excluded)
  });
});
