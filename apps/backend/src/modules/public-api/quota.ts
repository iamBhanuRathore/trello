import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { apiKeys, apiKeyModules } from '../../db/schema/index';

/** First instant of the current UTC month (timestamp without time zone). */
const MONTH_START = sql`date_trunc('month', now() AT TIME ZONE 'utc')`;

export interface QuotaResult {
  allowed: boolean;
  hits: number;
  limit: number | null;
  periodStart: Date | null;
  resetAt: number;
}

function nextMonthReset(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
}

/**
 * Atomically consume one request from the key's global monthly counter.
 * The CASE expressions reset the window and increment in a single UPDATE, so
 * concurrent requests cannot read-then-overwrite a stale count.
 */
export async function consumeGlobalHit(db: Database, apiKeyId: string): Promise<QuotaResult> {
  const [row] = await db
    .update(apiKeys)
    .set({
      hits: sql`CASE WHEN ${apiKeys.hitsPeriodStart} < ${MONTH_START} THEN 1 ELSE ${apiKeys.hits} + 1 END`,
      hitsPeriodStart: sql`CASE WHEN ${apiKeys.hitsPeriodStart} < ${MONTH_START} THEN ${MONTH_START} ELSE ${apiKeys.hitsPeriodStart} END`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(apiKeys.id, apiKeyId),
        or(
          isNull(apiKeys.hitLimit),
          sql`(CASE WHEN ${apiKeys.hitsPeriodStart} < ${MONTH_START} THEN 0 ELSE ${apiKeys.hits} END) < ${apiKeys.hitLimit}`
        )
      )
    )
    .returning({
      hits: apiKeys.hits,
      limit: apiKeys.hitLimit,
      periodStart: apiKeys.hitsPeriodStart,
    });

  if (!row) {
    // The conditional UPDATE matched no row, so report the current window from
    // a read; otherwise the 429 response loses its X-RateLimit-* headers.
    const [current] = await db
      .select({
        hits: apiKeys.hits,
        limit: apiKeys.hitLimit,
        periodStart: apiKeys.hitsPeriodStart,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);
    return {
      allowed: false,
      hits: current?.hits ?? 0,
      limit: current?.limit ?? 0,
      periodStart: current?.periodStart ?? null,
      resetAt: nextMonthReset(),
    };
  }
  return {
    allowed: true,
    hits: row.hits,
    limit: row.limit,
    periodStart: row.periodStart,
    resetAt: nextMonthReset(),
  };
}

/** Per-module monthly counter, same atomic reset/increment semantics. */
export async function consumeModuleHit(
  db: Database,
  apiKeyId: string,
  module: string
): Promise<QuotaResult> {
  const [row] = await db
    .update(apiKeyModules)
    .set({
      hits: sql`CASE WHEN ${apiKeyModules.hitsPeriodStart} < ${MONTH_START} THEN 1 ELSE ${apiKeyModules.hits} + 1 END`,
      hitsPeriodStart: sql`CASE WHEN ${apiKeyModules.hitsPeriodStart} < ${MONTH_START} THEN ${MONTH_START} ELSE ${apiKeyModules.hitsPeriodStart} END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(apiKeyModules.apiKeyId, apiKeyId),
        eq(apiKeyModules.module, module),
        or(
          isNull(apiKeyModules.hitLimit),
          sql`(CASE WHEN ${apiKeyModules.hitsPeriodStart} < ${MONTH_START} THEN 0 ELSE ${apiKeyModules.hits} END) < ${apiKeyModules.hitLimit}`
        )
      )
    )
    .returning({
      hits: apiKeyModules.hits,
      limit: apiKeyModules.hitLimit,
      periodStart: apiKeyModules.hitsPeriodStart,
    });

  if (!row) {
    const [current] = await db
      .select({
        hits: apiKeyModules.hits,
        limit: apiKeyModules.hitLimit,
        periodStart: apiKeyModules.hitsPeriodStart,
      })
      .from(apiKeyModules)
      .where(and(eq(apiKeyModules.apiKeyId, apiKeyId), eq(apiKeyModules.module, module)))
      .limit(1);
    return {
      allowed: false,
      hits: current?.hits ?? 0,
      limit: current?.limit ?? 0,
      periodStart: current?.periodStart ?? null,
      resetAt: nextMonthReset(),
    };
  }
  return {
    allowed: true,
    hits: row.hits,
    limit: row.limit,
    periodStart: row.periodStart,
    resetAt: nextMonthReset(),
  };
}

export function quotaHeaders(set: { headers?: Record<string, unknown> }, result: QuotaResult) {
  if (!result.limit) return;
  if (!set.headers) set.headers = {};
  set.headers['X-RateLimit-Limit'] = String(result.limit);
  set.headers['X-RateLimit-Remaining'] = String(Math.max(0, result.limit - result.hits));
  set.headers['X-RateLimit-Reset'] = String(result.resetAt);
}
