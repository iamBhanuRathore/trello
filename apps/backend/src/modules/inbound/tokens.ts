import { createHash, createHmac, randomBytes } from 'node:crypto';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { inboundEmailTokens, organizationMembers } from '../../db/schema/index';
import { httpError } from '../organizations/service';

// Capability tokens for inbound email (4.6b). The plaintext token is shown
// once at creation and only its SHA-256 hash is stored. Scope pins the target:
// board → first list, list → that list, card → reply/comment on that card.
// Per-user reply tokens (createdBy = the replier) bound forward-leak: sharing
// a board address grants creation, never reply-as-someone-else.

export type InboundScope = 'board' | 'list' | 'card';

export interface InboundTokenRow {
  id: string;
  organizationId: string;
  scope: InboundScope;
  refId: string;
  createdBy: string | null;
  allowlist: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function extractBearerToken(toAddress: string): string | null {
  const local = toAddress.split('@')[0]?.trim() || '';
  if (!local) return null;
  // `board+<token>` / `inbound+<token>` / bare `<token>`.
  const candidate = local.includes('+') ? local.split('+').pop()! : local;
  return candidate.startsWith('bin_') ? candidate : null;
}

export async function createInboundToken(
  db: Database,
  organizationId: string,
  createdBy: string,
  input: { scope: InboundScope; refId: string; allowlist?: string[]; expiresAt?: Date }
): Promise<{ id: string; token: string; prefix: string }> {
  if (!['board', 'list', 'card'].includes(input.scope)) throw httpError(400, 'Invalid token scope');
  const secret = randomBytes(24).toString('base64url');
  const token = `bin_${secret}`;
  const [row] = await db
    .insert(inboundEmailTokens)
    .values({
      organizationId,
      scope: input.scope,
      refId: input.refId,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 12),
      allowlist: input.allowlist?.join(',') ?? null,
      expiresAt: input.expiresAt ?? null,
      createdBy,
    })
    .returning({ id: inboundEmailTokens.id });
  if (!row) throw httpError(500, 'Failed to create inbound token');
  return { id: row.id, token, prefix: token.slice(0, 12) };
}

export async function resolveInboundToken(db: Database, raw: string): Promise<InboundTokenRow> {
  const [row] = await db
    .select()
    .from(inboundEmailTokens)
    .where(eq(inboundEmailTokens.tokenHash, hashToken(raw)))
    .limit(1);
  if (!row || row.revokedAt) throw httpError(404, 'Unknown or revoked inbound address');
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw httpError(404, 'Unknown or revoked inbound address');
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    scope: row.scope as InboundScope,
    refId: row.refId,
    createdBy: row.createdBy,
    allowlist: row.allowlist,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

export async function revokeInboundToken(
  db: Database,
  organizationId: string,
  id: string
): Promise<void> {
  const [row] = await db
    .select({ id: inboundEmailTokens.id })
    .from(inboundEmailTokens)
    .where(
      and(eq(inboundEmailTokens.id, id), eq(inboundEmailTokens.organizationId, organizationId))
    )
    .limit(1);
  if (!row) throw httpError(404, 'Token not found');
  await db
    .update(inboundEmailTokens)
    .set({ revokedAt: new Date() })
    .where(eq(inboundEmailTokens.id, id));
}

export function tokenAllowsSender(token: InboundTokenRow, fromAddress: string): boolean {
  if (!token.allowlist) return true;
  const from = fromAddress.toLowerCase();
  return token.allowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith('@') ? from.endsWith(entry) : from === entry));
}

export async function assertActiveMember(
  db: Database,
  userId: string,
  orgId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, orgId),
        isNull(organizationMembers.deletedAt),
        eq(organizationMembers.status, 'active')
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Outbound threading token. The card's capability is *derived* from a server
 * secret instead of stored in plaintext, so every notification email for a card
 * carries the same Reply-To and repeat replies keep threading without a token
 * table row per send. `version` is the count of existing rows for the card, so
 * revoking (which keeps the row) rotates the address on the next send.
 */
export function deriveCardToken(organizationId: string, cardId: string, version = 0): string {
  const secret = process.env['INBOUND_TOKEN_SECRET'] || '';
  if (!secret) throw httpError(503, 'Inbound token secret is not configured');
  const mac = createHmac('sha256', secret)
    .update(`card:${organizationId}:${cardId}:${version}`)
    .digest('base64url');
  return `bin_${mac.slice(0, 32)}`;
}

/**
 * Find-or-create the inbound token a card's notification mail replies through.
 * Requires `INBOUND_TOKEN_SECRET`; without it the caller skips threaded mail
 * rather than minting an unstored, unrecoverable token per email.
 */
export async function ensureCardInboundToken(
  db: Database,
  organizationId: string,
  cardId: string,
  createdBy: string
): Promise<string | null> {
  const secret = process.env['INBOUND_TOKEN_SECRET'] || '';
  if (!secret) return null;

  const existing = await db
    .select({
      id: inboundEmailTokens.id,
      tokenHash: inboundEmailTokens.tokenHash,
      revokedAt: inboundEmailTokens.revokedAt,
    })
    .from(inboundEmailTokens)
    .where(
      and(
        eq(inboundEmailTokens.organizationId, organizationId),
        eq(inboundEmailTokens.scope, 'card'),
        eq(inboundEmailTokens.refId, cardId)
      )
    )
    .orderBy(desc(inboundEmailTokens.createdAt));

  // Reuse the address already in use so repeat replies stay in one thread.
  for (let version = 0; version < existing.length; version++) {
    const candidate = deriveCardToken(organizationId, cardId, version);
    const live = existing.find((r) => r.tokenHash === hashToken(candidate) && !r.revokedAt);
    if (live) return candidate;
  }

  // None of the minted versions is live (first send, or all revoked): take the
  // next version, which is by construction a fresh un-revoked address.
  const token = deriveCardToken(organizationId, cardId, existing.length);
  await db
    .insert(inboundEmailTokens)
    .values({
      organizationId,
      scope: 'card',
      refId: cardId,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 12),
      createdBy,
    })
    .onConflictDoNothing();
  return token;
}
