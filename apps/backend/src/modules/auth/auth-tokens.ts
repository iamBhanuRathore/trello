import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'crypto';
import type { Database } from '../../db/index';
import {
  users,
  organizationMembers,
  refreshTokens as refreshTokensTable,
  auditLog,
} from '../../db/schema/index';
import { signAccessToken } from '../../middleware/auth';
import { logger } from '../../lib/logger';
import { markFamilyBurned } from '../../lib/cache';
import {
  httpError,
  hashToken,
  hashRequestMeta,
  durationToMs,
  refreshLifetimes,
  refreshReuseWindow,
  type TokenPairOptions,
  type RefreshContext,
} from './auth-common';

export async function issueTokenPair(
  db: Database,
  userId: string,
  organizationId: string,
  isPlatformAdmin: boolean = false,
  opts: TokenPairOptions = {}
) {
  const { idle, absolute } = refreshLifetimes(isPlatformAdmin);
  const nowMs = Date.now();
  // Absolute cap is set once at login and never extended; idle expiry clamps
  // to it so the last rotation before the cap yields a shortened window.
  const absoluteExpiresAt = opts.absoluteExpiresAt ?? new Date(nowMs + durationToMs(absolute));
  const expiresAt = new Date(Math.min(nowMs + durationToMs(idle), absoluteExpiresAt.getTime()));
  const familyId = opts.familyId ?? randomUUID();
  const accessToken = await signAccessToken({
    userId,
    organizationId,
    isPlatformAdmin,
    sid: familyId,
  });

  // Opaque refresh token — store its hash in DB
  const rawRefreshToken = randomBytes(48).toString('hex');

  await db.insert(refreshTokensTable).values({
    userId,
    tokenHash: hashToken(rawRefreshToken),
    expiresAt,
    absoluteExpiresAt,
    familyId,
    parentHash: opts.parentHash ?? null,
    uaHash: opts.userAgent ? hashRequestMeta(opts.userAgent) : null,
    ipHash: opts.ip ? hashRequestMeta(opts.ip) : null,
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

// ─── refreshTokens (sliding families) ─────────────────────────────────────────
/**
 * Sliding refresh rotation:
 * - Fast path: atomic UPDATE revokes the presented token (iff live on both
 *   idle and absolute clocks) and returns its family; a child in the same
 *   family is minted with expiresAt = LEAST(now + idle, absolute).
 * - Re-presenting a just-rotated token inside the grace window (time + uses +
 *   UA match) mints a sibling child instead of burning — this is the 2-tab /
 *   StrictMode race path. Only hashes are stored, so the existing head's
 *   plaintext can never be re-returned; a sibling is equivalent.
 * - Anything else (unknown, idle-expired, past-window reuse, UA mismatch,
 *   cap exceeded) burns ONLY that family and returns a generic 401.
 * - Absolute expiry burns the family (session is fully dead) + generic 401.
 */
export async function refreshTokens(db: Database, rawToken: string, ctx: RefreshContext = {}) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const { graceSeconds, maxUses } = refreshReuseWindow();
  const ctxUaHash = ctx.userAgent ? hashRequestMeta(ctx.userAgent) : null;

  // Fast path: atomically revoke iff live. DB now() avoids app/DB clock skew.
  const rotated = await db
    .update(refreshTokensTable)
    .set({ revokedAt: now, lastUsedAt: now })
    .where(
      and(
        eq(refreshTokensTable.tokenHash, tokenHash),
        isNull(refreshTokensTable.revokedAt),
        gt(refreshTokensTable.expiresAt, sql`now()`),
        gt(refreshTokensTable.absoluteExpiresAt, sql`now()`)
      )
    )
    .returning({
      familyId: refreshTokensTable.familyId,
      userId: refreshTokensTable.userId,
      absoluteExpiresAt: refreshTokensTable.absoluteExpiresAt,
    });

  if (rotated.length > 0) {
    const r = rotated[0]!;
    const gate = await assertRefreshGate(db, r.userId, r.familyId);
    const child = await mintRefreshChild(db, {
      userId: r.userId,
      familyId: r.familyId,
      absoluteExpiresAt: r.absoluteExpiresAt,
      parentHash: tokenHash,
      isPlatformAdmin: gate.user.isPlatformAdmin ?? false,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    // Informational link only — the sibling-grace design never needs it.
    await db
      .update(refreshTokensTable)
      .set({ replacedByHash: hashToken(child.raw) })
      .where(eq(refreshTokensTable.tokenHash, tokenHash))
      .catch(() => {});
    const accessToken = await signAccessToken({
      userId: r.userId,
      organizationId: gate.organizationId,
      isPlatformAdmin: gate.user.isPlatformAdmin ?? false,
      sid: r.familyId,
    });
    return { accessToken, refreshToken: child.raw };
  }

  // Slow path: the token wasn't live. Load it to distinguish expiry vs reuse.
  const [row] = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!row) throw httpError(401, 'Invalid or expired refresh token');

  if (!row.revokedAt) {
    // Live-flag failed but never revoked → idle- or absolute-expired.
    if (row.absoluteExpiresAt.getTime() <= now.getTime()) {
      await burnRefreshFamily(db, row.familyId);
      await auditAuthEvent(db, row.userId, 'auth.absolute_expired', {
        familyId: row.familyId,
      });
      logger.info({ user_id: row.userId }, 'Refresh absolute lifetime reached — family burned');
    }
    throw httpError(401, 'Invalid or expired refresh token');
  }

  // Revoked: grace sibling or real reuse?
  const ageMs = now.getTime() - row.revokedAt.getTime();
  const uaOk = !row.uaHash || !ctxUaHash || row.uaHash === ctxUaHash;
  if (ageMs <= graceSeconds * 1000 && (row.graceUses ?? 0) < maxUses && uaOk) {
    // Atomic use-count bump — losers at the cap fall through to burn.
    const claimed = await db
      .update(refreshTokensTable)
      .set({ graceUses: sql`${refreshTokensTable.graceUses} + 1`, lastUsedAt: now })
      .where(
        and(
          eq(refreshTokensTable.tokenHash, tokenHash),
          sql`${refreshTokensTable.graceUses} < ${maxUses}`
        )
      )
      .returning({
        familyId: refreshTokensTable.familyId,
        userId: refreshTokensTable.userId,
        absoluteExpiresAt: refreshTokensTable.absoluteExpiresAt,
      });
    if (claimed.length > 0) {
      const c = claimed[0]!;
      const gate = await assertRefreshGate(db, c.userId, c.familyId);
      const sibling = await mintRefreshChild(db, {
        userId: c.userId,
        familyId: c.familyId,
        absoluteExpiresAt: c.absoluteExpiresAt,
        parentHash: tokenHash,
        isPlatformAdmin: gate.user.isPlatformAdmin ?? false,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      });
      logger.info({ user_id: c.userId }, 'Refresh reuse within grace — sibling minted');
      const accessToken = await signAccessToken({
        userId: c.userId,
        organizationId: gate.organizationId,
        isPlatformAdmin: gate.user.isPlatformAdmin ?? false,
        sid: c.familyId,
      });
      return { accessToken, refreshToken: sibling.raw };
    }
  }

  // Real reuse: burn only this family (other devices survive).
  await burnRefreshFamily(db, row.familyId);
  await auditAuthEvent(db, row.userId, 'auth.refresh_reuse_detected', {
    familyId: row.familyId,
    graceUses: row.graceUses ?? 0,
    uaMatch: uaOk,
  });
  logger.warn({ user_id: row.userId }, 'Refresh token reuse detected — family burned');
  throw httpError(401, 'Invalid or expired refresh token');
}

/** Mint a child refresh token in an existing family (clamped to absolute). */
async function mintRefreshChild(
  db: Database,
  input: {
    userId: string;
    familyId: string;
    absoluteExpiresAt: Date;
    parentHash: string;
    isPlatformAdmin: boolean;
    userAgent?: string | null;
    ip?: string | null;
  }
): Promise<{ raw: string; expiresAt: Date }> {
  const { idle } = refreshLifetimes(input.isPlatformAdmin);
  const nowMs = Date.now();
  const expiresAt = new Date(
    Math.min(nowMs + durationToMs(idle), input.absoluteExpiresAt.getTime())
  );
  const raw = randomBytes(48).toString('hex');
  await db.insert(refreshTokensTable).values({
    userId: input.userId,
    tokenHash: hashToken(raw),
    expiresAt,
    absoluteExpiresAt: input.absoluteExpiresAt,
    familyId: input.familyId,
    parentHash: input.parentHash,
    uaHash: input.userAgent ? hashRequestMeta(input.userAgent) : null,
    ipHash: input.ip ? hashRequestMeta(input.ip) : null,
  });
  return { raw, expiresAt };
}

/**
 * Gate every mint: the user must exist and not be deactivated, and their
 * membership must not be deactivated. On gate failure the family burns so a
 * removed user keeps no usable refresh chain.
 */
async function assertRefreshGate(db: Database, userId: string, familyId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw httpError(401, 'Invalid or expired refresh token');
  if (user.deactivatedAt) {
    await burnRefreshFamily(db, familyId);
    throw httpError(403, 'Your account has been deactivated.');
  }
  const [membership] = await db
    .select({
      organizationId: organizationMembers.organizationId,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, user.id), isNull(organizationMembers.deletedAt)))
    .limit(1);
  if (membership && membership.status === 'deactivated') {
    await burnRefreshFamily(db, familyId);
    throw httpError(403, 'Your account in this organization has been deactivated.');
  }
  return { user, organizationId: membership?.organizationId ?? '' };
}

/** Revoke every live token in a family + flag it for the JWT fast path. */
export async function burnRefreshFamily(db: Database, familyId: string): Promise<number> {
  const { maxUses } = refreshReuseWindow();
  const burned = await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date(), graceUses: maxUses })
    .where(and(eq(refreshTokensTable.familyId, familyId), isNull(refreshTokensTable.revokedAt)))
    .returning({ id: refreshTokensTable.id });
  await markFamilyBurned(familyId);
  return burned.length;
}

/**
 * Revoke all live sessions for a user (password change, disable, force
 * logout). Pass exceptFamilyId to keep the current session alive.
 */
export async function revokeAllUserSessions(
  db: Database,
  userId: string,
  opts: { exceptFamilyId?: string } = {}
): Promise<number> {
  const { maxUses } = refreshReuseWindow();
  const conditions = [eq(refreshTokensTable.userId, userId), isNull(refreshTokensTable.revokedAt)];
  if (opts.exceptFamilyId) {
    conditions.push(sql`${refreshTokensTable.familyId} != ${opts.exceptFamilyId}`);
  }
  const revoked = await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date(), graceUses: maxUses })
    .where(and(...conditions))
    .returning({ familyId: refreshTokensTable.familyId });
  const families = new Set(revoked.map((r) => r.familyId));
  await Promise.all([...families].map((f) => markFamilyBurned(f)));
  if (revoked.length > 0) {
    logger.info({ user_id: userId, sessions: revoked.length }, 'All user sessions revoked');
  }
  return revoked.length;
}

/** Best-effort audit write — resolves the actor's org, skips when none. */
async function auditAuthEvent(
  db: Database,
  userId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const [membership] = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), isNull(organizationMembers.deletedAt)))
      .limit(1);
    if (!membership) return;
    await db.insert(auditLog).values({
      organizationId: membership.organizationId,
      actorId: userId,
      action,
      target: userId,
      targetId: userId,
      metadata,
    });
  } catch (err: unknown) {
    logger.warn({ err: String(err), action }, 'Auth audit write failed');
  }
}

// ─── signOut ──────────────────────────────────────────────────────────────────
export async function signOut(db: Database, rawToken: string, userId: string) {
  if (!/^[0-9a-fA-F-]{36}$/.test(userId)) return;
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select({ familyId: refreshTokensTable.familyId })
    .from(refreshTokensTable)
    .where(and(eq(refreshTokensTable.tokenHash, tokenHash), eq(refreshTokensTable.userId, userId)))
    .limit(1);
  if (row) await burnRefreshFamily(db, row.familyId);
}
