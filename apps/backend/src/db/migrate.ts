import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as path from 'path';

import { env } from '../lib/env';
import { handlePgNotice } from './notice-handler';

/**
 * One-shot migration runner.
 * Run with: bun run src/db/migrate.ts
 */
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;

const sql = postgres(connectionString, { max: 1, onnotice: handlePgNotice });
const db = drizzle(sql);

const migrationsFolder = path.join(import.meta.dir, 'migrations');
console.log('🔄  Running migrations from:', migrationsFolder);

try {
  await migrate(db, { migrationsFolder });
  console.log('✅  Migrations applied successfully');
} catch (err) {
  console.error('❌  Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end();
}
