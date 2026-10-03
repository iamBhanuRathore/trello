import { eq, inArray } from 'drizzle-orm';
import type { Database } from './db/index';
import * as schema from './db/schema/index';

/**
 * Test isolation helpers (scratch `boardly_test` DB is shared across suites).
 *
 * Two rules keep suites repeatable and parallel-safe:
 * 1. Every suite signs up with a UNIQUE email/slug per run (`Date.now` alone
 *    collides across parallel workers — the random suffix fixes that).
 * 2. Teardown goes through `deleteTestOrg`/`deleteTestUser` below. Hand-rolled
 *    chains died on the `roles.organization_id` restrict FK (and whole-table
 *    deletes of shared tables are hostile to other suites — scope by id).
 */

export function uniqueTestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueTestEmail(prefix: string): string {
  return `${uniqueTestId(prefix)}@example.com`;
}

export function uniqueTestSlug(prefix: string): string {
  return uniqueTestId(prefix);
}

/** FK-safe org teardown, leaf → root. Must run AFTER suite leaf cleanup. */
export async function deleteTestOrg(db: Database, orgId: string): Promise<void> {
  const orgSubs = db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.organizationId, orgId));
  await db
    .delete(schema.seatChangeRequests)
    .where(inArray(schema.seatChangeRequests.subscriptionId, orgSubs));
  await db.delete(schema.guestSeats).where(eq(schema.guestSeats.organizationId, orgId));
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId));
  // sso_configurations.organization_id is NO ACTION (verified against
  // information_schema), so the org delete below trips on it. Three suites were
  // each hand-rolling this one statement because the helper could not be used
  // without it.
  await db
    .delete(schema.ssoConfigurations)
    .where(eq(schema.ssoConfigurations.organizationId, orgId));
  await db
    .delete(schema.organizationRoleMembers)
    .where(eq(schema.organizationRoleMembers.organizationId, orgId));
  await db
    .delete(schema.rolePermissions)
    .where(
      inArray(
        schema.rolePermissions.roleId,
        db
          .select({ id: schema.roles.id })
          .from(schema.roles)
          .where(eq(schema.roles.organizationId, orgId))
      )
    );
  await db.delete(schema.roles).where(eq(schema.roles.organizationId, orgId));
  await db.delete(schema.invitations).where(eq(schema.invitations.organizationId, orgId));
  await db
    .delete(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}

/** FK-safe user teardown (tokens first — `refresh_tokens.user_id` restricts). */
export async function deleteTestUser(db: Database, email: string): Promise<void> {
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) return;
  await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, user.id));
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
}

/**
 * Deletes refresh tokens for the named users only.
 *
 * Several suites reset token state with a bare `db.delete(refreshTokens)` and
 * no WHERE. `refresh_tokens` is shared, so that wiped every live token in
 * boardly_test — including other suites' — so an unrelated suite's mid-test
 * sign-in could fail with a 401 depending on file execution order. Use this, or
 * `deleteTestUser`, instead.
 */
export async function deleteTestUserTokens(db: Database, emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await db
    .delete(schema.refreshTokens)
    .where(
      inArray(
        schema.refreshTokens.userId,
        db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(inArray(schema.users.email, emails))
      )
    );
}
