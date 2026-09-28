/**
 * Shared pagination clamping.
 *
 * Every list endpoint must bound its own page size: a tenant with 100k comments
 * would otherwise stream the whole table into one JSON response and pin the
 * event loop. Callers pass the raw query value; `clampLimit` normalizes garbage
 * (NaN, negatives, `Infinity`, huge numbers) to a safe integer.
 */

/** Default page size when the caller doesn't ask for one. */
export const DEFAULT_LIMIT = 50;

/** Hard ceiling — no endpoint may return more than this in one response. */
export const MAX_LIMIT = 200;

export function clampLimit(
  raw: number | string | undefined,
  { def = DEFAULT_LIMIT, max = MAX_LIMIT }: { def?: number; max?: number } = {}
): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return def;
  const floored = Math.floor(n);
  if (floored < 1) return def;
  return Math.min(floored, max);
}
