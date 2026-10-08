import { eq, and, lt, lte } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { attachments, chatAttachments } from '../../db/schema/index';
import { deleteObject } from '../../lib/storage';
import { MediaStatus } from '@boardly/shared-types';
import { logger } from '../../lib/logger';
import { captureServerError } from '../../lib/sentry';

// ─── Media GC: staged >24h → delete object (404 ok) then row, idempotent ─────
// S3 lifecycle on the upload prefix is the backstop (see infra notes in
// Decisions.md); this cron is the precise path. Failed rows are reaped after
// a 7-day audit window.

export interface MediaGCResult {
  stagedCards: number;
  stagedChat: number;
  failedCards: number;
  failedChat: number;
}

export function gcCutoffs(now = Date.now()): { stagedOlderThan: Date; failedOlderThan: Date } {
  const stagedHours = Number(process.env['MEDIA_GC_STAGED_HOURS'] || 24);
  const failedDays = Number(process.env['MEDIA_GC_FAILED_DAYS'] || 7);
  return {
    stagedOlderThan: new Date(now - stagedHours * 3_600_000),
    failedOlderThan: new Date(now - failedDays * 86_400_000),
  };
}

export async function runMediaGC(
  db: Database,
  now = Date.now(),
  batch = 200
): Promise<MediaGCResult> {
  const { stagedOlderThan, failedOlderThan } = gcCutoffs(now);
  const result: MediaGCResult = { stagedCards: 0, stagedChat: 0, failedCards: 0, failedChat: 0 };

  const reap = async (
    rows: Array<{ id: string; storageKey: string | null }>,
    remove: (id: string) => Promise<void>
  ): Promise<number> => {
    let n = 0;
    for (const row of rows) {
      try {
        // Object first: a crash between object-delete and row-delete leaves an
        // orphan row the next tick reaps (idempotent); the reverse would leak bytes.
        if (row.storageKey) await deleteObject(row.storageKey);
        await remove(row.id);
        n++;
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), id: row.id },
          'Media GC reap failed'
        );
      }
    }
    return n;
  };

  const stagedCards = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(
      and(eq(attachments.status, MediaStatus.Staged), lt(attachments.createdAt, stagedOlderThan))
    )
    .limit(batch);
  result.stagedCards = await reap(stagedCards, async (id) => {
    await db.delete(attachments).where(eq(attachments.id, id));
  });

  const stagedChat = await db
    .select({ id: chatAttachments.id, storageKey: chatAttachments.storageKey })
    .from(chatAttachments)
    .where(
      and(
        eq(chatAttachments.status, MediaStatus.Staged),
        lt(chatAttachments.createdAt, stagedOlderThan)
      )
    )
    .limit(batch);
  result.stagedChat = await reap(stagedChat, async (id) => {
    await db.delete(chatAttachments).where(eq(chatAttachments.id, id));
  });

  const failedCards = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(
      and(eq(attachments.status, MediaStatus.Failed), lte(attachments.createdAt, failedOlderThan))
    )
    .limit(batch);
  result.failedCards = await reap(failedCards, async (id) => {
    await db.delete(attachments).where(eq(attachments.id, id));
  });

  const failedChat = await db
    .select({ id: chatAttachments.id, storageKey: chatAttachments.storageKey })
    .from(chatAttachments)
    .where(
      and(
        eq(chatAttachments.status, MediaStatus.Failed),
        lte(chatAttachments.createdAt, failedOlderThan)
      )
    )
    .limit(batch);
  result.failedChat = await reap(failedChat, async (id) => {
    await db.delete(chatAttachments).where(eq(chatAttachments.id, id));
  });

  return result;
}

export function startMediaGC(db: Database, intervalMs = 3_600_000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await runMediaGC(db);
    } catch (err) {
      captureServerError(err, { route: 'worker:media-gc' });
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Media GC tick failed'
      );
    }
  };
  const timer = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
