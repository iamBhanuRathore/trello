import { sql } from 'drizzle-orm';
import type { Database } from './index';
import { logger } from '../lib/logger';
import { env } from '../lib/env';
import { BOOT_STEPS } from './bootstrap-steps';

/**
 * Ledger of boot backstops already applied to this database.
 *
 * Created by the boot runner itself (not by a migration) because its whole
 * purpose is to unblock databases that have NOT run migrations yet. Absence of
 * the table means "nothing recorded", not "nothing applied".
 */
const LEDGER_TABLE = 'boot_migrations';

/**
 * Applies the boot-time schema backstops in `bootstrap-steps.ts`, exactly once
 * per database per statement.
 *
 * Two guards keep restarts cheap and quiet:
 *  - Ledger: a statement already recorded in `boot_migrations` is skipped, so a
 *    healthy restart issues zero DDL and emits zero Postgres NOTICEs.
 *  - Best-effort: a statement that fails (typically because the parent table does
 *    not exist on an unmigrated database) is logged and skipped WITHOUT being
 *    recorded, so the next boot retries it after migrations have run.
 *
 * Set `BOOT_MIGRATIONS_FORCE=true` to replay every statement regardless of the
 * ledger — the escape hatch for hand-repaired databases where a recorded step
 * no longer reflects reality (e.g. a column dropped by hand).
 */
export async function runBootMigrations(db: Database): Promise<void> {
  const force = env.BOOT_MIGRATIONS_FORCE;
  const applied = force ? new Set<string>() : await readLedger(db);

  if (applied === null) {
    // Ledger unavailable — degrade to running everything, unrecorded.
    await runAllSteps(db, false);
    return;
  }

  const pending = BOOT_STEPS.filter((step) => !applied.has(step.key));
  if (pending.length === 0) {
    logger.debug({ steps: BOOT_STEPS.length }, 'boot schema backstops already applied');
    return;
  }

  let succeeded = 0;
  let failed = 0;
  for (const step of pending) {
    const ok = await applyStep(db, step);
    if (ok) succeeded += 1;
    else failed += 1;
  }

  logger.info(
    { applied: succeeded, failed, skipped: BOOT_STEPS.length - pending.length, forced: force },
    'boot schema backstops complete'
  );
}

/**
 * Returns the set of ledger keys already applied, or `null` when the ledger
 * cannot be read (pre-existing database, restricted role, transient failure) —
 * the caller then runs every step without recording.
 */
async function readLedger(db: Database): Promise<Set<string> | null> {
  try {
    const table = sql.identifier(LEDGER_TABLE);
    const presence = (await db.execute(
      sql.raw(`SELECT to_regclass('public.${LEDGER_TABLE}') IS NOT NULL AS present`)
    )) as unknown as Array<Record<string, unknown>>;
    if (!presence[0]?.['present']) {
      await db.execute(
        sql`CREATE TABLE IF NOT EXISTS ${table} ("key" text PRIMARY KEY, "applied_at" timestamp NOT NULL DEFAULT now())`
      );
      return new Set();
    }

    const rows = (await db.execute(sql`SELECT "key" FROM ${table}`)) as unknown as Array<
      Record<string, unknown>
    >;
    return new Set(rows.map((row) => String(row['key'])));
  } catch (err) {
    logger.warn({ err }, 'boot_migrations ledger unreadable; running all backstops unrecorded');
    return null;
  }
}

async function runAllSteps(db: Database, record: boolean): Promise<void> {
  for (const step of BOOT_STEPS) {
    await applyStep(db, step, record);
  }
}

async function applyStep(
  db: Database,
  step: { key: string; statement: string },
  record = true
): Promise<boolean> {
  try {
    await db.execute(sql.raw(step.statement));
    if (record) {
      await db.execute(
        sql`INSERT INTO ${sql.identifier(LEDGER_TABLE)} ("key") VALUES (${step.key}) ON CONFLICT DO NOTHING`
      );
    }
    return true;
  } catch (err) {
    // Not recorded: the next boot retries. Expected on unmigrated databases
    // where the parent table is missing.
    logger.warn({ err, step: step.key }, 'boot schema backstop failed; will retry next boot');
    return false;
  }
}
