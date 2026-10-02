import { createHash } from 'crypto';
import { env } from '../../lib/env';

// ─── Errors ───────────────────────────────────────────────────────────────────
export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Truncated sha256 for request metadata (UA / IP) — fixed 64-char column. */
export function hashRequestMeta(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 64);
}

export function durationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const [, amount, unit] = match;
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(amount) * (multipliers[unit!] ?? 0);
}

/**
 * Effective refresh windows. Super-admin caps override when set; otherwise the
 * main idle/absolute pair applies, falling back to the legacy single knob.
 */
export function refreshLifetimes(isPlatformAdmin = false): { idle: string; absolute: string } {
  if (isPlatformAdmin) {
    return {
      idle:
        env.SUPERADMIN_REFRESH_IDLE_EXPIRES_IN ??
        env.REFRESH_IDLE_EXPIRES_IN ??
        env.REFRESH_TOKEN_EXPIRES_IN,
      absolute:
        env.SUPERADMIN_REFRESH_ABSOLUTE_EXPIRES_IN ??
        env.REFRESH_ABSOLUTE_EXPIRES_IN ??
        env.REFRESH_TOKEN_EXPIRES_IN,
    };
  }
  return {
    idle: env.REFRESH_IDLE_EXPIRES_IN ?? env.REFRESH_TOKEN_EXPIRES_IN,
    absolute: env.REFRESH_ABSOLUTE_EXPIRES_IN ?? env.REFRESH_TOKEN_EXPIRES_IN,
  };
}

export function refreshReuseWindow(): { graceSeconds: number; maxUses: number } {
  return { graceSeconds: env.REFRESH_REUSE_GRACE_SECONDS, maxUses: env.REFRESH_GRACE_MAX_USES };
}

export interface TokenPairOptions {
  /** Reuse on rotation; omitted on fresh login (a new family is created). */
  familyId?: string;
  /** Never extended on rotation — forces re-login at the absolute cap. */
  absoluteExpiresAt?: Date;
  /** Hash of the rotated (parent) token — omitted on fresh login. */
  parentHash?: string;
  userAgent?: string | null;
  ip?: string | null;
}

export interface RefreshContext {
  userAgent?: string | null;
  ip?: string | null;
}
