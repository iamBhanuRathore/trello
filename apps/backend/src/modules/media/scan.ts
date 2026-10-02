import { eq, and, lt, or, isNull, inArray, isNotNull } from 'drizzle-orm';
import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import type { Database } from '../../db/index';
import { attachments, chatAttachments } from '../../db/schema/index';
import {
  findMedia,
  getObjectBytes,
  openObjectStream,
  copyObject,
  sha256Hex,
  deleteObject,
  scanMode,
} from '../../lib/storage';
import { MediaScanStatus, MediaStatus } from '@boardly/shared-types';
import { logger } from '../../lib/logger';

// ─── ClamAV sidecar scanner (fail-closed) ─────────────────────────────────────
// Streams object bytes to `clamd` INSTREAM in chunks with backpressure and a
// capped in-flight window. clean→ready, infected→blocked (object moved to the
// quarantine prefix, row kept for audit), error/timeout→error with backoff and
// →failed after SCAN_MAX_ATTEMPTS. Nothing is servable until clean (or
// dev-only skipped) — see storage.presignedGet.

export const scanMetrics = {
  enqueued: 0,
  clean: 0,
  infected: 0,
  errors: 0,
  failed: 0,
  lastScanAt: null as Date | null,
  sidecarHealthy: null as boolean | null,
  queueDepth: 0,
  /** Age of the oldest queued id — the p95-ish "how stale is the gate" signal. */
  oldestQueuedAt: null as Date | null,
};

interface MetricEvent {
  at: number;
  error: boolean;
}

const METRIC_WINDOW: MetricEvent[] = [];

/** Queue depth, queue age, error rate, and sidecar health for /media/scan-metrics. */
export function scanMetricsSnapshot(): Record<string, unknown> {
  const cutoff = Date.now() - 300_000;
  while (METRIC_WINDOW.length > 0 && METRIC_WINDOW[0]!.at < cutoff) METRIC_WINDOW.shift();
  const windowErrors = METRIC_WINDOW.reduce((n, e) => (e.error ? n + 1 : n), 0);
  const attempted = METRIC_WINDOW.length;
  return {
    scanMode: scanMode(),
    queueDepth: scanMetrics.queueDepth,
    oldestQueuedAt: scanMetrics.oldestQueuedAt,
    queueAgeSeconds: scanMetrics.oldestQueuedAt
      ? Math.round((Date.now() - scanMetrics.oldestQueuedAt.getTime()) / 1000)
      : 0,
    sidecarHealthy: scanMetrics.sidecarHealthy,
    totals: {
      enqueued: scanMetrics.enqueued,
      clean: scanMetrics.clean,
      infected: scanMetrics.infected,
      errors: scanMetrics.errors,
      failed: scanMetrics.failed,
      lastScanAt: scanMetrics.lastScanAt,
    },
    window5m: {
      attempts: attempted,
      errors: windowErrors,
      errorRate: attempted === 0 ? 0 : Number((windowErrors / attempted).toFixed(3)),
    },
  };
}

interface QueueEntry {
  id: string;
  at: number;
}

const queue: QueueEntry[] = [];
const queuedSet = new Set<string>();
let draining = false;

export function enqueueScan(mediaId: string): void {
  if (queuedSet.has(mediaId)) return;
  queuedSet.add(mediaId);
  queue.push({ id: mediaId, at: Date.now() });
  scanMetrics.enqueued++;
  METRIC_WINDOW.push({ at: Date.now(), error: false });
  scanMetrics.queueDepth = queue.length;
  scanMetrics.oldestQueuedAt = new Date(queue[0]!.at);
}

export function scanQueueDepth(): number {
  return queue.length;
}

/** Exponential backoff between scan attempts: poll × 2^attempts, capped. */
export function backoffMs(attempts: number, pollMs = 5000): number {
  return Math.min(pollMs * 2 ** Math.max(0, attempts), 5 * 60_000);
}

type ScanVerdict = 'clean' | 'infected';
let transportOverride: ((bytes: Uint8Array) => Promise<ScanVerdict>) | null = null;

/** Test hook: stub the ClamAV transport (null = real sidecar). */
/**
 * Test-only: widen the window between receiving the verdict and reading the
 * checksum, so the cross-scan interleaving that a shared checksum variable was
 * vulnerable to becomes deterministic instead of microtask-luck.
 */
export function __setVerdictSettleDelay(ms: number): void {
  verdictSettleDelayMs = ms;
}

let verdictSettleDelayMs = 0;

export function __setScanTransport(fn: ((bytes: Uint8Array) => Promise<ScanVerdict>) | null): void {
  transportOverride = fn;
}

function scanConcurrency(): number {
  const raw = Number(process.env['SCAN_CONCURRENCY'] || 4);
  return Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 16) : 4;
}

function maxAttempts(): number {
  const raw = Number(process.env['SCAN_MAX_ATTEMPTS'] || 5);
  return Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 20) : 5;
}

function scanTimeoutMs(): number {
  const raw = Number(process.env['SCAN_TIMEOUT_MS'] || 60_000);
  return Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 5_000), 300_000) : 60_000;
}

/**
 * Raw clamd INSTREAM over an async byte source: `zINSTREAM <4-byte BE len><chunk>…
 * <0x00000000>`, then read the verdict line. Bytes are pulled chunk-by-chunk with
 * socket backpressure, so S3 → clamd never materialises the whole object in RAM.
 */
export async function clamavScanStream(source: AsyncIterable<Uint8Array>): Promise<ScanVerdict> {
  const host = process.env['CLAMAV_HOST'] || '127.0.0.1';
  const port = Number(process.env['CLAMAV_PORT'] || 3310);
  const timeoutMs = scanTimeoutMs();
  return new Promise<ScanVerdict>((resolve, reject) => {
    const socket = createConnection({ host, port });
    let done = false;
    const fail = (err: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      reject(err);
    };
    const timer = setTimeout(
      () => fail(new Error(`ClamAV INSTREAM timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
    socket.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))));
    socket.on('connect', () => {
      try {
        socket.write('zINSTREAM\0', async (err) => {
          if (err) {
            clearTimeout(timer);
            fail(err instanceof Error ? err : new Error(String(err)));
            return;
          }
          // Chunked with backpressure: wait for drain before sending more.
          const CHUNK = 8192;
          const iterator = source[Symbol.asyncIterator]();
          let pending: Uint8Array | null = null;
          let offset = 0;
          const sendNext = (): void => {
            if (done) return;
            if (!pending) {
              void (async () => {
                const next = await iterator.next();
                if (done) return;
                if (next.done) {
                  const term = Buffer.alloc(4);
                  term.writeUInt32BE(0, 0);
                  socket.write(term);
                  return;
                }
                pending = next.value;
                offset = 0;
                sendNext();
              })().catch((e: unknown) => {
                clearTimeout(timer);
                fail(e instanceof Error ? e : new Error(String(e)));
              });
              return;
            }
            if (offset >= pending.length) {
              pending = null;
              sendNext();
              return;
            }
            const end = Math.min(offset + CHUNK, pending.length);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(end - offset, 0);
            const chunk = Buffer.from(pending.subarray(offset, end));
            offset = end;
            const ok = socket.write(Buffer.concat([len, chunk]));
            if (ok) setImmediate(sendNext);
            else socket.once('drain', sendNext);
          };
          sendNext();
        });
      } catch (err) {
        clearTimeout(timer);
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    });
    let out = '';
    socket.on('data', (data) => {
      out += data.toString('utf8');
      // clamd terminates command replies with a NUL byte (z-prefixed protocol);
      // accept a newline too so non-framing proxies still terminate the read.
      if (out.includes('\0') || out.includes('\n')) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.end();
        if (/OK$|OK\b/.test(out.trim()) && !/FOUND/.test(out)) resolve('clean');
        else if (/FOUND/.test(out)) resolve('infected');
        else reject(new Error(`Unrecognized clamd verdict: ${out.trim().slice(0, 200)}`));
      }
    });
    socket.on('close', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error('Clamd connection closed before verdict'));
      }
    });
  });
}

/** Buffered convenience wrapper around {@link clamavScanStream}. */
export async function clamavScan(bytes: Uint8Array): Promise<ScanVerdict> {
  return clamavScanStream({
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  });
}

/** PING the sidecar for health checks / metrics. */
export async function sidecarHealth(): Promise<boolean> {
  const host = process.env['CLAMAV_HOST'] || '127.0.0.1';
  const port = Number(process.env['CLAMAV_PORT'] || 3310);
  try {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 3000);
      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      socket.on('connect', () => {
        // zPING\0 is the command form; bare PING is only the nmap-style
        // handshake and clamd answers it with UNKNOWN COMMAND.
        socket.write('zPING\0', () => {});
      });
      socket.on('data', (data) => {
        clearTimeout(timer);
        socket.end();
        resolve(data.toString('utf8').includes('PONG'));
      });
    });
    scanMetrics.sidecarHealthy = ok;
    return ok;
  } catch {
    scanMetrics.sidecarHealthy = false;
    return false;
  }
}

async function quarantineObject(storageKey: string | null): Promise<void> {
  if (!storageKey) return;
  // Row is kept for audit; bytes move out of the servable namespace.
  // S3 lifecycle on the upload prefix is the backstop; local-dev renames aside.
  if (!process.env['STORAGE_BUCKET']) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { LOCAL_UPLOADS_DIR } = await import('../../lib/s3');
      const leaf = storageKey.split('/').pop()!;
      const qdir = path.join(LOCAL_UPLOADS_DIR, 'quarantine');
      fs.mkdirSync(qdir, { recursive: true });
      fs.renameSync(path.join(LOCAL_UPLOADS_DIR, leaf), path.join(qdir, leaf));
      return;
    } catch {
      // Fall through to plain delete.
    }
  }
  // S3 has no atomic move: server-side copy into the quarantine prefix first,
  // then drop the servable object. A failed copy falls back to a hard delete so
  // an infected object is never left reachable.
  const copied = await copyObject(storageKey, `quarantine/${storageKey}`);
  await deleteObject(storageKey).catch(() => {});
  if (!copied) logger.warn({ storageKey }, 'Quarantine copy failed; object hard-deleted');
}

async function markRow(
  db: Database,
  mediaId: string,
  kind: 'card' | 'chat',
  patch: { status: MediaStatus; scanStatus: MediaScanStatus; checksum?: string }
): Promise<void> {
  const now = new Date();
  if (kind === 'card') {
    await db
      .update(attachments)
      .set({
        status: patch.status,
        scanStatus: patch.scanStatus,
        scannedAt: now,
        ...(patch.checksum ? { checksumSha256: patch.checksum } : {}),
      })
      .where(eq(attachments.id, mediaId));
  } else {
    await db
      .update(chatAttachments)
      .set({
        status: patch.status,
        scanStatus: patch.scanStatus,
        scannedAt: now,
        ...(patch.checksum ? { checksumSha256: patch.checksum } : {}),
      })
      .where(eq(chatAttachments.id, mediaId));
  }
}

async function bumpError(db: Database, mediaId: string, kind: 'card' | 'chat'): Promise<void> {
  const attempts = maxAttempts();
  if (kind === 'card') {
    const [row] = await db
      .select({ scanAttempts: attachments.scanAttempts })
      .from(attachments)
      .where(eq(attachments.id, mediaId))
      .limit(1);
    const next = (row?.scanAttempts ?? 0) + 1;
    if (next >= attempts) {
      await db
        .update(attachments)
        .set({
          scanStatus: MediaScanStatus.Error,
          status: MediaStatus.Failed,
          scanAttempts: next,
          scannedAt: new Date(),
        })
        .where(eq(attachments.id, mediaId));
      scanMetrics.failed++;
    } else {
      // Stay `scanning`; the poll loop re-enqueues once the backoff window for
      // this attempt count has elapsed (never immediately — a dead sidecar would
      // otherwise spin the queue).
      await db
        .update(attachments)
        .set({ scanStatus: MediaScanStatus.Error, scanAttempts: next, scannedAt: new Date() })
        .where(eq(attachments.id, mediaId));
    }
  } else {
    const [row] = await db
      .select({ scanAttempts: chatAttachments.scanAttempts })
      .from(chatAttachments)
      .where(eq(chatAttachments.id, mediaId))
      .limit(1);
    const next = (row?.scanAttempts ?? 0) + 1;
    if (next >= attempts) {
      await db
        .update(chatAttachments)
        .set({
          scanStatus: MediaScanStatus.Error,
          status: MediaStatus.Failed,
          scanAttempts: next,
          scannedAt: new Date(),
        })
        .where(eq(chatAttachments.id, mediaId));
      scanMetrics.failed++;
    } else {
      await db
        .update(chatAttachments)
        .set({ scanStatus: MediaScanStatus.Error, scanAttempts: next, scannedAt: new Date() })
        .where(eq(chatAttachments.id, mediaId));
    }
  }
  scanMetrics.errors++;
  METRIC_WINDOW.push({ at: Date.now(), error: true });
}

export async function scanOne(db: Database, mediaId: string): Promise<void> {
  const media = await findMedia(db, mediaId);
  if (!media) return;
  // ready/pending is the pre-gate legacy pair — the throttled rescan is the only
  // path allowed to touch it.
  const legacy = media.status === MediaStatus.Ready && media.scanStatus === MediaScanStatus.Pending;
  if (media.status !== MediaStatus.Scanning && !legacy) return;
  if (!media.storageKey) {
    await bumpError(db, mediaId, media.kind);
    return;
  }
  const maxBytes = Number(process.env['SCAN_MAX_BYTES'] || 26 * 1024 * 1024);
  // The test transport needs the whole buffer; production pipes S3 → clamd.
  if (transportOverride) {
    const bytes = await getObjectBytes(media.storageKey, maxBytes);
    if (!bytes) {
      await bumpError(db, mediaId, media.kind);
      return;
    }
    await runVerdict(
      db,
      mediaId,
      media,
      () => sha256Hex(bytes),
      () => transportOverride!(bytes)
    );
    return;
  }
  const source = await openObjectStream(media.storageKey, maxBytes);
  if (!source) {
    await bumpError(db, mediaId, media.kind);
    return;
  }
  const hash = createHash('sha256');
  // Per-scan local: scanOne runs up to SCAN_CONCURRENCY at a time, so this
  // must not be shared across scans or rows get each other's checksum.
  let localChecksum: string | null = null;
  await runVerdict(
    db,
    mediaId,
    media,
    () => localChecksum,
    async () => {
      const hashing = (async function* (): AsyncGenerator<Uint8Array> {
        for await (const chunk of source) {
          hash.update(chunk);
          yield chunk;
        }
      })();
      const verdict = await clamavScanStream(hashing);
      localChecksum = hash.digest('hex');
      return verdict;
    }
  );
}

async function runVerdict(
  db: Database,
  mediaId: string,
  media: { kind: 'card' | 'chat'; storageKey: string | null },
  checksumFn: () => string | null,
  verdictFn: () => Promise<'clean' | 'infected'>
): Promise<void> {
  try {
    const verdict = await verdictFn();
    if (verdictSettleDelayMs > 0) {
      await new Promise((r) => setTimeout(r, verdictSettleDelayMs));
    }
    scanMetrics.lastScanAt = new Date();
    const checksum = checksumFn();
    if (verdict === 'clean') {
      await markRow(db, mediaId, media.kind, {
        status: MediaStatus.Ready,
        scanStatus: MediaScanStatus.Clean,
        ...(checksum ? { checksum } : {}),
      });
      scanMetrics.clean++;
    } else {
      await quarantineObject(media.storageKey);
      await markRow(db, mediaId, media.kind, {
        status: MediaStatus.Blocked,
        scanStatus: MediaScanStatus.Infected,
        ...(checksum ? { checksum } : {}),
      });
      scanMetrics.infected++;
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), mediaId },
      'Media scan error (will retry)'
    );
    await bumpError(db, mediaId, media.kind);
  }
}

async function drain(db: Database): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const width = scanConcurrency();
    while (queue.length > 0) {
      const batch = queue.splice(0, width);
      for (const entry of batch) queuedSet.delete(entry.id);
      scanMetrics.queueDepth = queue.length;
      scanMetrics.oldestQueuedAt = queue.length > 0 ? new Date(queue[0]!.at) : null;
      await Promise.all(batch.map((entry) => scanOne(db, entry.id).catch(() => {})));
    }
  } finally {
    draining = false;
  }
}

/**
 * Scan worker: drains the in-memory queue AND re-polls stale `scanning` rows
 * (crash-safe: a restart reaps rows the dead process never drained).
 */
export function startScanWorker(db: Database, opts: { pollMs?: number } = {}): () => void {
  if (scanMode() === 'disabled') return () => {};
  const pollMs = opts.pollMs ?? 5000;
  const legacyMs = Number(process.env['LEGACY_RESCAN_MS'] || 24 * 60 * 60_000);
  const legacyBatch = Number(process.env['LEGACY_RESCAN_BATCH'] || 25);
  let stopped = false;
  let lastLegacyRun = 0;

  const tick = async () => {
    if (stopped) return;
    try {
      // Retryable `scanning` rows whose backoff window has elapsed: rows the
      // in-process queue lost (crash/restart) plus rows a failed attempt left
      // behind. Every attempt stamps scanned_at, so the window grows with
      // scan_attempts instead of hot-looping against a dead sidecar.
      const cards = await db
        .select({
          id: attachments.id,
          attempts: attachments.scanAttempts,
          scannedAt: attachments.scannedAt,
          scanStatus: attachments.scanStatus,
        })
        .from(attachments)
        .where(
          and(
            eq(attachments.status, MediaStatus.Scanning),
            inArray(attachments.scanStatus, [MediaScanStatus.Pending, MediaScanStatus.Error]),
            or(
              isNull(attachments.scannedAt),
              lt(attachments.scannedAt, new Date(Date.now() - pollMs))
            )
          )
        )
        .limit(100);
      const chat = await db
        .select({
          id: chatAttachments.id,
          attempts: chatAttachments.scanAttempts,
          scannedAt: chatAttachments.scannedAt,
          scanStatus: chatAttachments.scanStatus,
        })
        .from(chatAttachments)
        .where(
          and(
            eq(chatAttachments.status, MediaStatus.Scanning),
            inArray(chatAttachments.scanStatus, [MediaScanStatus.Pending, MediaScanStatus.Error]),
            or(
              isNull(chatAttachments.scannedAt),
              lt(chatAttachments.scannedAt, new Date(Date.now() - pollMs))
            )
          )
        )
        .limit(100);
      for (const r of [...cards, ...chat]) {
        const window =
          r.scanStatus === MediaScanStatus.Error ? backoffMs(r.attempts ?? 0, pollMs) : pollMs;
        if (Date.now() >= (r.scannedAt?.getTime() ?? 0) + window) enqueueScan(r.id);
      }

      // Throttled legacy rescan: pre-gate rows were backfilled ready/pending and
      // stay downloadable; a small daily batch upgrades them to clean so that
      // exception eventually drains. Only rows with a resolvable key qualify.
      if (Date.now() - lastLegacyRun >= legacyMs) {
        lastLegacyRun = Date.now();
        const legacyCards = await db
          .select({ id: attachments.id })
          .from(attachments)
          .where(
            and(
              eq(attachments.status, MediaStatus.Ready),
              eq(attachments.scanStatus, MediaScanStatus.Pending),
              isNotNull(attachments.storageKey)
            )
          )
          .limit(legacyBatch);
        const legacyChat = await db
          .select({ id: chatAttachments.id })
          .from(chatAttachments)
          .where(
            and(
              eq(chatAttachments.status, MediaStatus.Ready),
              eq(chatAttachments.scanStatus, MediaScanStatus.Pending),
              isNotNull(chatAttachments.storageKey)
            )
          )
          .limit(legacyBatch);
        for (const r of [...legacyCards, ...legacyChat]) enqueueScan(r.id);
        if (legacyCards.length + legacyChat.length > 0) {
          logger.info(
            { count: legacyCards.length + legacyChat.length },
            'Legacy media rescan batch enqueued'
          );
        }
      }

      await drain(db);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Media scan tick failed'
      );
    }
  };
  const timer = setInterval(tick, pollMs);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** Synchronous drain for tests (uses the stubbed transport). */
export async function drainScanQueueForTests(db: Database): Promise<void> {
  await drain(db);
}
