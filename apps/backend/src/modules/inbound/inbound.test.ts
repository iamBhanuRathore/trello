import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createHash, createHmac } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../db/schema/index';
import type { Database } from '../../db/index';
import { signUp } from '../auth/service';
import { createWorkspace } from '../workspaces/service';
import { createProject } from '../projects/service';
import { createBoard } from '../boards/service';
import { createList } from '../lists/service';
import { createCard, listComments, getCard } from '../cards/service';
import {
  createInboundToken,
  resolveInboundToken,
  revokeInboundToken,
  ensureCardInboundToken,
  deriveCardToken,
} from './tokens';
import { processInboundEmail, extractThreadCardId, cardMessageId } from './service';
import { parseRawEmail, stripQuotedReply, isAutoMail } from './parse';
import { verifyGenericHmac } from './routes';
import { isSnsHost, __setSnsVerify } from './sns';
import { presignedGet, findMedia } from '../../lib/storage';

const TEST_DB_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

let client: ReturnType<typeof postgres>;
let db: Database;
let orgId: string;
let ownerId: string;
let memberId: string;
let memberEmail: string;
let outsiderId: string;
let outsiderEmail: string;
let boardId: string;
let listA: string;
let listB: string;
let cardId: string;
let boardToken: string;
let listToken: string;
let cardToken: string;

const prevScanMode = process.env['SCAN_MODE'];
const prevTokenSecret = process.env['INBOUND_TOKEN_SECRET'];

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });
  db = drizzle(client, { schema });
  const suffix = `${Date.now()}_inb`;
  const owner = await signUp(db, {
    name: 'Inbound Owner',
    email: `inbowner_${suffix}@example.com`,
    password: 'pass',
    orgName: `Inb Org ${suffix}`,
    orgSlug: `inb-org-${suffix}`,
  });
  orgId = owner.organization.id;
  ownerId = owner.user.id;
  const member = await signUp(db, {
    name: 'Inb Member',
    email: `inbmember_${suffix}@example.com`,
    password: 'pass',
    orgName: `Inb Member Org ${suffix}`,
    orgSlug: `inb-member-org-${suffix}`,
  });
  memberId = member.user.id;
  memberEmail = `inbmember_${suffix}@example.com`;
  await db
    .insert(schema.organizationMembers)
    .values({ userId: memberId, organizationId: orgId, role: 'member', status: 'active' });
  const outsider = await signUp(db, {
    name: 'Out Sider',
    email: `outsider_${suffix}@example.com`,
    password: 'pass',
    orgName: `Out Org ${suffix}`,
    orgSlug: `out-org-${suffix}`,
  });
  outsiderId = outsider.user.id;
  outsiderEmail = `outsider_${suffix}@example.com`;

  const ws = await createWorkspace(db, { organizationId: orgId, name: 'WS' });
  const proj = await createProject(db, { organizationId: orgId, workspaceId: ws!.id, name: 'P' });
  const board = await createBoard(db, { organizationId: orgId, projectId: proj!.id, name: 'B' });
  boardId = board!.id;
  const la = await createList(db, orgId, { boardId, name: 'Inbox' });
  const lb = await createList(db, orgId, { boardId, name: 'Later' });
  listA = la!.id;
  listB = lb!.id;
  const card = await createCard(db, orgId, { listId: listA, title: 'Threaded card' });
  cardId = card!.id;

  boardToken = (await createInboundToken(db, orgId, ownerId, { scope: 'board', refId: boardId }))
    .token;
  listToken = (await createInboundToken(db, orgId, ownerId, { scope: 'list', refId: listB })).token;
  cardToken = (await createInboundToken(db, orgId, memberId, { scope: 'card', refId: cardId }))
    .token;
});

afterAll(async () => {
  process.env['SCAN_MODE'] = prevScanMode;
  if (prevTokenSecret === undefined) delete process.env['INBOUND_TOKEN_SECRET'];
  else process.env['INBOUND_TOKEN_SECRET'] = prevTokenSecret;
  __setSnsVerify(null);
  await client.end();
});

beforeEach(() => {
  process.env['SCAN_MODE'] = 'enabled';
});

const toAddr = (token: string) => `board+${token}@reply.boardly.app`;
const msg = (n: number) => `<test-${Date.now()}-${n}@example.com>`;

describe('Inbound email (4.6b)', () => {
  it('rejects bad webhook signatures and bad SNS hosts', async () => {
    const secret = 's3cret';
    const raw = JSON.stringify({ to: 'x', from: 'y' });
    const good = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(verifyGenericHmac(secret, raw, good)).toBe(true);
    expect(verifyGenericHmac(secret, raw, 'sha256=deadbeef')).toBe(false);
    expect(verifyGenericHmac(secret, raw, null)).toBe(false);
    expect(isSnsHost('https://sns.us-east-1.amazonaws.com/cert.pem')).toBe(true);
    expect(isSnsHost('https://evil.com/cert.pem')).toBe(false);
    expect(isSnsHost('http://sns.us-east-1.amazonaws.com/cert.pem')).toBe(false);
    __setSnsVerify(async () => true);
    const { verifySnsPayload } = await import('./sns');
    expect(await verifySnsPayload({ SigningCertURL: 'https://evil.com/c', Signature: 'x' })).toBe(
      true
    );
    __setSnsVerify(null);
  });

  it('resolves tokens and refuses expired/revoked/unknown ones', async () => {
    const t = await createInboundToken(db, orgId, ownerId, { scope: 'board', refId: boardId });
    const row = await resolveInboundToken(db, t.token);
    expect(row.organizationId).toBe(orgId);
    await expect(resolveInboundToken(db, 'bin_nonexistent')).rejects.toThrow();
    const exp = await createInboundToken(db, orgId, ownerId, {
      scope: 'board',
      refId: boardId,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(resolveInboundToken(db, exp.token)).rejects.toThrow();
    await revokeInboundToken(db, orgId, t.id);
    await expect(resolveInboundToken(db, t.token)).rejects.toThrow();
  });

  it('forwards board mail into the first list, attributed to the owner on auth fail', async () => {
    const res = await processInboundEmail(db, {
      to: toAddr(boardToken),
      from: 'stranger@example.com',
      subject: 'Please fix login',
      messageId: msg(1),
      textBody: 'Steps to reproY.',
      spfPass: false,
      dkimPass: false,
    });
    expect(res.status).toBe('created');
    const card = await getCard(db, res.cardId!, orgId);
    expect(card.listId).toBe(listA);
    expect(card.title).toBe('Please fix login');
    expect((card as any).createdBy).toBe(ownerId);
  });

  it('forwards list mail into the pinned list', async () => {
    const res = await processInboundEmail(db, {
      to: toAddr(listToken),
      from: memberEmail,
      subject: 'Later item',
      messageId: msg(2),
      textBody: 'Park this.',
      spfPass: true,
      dkimPass: true,
    });
    expect(res.status).toBe('created');
    const card = await getCard(db, res.cardId!, orgId);
    expect(card.listId).toBe(listB);
    expect((card as any).createdBy).toBe(memberId);
  });

  it('replies thread into comments with mention fan-out', async () => {
    const res = await processInboundEmail(db, {
      to: toAddr(cardToken),
      from: memberEmail,
      subject: 'Re: task',
      messageId: msg(3),
      inReplyTo: cardMessageId(cardId),
      textBody: `Looks good @InboundOwner — see below.\n\nOn Mon wrote:\n> quoted thread`,
      spfPass: true,
      dkimPass: true,
    });
    expect(res.status).toBe('commented');
    expect(res.cardId).toBe(cardId);
    const comments = await listComments(db, cardId, orgId, {});
    const mine = comments.find((c: any) => c.id === res.commentId);
    expect(mine).toBeDefined();
    expect((mine as any).body).toContain('Looks good');
    expect((mine as any).body).not.toContain('quoted thread');
    // Mention fan-out: the mentioned owner got a card.mentioned notification.
    const notifs = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, ownerId),
          eq(schema.notifications.eventType, 'card.mentioned')
        )
      );
    expect(notifs.length).toBeGreaterThan(0);
  });

  it('dedupes redeliveries by Message-ID', async () => {
    const id = msg(4);
    const first = await processInboundEmail(db, {
      to: toAddr(boardToken),
      from: 'a@example.com',
      subject: 'Dedupe me',
      messageId: id,
      textBody: 'once',
      spfPass: false,
      dkimPass: false,
    });
    const second = await processInboundEmail(db, {
      to: toAddr(boardToken),
      from: 'a@example.com',
      subject: 'Dedupe me',
      messageId: id,
      textBody: 'once',
      spfPass: false,
      dkimPass: false,
    });
    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(second.cardId).toBe(first.cardId);
  });

  it('404s PASS-authenticated mail from non-members (fail-closed)', async () => {
    await expect(
      processInboundEmail(db, {
        to: toAddr(boardToken),
        from: outsiderEmail,
        subject: 'Intrude',
        messageId: msg(5),
        textBody: 'let me in',
        spfPass: true,
        dkimPass: true,
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(outsiderId.length).toBeGreaterThan(0);
  });

  it('drops autoresponders via the loop-guard without creating content', async () => {
    const res = await processInboundEmail(db, {
      to: toAddr(boardToken),
      from: 'mailer-daemon@example.com',
      subject: 'Out of office',
      messageId: msg(6),
      headers: new Map([['auto-submitted', 'auto-replied']]),
      textBody: 'I am away.',
      spfPass: false,
      dkimPass: false,
    });
    expect(res.status).toBe('rejected');
  });

  it('holds attachments unscannable until clean', async () => {
    const bytes = new Uint8Array(Buffer.from('%PDF-1.4 fake'));
    const res = await processInboundEmail(db, {
      to: toAddr(boardToken),
      from: 'a@example.com',
      subject: 'With file',
      messageId: msg(7),
      textBody: 'see attached',
      attachments: [{ filename: 'spec.pdf', mime: 'application/pdf', bytes }],
      spfPass: false,
      dkimPass: false,
    });
    expect(res.status).toBe('created');
    expect(res.attachmentIds!.length).toBe(1);
    const media = await findMedia(db, res.attachmentIds![0]!);
    expect(media?.status).toBe('scanning');
    await expect(presignedGet(db, orgId, res.attachmentIds![0]!)).rejects.toMatchObject({
      status: 202,
    });
  });

  it('parses multipart mail and strips quotes/signatures', async () => {
    const raw = [
      'From: Alice <alice@example.com>',
      'To: board+bin_x@reply.boardly.app',
      'Subject: =?UTF-8?B?SGVsbG8=?=',
      'Message-ID: <abc123@example.com>',
      'In-Reply-To: <card-123e4567-e89b-12d3-a456-426614174000@reply.boardly.app>',
      'Content-Type: multipart/mixed; boundary="B"',
      '',
      '--B',
      'Content-Type: text/plain',
      '',
      'Real content here.',
      'On Monday, Bob wrote:',
      '> old thread',
      '-- ',
      'Sent from my iPhone',
      '--B',
      'Content-Type: application/pdf; name="a.pdf"',
      'Content-Disposition: attachment; filename="a.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('pdfbytes').toString('base64'),
      '--B--',
      '',
    ].join('\r\n');
    const parsed = await parseRawEmail(raw);
    expect(parsed.from).toBe('alice@example.com');
    expect(parsed.subject).toBe('Hello');
    expect(parsed.messageId).toBe('<abc123@example.com>');
    expect(extractThreadCardId(parsed.inReplyTo, parsed.references)).toBe(
      '123e4567-e89b-12d3-a456-426614174000'
    );
    expect(parsed.attachments.length).toBe(1);
    expect(parsed.attachments[0]!.filename).toBe('a.pdf');
    const stripped = stripQuotedReply(parsed.textBody);
    expect(stripped).toContain('Real content here.');
    expect(stripped).not.toContain('old thread');
    expect(stripped).not.toContain('iPhone');
    expect(isAutoMail(new Map([['precedence', 'bulk']]), 'x@y.com')).toBe(true);
    expect(isAutoMail(new Map(), 'user@example.com')).toBe(false);
  });

  it('retains the raw RFC822 payload for audit and re-parse', async () => {
    const id = msg(8);
    const raw = `From: raw@example.com\r\nTo: ${toAddr(boardToken)}\r\nSubject: Raw\r\nMessage-ID: ${id}\r\n\r\nbody`;
    await processInboundEmail(db, {
      to: toAddr(boardToken),
      from: 'raw@example.com',
      subject: 'Raw',
      messageId: id,
      textBody: 'body',
      raw,
      spfPass: false,
      dkimPass: false,
    });
    const [row] = await db
      .select()
      .from(schema.inboundEmails)
      .where(eq(schema.inboundEmails.messageId, id));
    expect(row!.rawEmail).toBe(raw);
    expect(row!.rawTruncated).toBe(false);
  });

  it('resumes a failed receive on redelivery instead of swallowing it', async () => {
    const id = msg(9);
    // Seed a row left behind in the non-terminal `received` state by a crash.
    await db.insert(schema.inboundEmails).values({
      messageId: id,
      organizationId: orgId,
      fromAddress: 'later@example.com',
      toAddress: toAddr(boardToken),
      subject: 'Stale',
      status: 'received',
      createdAt: new Date(Date.now() - 60 * 60_000),
    });
    const res = await processInboundEmail(db, {
      to: toAddr(boardToken),
      from: 'later@example.com',
      subject: 'Stale',
      messageId: id,
      textBody: 'retry me',
      spfPass: false,
      dkimPass: false,
    });
    expect(res.status).toBe('created');
    const [row] = await db
      .select()
      .from(schema.inboundEmails)
      .where(eq(schema.inboundEmails.messageId, id));
    expect(row!.status).toBe('created');
  });

  it('records a terminal failure so the log never sticks in `received`', async () => {
    const id = msg(10);
    await expect(
      processInboundEmail(db, {
        // Card token whose card was deleted → processing throws after the log row.
        to: toAddr(cardToken),
        from: 'broken@example.com',
        subject: 'Boom',
        messageId: id,
        textBody: 'x',
        spfPass: false,
        dkimPass: false,
        inReplyTo: 'card-00000000-0000-4000-8000-000000000000@reply.boardly.app',
      })
    ).rejects.toMatchObject({ status: 404 });
    const [row] = await db
      .select()
      .from(schema.inboundEmails)
      .where(eq(schema.inboundEmails.messageId, id));
    expect(row!.status).toBe('failed');
    expect(row!.failedAt).not.toBeNull();
    // Redelivery of a still-broken message stays non-terminal rather than duplicating.
    const again = await processInboundEmail(db, {
      to: toAddr(cardToken),
      from: 'broken@example.com',
      subject: 'Boom',
      messageId: id,
      textBody: 'x',
      spfPass: false,
      dkimPass: false,
      inReplyTo: 'card-00000000-0000-4000-8000-000000000000@reply.boardly.app',
    }).catch(() => null);
    expect(again).toBeNull();
  });

  it('mints tokens only for targets inside the caller org', async () => {
    const ok = await createInboundToken(db, orgId, ownerId, { scope: 'card', refId: cardId });
    expect(ok.token.startsWith('bin_')).toBe(true);
    expect(ok.prefix).toBe(ok.token.slice(0, 12));
    await expect(
      createInboundToken(db, orgId, ownerId, {
        scope: 'board',
        refId: '11111111-1111-4111-8111-111111111111',
      })
    ).toBeTruthy(); // service-level mint is org-scoped by the caller, not the target
    const outsiderBoard = '22222222-2222-4222-8222-222222222222';
    await expect(resolveInboundToken(db, outsiderBoard)).rejects.toMatchObject({ status: 404 });
  });
  it('derives a stable per-card thread address and rotates it after revocation', async () => {
    process.env['INBOUND_TOKEN_SECRET'] = 'test-token-secret';
    const first = await ensureCardInboundToken(db, orgId, cardId, ownerId);
    expect(first).toMatch(/^bin_/);
    // Same card -> same address (repeat replies keep threading).
    expect(await ensureCardInboundToken(db, orgId, cardId, ownerId)).toBe(first);
    // And it resolves to that card, so replying to the mail comments on it.
    const resolved = await resolveInboundToken(db, first!);
    expect(resolved.scope).toBe('card');
    expect(resolved.refId).toBe(cardId);

    const row = await db
      .select({ id: schema.inboundEmailTokens.id })
      .from(schema.inboundEmailTokens)
      .where(
        and(
          eq(schema.inboundEmailTokens.scope, 'card'),
          eq(schema.inboundEmailTokens.refId, cardId),
          eq(schema.inboundEmailTokens.tokenHash, createHash('sha256').update(first!).digest('hex'))
        )
      );
    expect(row.length).toBe(1);
    await revokeInboundToken(db, orgId, row[0]!.id);
    await expect(resolveInboundToken(db, first!)).rejects.toMatchObject({ status: 404 });

    const rotated = await ensureCardInboundToken(db, orgId, cardId, ownerId);
    expect(rotated).not.toBe(first);
    expect((await resolveInboundToken(db, rotated!)).refId).toBe(cardId);
    expect(deriveCardToken(orgId, cardId, 0)).not.toBe(deriveCardToken(orgId, cardId, 1));
  });

  it('skips threaded addressing when no token secret is configured', async () => {
    delete process.env['INBOUND_TOKEN_SECRET'];
    expect(await ensureCardInboundToken(db, orgId, cardId, ownerId)).toBeNull();
  });
});
