import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard } from '../cards/service';
import { createGroupChannel } from '../chat/service';
import {
  requestUpload,
  confirmUpload,
  presignedGet,
  putObjectBytes,
  deleteObject,
  isS3Enabled,
  findMedia,
} from '../../lib/storage';
import { scanOne, __setScanTransport, enqueueScan, backoffMs, scanMetricsSnapshot } from './scan';
import { runMediaGC } from './gc';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;
let orgId: string;
let userId: string;
let cardId: string;
let channelId: string;
let otherOrgId: string;
let otherUserId: string;

const prevScanMode = process.env['SCAN_MODE'];
const prevMaxAttempts = process.env['SCAN_MAX_ATTEMPTS'];

async function setupTenant(suffix: string) {
  const { user, organization } = await signUp(db, {
    name: `Media Owner ${suffix}`,
    email: `media_${suffix}@example.com`,
    password: 'pass',
    orgName: `Media Org ${suffix}`,
    orgSlug: `media-org-${suffix}`,
  });
  const ws = await createWorkspace(db, { organizationId: organization.id, name: 'WS' });
  const proj = await createProject(db, {
    organizationId: organization.id,
    workspaceId: ws!.id,
    name: 'P',
  });
  const board = await createBoard(db, {
    organizationId: organization.id,
    projectId: proj!.id,
    name: 'B',
  });
  const list = await createList(db, organization.id, { boardId: board!.id, name: 'To Do' });
  const card = await createCard(db, organization.id, { listId: list!.id, title: 'Media card' });
  const channel = await createGroupChannel(db, organization.id, user.id, {
    name: `media-${suffix}`,
  });
  return { user, organization, card, channel };
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
  const a = await setupTenant(`${Date.now()}_a`);
  orgId = a.organization.id;
  userId = a.user.id;
  cardId = a.card!.id;
  channelId = a.channel!.id;
  const b = await setupTenant(`${Date.now()}_b`);
  otherOrgId = b.organization.id;
  otherUserId = b.user.id;
});

afterAll(async () => {
  process.env['SCAN_MODE'] = prevScanMode;
  if (prevMaxAttempts === undefined) delete process.env['SCAN_MAX_ATTEMPTS'];
  else process.env['SCAN_MAX_ATTEMPTS'] = prevMaxAttempts;
  __setScanTransport(null);
  await client.end();
});

beforeEach(() => {
  process.env['SCAN_MODE'] = 'enabled';
  delete process.env['SCAN_MAX_ATTEMPTS'];
  __setScanTransport(null);
});

const png = (n = 64) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256));

describe('Media scan gate (5.5)', () => {
  it('rejects oversize declarations (25 MB Zod cap)', async () => {
    await expect(
      requestUpload(db, orgId, userId, {
        kind: 'card',
        refId: cardId,
        fileName: 'big.png',
        declaredMime: 'image/png',
        sizeBytes: 26 * 1024 * 1024,
      })
    ).rejects.toThrow();
  });

  it('rejects malformed MIME types', async () => {
    await expect(
      requestUpload(db, orgId, userId, {
        kind: 'card',
        refId: cardId,
        fileName: 'a.png',
        declaredMime: 'not-a-mime',
      })
    ).rejects.toThrow();
  });

  it('rejects disallowed extensions in local mode before any row exists', async () => {
    if (isS3Enabled()) return;
    const before = await db.select({ id: schema.attachments.id }).from(schema.attachments);
    await expect(
      requestUpload(db, orgId, userId, { kind: 'card', refId: cardId, fileName: 'evil.html' })
    ).rejects.toThrow();
    const after = await db.select({ id: schema.attachments.id }).from(schema.attachments);
    expect(after.length).toBe(before.length);
  });

  it('returns 404 cross-org on confirm and read (no existence oracle)', async () => {
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'x.png',
      declaredMime: 'image/png',
    });
    await putObjectBytes(storageKey, png());
    try {
      await expect(confirmUpload(db, otherOrgId, mediaId)).rejects.toThrow();
      await expect(presignedGet(db, otherOrgId, mediaId)).rejects.toThrow();
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }
  });

  it('leaves an orphan staged row when the PUT never completes (GC owns it)', async () => {
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'orphan.png',
      declaredMime: 'image/png',
    });
    try {
      await expect(confirmUpload(db, orgId, mediaId)).rejects.toThrow();
      const media = await findMedia(db, mediaId);
      expect(media?.status).toBe('staged');
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }
  });

  it('holds scanning uploads unservable (202) until clean', async () => {
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'hold.png',
      declaredMime: 'image/png',
    });
    const bytes = png();
    await putObjectBytes(storageKey, bytes, 'image/png');
    try {
      const confirmed = await confirmUpload(db, orgId, mediaId);
      expect(confirmed.status).toBe('scanning');
      await expect(presignedGet(db, orgId, mediaId)).rejects.toMatchObject({ status: 202 });
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }
  });

  it('serves clean uploads after the scan (ready + checksum)', async () => {
    __setScanTransport(async () => 'clean');
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'clean.png',
      declaredMime: 'image/png',
    });
    const bytes = png();
    await putObjectBytes(storageKey, bytes, 'image/png');
    try {
      await confirmUpload(db, orgId, mediaId);
      await scanOne(db, mediaId);
      const media = await findMedia(db, mediaId);
      expect(media?.status).toBe('ready');
      expect(media?.scanStatus).toBe('clean');
      expect(media?.checksumSha256?.length).toBe(64);
      const read = await presignedGet(db, orgId, mediaId);
      if (read.mode === 'local') {
        const file = Bun.file(read.absPath);
        expect(await file.exists()).toBe(true);
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
      } else {
        expect(read.url.length).toBeGreaterThan(0);
      }
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }
  });

  it('blocks infected uploads with 410 and quarantines bytes', async () => {
    __setScanTransport(async () => 'infected');
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'evil.png',
      declaredMime: 'image/png',
    });
    await putObjectBytes(storageKey, png(), 'image/png');
    try {
      await confirmUpload(db, orgId, mediaId);
      await scanOne(db, mediaId);
      const media = await findMedia(db, mediaId);
      expect(media?.status).toBe('blocked');
      expect(media?.scanStatus).toBe('infected');
      await expect(presignedGet(db, orgId, mediaId)).rejects.toMatchObject({ status: 410 });
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }
  });

  it('retries scan errors with backoff, then fails closed after N attempts', async () => {
    process.env['SCAN_MAX_ATTEMPTS'] = '2';
    let calls = 0;
    __setScanTransport(async () => {
      calls++;
      throw new Error('clamd down');
    });
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'flaky.png',
      declaredMime: 'image/png',
    });
    await putObjectBytes(storageKey, png(), 'image/png');
    try {
      await confirmUpload(db, orgId, mediaId);
      await scanOne(db, mediaId);
      let media = await findMedia(db, mediaId);
      expect(media?.status).toBe('scanning');
      expect(media?.scanStatus).toBe('error');
      // Retry succeeds.
      __setScanTransport(async () => 'clean');
      enqueueScan(mediaId);
      await scanOne(db, mediaId);
      media = await findMedia(db, mediaId);
      expect(media?.status).toBe('ready');
      expect(calls).toBe(1);
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }

    // Persistent outage → failed after N, unservable as 404.
    __setScanTransport(async () => {
      throw new Error('clamd still down');
    });
    const second = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'dead.png',
      declaredMime: 'image/png',
    });
    await putObjectBytes(second.storageKey, png(), 'image/png');
    try {
      await confirmUpload(db, orgId, second.mediaId);
      await scanOne(db, second.mediaId);
      await scanOne(db, second.mediaId);
      const media = await findMedia(db, second.mediaId);
      expect(media?.status).toBe('failed');
      await expect(presignedGet(db, orgId, second.mediaId)).rejects.toMatchObject({ status: 404 });
    } finally {
      await deleteObject(second.storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, second.mediaId));
    }
  });

  it('loses the confirm-vs-GC race fail-closed (confirm after reap → 404)', async () => {
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'race.png',
      declaredMime: 'image/png',
    });
    await putObjectBytes(storageKey, png(), 'image/png');
    // Age the staged row past the GC window, then reap.
    await db
      .update(schema.attachments)
      .set({ createdAt: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(schema.attachments.id, mediaId));
    const gc = await runMediaGC(db);
    expect(gc.stagedCards).toBeGreaterThanOrEqual(1);
    expect(await findMedia(db, mediaId)).toBeNull();
    await expect(confirmUpload(db, orgId, mediaId)).rejects.toMatchObject({ status: 404 });
  });

  it('treats confirm as idempotent once ready', async () => {
    process.env['SCAN_MODE'] = 'disabled';
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'idem.png',
      declaredMime: 'image/png',
    });
    await putObjectBytes(storageKey, png(), 'image/png');
    try {
      const first = await confirmUpload(db, orgId, mediaId);
      expect(first.status).toBe('ready');
      const second = await confirmUpload(db, orgId, mediaId);
      expect(second.status).toBe('ready');
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }
  });

  it('rejects size mismatches between declaration and uploaded bytes', async () => {
    const { mediaId, storageKey } = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'mismatch.png',
      declaredMime: 'image/png',
      sizeBytes: 10,
    });
    await putObjectBytes(storageKey, png(64), 'image/png');
    try {
      await expect(confirmUpload(db, orgId, mediaId)).rejects.toMatchObject({ status: 422 });
    } finally {
      await deleteObject(storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, mediaId));
    }
  });

  it('runs the full chat-local cycle (stage → confirm → scan → read)', async () => {
    __setScanTransport(async () => 'clean');
    // Other user's channel must not leak: use own channel.
    const staged = await requestUpload(db, orgId, userId, {
      kind: 'chat',
      refId: channelId,
      fileName: 'chat.png',
      declaredMime: 'image/png',
    });
    if (!isS3Enabled()) {
      expect(staged.uploadUrl).toContain('local-upload');
    }
    await putObjectBytes(staged.storageKey, png(), 'image/png');
    try {
      // Non-member of the channel cannot stage.
      await expect(
        requestUpload(db, orgId, otherUserId, {
          kind: 'chat',
          refId: channelId,
          fileName: 'nope.png',
        })
      ).rejects.toThrow();
      await confirmUpload(db, orgId, staged.mediaId);
      await scanOne(db, staged.mediaId);
      const media = await findMedia(db, staged.mediaId);
      expect(media?.status).toBe('ready');
      const read = await presignedGet(db, orgId, staged.mediaId);
      expect(read.fileName).toBe('chat.png');
    } finally {
      await deleteObject(staged.storageKey);
      await db.delete(schema.chatAttachments).where(eq(schema.chatAttachments.id, staged.mediaId));
    }
  });

  it('GC reaps only expired staged rows and old failed rows', async () => {
    const fresh = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'fresh.png',
      declaredMime: 'image/png',
    });
    const old = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'old.png',
      declaredMime: 'image/png',
    });
    await db
      .update(schema.attachments)
      .set({ createdAt: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(schema.attachments.id, old.mediaId));
    try {
      const gc = await runMediaGC(db);
      expect(gc.stagedCards).toBeGreaterThanOrEqual(1);
      expect(await findMedia(db, old.mediaId)).toBeNull();
      expect(await findMedia(db, fresh.mediaId)).not.toBeNull();
    } finally {
      await deleteObject(fresh.storageKey);
      await deleteObject(old.storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, fresh.mediaId));
      await db.delete(schema.attachments).where(eq(schema.attachments.id, old.mediaId));
    }
  });
  it.skipIf(!isS3Enabled())(
    'rejects a MIME mismatch between the declared and uploaded type',
    async () => {
      const up = await requestUpload(db, orgId, userId, {
        kind: 'card',
        refId: cardId,
        fileName: 'spec.pdf',
        declaredMime: 'application/pdf',
        sizeBytes: 5,
      });
      try {
        await putObjectBytes(up.storageKey, new Uint8Array(Buffer.from('12345')));
        // The head echo is what a lying client (or a reused signed URL) produces.
        await expect(confirmUpload(db, orgId, up.mediaId)).rejects.toMatchObject({ status: 422 });
      } finally {
        await deleteObject(up.storageKey);
        await db.delete(schema.attachments).where(eq(schema.attachments.id, up.mediaId));
      }
    }
  );

  it('serves pre-gate legacy rows (ready/pending) but never a staged one', async () => {
    const up = await requestUpload(db, orgId, userId, {
      kind: 'card',
      refId: cardId,
      fileName: 'legacy.png',
      declaredMime: 'image/png',
    });
    await putObjectBytes(up.storageKey, new Uint8Array(Buffer.from('png-bytes')));
    try {
      // Staged: not yet confirmed -> 409.
      await expect(presignedGet(db, orgId, up.mediaId)).rejects.toMatchObject({ status: 409 });

      await db
        .update(schema.attachments)
        .set({ status: 'ready', scanStatus: 'pending' })
        .where(eq(schema.attachments.id, up.mediaId));
      const legacy = await presignedGet(db, orgId, up.mediaId);
      expect(legacy.fileName).toBe('legacy.png');

      // A pending row that is NOT ready is still gated.
      await db
        .update(schema.attachments)
        .set({ status: 'scanning', scanStatus: 'pending' })
        .where(eq(schema.attachments.id, up.mediaId));
      await expect(presignedGet(db, orgId, up.mediaId)).rejects.toMatchObject({ status: 202 });

      // The throttled rescan upgrades legacy rows to clean.
      await db
        .update(schema.attachments)
        .set({ status: 'ready', scanStatus: 'pending' })
        .where(eq(schema.attachments.id, up.mediaId));
      enqueueScan(up.mediaId);
      __setScanTransport(async () => 'clean');
      await scanOne(db, up.mediaId);
      const after = await findMedia(db, up.mediaId);
      expect(after?.status).toBe('ready');
      expect(after?.scanStatus).toBe('clean');
      expect(after?.checksumSha256).toBeTruthy();
    } finally {
      await deleteObject(up.storageKey);
      await db.delete(schema.attachments).where(eq(schema.attachments.id, up.mediaId));
    }
  });

  it('grows the retry backoff and exposes queue/error-rate metrics', () => {
    expect(backoffMs(0, 5000)).toBe(5000);
    expect(backoffMs(1, 5000)).toBe(10_000);
    expect(backoffMs(3, 5000)).toBe(40_000);
    expect(backoffMs(20, 5000)).toBe(5 * 60_000);
    const snap = scanMetricsSnapshot() as Record<string, any>;
    expect(snap.scanMode).toBeDefined();
    expect(typeof snap.queueDepth).toBe('number');
    expect(typeof snap.queueAgeSeconds).toBe('number');
    expect(snap.window5m).toHaveProperty('errorRate');
    expect(snap.totals).toHaveProperty('failed');
    expect(snap).toHaveProperty('sidecarHealthy');
  });
});
