import { createVerify } from 'node:crypto';

// ─── SNS signature verification (SES → SNS path) ─────────────────────────────
// Follows the AWS "verifying signatures" recipe: SigningCertURL host MUST be
// an SNS endpoint, the cert is fetched + cached, and Signature is verified
// over the canonical field string. SubscriptionConfirmation is confirmed by
// GETting SubscribeURL (same host check).

const certCache = new Map<string, string>();
let verifyOverride: ((payload: Record<string, any>) => Promise<boolean>) | null = null;

/** Test hook: stub network cert verification. */
export function __setSnsVerify(
  fn: ((payload: Record<string, any>) => Promise<boolean>) | null
): void {
  verifyOverride = fn;
}

export function isSnsHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname);
  } catch {
    return false;
  }
}

function canonicalString(p: Record<string, any>): string {
  const type = p['Type'];
  const fields =
    type === 'Notification'
      ? [
          'Message',
          'MessageId',
          ...(p['Subject'] ? ['Subject'] : []),
          'Timestamp',
          'TopicArn',
          'Type',
        ]
      : type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation'
        ? ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
        : null;
  if (!fields) throw new Error(`Unsupported SNS Type: ${type}`);
  return fields.map((f) => `${f}\n${p[f] ?? ''}\n`).join('');
}

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Cert fetch failed (${res.status})`);
  const pem = await res.text();
  if (!pem.includes('BEGIN CERTIFICATE')) throw new Error('Cert URL did not return a certificate');
  certCache.set(url, pem);
  return pem;
}

export async function verifySnsPayload(payload: Record<string, any>): Promise<boolean> {
  if (verifyOverride) return verifyOverride(payload);
  try {
    const certUrl = payload['SigningCertURL'];
    const signature = payload['Signature'];
    if (typeof certUrl !== 'string' || !isSnsHost(certUrl)) return false;
    if (typeof signature !== 'string' || !signature) return false;
    const cert = await fetchCert(certUrl);
    const verifier = createVerify('RSA-SHA1');
    verifier.update(canonicalString(payload), 'utf8');
    return verifier.verify(cert, signature, 'base64');
  } catch {
    return false;
  }
}

export async function confirmSnsSubscription(subscribeUrl: string): Promise<boolean> {
  if (!isSnsHost(subscribeUrl)) return false;
  if (verifyOverride) return true;
  try {
    const res = await fetch(subscribeUrl, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}
