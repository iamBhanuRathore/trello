import { google } from 'googleapis';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../../lib/env';

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];

export function isGoogleConfigured(): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.CALENDAR_TOKEN_KEY);
}

export function googleRedirectUri(): string {
  return env.GOOGLE_REDIRECT_URI || `${env.API_URL}/v1/calendar/google/callback`;
}

export function oauthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri()
  );
}

export function buildAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  });
}

function tokenKey(): Buffer {
  if (!env.CALENDAR_TOKEN_KEY) {
    throw new Error('CALENDAR_TOKEN_KEY must be set (generate: openssl rand -base64 32)');
  }
  return createHash('sha256').update(env.CALENDAR_TOKEN_KEY).digest();
}

/** Bind OAuth state to the initiating user so callbacks can't be re-targeted. */
export function signState(payload: { userId: string; organizationId: string }): string {
  const data = Buffer.from(
    JSON.stringify({ ...payload, nonce: randomBytes(8).toString('hex') })
  ).toString('base64url');
  const sig = createHmac('sha256', tokenKey()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyState(state: string): { userId: string; organizationId: string } {
  const [data, sig] = (state || '').split('.');
  if (!data || !sig) throw new Error('Invalid OAuth state');
  const expected = createHmac('sha256', tokenKey()).update(data).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid OAuth state signature');
  }
  const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  if (!parsed.userId || !parsed.organizationId) throw new Error('Invalid OAuth state payload');
  return parsed;
}

/** AES-256-GCM at-rest encryption for OAuth refresh tokens. */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${ct.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptToken(enc: string): string {
  const [ivB64, ctB64, tagB64] = (enc || '').split('.');
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('Malformed encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export type CalendarApi = ReturnType<typeof google.calendar>;

/** Authenticated Calendar API client from a stored (encrypted) refresh token. */
export function calendarClient(encryptedRefreshToken: string): CalendarApi {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: decryptToken(encryptedRefreshToken) });
  return google.calendar({ version: 'v3', auth });
}

export async function fetchGoogleEmail(auth: ReturnType<typeof oauthClient>): Promise<{
  sub: string;
  email: string;
}> {
  const oauth2 = google.oauth2({ version: 'v2', auth: auth as any });
  const { data } = await oauth2.userinfo.get();
  return { sub: String(data.id || ''), email: String(data.email || '') };
}
