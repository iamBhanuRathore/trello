import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as path from 'path';

/**
 * One-shot migration runner.
 * Run with: bun run src/db/migrate.ts
 */
const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  console.error('❌  DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
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
