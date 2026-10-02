import { z } from 'zod';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import fs from 'fs';
import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../db/index';
import {
  attachments,
  chatAttachments,
  chatChannels,
  chatChannelMembers,
  cards,
} from '../db/schema/index';
import { s3Client, LOCAL_UPLOADS_DIR, isLocalUploadKeyAllowed } from './s3';
import { env } from './env';
import { httpError } from '../modules/organizations/service';
import { MediaScanStatus, MediaStatus } from '@boardly/shared-types';
export type ScanStatus = MediaScanStatus;
export type { MediaStatus, MediaScanStatus };

// ─── Shared validation (mirrors the old card/chat mint guards) ───────────────
export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const MIME_RE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/;

export const mediaUploadInput = z.object({
  fileName: z.string().min(1).max(255),
  declaredMime: z.string().min(1).max(100).regex(MIME_RE, 'Invalid MIME type').optional(),
  sizeBytes: z.number().int().min(0).max(MEDIA_MAX_BYTES).optional(),
});

export type MediaKind = 'card' | 'chat';

export function isS3Enabled(): boolean {
  return Boolean(s3Client && env.STORAGE_BUCKET);
}

export function scanMode(): 'enabled' | 'disabled' {
  const raw = (process.env['SCAN_MODE'] || '').toLowerCase();
  if (raw === 'enabled') return 'enabled';
  if (raw === 'disabled') return 'disabled';
  // Default: disabled outside production so local-dev/test never need a sidecar.
  return env.NODE_ENV === 'production' ? 'enabled' : 'disabled';
}

/** Refuse SCAN_MODE=disabled in production — fail-closed, never silent. */
export function assertScanModeValid(): void {
  if (scanMode() === 'disabled' && env.NODE_ENV === 'production') {
    throw httpError(500, 'Virus scanning is disabled in production (refusing to serve uploads)');
  }
}

function safeBase(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.-]/g, '_').slice(-100);
}

function s3KeyFor(orgId: string, scope: string, fileName: string): string {
  return `orgs/${orgId}/${scope}/${Date.now()}-${safeBase(fileName)}`;
}

function localKeyFor(fileName: string): string {
  return `${Date.now()}-${safeBase(fileName)}`;
}

// ─── Object-store primitives (S3 with local-dev parity) ──────────────────────

export async function putObjectBytes(
  storageKey: string,
  bytes: Uint8Array,
  mime?: string
): Promise<void> {
  if (isS3Enabled()) {
    await s3Client!.send(
      new PutObjectCommand({
        Bucket: env.STORAGE_BUCKET!,
        Key: storageKey,
        Body: bytes,
        ContentType: mime,
      })
    );
    return;
  }
  const safe = storageKey.split('/').pop() || storageKey;
  if (!isLocalUploadKeyAllowed(safe)) throw httpError(400, 'File type not allowed');
  await Bun.write(path.join(LOCAL_UPLOADS_DIR, safe), bytes);
}

export async function headObject(
  storageKey: string
): Promise<{ size: number; mime?: string } | null> {
  if (isS3Enabled()) {
    try {
      const out = await s3Client!.send(
        new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET!, Key: storageKey })
      );
      return { size: out.ContentLength ?? 0, mime: out.ContentType };
    } catch {
      return null;
    }
  }
  const safe = storageKey.split('/').pop() || storageKey;
  const file = Bun.file(path.join(LOCAL_UPLOADS_DIR, safe));
  if (!(await file.exists())) return null;
  return { size: file.size, mime: undefined };
}

export async function getObjectBytes(
  storageKey: string,
  maxBytes = MEDIA_MAX_BYTES
): Promise<Uint8Array | null> {
  if (isS3Enabled()) {
    try {
      const out = await s3Client!.send(
        new GetObjectCommand({ Bucket: env.STORAGE_BUCKET!, Key: storageKey })
      );
      const body = out.Body as unknown as
        { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
      if (body && typeof body.transformToByteArray === 'function') {
        const bytes = await body.transformToByteArray();
        return bytes.slice(0, maxBytes + 1);
      }
      return null;
    } catch {
      return null;
    }
  }
  const safe = storageKey.split('/').pop() || storageKey;
  const file = Bun.file(path.join(LOCAL_UPLOADS_DIR, safe));
  if (!(await file.exists())) return null;
  if (file.size > maxBytes) return null;
  return new Uint8Array(await file.arrayBuffer());
}

function toAsyncIterable(body: unknown): AsyncIterable<Uint8Array> | null {
  if (!body) return null;
  if (typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function') {
    return body as AsyncIterable<Uint8Array>;
  }
  const reader = (body as ReadableStream<Uint8Array>).getReader;
  if (typeof reader === 'function') {
    const stream = body as ReadableStream<Uint8Array>;
    return {
      async *[Symbol.asyncIterator]() {
        const r = stream.getReader();
        try {
          for (;;) {
            const { done, value } = await r.read();
            if (done) return;
            if (value) yield value;
          }
        } finally {
          r.releaseLock();
        }
      },
    };
  }
  return null;
}

/** Hard byte cap while streaming — an oversized object aborts mid-transfer. */
function capStream(source: AsyncIterable<Uint8Array>, maxBytes: number): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      let seen = 0;
      for await (const chunk of source) {
        seen += chunk.length;
        if (seen > maxBytes) throw new Error(`Object exceeds the ${maxBytes} byte scan limit`);
        yield chunk;
      }
    },
  };
}

/**
 * Open the object as a byte stream so the scanner can pipe S3 → clamd directly
 * instead of buffering a 25 MB object in the API process.
 */
export async function openObjectStream(
  storageKey: string,
  maxBytes = MEDIA_MAX_BYTES
): Promise<AsyncIterable<Uint8Array> | null> {
  if (isS3Enabled()) {
    try {
      const out = await s3Client!.send(
        new GetObjectCommand({ Bucket: env.STORAGE_BUCKET!, Key: storageKey })
      );
      const source = toAsyncIterable(out.Body);
      return source ? capStream(source, maxBytes) : null;
    } catch {
      return null;
    }
  }
  const safe = storageKey.split('/').pop() || storageKey;
  const file = Bun.file(path.join(LOCAL_UPLOADS_DIR, safe));
  if (!(await file.exists())) return null;
  if (file.size > maxBytes) return null;
  const source = toAsyncIterable(file.stream());
  return source ? capStream(source, maxBytes) : null;
}

/** Server-side copy (quarantine) — S3 has no atomic move. */
export async function copyObject(srcKey: string, dstKey: string): Promise<boolean> {
  if (!isS3Enabled()) return false;
  try {
    await s3Client!.send(
      new CopyObjectCommand({
        Bucket: env.STORAGE_BUCKET!,
        Key: dstKey,
        CopySource: `${env.STORAGE_BUCKET!}/${srcKey}`,
        MetadataDirective: 'COPY',
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(storageKey: string): Promise<void> {
  if (isS3Enabled()) {
    await s3Client!
      .send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET!, Key: storageKey }))
      .catch(() => {});
    return;
  }
  const safe = storageKey.split('/').pop() || storageKey;
  try {
    fs.unlinkSync(path.join(LOCAL_UPLOADS_DIR, safe));
  } catch {}
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ─── Access verification (tenant fail-closed, mirrors card/chat guards) ──────

async function verifyCardRef(db: Database, cardId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.organizationId, orgId)))
    .limit(1);
  if (!row) throw httpError(404, 'Card not found');
}

async function verifyChannelRef(
  db: Database,
  channelId: string,
  orgId: string,
  userId?: string
): Promise<void> {
  const [ch] = await db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .where(and(eq(chatChannels.id, channelId), eq(chatChannels.organizationId, orgId)))
    .limit(1);
  if (!ch) throw httpError(404, 'Channel not found');
  if (userId) {
    const [m] = await db
      .select({ id: chatChannelMembers.id })
      .from(chatChannelMembers)
      .where(
        and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId))
      )
      .limit(1);
    if (!m) throw httpError(403, 'Access denied: not a member of this channel');
  }
}

// ─── Row helpers (unified view over the two legacy tables) ───────────────────

export interface MediaRow {
  mediaId: string;
  kind: MediaKind;
  fileName: string;
  mime: string;
  sizeBytes: number;
  status: MediaStatus;
  scanStatus: MediaScanStatus;
  storageKey: string | null;
  url: string;
  checksumSha256: string | null;
}

export async function findMedia(db: Database, mediaId: string): Promise<MediaRow | null> {
  const [a] = await db.select().from(attachments).where(eq(attachments.id, mediaId)).limit(1);
  if (a) {
    return {
      mediaId: a.id,
      kind: 'card',
      fileName: a.fileName,
      mime: a.declaredMime || a.fileType || 'application/octet-stream',
      sizeBytes: a.sizeBytes ?? 0,
      status: a.status || MediaStatus.Staged,
      scanStatus: a.scanStatus || MediaScanStatus.Pending,
      storageKey: a.storageKey,
      url: a.url,
      checksumSha256: a.checksumSha256,
    };
  }
  const [c] = await db
    .select()
    .from(chatAttachments)
    .where(eq(chatAttachments.id, mediaId))
    .limit(1);
  if (c) {
    return {
      mediaId: c.id,
      kind: 'chat',
      fileName: c.fileName,
      mime: c.declaredMime || c.fileType || 'application/octet-stream',
      sizeBytes: c.fileSize ?? 0,
      status: c.status || MediaStatus.Staged,
      scanStatus: c.scanStatus || MediaScanStatus.Pending,
      storageKey: c.storageKey,
      url: c.fileUrl,
      checksumSha256: c.checksumSha256,
    };
  }
  return null;
}

// ─── requestUpload: validate → verify → mint 5-min PUT → staged row ──────────

export interface RequestUploadInput {
  kind: MediaKind;
  refId: string;
  fileName: string;
  declaredMime?: string;
  sizeBytes?: number;
}

export async function requestUpload(
  db: Database,
  organizationId: string,
  userId: string,
  input: RequestUploadInput
): Promise<{ uploadUrl: string; mediaId: string; storageKey: string }> {
  const parsed = mediaUploadInput.safeParse({
    fileName: input.fileName,
    declaredMime: input.declaredMime,
    sizeBytes: input.sizeBytes,
  });
  if (!parsed.success)
    throw httpError(400, parsed.error.issues[0]?.message || 'Invalid upload input');

  if (input.kind === 'card') await verifyCardRef(db, input.refId, organizationId);
  else await verifyChannelRef(db, input.refId, organizationId, userId);

  const fileName = input.fileName.trim();
  // Local-dev buffer serves bytes back: fail fast before the DB record exists.
  if (!isS3Enabled() && !isLocalUploadKeyAllowed(fileName))
    throw httpError(400, 'File type not allowed');

  const scope = input.kind === 'card' ? `cards/${input.refId}` : `chat/${input.refId}`;
  const storageKey = isS3Enabled()
    ? s3KeyFor(organizationId, scope, fileName)
    : localKeyFor(fileName);

  let uploadUrl: string;
  let publicUrl: string;
  if (isS3Enabled()) {
    const command = new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET!,
      Key: storageKey,
      ContentType: input.declaredMime || 'application/octet-stream',
    });
    uploadUrl = await getSignedUrl(s3Client!, command, { expiresIn: 300 });
    const endpoint = env.STORAGE_ENDPOINT;
    publicUrl = endpoint
      ? `${endpoint}/${env.STORAGE_BUCKET}/${storageKey}`
      : `https://${env.STORAGE_BUCKET}.s3.${env.STORAGE_REGION || 'us-east-1'}.amazonaws.com/${storageKey}`;
  } else {
    const baseUrl = env.API_URL || 'http://localhost:3001';
    const leaf = storageKey.split('/').pop()!;
    uploadUrl = `${baseUrl}/v1/cards/attachments/local-upload?key=${encodeURIComponent(leaf)}`;
    publicUrl = `${baseUrl}/v1/cards/attachments/file/${encodeURIComponent(leaf)}`;
  }

  let mediaId: string;
  if (input.kind === 'card') {
    const [row] = await db
      .insert(attachments)
      .values({
        cardId: input.refId,
        uploadedBy: userId,
        fileName,
        url: publicUrl,
        fileType: input.declaredMime,
        declaredMime: input.declaredMime,
        sizeBytes: input.sizeBytes ?? null,
        storageKey,
        status: MediaStatus.Staged,
        scanStatus: MediaScanStatus.Pending,
        scanAttempts: 0,
      })
      .returning({ id: attachments.id });
    if (!row) throw httpError(500, 'Failed to stage upload');
    mediaId = row.id;
  } else {
    const [row] = await db
      .insert(chatAttachments)
      .values({
        messageId: null,
        channelId: input.refId,
        uploadedBy: userId,
        fileName,
        fileUrl: publicUrl,
        fileSize: input.sizeBytes ?? 0,
        fileType: input.declaredMime || 'application/octet-stream',
        declaredMime: input.declaredMime,
        storageKey,
        status: MediaStatus.Staged,
        scanStatus: MediaScanStatus.Pending,
        scanAttempts: 0,
      })
      .returning({ id: chatAttachments.id });
    if (!row) throw httpError(500, 'Failed to stage upload');
    mediaId = row.id;
  }

  return { uploadUrl, mediaId, storageKey };
}

// ─── confirmUpload: HEAD verify → staged→scanning (conditional) → enqueue ────

export async function confirmUpload(
  db: Database,
  organizationId: string,
  mediaId: string,
  opts: { enqueue?: (mediaId: string) => void } = {}
): Promise<{ status: MediaStatus; scanStatus: MediaScanStatus }> {
  const media = await findMedia(db, mediaId);
  if (!media) throw httpError(404, 'Upload not found');
  // Cross-org reads must 404 (no existence oracle).
  if (media.kind === 'card') {
    const [row] = await db
      .select({ id: attachments.id })
      .from(attachments)
      .innerJoin(cards, eq(cards.id, attachments.cardId))
      .where(and(eq(attachments.id, mediaId), eq(cards.organizationId, organizationId)))
      .limit(1);
    if (!row) throw httpError(404, 'Upload not found');
  } else {
    const [row] = await db
      .select({ id: chatAttachments.id })
      .from(chatAttachments)
      .innerJoin(chatChannels, eq(chatChannels.id, chatAttachments.channelId))
      .where(and(eq(chatAttachments.id, mediaId), eq(chatChannels.organizationId, organizationId)))
      .limit(1);
    if (!row) throw httpError(404, 'Upload not found');
  }
  if (!media.storageKey) throw httpError(400, 'Upload has no staged object');

  const head = await headObject(media.storageKey);
  if (!head) {
    // Client never completed the PUT (or GC already reaped it): keep the
    // staged row so GC owns cleanup, and report it as missing.
    throw httpError(404, 'Uploaded bytes not found (PUT may not have completed)');
  }
  if (head.size > MEDIA_MAX_BYTES) throw httpError(400, 'File exceeds the 25 MB limit');
  if (media.sizeBytes > 0 && head.size !== media.sizeBytes) {
    throw httpError(422, `Size mismatch: declared ${media.sizeBytes} bytes, uploaded ${head.size}`);
  }
  // S3 echoes the PUT ContentType back on HEAD; a mismatch means the client
  // lied about the type (or reused a signed URL for another file).
  if (head.mime && media.mime !== 'application/octet-stream' && head.mime !== media.mime) {
    throw httpError(422, `MIME mismatch: declared ${media.mime}, uploaded ${head.mime}`);
  }

  // Dev/test without a sidecar: mark skipped so the flow stays usable.
  // Production refuses (assertScanModeValid) — fail-closed, never silent.
  if (scanMode() === 'disabled') {
    assertScanModeValid();
    if (media.kind === 'card') {
      await db
        .update(attachments)
        .set({
          status: MediaStatus.Ready,
          scanStatus: MediaScanStatus.Skipped,
          scannedAt: new Date(),
          sizeBytes: head.size,
        })
        .where(eq(attachments.id, mediaId));
    } else {
      await db
        .update(chatAttachments)
        .set({
          status: MediaStatus.Ready,
          scanStatus: MediaScanStatus.Skipped,
          scannedAt: new Date(),
          fileSize: head.size,
        })
        .where(eq(chatAttachments.id, mediaId));
    }
    return { status: MediaStatus.Ready, scanStatus: MediaScanStatus.Skipped };
  }

  // Conditional transition: only staged rows move to scanning. The losers of
  // a confirm-vs-GC race get 0 updated rows → 409, never a silent resurrect.
  let moved = 0;
  if (media.kind === 'card') {
    const rows = await db
      .update(attachments)
      .set({ status: MediaStatus.Scanning, sizeBytes: head.size })
      .where(and(eq(attachments.id, mediaId), eq(attachments.status, MediaStatus.Staged)))
      .returning({ id: attachments.id });
    moved = rows.length;
  } else {
    const rows = await db
      .update(chatAttachments)
      .set({ status: MediaStatus.Scanning, fileSize: head.size })
      .where(and(eq(chatAttachments.id, mediaId), eq(chatAttachments.status, MediaStatus.Staged)))
      .returning({ id: chatAttachments.id });
    moved = rows.length;
  }
  if (moved === 0) {
    const cur = await findMedia(db, mediaId);
    if (!cur) throw httpError(404, 'Upload not found');
    if (cur.status === MediaStatus.Ready)
      return { status: MediaStatus.Ready, scanStatus: cur.scanStatus };
    throw httpError(409, `Upload is ${cur.status} (expected staged)`);
  }
  opts.enqueue?.(mediaId);
  const { enqueueScan } = await import('../modules/media/scan');
  enqueueScan(mediaId);
  return { status: MediaStatus.Scanning, scanStatus: MediaScanStatus.Pending };
}

// ─── ingestBytes: email path — no HTTP round-trip, same scan gate ────────────

export async function ingestBytes(
  db: Database,
  organizationId: string,
  userId: string,
  input: RequestUploadInput & { bytes: Uint8Array }
): Promise<{ mediaId: string }> {
  const parsed = mediaUploadInput.safeParse({
    fileName: input.fileName,
    declaredMime: input.declaredMime,
    sizeBytes: input.bytes.length,
  });
  if (!parsed.success)
    throw httpError(400, parsed.error.issues[0]?.message || 'Invalid upload input');
  if (input.bytes.length > MEDIA_MAX_BYTES) throw httpError(400, 'File exceeds the 25 MB limit');

  if (input.kind === 'card') await verifyCardRef(db, input.refId, organizationId);
  else await verifyChannelRef(db, input.refId, organizationId);

  const fileName = input.fileName.trim();
  if (!isS3Enabled() && !isLocalUploadKeyAllowed(fileName))
    throw httpError(400, 'File type not allowed');
  const scope = input.kind === 'card' ? `cards/${input.refId}` : `chat/${input.refId}`;
  const storageKey = isS3Enabled()
    ? s3KeyFor(organizationId, scope, fileName)
    : localKeyFor(fileName);
  await putObjectBytes(storageKey, input.bytes, input.declaredMime);
  const checksum = sha256Hex(input.bytes);

  const skipped = scanMode() === 'disabled';
  if (skipped) assertScanModeValid();
  const status: MediaStatus = skipped ? MediaStatus.Ready : MediaStatus.Scanning;
  const scanStatus: MediaScanStatus = skipped ? MediaScanStatus.Skipped : MediaScanStatus.Pending;

  let mediaId: string;
  if (input.kind === 'card') {
    const baseUrl = env.API_URL || 'http://localhost:3001';
    const leaf = storageKey.split('/').pop()!;
    const publicUrl = isS3Enabled()
      ? env.STORAGE_ENDPOINT
        ? `${env.STORAGE_ENDPOINT}/${env.STORAGE_BUCKET}/${storageKey}`
        : `https://${env.STORAGE_BUCKET}.s3.${env.STORAGE_REGION || 'us-east-1'}.amazonaws.com/${storageKey}`
      : `${baseUrl}/v1/cards/attachments/file/${encodeURIComponent(leaf)}`;
    const [row] = await db
      .insert(attachments)
      .values({
        cardId: input.refId,
        uploadedBy: userId,
        fileName,
        url: publicUrl,
        fileType: input.declaredMime,
        declaredMime: input.declaredMime,
        sizeBytes: input.bytes.length,
        storageKey,
        status,
        scanStatus,
        scannedAt: skipped ? new Date() : null,
        checksumSha256: checksum,
        scanAttempts: 0,
      })
      .returning({ id: attachments.id });
    if (!row) throw httpError(500, 'Failed to ingest upload');
    mediaId = row.id;
  } else {
    const baseUrl = env.API_URL || 'http://localhost:3001';
    const leaf = storageKey.split('/').pop()!;
    const publicUrl = isS3Enabled()
      ? env.STORAGE_ENDPOINT
        ? `${env.STORAGE_ENDPOINT}/${env.STORAGE_BUCKET}/${storageKey}`
        : `https://${env.STORAGE_BUCKET}.s3.${env.STORAGE_REGION || 'us-east-1'}.amazonaws.com/${storageKey}`
      : `${baseUrl}/v1/cards/attachments/file/${encodeURIComponent(leaf)}`;
    const [row] = await db
      .insert(chatAttachments)
      .values({
        messageId: null,
        channelId: input.refId,
        uploadedBy: userId,
        fileName,
        fileUrl: publicUrl,
        fileSize: input.bytes.length,
        fileType: input.declaredMime || 'application/octet-stream',
        declaredMime: input.declaredMime,
        storageKey,
        status,
        scanStatus,
        scannedAt: skipped ? new Date() : null,
        checksumSha256: checksum,
        scanAttempts: 0,
      })
      .returning({ id: chatAttachments.id });
    if (!row) throw httpError(500, 'Failed to ingest upload');
    mediaId = row.id;
  }
  if (!skipped) {
    const { enqueueScan } = await import('../modules/media/scan');
    enqueueScan(mediaId);
  }
  return { mediaId };
}

// ─── presignedGet: fail-closed 15-min read ───────────────────────────────────

export type PresignedRead =
  | { mode: 's3'; url: string; fileName: string; mime: string; sizeBytes: number }
  | { mode: 'local'; absPath: string; fileName: string; mime: string; sizeBytes: number };

export async function presignedGet(
  db: Database,
  organizationId: string,
  mediaId: string
): Promise<PresignedRead> {
  const media = await findMedia(db, mediaId);
  if (!media) throw httpError(404, 'Upload not found');
  // Tenant scoping: same conditional join as confirm (404, not 403).
  if (media.kind === 'card') {
    const [row] = await db
      .select({ id: attachments.id })
      .from(attachments)
      .innerJoin(cards, eq(cards.id, attachments.cardId))
      .where(and(eq(attachments.id, mediaId), eq(cards.organizationId, organizationId)))
      .limit(1);
    if (!row) throw httpError(404, 'Upload not found');
  } else {
    const [row] = await db
      .select({ id: chatAttachments.id })
      .from(chatAttachments)
      .innerJoin(chatChannels, eq(chatChannels.id, chatAttachments.channelId))
      .where(and(eq(chatAttachments.id, mediaId), eq(chatChannels.organizationId, organizationId)))
      .limit(1);
    if (!row) throw httpError(404, 'Upload not found');
  }

  // Fail-closed gate: only clean (or dev-skipped) ready rows are servable.
  if (media.status === MediaStatus.Blocked || media.scanStatus === MediaScanStatus.Infected)
    throw httpError(410, 'File blocked by virus scan');
  if (media.status === MediaStatus.Failed || media.scanStatus === MediaScanStatus.Error)
    throw httpError(404, 'Upload not found');
  // Documented legacy exception: rows that predate the scan gate were backfilled
  // to ready/pending. New uploads can never land in this pair (staged → scanning →
  // ready/clean), so it uniquely identifies pre-gate rows; they stay downloadable
  // until the throttled legacy rescan re-clears them.
  const legacy = media.status === MediaStatus.Ready && media.scanStatus === MediaScanStatus.Pending;
  if (media.status !== MediaStatus.Ready && !legacy) {
    const err = httpError(
      media.status === MediaStatus.Scanning ? 202 : 409,
      `Upload is ${media.status} (scan ${media.scanStatus})`
    );
    throw err;
  }
  if (
    !legacy &&
    media.scanStatus !== MediaScanStatus.Clean &&
    media.scanStatus !== MediaScanStatus.Skipped
  ) {
    throw httpError(409, `Upload scan is ${media.scanStatus}`);
  }
  if (media.scanStatus === MediaScanStatus.Skipped) assertScanModeValid();
  if (!media.storageKey) throw httpError(404, 'Upload not found');

  if (isS3Enabled()) {
    // Non-image attachments download; images may render inline. Never inline
    // HTML/SVG (stored-XSS): uploader allowlists already block those exts.
    const inline = media.mime.startsWith('image/');
    const command = new GetObjectCommand({
      Bucket: env.STORAGE_BUCKET!,
      Key: media.storageKey,
      ResponseContentDisposition: `${inline ? 'inline' : 'attachment'}; filename="${media.fileName.replace(/"/g, '_')}"`,
      ResponseContentType: media.mime,
    });
    const url = await getSignedUrl(s3Client!, command, { expiresIn: 900 });
    return {
      mode: 's3',
      url,
      fileName: media.fileName,
      mime: media.mime,
      sizeBytes: media.sizeBytes,
    };
  }
  const leaf = media.storageKey.split('/').pop()!;
  const absPath = path.join(LOCAL_UPLOADS_DIR, leaf);
  const file = Bun.file(absPath);
  if (!(await file.exists())) throw httpError(404, 'Upload not found');
  return {
    mode: 'local',
    absPath,
    fileName: media.fileName,
    mime: media.mime,
    sizeBytes: media.sizeBytes,
  };
}
