import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as path from 'path';
import {
  plans,
  permissions,
  rolePermissions,
} from './schema/index';
import { ALL_PERMISSION_KEYS, ORG_PERMISSIONS, WORKSPACE_PERMISSIONS, PROJECT_PERMISSIONS, BOARD_PERMISSIONS, CARD_PERMISSIONS } from '@boardly/shared-types';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  console.error('❌  DATABASE_URL is not set');
  process.exit(1);
}

console.log('⚠️  Resetting database...');

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

try {
  // Drop and recreate public schema
  console.log('🗑️  Dropping public schema...');
  await client.unsafe(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);

  // Run migrations
  const migrationsFolder = path.join(import.meta.dir, 'migrations');
  console.log('🔄  Applying migrations from:', migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log('✅  Migrations applied.');

  // Seed default data
  console.log('🌱  Seeding default plans, permissions, and system roles...');
  
  const defaultPlans = [
    { name: 'Free', tier: 'free' as const, maxSeats: 5, maxWorkspaces: 1, maxBoards: 3, maxStorageGb: 1 },
    { name: 'Pro', tier: 'pro' as const, maxSeats: 25, maxWorkspaces: 10, maxBoards: null, maxStorageGb: 50 },
    { name: 'Business', tier: 'business' as const, maxSeats: 100, maxWorkspaces: null, maxBoards: null, maxStorageGb: 250 },
    { name: 'Enterprise', tier: 'enterprise' as const, maxSeats: null, maxWorkspaces: null, maxBoards: null, maxStorageGb: null },
  ];
  for (const plan of defaultPlans) {
    await db.insert(plans).values(plan).onConflictDoNothing();
  }

  for (const key of ALL_PERMISSION_KEYS) {
    await db.insert(permissions).values({ key, description: key }).onConflictDoNothing();
  }

  const systemRoleNames = ['Org Owner', 'Org Admin', 'Member', 'Viewer'] as const;
  for (const name of systemRoleNames) {
    await client.unsafe(`INSERT INTO roles (name, is_system_role) VALUES ('${name}', true) ON CONFLICT DO NOTHING;`);
  }

  const allSystemRoles = await client.unsafe(`SELECT id, name FROM roles WHERE is_system_role = true;`) as { id: string; name: string }[];
  const roleMap = Object.fromEntries(allSystemRoles.map((r) => [r.name, r.id]));

  async function getPermId(key: string): Promise<string | null> {
    const res = await client.unsafe(`SELECT id FROM permissions WHERE key = '${key}' LIMIT 1;`) as { id: string }[];
    return res[0]?.id ?? null;
  }

  async function assignPerm(roleName: string, permKey: string) {
    const roleId = roleMap[roleName];
    const permId = await getPermId(permKey);
    if (!roleId || !permId) return;
    await db.insert(rolePermissions).values({ roleId, permissionId: permId }).onConflictDoNothing();
  }

  for (const key of ALL_PERMISSION_KEYS) {
    await assignPerm('Org Owner', key);
  }

  const adminExclude = new Set([
    'platform.manage', 'org.impersonate', 'org.create', 'org.delete',
    'feature_flag.manage', 'plan.manage', 'platform.audit_log.read', 'platform.health.read',
    'rate_limit.manage', 'org.transfer_ownership', 'sso.configure', 'security_policy.manage',
    'billing.manage',
  ]);
  for (const key of ALL_PERMISSION_KEYS) {
    if (!adminExclude.has(key)) await assignPerm('Org Admin', key);
  }

  const memberPermKeys = [
    ORG_PERMISSIONS.READ,
    WORKSPACE_PERMISSIONS.READ, WORKSPACE_PERMISSIONS.CREATE, WORKSPACE_PERMISSIONS.UPDATE,
    PROJECT_PERMISSIONS.READ, PROJECT_PERMISSIONS.CREATE, PROJECT_PERMISSIONS.UPDATE, PROJECT_PERMISSIONS.ARCHIVE,
    BOARD_PERMISSIONS.READ, BOARD_PERMISSIONS.CREATE, BOARD_PERMISSIONS.UPDATE, BOARD_PERMISSIONS.ARCHIVE,
    BOARD_PERMISSIONS.CREATE_LABEL, BOARD_PERMISSIONS.UPDATE_LABEL, BOARD_PERMISSIONS.CREATE_LIST,
    BOARD_PERMISSIONS.UPDATE_LIST, BOARD_PERMISSIONS.ARCHIVE_LIST,
    CARD_PERMISSIONS.READ, CARD_PERMISSIONS.CREATE, CARD_PERMISSIONS.UPDATE, CARD_PERMISSIONS.ARCHIVE,
    CARD_PERMISSIONS.MOVE, CARD_PERMISSIONS.ASSIGN, CARD_PERMISSIONS.WATCH,
    CARD_PERMISSIONS.ADD_LABEL, CARD_PERMISSIONS.REMOVE_LABEL, CARD_PERMISSIONS.SET_DUE_DATE,
    CARD_PERMISSIONS.UPDATE_STAGE, CARD_PERMISSIONS.ASSIGN_SPRINT,
    CARD_PERMISSIONS.CREATE_SUBTASK, CARD_PERMISSIONS.CREATE_CHECKLIST,
    CARD_PERMISSIONS.UPDATE_CHECKLIST, CARD_PERMISSIONS.ADD_ATTACHMENT,
    CARD_PERMISSIONS.CREATE_COMMENT, CARD_PERMISSIONS.UPDATE_COMMENT,
    CARD_PERMISSIONS.CREATE_TIME_LOG, CARD_PERMISSIONS.UPDATE_TIME_LOG,
  ];
  for (const key of memberPermKeys) {
    await assignPerm('Member', key);
  }

  const viewerPermKeys = [
    ORG_PERMISSIONS.READ,
    WORKSPACE_PERMISSIONS.READ,
    PROJECT_PERMISSIONS.READ,
    BOARD_PERMISSIONS.READ,
    CARD_PERMISSIONS.READ, CARD_PERMISSIONS.WATCH,
    CARD_PERMISSIONS.CREATE_COMMENT,
  ];
  for (const key of viewerPermKeys) {
    await assignPerm('Viewer', key);
  }

  console.log('🎉  Database reset and seeded successfully!');
} catch (err) {
  console.error('❌  Reset failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
