import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env';
import * as schema from './schema/index';

/**
 * Database connection setup with RDS Proxy and read/write splitting support.
 *
 * `prepare: false` is REQUIRED for RDS Proxy and PgBouncer in transaction mode.
 * Without this, postgres.js sends Parse/Bind/Execute protocol messages that fail
 * under connection multiplexing with "prepared statement does not exist" errors.
 */
const connectionString =
  env.NODE_ENV === 'test' && env.DATABASE_TEST_URL ? env.DATABASE_TEST_URL : env.DATABASE_URL;

const replicaConnectionString =
  env.NODE_ENV === 'test' && env.DATABASE_TEST_URL
    ? env.DATABASE_TEST_URL
    : (env.DATABASE_REPLICA_URL ?? connectionString);

export const writeClient = postgres(connectionString, {
  max: env.NODE_ENV === 'test' ? 1 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // Required for RDS Proxy transaction pooling
  connection: { application_name: 'boardly-backend-write' },
});

export const readClient = postgres(replicaConnectionString, {
  max: env.NODE_ENV === 'test' ? 1 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // Required for RDS Proxy transaction pooling
  connection: { application_name: 'boardly-backend-read' },
});

export const rawWriteDb = drizzle(writeClient, { schema });
export const rawReadDb = drizzle(readClient, { schema });

// Shared db handle for system/platform routes, boot scripts, and tests.
// All application traffic uses the write client; `rawReadDb` exists for
// future read-replica routing and is closed by `disconnectDb`.
//
// TENANT ISOLATION: enforced by per-query `organizationId` filters in the
// service layer, NOT by Postgres row-level security. Migration
// `0012_enable_row_level_security.sql` created `app.current_org_id` policies on
// workspaces/boards/cards, but those policies are inert — the app connects as
// the table owner and RLS does not apply to the owner without
// `FORCE ROW LEVEL SECURITY`. Enabling it properly requires a least-privilege
// application role plus an org-context transaction on every tenant query, and
// is tracked as a future defense-in-depth option, not a current guarantee.
// See docs/Decisions.md (2026-10-03, per-query org filters).
export const db = rawWriteDb;
export type Database = typeof rawWriteDb;

/**
 * Gracefully terminates all postgres connections.
 */
export async function disconnectDb(): Promise<void> {
  await Promise.allSettled([writeClient.end({ timeout: 5 }), readClient.end({ timeout: 5 })]);
}
