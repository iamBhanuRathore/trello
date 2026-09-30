import { lt, and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { auditLog, activityLog, notifications } from '../../db/schema';
import { logger } from '../../lib/logger';

/**
 * Log retention (5.3).
 *
 * Audit/activity/notification tables are append-only and grow forever; without
 * a retention policy they are the main source of table bloat and slow index
 * scans. Declarative range partitioning was rejected for now (it complicates
 * every FK and the pooled connection path for a table that a batched delete
 * handles fine) — see docs/Decisions.md.
 *
 * Compliance note: audit rows are typically retained 1-2 years in enterprise
 * setups; the defaults below are conservative and env-overridable.
 */

export interface RetentionConfig {
  auditDays: number;
  activityDays: number;
  /** Read notifications are disposable; unread ones are kept. */
  notificationDays: number;
  /** Rows deleted per statement — keeps each DELETE short and index-friendly. */
  batchSize: number;
}

function retentionFromEnv(): RetentionConfig {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  return {
    auditDays: num(process.env['AUDIT_RETENTION_DAYS'], 730),
    activityDays: num(process.env['ACTIVITY_RETENTION_DAYS'], 365),
    notificationDays: num(process.env['NOTIFICATION_RETENTION_DAYS'], 180),
    batchSize: num(process.env['LOG_PRUNE_BATCH_SIZE'], 10_000),
  };
}

export const DEFAULT_RETENTION: RetentionConfig = {
  auditDays: 730,
  activityDays: 365,
  notificationDays: 180,
  batchSize: 10_000,
};

async function deleteInBatches(
  db: Database,
  table: typeof auditLog | typeof activityLog | typeof notifications,
  cutoff: Date,
  batchSize: number,
  label: string,
  /** Extra predicate applied to both the outer and batched SELECT. */
  extra?: SQL
): Promise<number> {
  // Raw `sql` fragments can't bind a Date (postgres.js rejects it), so the
  // cutoff goes through as an ISO string with an explicit cast.
  const cutoffIso = cutoff.toISOString();
  let total = 0;
  for (;;) {
    const deleted = await db
      .delete(table)
      .where(
        and(
          lt(table.createdAt, cutoff),
          extra,
          // Stop early: a single statement takes at most `batchSize` rows.
          sql`${table.id} IN (
            SELECT ${table.id} FROM ${table}
            WHERE ${table.createdAt} < ${cutoffIso}::timestamp
              ${extra ? sql`AND ${extra}` : sql``}
            ORDER BY ${table.createdAt}
            LIMIT ${batchSize}
          )`
        )
      )
      .returning({ id: table.id });
    const count = deleted.length;
    total += count;
    if (count < batchSize) break;
  }
  if (total > 0) logger.info({ table: label, deleted: total }, 'Retention: pruned old rows');
  return total;
}

/**
 * Delete rows past their retention window. Safe to run concurrently: the
 * `IN (SELECT ... LIMIT n)` batch form is idempotent, and rows only ever move
 * further into the past.
 */
export async function pruneLogs(
  db: Database,
  config: RetentionConfig = retentionFromEnv()
): Promise<{ audit: number; activity: number; notifications: number }> {
  const now = Date.now();
  const day = 86_400_000;
  const auditCutoff = new Date(now - config.auditDays * day);
  const activityCutoff = new Date(now - config.activityDays * day);
  const notificationCutoff = new Date(now - config.notificationDays * day);

  const audit = await deleteInBatches(db, auditLog, auditCutoff, config.batchSize, 'audit_log');
  const activity = await deleteInBatches(
    db,
    activityLog,
    activityCutoff,
    config.batchSize,
    'activity_log'
  );
  // Unread and starred notifications are the user's inbox — never prune them.
  // Archived rows follow the normal read retention window.
  const notificationsDeleted = await deleteInBatches(
    db,
    notifications,
    notificationCutoff,
    config.batchSize,
    'notifications',
    // Unread or starred = still in the user's inbox. Never disposable.
    and(eq(notifications.isRead, true), eq(notifications.isStarred, false))
  );
  return { audit, activity, notifications: notificationsDeleted };
}

const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Start the retention loop. Returns a stop function so tests and graceful
 * shutdown can release the timer. Runs once at boot, then every 6h.
 */
export function startRetentionJob(db: Database, intervalMs = PRUNE_INTERVAL_MS): () => void {
  const run = () => {
    pruneLogs(db)
      .then((counts) => logger.info(counts, 'Retention sweep complete'))
      .catch((err: unknown) => logger.error({ err: String(err) }, 'Retention sweep failed'));
  };
  run();
  const timer = setInterval(run, intervalMs);
  // Don't hold the process open for a housekeeping timer.
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  return () => clearInterval(timer);
}
