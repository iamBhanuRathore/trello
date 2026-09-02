import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { env } from '../lib/env';
import { getDataClient, isRedisAvailable } from '../redis/client';
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

// Shared db handle for system/platform routes, boot scripts, and tests
export const db = rawWriteDb;
export type Database = typeof rawWriteDb;

/**
 * Enforces tenant isolation via Row Level Security (RLS) and read-after-write routing.
 * Sets `app.current_org_id` in transaction session context for RLS policies.
 * Writes record a 3-second Redis TTL marker so subsequent reads from the same org
 * route to the primary database to guarantee monotonic read consistency.
 */
export async function withOrgContext<T>(
  orgId: string,
  mode: 'read' | 'write',
  fn: (txDb: Database) => Promise<T>
): Promise<T> {
  const redis = getDataClient();
  const redisAvailable = isRedisAvailable() && redis !== null;

  if (mode === 'write') {
    return rawWriteDb.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`);
      const result = await fn(tx as unknown as Database);

      if (redisAvailable && redis) {
        try {
          await redis.set(`recent-write:org:${orgId}`, '1', 'EX', 3);
        } catch {
          // Non-blocking write-marker failure
        }
      }
      return result;
    });
  }

  // Read path: route to primary if recent write occurred within the 3s window
  let preferPrimary = false;
  if (redisAvailable && redis) {
    try {
      preferPrimary = (await redis.exists(`recent-write:org:${orgId}`)) === 1;
    } catch {
      preferPrimary = true; // Fall back to primary if check fails
    }
  }

  const selectedDb = preferPrimary ? rawWriteDb : rawReadDb;
  return selectedDb.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`);
    return fn(tx as unknown as Database);
  });
}

/**
 * Gracefully terminates all postgres connections.
 */
export async function disconnectDb(): Promise<void> {
  await Promise.allSettled([writeClient.end({ timeout: 5 }), readClient.end({ timeout: 5 })]);
}
