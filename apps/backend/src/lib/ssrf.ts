import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from './env';
import { httpError } from './errors';

/**
 * SSRF guard for every outbound HTTP target the product lets a tenant
 * configure (event webhooks + Integration Hub outbound calls).
 *
 * - https only; plain-http loopback requires explicit ALLOW_HTTP_WEBHOOKS=1
 * - no embedded credentials, no Unix sockets
 * - every resolved A/AAAA must be public unicast
 * Enforced at create/update (fast feedback) AND at dispatch (DNS may change).
 * Callers must re-validate each redirect hop.
 */
function isBlockedIPv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && (b === 0 || b === 88)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function isBlockedIP(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = mapped?.[1] ?? ip;
  if (isIP(v4) === 4) {
    const octets = v4.split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    return isBlockedIPv4(octets);
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fec0:') ||
    lower.startsWith('fc00:') ||
    lower.startsWith('fd00:') ||
    lower.startsWith('ff') ||
    lower.startsWith('::ffff:0:')
  );
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw httpError(400, 'Invalid webhook URL');
  }
  if (parsed.username || parsed.password) {
    throw httpError(400, 'Webhook URL must not contain credentials');
  }
  const isLoopbackHost =
    parsed.hostname.toLowerCase() === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]' ||
    parsed.hostname === '::1';
  const allowLoopback = env.ALLOW_HTTP_WEBHOOKS && parsed.protocol === 'http:';
  if (parsed.protocol === 'http:') {
    if (!isLoopbackHost || !env.ALLOW_HTTP_WEBHOOKS) {
      throw httpError(400, 'Webhook URL must use https');
    }
  } else if (parsed.protocol !== 'https:') {
    throw httpError(400, 'Webhook URL must use https');
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(parsed.hostname, { all: true });
  } catch {
    throw httpError(400, 'Webhook hostname does not resolve');
  }
  const blocked = addresses.some((a) => {
    if (allowLoopback && (a.address === '127.0.0.1' || a.address === '::1')) return false;
    return isBlockedIP(a.address);
  });
  if (addresses.length === 0 || blocked) {
    throw httpError(400, 'Webhook URL resolves to a blocked (private/internal) address');
  }
  return parsed;
}

/**
 * fetch() with per-hop SSRF re-validation. Returns the final response, or
 * throws a 400 HttpError when a redirect points at a blocked host.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<Response> {
  const { maxRedirects = 3, ...rest } = init;
  let target = (await assertSafeWebhookUrl(rawUrl)).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(target, { ...rest, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, target).toString();
      await assertSafeWebhookUrl(next);
      target = next;
      continue;
    }
    return res;
  }
  throw httpError(400, 'Too many redirects');
}
