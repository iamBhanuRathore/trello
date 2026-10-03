import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { deleteTestOrg, deleteTestUser } from '../../test-utils';
import { signUp } from '../auth/service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Super Admin Routes', () => {
  let testPlanId: string;
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let regularEmail: string;
  let adminEmail: string;

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema });

    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    // 1. Create a regular organization with users
    regularEmail = `regular_${id}@example.com`;
    const { organization: org } = await signUp(db, {
      name: 'Regular',
      email: regularEmail,
      password: 'pass',
      orgName: `Reg Org ${id}`,
      orgSlug: `reg-org-${id}`,
    });
    orgId = org.id;

    // 2. Make one of the users a platform admin manually
    adminEmail = `superadmin_${id}@example.com`;
    await db.insert(schema.users).values({
      email: adminEmail,
      name: 'Super Admin',
      isPlatformAdmin: true,
    });

    testPlanId = (org as any).planId ?? '';
  });

  afterAll(async () => {
    // This chain deleted organizationMembers then organizations, with no roles,
    // rolePermissions or subscriptions delete, so the org delete threw on a
    // restrict FK and `catch {}` swallowed it — the org and both users survived
    // every run with no signal. deleteTestOrg orders the leaves first.
    if (orgId) await deleteTestOrg(db, orgId);
    await deleteTestUser(db, regularEmail);
    await deleteTestUser(db, adminEmail);
    await client.end();
  });

  it('should list tenants', async () => {
    const { listTenants } = await import('./service');
    const tenants = await listTenants(db);
    expect(Array.isArray(tenants)).toBe(true);
    expect(tenants.length).toBeGreaterThan(0);
  });

  it('should list plans', async () => {
    const { listPlans } = await import('./service');
    const plans = await listPlans(db);
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
    testPlanId = plans[0]?.id ?? '';
  });

  it('should update plan', async () => {
    const { updatePlan } = await import('./service');
    if (!testPlanId) {
      const { listPlans } = await import('./service');
      const plans = await listPlans(db);
      testPlanId = plans[0]?.id ?? '';
    }
    if (testPlanId) {
      const updated = await updatePlan(db, testPlanId, {
        maxSeats: 999,
        maxBoards: 50,
      });
      expect(updated.maxSeats).toBe(999);
      expect(updated.maxBoards).toBe(50);
    }
  });
});
