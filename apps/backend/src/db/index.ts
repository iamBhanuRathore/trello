import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env';
import * as schema from './schema/index';

/**
 * Database connection — single shared instance across the application.
 * Uses postgres.js driver with Drizzle ORM.
 *
 * In test environments, use DATABASE_TEST_URL to point at a throwaway DB.
 */
const connectionString =
  env.NODE_ENV === 'test' && env.DATABASE_TEST_URL ? env.DATABASE_TEST_URL : env.DATABASE_URL;

const queryClient = postgres(connectionString, {
  max: env.NODE_ENV === 'test' ? 1 : 10, // Limit pool in tests
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
