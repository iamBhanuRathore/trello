import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { eq } from 'drizzle-orm';
import { signUp } from '../auth/service';
import {
  getAvailablePermissions,
  listRoles,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
} from './service';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

describe('Roles Service', () => {
  let client: ReturnType<typeof postgres>;
  let db: Database;
  let orgId: string;
  let customRoleId: string;
  let permissionIds: string[] = [];

  beforeAll(async () => {
    client = postgres(TEST_DB_URL, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Database;

    const email = `roles_${Date.now()}@example.com`;
    const slug = `roles-org-${Date.now()}`;

    const { organization } = await signUp(db, {
      name: 'Roles Admin',
      email,
      password: 'pass',
      orgName: 'Roles Org',
      orgSlug: slug,
    });
    orgId = organization.id;

    const perms = await getAvailablePermissions(db);
    permissionIds = perms.slice(0, 3).map((p) => p.id);
  });

  afterAll(async () => {
    if (customRoleId) {
      await db
        .delete(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, customRoleId));
      await db.delete(schema.roles).where(eq(schema.roles.id, customRoleId));
    }
    // Seeded team roles (Lead/Developer/Tester) reference the org without cascade.
    const orgRoles = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.organizationId, orgId));
    for (const r of orgRoles) {
      await db
        .delete(schema.organizationRoleMembers)
        .where(eq(schema.organizationRoleMembers.roleId, r.id));
      await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, r.id));
    }
    await db.delete(schema.roles).where(eq(schema.roles.organizationId, orgId));
    await db
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, orgId));
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.organizationId, orgId));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await client.end();
  });

  it('should list available system permissions', async () => {
    const perms = await getAvailablePermissions(db);
    expect(perms.length).toBeGreaterThan(0);
    expect(perms.some((p) => p.key === 'card.create')).toBe(true);
  });

  it('should create a custom role with permissions', async () => {
    const role = await createCustomRole(db, orgId, {
      name: 'External Contractor',
      permissionIds,
    });

    expect(role.id).toBeDefined();
    expect(role.name).toBe('External Contractor');
    expect(role.isSystemRole).toBe(false);
    expect(role.permissions.length).toBe(permissionIds.length);
    customRoleId = role.id;
  });

  it('should list organization roles including custom role', async () => {
    const allRoles = await listRoles(db, orgId);
    expect(allRoles.some((r) => r.id === customRoleId)).toBe(true);
  });

  it('should update a custom role name and permission matrix', async () => {
    const updated = await updateCustomRole(db, orgId, customRoleId, {
      name: 'Senior Contractor',
      permissionIds: [permissionIds[0]!],
    });

    expect(updated.name).toBe('Senior Contractor');
    expect(updated.permissions.length).toBe(1);
  });

  it('should delete a custom role', async () => {
    const deleted = await deleteCustomRole(db, orgId, customRoleId);
    expect(deleted!.id).toBe(customRoleId);

    const allRoles = await listRoles(db, orgId);
    expect(allRoles.some((r) => r.id === customRoleId)).toBe(false);
  });
});
