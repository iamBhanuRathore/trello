import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './env';

/**
 * AES-256-GCM secret storage with a version prefix so keys can be rotated.
 *
 * Format: `enc:v1:<iv>.<ciphertext>.<tag>` (base64url parts).
 * Legacy unprefixed values (calendar OAuth tokens) still decrypt.
 *
 * INTEGRATION_SECRET_KEY is the dedicated key. Development falls back to
 * CALENDAR_TOKEN_KEY then JWT_SECRET so a fresh checkout boots; production
 * requires the dedicated variable.
 */
const VERSION = 'enc:v1:';

function integrationKey(): Buffer {
  const dedicated = env.INTEGRATION_SECRET_KEY || env.CALENDAR_TOKEN_KEY;
  if (dedicated) return createHash('sha256').update(dedicated).digest();
  if (env.NODE_ENV === 'production') {
    throw new Error('INTEGRATION_SECRET_KEY must be set in production (openssl rand -base64 32)');
  }
  return createHash('sha256').update(`${env.JWT_SECRET}:integration-secret-fallback`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', integrationKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}${iv.toString('base64url')}.${ct.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptSecret(value: string): string {
  if (!value) throw new Error('Malformed encrypted secret');
  const body = value.startsWith(VERSION) ? value.slice(VERSION.length) : value;
  const [ivB64, ctB64, tagB64] = body.split('.');
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('Malformed encrypted secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    integrationKey(),
    Buffer.from(ivB64, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** True when the stored value can be decrypted with the current key. */
export function canDecryptSecret(value: string): boolean {
  try {
    decryptSecret(value);
    return true;
  } catch {
    return false;
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(prefix: string, bytes = 24): string {
  return `${prefix}${randomBytes(bytes).toString('hex')}`;
}

/** Never return a full secret to the client — keep a copyable, non-sensitive head. */
export function tokenPrefix(token: string, length = 12): string {
  return token.slice(0, length);
}
