import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import postgres from 'postgres';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { db as appDb } from '../../db/index';
import { satisfiesPermission } from '../../lib/permissions-resolver';
import { deleteTestUser } from '../../test-utils';

/**
 * Guard + parity contract for the sprint/phase permission model (P0-8).
 *
 * Correction to the original plan: `phases/*` and `sprints/*` were NOT missing
 * `requirePermission` guards — all eight handlers in each file have had one. The
 * real risk is the opposite, and this test pins it:
 *
 *   1. every mutating route is guarded (a new handler without a guard fails here);
 *   2. reads require `project.read` and mutations require their specific key;
 *   3. the system roles' grants are internally consistent, so editing the seed
 *      cannot silently strand a role.
 *
 * `satisfiesPermission` is the same alias-aware resolver `requirePermission`
 * uses, so these assertions track production semantics rather than a
 * reimplementation of them.
 */

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;

const orgIds: string[] = [];
const emails: string[] = [];

beforeAll(() => {
  client = postgres(TEST_DB_URL, { max: 1 });
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await appDb
      .delete(schema.organizationRoleMembers)
      .where(eq(schema.organizationRoleMembers.organizationId, orgId));
    await appDb
      .delete(schema.rolePermissions)
      .where(
        inArray(
          schema.rolePermissions.roleId,
          appDb
            .select({ id: schema.roles.id })
            .from(schema.roles)
            .where(eq(schema.roles.organizationId, orgId))
        )
      );
    await appDb.delete(schema.roles).where(eq(schema.roles.organizationId, orgId));
    await appDb
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, orgId));
    await appDb.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
  }
  for (const email of emails) await deleteTestUser(appDb, email);
  await client.end();
});

async function systemRoleGrants(roleName: string): Promise<Set<string>> {
  const rows = await appDb
    .select({ key: schema.permissions.key })
    .from(schema.rolePermissions)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.rolePermissions.roleId))
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
    .where(and(eq(schema.roles.name, roleName), isNull(schema.roles.organizationId)));
  return new Set(rows.map((r) => r.key));
}

describe('Sprint/phase routes are guarded', () => {
  it('every sprints handler declares requirePermission', async () => {
    const src = await Bun.file(new URL('../sprints/routes.ts', import.meta.url)).text();
    const handlers = (src.match(/^\s*\.(get|post|put|patch|delete)\(/gm) ?? []).length;
    const guards = (src.match(/requirePermission\(/g) ?? []).length;
    expect(handlers).toBeGreaterThan(0);
    expect(guards).toBeGreaterThanOrEqual(handlers);
  });

  it('every phases handler declares requirePermission', async () => {
    const src = await Bun.file(new URL('../phases/routes.ts', import.meta.url)).text();
    const handlers = (src.match(/^\s*\.(get|post|put|patch|delete)\(/gm) ?? []).length;
    const guards = (src.match(/requirePermission\(/g) ?? []).length;
    expect(handlers).toBeGreaterThan(0);
    expect(guards).toBeGreaterThanOrEqual(handlers);
  });

  it('sprint reads use project.read and mutations use sprint.*', async () => {
    const src = await Bun.file(new URL('../sprints/routes.ts', import.meta.url)).text();
    expect(src).toContain("requirePermission('sprint.create')");
    expect(src).toContain("requirePermission('sprint.update')");
    expect(src).toContain("requirePermission('sprint.delete')");
    expect(src).toContain("requirePermission('project.read')");
  });

  it('phase mutations use phase.*', async () => {
    const src = await Bun.file(new URL('../phases/routes.ts', import.meta.url)).text();
    expect(src).toContain("requirePermission('phase.create')");
    expect(src).toContain("requirePermission('phase.update')");
    expect(src).toContain("requirePermission('phase.delete')");
  });
});

describe('system role grant parity', () => {
  it('Org Owner holds every sprint and phase key', async () => {
    const granted = await systemRoleGrants('Org Owner');
    for (const key of [
      'sprint.create',
      'sprint.update',
      'sprint.delete',
      'phase.create',
      'phase.update',
      'phase.delete',
    ]) {
      expect(granted.has(key)).toBe(true);
    }
  });

  it('Org Admin holds every sprint and phase key', async () => {
    const granted = await systemRoleGrants('Org Admin');
    for (const key of [
      'sprint.create',
      'sprint.update',
      'sprint.delete',
      'phase.create',
      'phase.update',
      'phase.delete',
    ]) {
      expect(granted.has(key)).toBe(true);
    }
  });

  it('Viewer can read but not mutate sprints or phases', async () => {
    const granted = await systemRoleGrants('Viewer');
    expect(granted.has('project.read')).toBe(true);
    expect(granted.has('sprint.create')).toBe(false);
    expect(granted.has('sprint.update')).toBe(false);
    expect(granted.has('sprint.delete')).toBe(false);
    expect(granted.has('phase.create')).toBe(false);
    expect(granted.has('phase.update')).toBe(false);
  });

  it('documents that Member cannot mutate sprints or phases', async () => {
    // This is the behaviour the dashboard gating in ProjectSprints/ProjectPhases
    // exists for: a member sees read-only sprints but the create/start/complete
    // controls would 403. Pinned deliberately — if the seed later grants Member
    // these keys, this assertion is the signal to revisit that gating.
    const granted = await systemRoleGrants('Member');
    const canMutateSprints =
      satisfiesPermission(granted, 'sprint.create') ||
      satisfiesPermission(granted, 'sprint.update');
    const canMutatePhases =
      satisfiesPermission(granted, 'phase.create') || satisfiesPermission(granted, 'phase.update');
    expect(canMutateSprints).toBe(false);
    expect(canMutatePhases).toBe(false);
    // Reading is still allowed, which is why the pages render at all.
    expect(satisfiesPermission(granted, 'project.read')).toBe(true);
  });

  it('any role holding sprint.* can also read the project list', async () => {
    // A role that can mutate but not read would see an empty page it cannot act
    // from — a contradiction worth failing on.
    for (const roleName of ['Org Owner', 'Org Admin', 'Member', 'Viewer']) {
      const granted = await systemRoleGrants(roleName);
      const mutates = satisfiesPermission(granted, 'sprint.create');
      if (mutates) {
        expect(satisfiesPermission(granted, 'project.read')).toBe(true);
      }
    }
  });
});
