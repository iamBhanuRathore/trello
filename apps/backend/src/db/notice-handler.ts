import { logger } from '../lib/logger';

export type PgNotice = Record<string, string>;

/**
 * Postgres emits a NOTICE every time an idempotent DDL statement finds its
 * object already in place (`ADD COLUMN IF NOT EXISTS ... already exists,
 * skipping`, `CREATE INDEX IF NOT EXISTS`, ...). postgres.js `console.log`s raw
 * driver objects when no `onnotice` handler is configured
 * (`postgres/src/connection.js` -> `NoticeResponse`), which flooded the terminal
 * on every restart. Those notices carry no information — drop them. Anything
 * else (constraint violations, extension notices, ...) is still surfaced.
 */
const IDEMPOTENT_DDL_NOTICE = /already exists, skipping/i;

export function handlePgNotice(notice: PgNotice): void {
  const message = notice.message ?? '';
  if (IDEMPOTENT_DDL_NOTICE.test(message)) return;
  logger.warn({ code: notice.code, detail: notice.detail, notice: message }, 'postgres notice');
}
