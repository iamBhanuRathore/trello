/**
 * Seed script — populates default roles, permissions, and plans.
 * Run with: bun run db:seed
 *
 * Idempotent: safe to re-run; uses ON CONFLICT DO NOTHING.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { plans, permissions, rolePermissions } from './schema/index';
import {
  ALL_PERMISSION_KEYS,
  ORG_PERMISSIONS,
  WORKSPACE_PERMISSIONS,
  PROJECT_PERMISSIONS,
  BOARD_PERMISSIONS,
  CARD_PERMISSIONS,
} from '@boardly/shared-types';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  console.error('❌  DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

// ─── 1. Seed Plans ────────────────────────────────────────────────────────────
console.log('🌱  Seeding plans...');
const defaultPlans = [
  {
    name: 'Free',
    tier: 'free' as const,
    maxSeats: 5,
    maxWorkspaces: 1,
    maxBoards: 3,
    maxStorageGb: 1,
  },
  {
    name: 'Pro',
    tier: 'pro' as const,
    maxSeats: 25,
    maxWorkspaces: 10,
    maxBoards: null,
    maxStorageGb: 50,
  },
  {
    name: 'Business',
    tier: 'business' as const,
    maxSeats: 100,
    maxWorkspaces: null,
    maxBoards: null,
    maxStorageGb: 250,
  },
  {
    name: 'Enterprise',
    tier: 'enterprise' as const,
    maxSeats: null,
    maxWorkspaces: null,
    maxBoards: null,
    maxStorageGb: null,
  },
];

for (const plan of defaultPlans) {
  await db.insert(plans).values(plan).onConflictDoNothing();
}

// ─── 2. Seed Permissions ──────────────────────────────────────────────────────
console.log('🌱  Seeding permissions...');
for (const key of ALL_PERMISSION_KEYS) {
  await db.insert(permissions).values({ key, description: key }).onConflictDoNothing();
}

// ─── 3. Seed System Roles ─────────────────────────────────────────────────────
console.log('🌱  Seeding system roles...');
// System roles have null organizationId
const systemRoleNames = ['Org Owner', 'Org Admin', 'Member', 'Viewer'] as const;

for (const name of systemRoleNames) {
  const existing = (await db.execute(
    sql`SELECT id, name FROM roles WHERE name = ${name} AND is_system_role = true LIMIT 1`
  )) as unknown as { id: string; name: string }[];
  if (!existing || existing.length === 0) {
    await db.execute(sql`INSERT INTO roles (name, is_system_role) VALUES (${name}, true)`);
  }
}

// Re-fetch all system roles
const allSystemRoles = (await db.execute(
  sql`SELECT id, name FROM roles WHERE is_system_role = true`
)) as unknown as { id: string; name: string }[];

const roleMap = Object.fromEntries(allSystemRoles.map((r) => [r.name, r.id]));

// ── 4a. Revoke overpowered Member permissions (idempotent cleanup) ────────────
// When permissions are removed from memberPermKeys below, this block strips them
// from the live Member role so a db:seed re-run cleans existing environments.
console.log('🌱  Revoking over-privileged Member permissions (cleanup)...');
const memberRevoke = [
  // Structural workspace/project/board powers — Admin-only
  'workspace.create',
  'workspace.update',
  'project.create',
  'project.update',
  'project.archive',
  'board.create',
  'board.update',
  'board.archive',
  'label.create',
  'label.update',
  'list.create',
  'list.update',
  'list.archive',
  // Destructive / sprint-management powers
  'card.archive',
  'card.sprint.assign',
];
const memberRoleId = roleMap['Member'];
if (memberRoleId) {
  for (const key of memberRevoke) {
    await db.execute(sql`
      DELETE FROM role_permissions
      WHERE role_id = ${memberRoleId}
        AND permission_id = (
          SELECT id FROM permissions WHERE key = ${key} LIMIT 1
        )
    `);
  }
}

// ─── 4. Assign Permissions to Roles ──────────────────────────────────────────
console.log('🌱  Assigning permissions to roles...');

// Helper: get permission id by key
async function getPermId(key: string): Promise<string | null> {
  const res = (await db.execute(sql`SELECT id FROM permissions WHERE key = ${key} LIMIT 1`)) as {
    id: string;
  }[];
  return res[0]?.id ?? null;
}

// Helper: assign perm to role
async function assignPerm(roleName: string, permKey: string) {
  const roleId = roleMap[roleName];
  const permId = await getPermId(permKey);
  if (!roleId || !permId) return;
  await db.insert(rolePermissions).values({ roleId, permissionId: permId }).onConflictDoNothing();
}

// Org Owner — gets everything
for (const key of ALL_PERMISSION_KEYS) {
  await assignPerm('Org Owner', key);
}

// Org Admin — gets everything except platform + ownership transfer + SSO + security + billing manage
const adminExclude = new Set([
  'platform.manage',
  'org.impersonate',
  'org.create',
  'org.delete',
  'feature_flag.manage',
  'plan.manage',
  'platform.audit_log.read',
  'platform.health.read',
  'rate_limit.manage',
  'org.transfer_ownership',
  'sso.configure',
  'security_policy.manage',
  'billing.manage',
]);
for (const key of ALL_PERMISSION_KEYS) {
  if (!adminExclude.has(key)) await assignPerm('Org Admin', key);
}

// Member — task collaboration only; no structural create/update/archive powers
//
// Removed vs. original:
//   workspace.create, workspace.update          (admin-only)
//   project.create, project.update, project.archive  (admin-only)
//   board.create, board.update, board.archive   (admin-only)
//   label.create, label.update                  (board admin task)
//   list.create, list.update, list.archive      (board structure = admin)
//   card.archive                                (destructive, admin-only)
//   card.sprint.assign                          (sprint management = admin)
const memberPermKeys = [
  ORG_PERMISSIONS.READ,
  WORKSPACE_PERMISSIONS.READ,
  PROJECT_PERMISSIONS.READ,
  BOARD_PERMISSIONS.READ,
  CARD_PERMISSIONS.READ,
  CARD_PERMISSIONS.CREATE,
  CARD_PERMISSIONS.UPDATE,
  CARD_PERMISSIONS.MOVE,
  CARD_PERMISSIONS.ASSIGN,
  CARD_PERMISSIONS.WATCH,
  CARD_PERMISSIONS.ADD_LABEL,
  CARD_PERMISSIONS.REMOVE_LABEL,
  CARD_PERMISSIONS.SET_DUE_DATE,
  CARD_PERMISSIONS.UPDATE_STAGE,
  CARD_PERMISSIONS.CREATE_SUBTASK,
  CARD_PERMISSIONS.CREATE_CHECKLIST,
  CARD_PERMISSIONS.UPDATE_CHECKLIST,
  CARD_PERMISSIONS.ADD_ATTACHMENT,
  CARD_PERMISSIONS.CREATE_COMMENT,
  CARD_PERMISSIONS.UPDATE_COMMENT,
  CARD_PERMISSIONS.CREATE_TIME_LOG,
  CARD_PERMISSIONS.UPDATE_TIME_LOG,
];
for (const key of memberPermKeys) {
  await assignPerm('Member', key);
}

// Viewer — read-only
const viewerPermKeys = [
  ORG_PERMISSIONS.READ,
  WORKSPACE_PERMISSIONS.READ,
  PROJECT_PERMISSIONS.READ,
  BOARD_PERMISSIONS.READ,
  CARD_PERMISSIONS.READ,
  CARD_PERMISSIONS.WATCH,
  CARD_PERMISSIONS.CREATE_COMMENT,
];
for (const key of viewerPermKeys) {
  await assignPerm('Viewer', key);
}

console.log('✅  Base system seed complete.');

// ─── 5. Seed Full Enterprise Organization ─────────────────────────────────────
import { seedFullOrganization } from './seedOrganization';
await seedFullOrganization();

await client.end();
process.exit(0);
