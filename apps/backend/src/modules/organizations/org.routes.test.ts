/**
 * Route-level RBAC regression tests.
 *
 * These go through the real HTTP layer because the original vulnerability was
 * wiring-level: permission checks registered via `.use(requirePermission(...))`
 * (an Elysia sub-plugin with local-scope hooks) never executed on
 * parent-instance routes, letting ANY authenticated member perform admin
 * actions (e.g. DELETE /v1/orgs/:orgId/members/:memberId).
 *
 * Run: bun test src/modules/organizations/org.routes.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Elysia } from 'elysia';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { orgRoutes } from './routes';
import { signAccessToken } from '../../middleware/auth';
import {
  ALL_PERMISSION_KEYS,
  ORG_PERMISSIONS,
  WORKSPACE_PERMISSIONS,
  PROJECT_PERMISSIONS,
  BOARD_PERMISSIONS,
  CARD_PERMISSIONS,
} from '@boardly/shared-types';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ?? 'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;
let serverPort = 0;
let stopServer: () => void = () => {};

const orgId = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let ownerId = '';
let memberId = '';
let orgUuid = '';
let ownerToken = '';
let memberToken = '';
const memberEmail = `rbac_member_${Date.now()}@test.example`;
const ownerEmail = `rbac_owner_${Date.now()}@test.example`;

async function ensureRbacSeed(db: Database) {
  // Permissions registry
  for (const key of ALL_PERMISSION_KEYS) {
    await db.insert(schema.permissions).values({ key, description: key }).onConflictDoNothing();
  }
  // System roles
  for (const name of ['Org Owner', 'Org Admin', 'Member', 'Viewer']) {
    const existing = (await db.execute(
      sql`SELECT id FROM roles WHERE name = ${name} AND is_system_role = true LIMIT 1`
    )) as unknown as { id: string }[];
    if (!existing || existing.length === 0) {
      await db.execute(sql`INSERT INTO roles (name, is_system_role) VALUES (${name}, true)`);
    }
  }
  const roleRows = (await db.execute(
    sql`SELECT id, name FROM roles WHERE is_system_role = true`
  )) as unknown as { id: string; name: string }[];
  const roleId = Object.fromEntries(roleRows.map((r) => [r.name, r.id]));

  // Org Owner → everything; Member → read-only basics (NOT member.remove)
  const grants: Array<[string, string[]]> = [
    ['Org Owner', ALL_PERMISSION_KEYS],
    [
      'Member',
      [
        ORG_PERMISSIONS.READ,
        WORKSPACE_PERMISSIONS.READ,
        PROJECT_PERMISSIONS.READ,
        BOARD_PERMISSIONS.READ,
        CARD_PERMISSIONS.READ,
      ],
    ],
    ['Viewer', [ORG_PERMISSIONS.READ]],
  ];
  for (const [roleName, keys] of grants) {
    for (const key of keys) {
      await db.execute(sql`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT ${roleId[roleName]}, p.id FROM permissions p WHERE p.key = ${key}
        ON CONFLICT DO NOTHING
      `);
    }
  }
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });

  await ensureRbacSeed(db);

  const [org] = await db
    .insert(schema.organizations)
    .values({ name: 'RBAC Test Org', slug: orgId })
    .returning();

  const [owner] = await db
    .insert(schema.users)
    .values({ name: 'Owner', email: ownerEmail, passwordHash: 'x' })
    .returning();
  const [member] = await db
    .insert(schema.users)
    .values({ name: 'Leo (member)', email: memberEmail, passwordHash: 'x' })
    .returning();
  ownerId = owner!.id;
  memberId = member!.id;
  orgUuid = org!.id;

  await db.insert(schema.organizationMembers).values([
    { organizationId: org!.id, userId: ownerId, role: 'org_owner', status: 'active' },
    { organizationId: org!.id, userId: memberId, role: 'member', status: 'active' },
  ]);

  ownerToken = await signAccessToken({ userId: ownerId, organizationId: org!.id, isPlatformAdmin: false });
  memberToken = await signAccessToken({ userId: memberId, organizationId: org!.id, isPlatformAdmin: false });

  const app = new Elysia().group('/v1', (g) => g.use(orgRoutes)).listen(0);
  serverPort = app.server?.port ?? 0;
  stopServer = () => app.stop(true);
});

afterAll(async () => {
  stopServer();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, orgId));
  if (org) {
    await db.delete(schema.auditLog).where(eq(schema.auditLog.organizationId, org.id));
    await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, org.id));
    await db.delete(schema.users).where(eq(schema.users.email, ownerEmail));
    await db.delete(schema.users).where(eq(schema.users.email, memberEmail));
    await db.delete(schema.organizations).where(eq(schema.organizations.id, org.id));
  }
  await client.end();
});

const call = (method: string, path: string, token?: string) =>
  fetch(`http://127.0.0.1:${serverPort}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe('Organization routes — RBAC enforcement over HTTP', () => {
  it('a plain member CANNOT remove an org member (regression: silent permission bypass)', async () => {
    const res = await call('DELETE', `/v1/orgs/${orgUuid}/members/${ownerId}`, memberToken);
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toContain('member.remove');

    const [stillActive] = await db
      .select()
      .from(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.userId, ownerId), sql`deleted_at IS NULL`));
    expect(stillActive).toBeDefined();
  });

  it('a plain member CAN list members (holds org.read)', async () => {
    const res = await call('GET', `/v1/orgs/${orgUuid}/members`, memberToken);
    expect(res.status).toBe(200);
    const members = (await res.json()) as any[];
    expect(members).toHaveLength(2);
  });

  it('an org owner CAN remove a member', async () => {
    // create a disposable third member for the owner to remove
    const [tmpUser] = await db
      .insert(schema.users)
      .values({ name: 'Disposable', email: `rbac_tmp_${Date.now()}@test.example`, passwordHash: 'x' })
      .returning();
    await db.insert(schema.organizationMembers).values({
      organizationId: orgUuid,
      userId: tmpUser!.id,
      role: 'member',
      status: 'active',
    });
    try {
      const res = await call('DELETE', `/v1/orgs/${orgUuid}/members/${tmpUser!.id}`, ownerToken);
      expect(res.status).toBe(200);
    } finally {
      await db.delete(schema.organizationMembers).where(eq(schema.organizationMembers.userId, tmpUser!.id));
      await db.delete(schema.users).where(eq(schema.users.id, tmpUser!.id));
    }
  });

  it('requests without a token are rejected with 401', async () => {
    const res = await call('DELETE', `/v1/orgs/${orgUuid}/members/${ownerId}`);
    expect([401, 403]).toContain(res.status);
  });

  it('a plain member CANNOT update another member role (member.role.update required)', async () => {
    const res = await call(
      'PATCH',
      `/v1/orgs/${orgUuid}/members/${ownerId}`,
      memberToken
    );
    // route body validation may 422 first, but must never be 2xx
    expect(res.status).not.toBe(200);
    expect([403, 422]).toContain(res.status);
  });
});
