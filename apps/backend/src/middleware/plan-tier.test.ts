import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema/index';
import type { Database } from '../db/index';
import { signUp } from '../modules/auth/service';
import { resolveOrgPlanTier, __setStaleTierForTest, __clearStaleTierCache } from './auth';
import { deleteTestOrg, deleteTestUser } from '../test-utils';
import { PlanTier } from '@boardly/shared-types';

/**
 * Plan-tier fail-closed contract: a database error serves the last-known tier
 * and throws 503 only when there is nothing cached — never a silent downgrade
 * to Free. 'not-a-uuid' forces a Postgres 22P02 error without touching data.
 */
describe('resolveOrgPlanTier fail-closed', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let email: string;

  beforeAll(async () => {
    client = postgres(
      process.env['DATABASE_TEST_URL'] ??
        'postgresql://boardly:boardly_test@localhost:5433/boardly_test',
      { max: 1 }
    );
    db = drizzle(client, { schema });
    __clearStaleTierCache();
    email = `tier_${Date.now()}@example.com`;
    const { organization } = await signUp(db, {
      name: 'Tier Owner',
      email,
      password: 'pass',
      orgName: `Tier Org ${Date.now()}`,
      orgSlug: `tier-org-${Date.now()}`,
    });
    orgId = organization.id;
  });

  afterAll(async () => {
    __clearStaleTierCache();
    if (orgId) await deleteTestOrg(db, orgId);
    if (email) await deleteTestUser(db, email);
    await client.end();
  });

  it('resolves the tier from the database on cache miss', async () => {
    expect(await resolveOrgPlanTier(orgId)).toBe(PlanTier.Free);
  });

  it('throws 503 on DB error with no cache', async () => {
    await expect(resolveOrgPlanTier('not-a-uuid')).rejects.toMatchObject({ status: 503 });
  });

  it('serves stale tier on DB error', async () => {
    __setStaleTierForTest('not-a-uuid', PlanTier.Pro);
    expect(await resolveOrgPlanTier('not-a-uuid')).toBe(PlanTier.Pro);
  });
});
