import { Elysia, t } from 'elysia';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { inboundEmailTokens, boards, lists, cards, projects } from '../../db/schema/index';
import { processInboundEmail, type InboundEnvelope } from './service';
import { createInboundToken, revokeInboundToken, type InboundScope } from './tokens';
import { inboundDomain } from './service';
import { parseRawEmail } from './parse';
import { verifySnsPayload, confirmSnsSubscription } from './sns';
import { logger } from '../../lib/logger';
import { httpError } from '../organizations/service';

// ─── Public inbound email receiver (4.6b) ────────────────────────────────────
// Two sender shapes, both outside auth (PUBLIC_PATH_PREFIXES) and exempt from
// rate limiting (abuse is bounded by token capability + Message-ID dedupe):
//  1. Generic webhook (SendGrid/Mailgun-style forwarder): HMAC-SHA256 over the
//     exact raw bytes (git-webhook pattern), JSON envelope in the body.
//  2. SES → SNS: SNS signature + cert-URL host check; SubscriptionConfirmation
//     is confirmed inline; the SES `content` (raw RFC2822) is parsed.

export function verifyGenericHmac(secret: string, raw: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  let actual: Buffer;
  try {
    actual = Buffer.from(hex, 'hex');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface GenericEnvelope {
  to: string;
  from: string;
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  text?: string;
  html?: string;
  spf?: string;
  dkim?: string;
  attachments?: Array<{ filename?: string; mime?: string; contentBase64?: string }>;
}

function genericToInbound(g: GenericEnvelope): InboundEnvelope {
  const refs = typeof g.references === 'string' ? g.references.split(/\s+/) : (g.references ?? []);
  return {
    to: g.to,
    from: (g.from || '').toLowerCase(),
    subject: g.subject || '',
    messageId: g.messageId,
    inReplyTo: g.inReplyTo,
    references: refs,
    textBody: g.text || '',
    attachments: (g.attachments ?? []).slice(0, 10).map((a) => ({
      filename: (a.filename || 'attachment').slice(0, 255),
      mime: a.mime || 'application/octet-stream',
      bytes: new Uint8Array(Buffer.from(a.contentBase64 || '', 'base64')),
    })),
    spfPass: (g.spf || '').toLowerCase() === 'pass',
    dkimPass: (g.dkim || '').toLowerCase() === 'pass',
  };
}

async function sesToInbound(ses: any): Promise<InboundEnvelope> {
  const mail = ses.mail || {};
  const receipt = ses.receipt || {};
  const verdict = (v: any) => v?.status?.toUpperCase() === 'PASS';
  const raw: string = typeof ses.content === 'string' ? ses.content : '';
  const parsed = raw ? await parseRawEmail(raw) : null;
  const common = mail.commonHeaders || {};
  const to: string[] = common.to || mail.destination || [];
  return {
    to: (Array.isArray(to) ? to[0] : to) || '',
    from: ((common.from?.[0] || mail.source || '') as string).toLowerCase(),
    subject: common.subject || '',
    messageId: mail.messageId || parsed?.messageId,
    inReplyTo: parsed?.inReplyTo,
    references: parsed?.references,
    headers: parsed?.headers,
    textBody: parsed?.textBody || '',
    attachments: (parsed?.attachments ?? []).map((a) => ({
      filename: a.filename,
      mime: a.mime,
      bytes: a.bytes,
    })),
    raw: raw || null,
    spfPass: verdict(receipt.spfVerdict),
    dkimPass: verdict(receipt.dkimVerdict),
  };
}

export const inboundEmailRoutes = new Elysia({ prefix: '/inbound', tags: ['Inbound'] }).post(
  '/email',
  async ({ headers, body, set }) => {
    try {
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      let parsed: any;
      try {
        parsed = typeof body === 'string' ? JSON.parse(body) : body;
      } catch {
        set.status = 400;
        return { error: 'Invalid JSON payload' };
      }

      // SNS path: Type + Signature markers.
      if (parsed && typeof parsed === 'object' && parsed.Type && parsed.Signature) {
        if (!(await verifySnsPayload(parsed))) {
          set.status = 401;
          return { error: 'Invalid SNS signature' };
        }
        if (parsed.Type === 'SubscriptionConfirmation') {
          const ok = await confirmSnsSubscription(parsed.SubscribeURL);
          if (!ok) {
            set.status = 400;
            return { error: 'Invalid SubscribeURL' };
          }
          return { confirmed: true };
        }
        if (parsed.Type !== 'Notification') {
          set.status = 400;
          return { error: `Unsupported SNS Type: ${parsed.Type}` };
        }
        let ses: any;
        try {
          ses = JSON.parse(parsed.Message);
        } catch {
          set.status = 400;
          return { error: 'Invalid SES message payload' };
        }
        // SES bounce/complaint notifications are autoresponders, not content.
        if (ses.notificationType && ses.notificationType !== 'Received') {
          logger.info(
            { type: ses.notificationType },
            'SES notification ignored (not inbound content)'
          );
          return { ignored: ses.notificationType };
        }
        const envelope = await sesToInbound(ses);
        if (!envelope.to) {
          set.status = 400;
          return { error: 'Missing recipient' };
        }
        return await processInboundEmail(db, envelope);
      }

      // Generic HMAC webhook path.
      const secret = process.env['INBOUND_WEBHOOK_SECRET'] || '';
      if (!secret) {
        set.status = 503;
        return { error: 'Inbound email webhook is not configured' };
      }
      const h = headers as Record<string, string | undefined>;
      const signature = h['x-inbound-signature'] || h['X-Inbound-Signature'] || null;
      if (!verifyGenericHmac(secret, raw, signature)) {
        set.status = 401;
        return { error: 'Invalid webhook signature' };
      }
      const g = parsed as GenericEnvelope;
      if (!g?.to || !g?.from) {
        set.status = 400;
        return { error: 'Missing to/from' };
      }
      return await processInboundEmail(db, genericToInbound(g));
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  },
  { parse: 'text' }
);

// ─── Token management (authenticated) ─────────────────────────────────────────
// The plaintext capability is returned exactly once here; only its hash is stored.
// Targets are validated against the caller's org so a token can never be minted
// for another tenant's board/list/card.

async function assertTargetInOrg(orgId: string, scope: InboundScope, refId: string): Promise<void> {
  if (scope === 'board') {
    const [row] = await db
      .select({ id: boards.id })
      .from(boards)
      .innerJoin(projects, eq(projects.id, boards.projectId))
      .where(and(eq(boards.id, refId), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!row) throw httpError(404, 'Target not found');
    return;
  }
  if (scope === 'list') {
    const [row] = await db
      .select({ id: lists.id })
      .from(lists)
      .innerJoin(boards, eq(boards.id, lists.boardId))
      .innerJoin(projects, eq(projects.id, boards.projectId))
      .where(and(eq(lists.id, refId), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!row) throw httpError(404, 'Target not found');
    return;
  }
  const [row] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, refId), eq(cards.organizationId, orgId)))
    .limit(1);
  if (!row) throw httpError(404, 'Target not found');
}

export const inboundTokenRoutes = new Elysia({ prefix: '/inbound', tags: ['Inbound'] })
  .use(authPlugin)
  .post(
    '/tokens',
    async ({ body, user, set }) => {
      try {
        await assertTargetInOrg(user.organizationId, body.scope, body.refId);
        const created = await createInboundToken(db, user.organizationId, user.userId, {
          scope: body.scope,
          refId: body.refId,
          allowlist: body.allowlist,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        });
        return {
          ...created,
          address: `board+${created.token}@${inboundDomain()}`,
        };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        scope: t.Union([t.Literal('board'), t.Literal('list'), t.Literal('card')]),
        refId: t.String({ format: 'uuid' }),
        allowlist: t.Optional(t.Array(t.String({ maxLength: 320 }), { maxItems: 50 })),
        expiresAt: t.Optional(t.String()),
      }),
    }
  )
  .get(
    '/tokens',
    async ({ user, set, query }) => {
      try {
        const rows = await db
          .select({
            id: inboundEmailTokens.id,
            scope: inboundEmailTokens.scope,
            refId: inboundEmailTokens.refId,
            tokenPrefix: inboundEmailTokens.tokenPrefix,
            allowlist: inboundEmailTokens.allowlist,
            expiresAt: inboundEmailTokens.expiresAt,
            revokedAt: inboundEmailTokens.revokedAt,
            createdAt: inboundEmailTokens.createdAt,
          })
          .from(inboundEmailTokens)
          .where(eq(inboundEmailTokens.organizationId, user.organizationId))
          .orderBy(desc(inboundEmailTokens.createdAt))
          .limit(Math.min(query.limit ?? 50, 200));
        return { tokens: rows };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      query: t.Object({ limit: t.Optional(t.Numeric()) }),
    }
  )
  .delete('/tokens/:id', async ({ params, user, set }) => {
    try {
      await revokeInboundToken(db, user.organizationId, params.id);
      return { revoked: true };
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  });
