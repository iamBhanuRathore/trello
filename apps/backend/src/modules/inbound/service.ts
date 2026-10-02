import { createHash } from 'node:crypto';
import { eq, and, isNull, asc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  inboundEmails,
  users,
  organizationMembers,
  cards,
  boards,
  lists,
} from '../../db/schema/index';
import { createCard, createComment } from '../cards/service';
import { ingestBytes } from '../../lib/storage';
import { logger } from '../../lib/logger';
import { httpError } from '../organizations/service';
import { resolveInboundToken, tokenAllowsSender, assertActiveMember } from './tokens';
import { stripQuotedReply } from './parse';
import { InboundEmailStatus } from '@boardly/shared-types';

// ─── Inbound email processor (4.6b) ──────────────────────────────────────────
// Public webhook (HMAC or SNS-verified) → capability token → SPF/DKIM-gated
// attribution → reply = comment (+mention fan-out), forward = new card.
// Attachments ride storage.ingestBytes through the same scan gate and stay
// invisible until clean. Message-ID gives redelivery idempotency.

export interface InboundAttachment {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

export interface InboundEnvelope {
  to: string;
  from: string;
  subject: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  headers?: Map<string, string>;
  textBody: string;
  attachments?: InboundAttachment[];
  /** Raw RFC822 source (capped on persist) for audit + re-parse after parser fixes. */
  raw?: string | null;
  spfPass: boolean;
  dkimPass: boolean;
}

export interface InboundResult {
  status: 'created' | 'commented' | 'duplicate' | 'rejected';
  cardId?: string;
  commentId?: string;
  attachmentIds?: string[];
}

export function inboundDomain(): string {
  return process.env['INBOUND_DOMAIN'] || 'reply.boardly.app';
}

/** Per-card threading identity: replies carry this in In-Reply-To. */
export function cardMessageId(cardId: string): string {
  return `card-${cardId}@${inboundDomain()}`;
}

/** Outbound Reply-To for card notifications: capability + threading in one. */
export function boardReplyTo(token: string): string {
  return `board+${token}@${inboundDomain()}`;
}

const CARD_MSG_RE = /card-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Raw RFC822 retention cap (binary parts live in the media store, not here). */
const RAW_RETENTION_LIMIT = 200_000;

/** A `received` row older than this is treated as abandoned and is resumed. */
const STALE_RECEIVE_MS = 5 * 60_000;

export function extractThreadCardId(
  inReplyTo?: string | null,
  references?: string[]
): string | null {
  const hay = [inReplyTo || '', ...(references || [])].join(' ');
  return hay.match(CARD_MSG_RE)?.[1] || null;
}

function fingerprint(envelope: InboundEnvelope, token: string): string {
  return createHash('sha256')
    .update(`${token}|${envelope.from}|${envelope.subject}|${envelope.textBody}`)
    .digest('hex')
    .slice(0, 32);
}

async function matchMentionedUsers(
  db: Database,
  orgId: string,
  authorId: string,
  text: string
): Promise<string[]> {
  const tokens = new Set(
    [...text.matchAll(/@([A-Za-z0-9._-]+)/g)].map((m) => m[1]!.toLowerCase()).slice(0, 20)
  );
  if (tokens.size === 0) return [];
  const members = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        isNull(organizationMembers.deletedAt),
        eq(organizationMembers.status, 'active')
      )
    )
    .limit(500);
  const ids: string[] = [];
  for (const m of members) {
    if (m.userId === authorId || ids.length >= 10) continue;
    const needles = [
      m.name.toLowerCase().replace(/\s+/g, ''),
      m.name.toLowerCase(),
      m.email.split('@')[0]!.toLowerCase(),
    ];
    if ([...tokens].some((t) => needles.includes(t) || needles[0]!.startsWith(t)))
      ids.push(m.userId);
  }
  return ids;
}

async function resolveListForToken(
  db: Database,
  orgId: string,
  scope: string,
  refId: string
): Promise<string> {
  if (scope === 'list') {
    const [row] = await db
      .select({ id: lists.id })
      .from(lists)
      .innerJoin(boards, eq(boards.id, lists.boardId))
      .where(and(eq(lists.id, refId), eq(boards.organizationId, orgId)))
      .limit(1);
    if (!row) throw httpError(404, 'Unknown or revoked inbound address');
    return row.id;
  }
  // scope board → first list by position.
  const [row] = await db
    .select({ id: lists.id })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(boards.id, refId), eq(boards.organizationId, orgId)))
    .orderBy(asc(lists.position))
    .limit(1);
  if (!row) throw httpError(422, 'Board has no lists to receive email');
  return row.id;
}

export async function processInboundEmail(
  db: Database,
  envelope: InboundEnvelope
): Promise<InboundResult> {
  const { extractBearerToken } = await import('./tokens');
  const rawToken = extractBearerToken(envelope.to);
  if (!rawToken) throw httpError(404, 'Unknown or revoked inbound address');
  const token = await resolveInboundToken(db, rawToken);
  if (!tokenAllowsSender(token, envelope.from))
    throw httpError(404, 'Unknown or revoked inbound address');

  const messageId = envelope.messageId || `gen:${fingerprint(envelope, rawToken)}`;
  const raw = envelope.raw ?? null;
  const rawTruncated = raw !== null && raw.length > RAW_RETENTION_LIMIT;
  const rawStored = raw === null ? null : raw.slice(0, RAW_RETENTION_LIMIT);

  let logId: string | null = null;
  const duplicate = (row: typeof inboundEmails.$inferSelect | undefined): InboundResult =>
    ({
      ...((row?.result ?? {}) as Record<string, string>),
      status: InboundEmailStatus.Duplicate,
    }) as InboundResult;

  // Redelivery idempotency (unique per org+Message-ID). Rows that never reached a
  // terminal state (crashed/abandoned `received`, or `failed`) are resumed so a
  // transient outage can't permanently swallow a message.
  const [existing] = await db
    .select()
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.organizationId, token.organizationId),
        eq(inboundEmails.messageId, messageId)
      )
    )
    .limit(1);
  if (existing) {
    const resumable =
      existing.status === InboundEmailStatus.Failed ||
      (existing.status === InboundEmailStatus.Received &&
        Date.now() - existing.createdAt.getTime() > STALE_RECEIVE_MS);
    if (!resumable) return duplicate(existing);
    logId = existing.id;
    await db
      .update(inboundEmails)
      .set({
        status: InboundEmailStatus.Received,
        failedAt: null,
        rawEmail: rawStored ?? existing.rawEmail,
      })
      .where(eq(inboundEmails.id, existing.id));
  } else {
    try {
      const [logged] = await db
        .insert(inboundEmails)
        .values({
          messageId,
          organizationId: token.organizationId,
          tokenId: token.id,
          fromAddress: envelope.from.slice(0, 320),
          toAddress: envelope.to.slice(0, 320),
          subject: envelope.subject.slice(0, 500),
          status: InboundEmailStatus.Received,
          rawEmail: rawStored,
          rawTruncated,
        })
        .returning({ id: inboundEmails.id });
      logId = logged?.id ?? null;
    } catch (err: any) {
      if (err?.code === '23505') {
        const [row] = await db
          .select()
          .from(inboundEmails)
          .where(
            and(
              eq(inboundEmails.organizationId, token.organizationId),
              eq(inboundEmails.messageId, messageId)
            )
          )
          .limit(1);
        return duplicate(row);
      }
      throw err;
    }
  }

  const finish = async (
    status: InboundEmailStatus,
    result: Record<string, unknown>
  ): Promise<InboundResult> => {
    if (logId) {
      await db
        .update(inboundEmails)
        .set({ status, result, failedAt: null })
        .where(eq(inboundEmails.id, logId))
        .catch(() => {});
    }
    return {
      ...(result as Record<string, string>),
      status: status as InboundResult['status'],
    } as InboundResult;
  };

  // Any throw below is recorded as terminal `failed` so the receive log never
  // sits in `received` forever, and so a redelivery can resume the message.
  const run = async (): Promise<InboundResult> => {
    // Autoresponder loop-guard: log + drop, never create content.
    const headers = envelope.headers ?? new Map<string, string>();
    const { isAutoMail } = await import('./parse');
    if (isAutoMail(headers, envelope.from)) {
      logger.info({ messageId }, 'Inbound email dropped by autoresponder loop-guard');
      return finish(InboundEmailStatus.Rejected, { reason: 'auto-mail' });
    }

    // Trust: token is the capability; SPF+DKIM PASS additionally binds From to
    // an org member. PASS from a non-member 404s (fail-closed); anything else
    // attributes to the token owner (per-user reply tokens bound forward-leak).
    let authorId: string | null = null;
    if (envelope.spfPass && envelope.dkimPass && envelope.from) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, envelope.from.toLowerCase()))
        .limit(1);
      if (u) {
        if (!(await assertActiveMember(db, u.id, token.organizationId))) {
          throw httpError(404, 'Unknown or revoked inbound address');
        }
        authorId = u.id;
      }
    }
    if (!authorId) {
      if (!token.createdBy) throw httpError(422, 'Inbound token has no owner');
      if (!(await assertActiveMember(db, token.createdBy, token.organizationId))) {
        throw httpError(422, 'Inbound token owner is no longer active');
      }
      authorId = token.createdBy;
    }

    const body = stripQuotedReply(envelope.textBody).slice(0, 20_000) || '(empty message)';
    const attachmentIds: string[] = [];
    const attachNote: string[] = [];

    const ingestAll = async (cardId: string) => {
      for (const a of (envelope.attachments ?? []).slice(0, 10)) {
        try {
          const { mediaId } = await ingestBytes(db, token.organizationId, authorId!, {
            kind: 'card',
            refId: cardId,
            fileName: a.filename,
            declaredMime: a.mime,
            bytes: a.bytes,
          });
          attachmentIds.push(mediaId);
          attachNote.push(`📎 ${a.filename} (virus scan pending)`);
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'Inbound attachment ingest failed'
          );
        }
      }
    };

    // Reply path: In-Reply-To names a card in this org → comment + mention fan-out.
    const threadCardId = extractThreadCardId(envelope.inReplyTo, envelope.references);
    const replyTarget = threadCardId ?? (token.scope === 'card' ? token.refId : null);
    if (replyTarget) {
      const [card] = await db
        .select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.id, replyTarget), eq(cards.organizationId, token.organizationId)))
        .limit(1);
      if (!card) throw httpError(404, 'Unknown or revoked inbound address');
      const mentioned = await matchMentionedUsers(db, token.organizationId, authorId, body);
      await ingestAll(card.id);
      const commentBody = attachNote.length > 0 ? `${body}\n\n${attachNote.join('\n')}` : body;
      const comment = await createComment(
        db,
        card.id,
        token.organizationId,
        authorId,
        commentBody,
        mentioned
      );
      if (!comment) throw httpError(500, 'Failed to record inbound comment');
      return finish(InboundEmailStatus.Commented, {
        cardId: card.id,
        commentId: comment.id,
        attachmentIds,
      });
    }

    // Forward path: new card in the token's list.
    const listId = await resolveListForToken(db, token.organizationId, token.scope, token.refId);
    const mentioned = await matchMentionedUsers(db, token.organizationId, authorId, body);
    const card = await createCard(db, token.organizationId, {
      listId,
      title: envelope.subject.trim() || '(no subject)',
      description: body,
      actorId: authorId,
    });
    // Mention fan-out for email-created cards (createCard doesn't parse @names).
    if (mentioned.length > 0) {
      await createComment(
        db,
        card!.id,
        token.organizationId,
        authorId,
        `Mentioned from email: ${mentioned.length} teammate(s)`,
        mentioned
      ).catch(() => {});
    }
    await ingestAll(card!.id);
    return finish(InboundEmailStatus.Created, { cardId: card!.id, attachmentIds });
  };

  try {
    return await run();
  } catch (err) {
    if (logId) {
      await db
        .update(inboundEmails)
        .set({
          status: InboundEmailStatus.Failed,
          failedAt: new Date(),
          result: { error: err instanceof Error ? err.message : String(err) },
        })
        .where(eq(inboundEmails.id, logId))
        .catch(() => {});
    }
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), messageId },
      'Inbound email processing failed'
    );
    throw err;
  }
}
