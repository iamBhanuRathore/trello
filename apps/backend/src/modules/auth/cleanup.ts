import { sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { refreshTokens } from '../../db/schema/index';
import { logger } from '../../lib/logger';
import { captureServerError } from '../../lib/sentry';

/**
 * Refresh-token cleanup.
 *
 * Burned/revoked rows must survive until expiry (reuse of an old token is
 * only detectable while its row exists), so the cutoff lags one day past the
 * effective expiry: GREATEST(expires_at, absolute_expires_at) + 1 day.
 * Batched + idempotent — safe to run concurrently.
 */

const PRUNE_BATCH_SIZE = 5_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export async function pruneRefreshTokens(
  db: Database,
  batchSize = PRUNE_BATCH_SIZE
): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await db
      .delete(refreshTokens)
      .where(
        sql`${refreshTokens.id} IN (
          SELECT ${refreshTokens.id} FROM ${refreshTokens}
          WHERE GREATEST(${refreshTokens.expiresAt}, ${refreshTokens.absoluteExpiresAt})
            < now() - interval '1 day'
          ORDER BY ${refreshTokens.expiresAt}
          LIMIT ${batchSize}
        )`
      )
      .returning({ id: refreshTokens.id });
    total += deleted.length;
    if (deleted.length < batchSize) break;
  }
  if (total > 0) logger.info({ deleted: total }, 'Refresh-token cleanup: pruned old rows');
  return total;
}

/**
 * Start the cleanup loop. Returns a stop function for tests / shutdown.
 * Runs once at boot, then hourly. Timer is unref'd — never holds the process.
 */
export function startRefreshTokenCleanup(db: Database, intervalMs = PRUNE_INTERVAL_MS): () => void {
  const run = () => {
    pruneRefreshTokens(db)
      .then((count) => logger.info({ count }, 'Refresh-token cleanup sweep complete'))
      .catch((err: unknown) => {
        captureServerError(err, { route: 'worker:refresh-token-cleanup' });
        logger.error({ err: String(err) }, 'Refresh-token cleanup failed');
      });
  };
  run();
  const timer = setInterval(run, intervalMs);
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  return () => clearInterval(timer);
}
