import Elysia, { t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { env } from '../../lib/env';
import {
  signUp,
  signIn,
  refreshTokens,
  signOut,
  getMe,
  updateProfile,
  changePassword,
  getMyPermissions,
  getInvitationInfo,
  acceptInvitation,
  durationToMs,
  refreshLifetimes,
  httpError,
} from './service';
import {
  getGoogleAuthorizationUrl,
  getSSOAuthorizationUrl,
  authenticateWithWorkOSCode,
} from './workos.service';
import { HttpsUrlSchema } from '../../lib/validators';

// ─── Refresh cookie (phase 1: dual-read) ─────────────────────────────────────
// The refresh token is mirrored into an httpOnly SameSite=Lax cookie scoped to
// /v1/auth. Handlers accept body OR cookie; the body path stays for mobile /
// token-storage clients. __Host- prefix is deliberately NOT used: it requires
// Secure, which breaks http://localhost dev. Production sets Secure.
const REFRESH_COOKIE = 'boardly_rt';

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function cookieMaxAge(isPlatformAdmin = false): number {
  return Math.floor(durationToMs(refreshLifetimes(isPlatformAdmin).absolute) / 1000);
}

function refreshCookieHeader(raw: string, isPlatformAdmin = false): string {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${REFRESH_COOKIE}=${encodeURIComponent(raw)}; Path=/v1/auth; Max-Age=${cookieMaxAge(isPlatformAdmin)}; HttpOnly; SameSite=Lax${secure}`;
}

function clearRefreshCookieHeader(): string {
  return `${REFRESH_COOKIE}=; Path=/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function requestIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim().slice(0, 64);
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim().slice(0, 64) ?? null;
}

function refreshContext(request: Request) {
  return { userAgent: request.headers.get('user-agent'), ip: requestIp(request) };
}

/**
 * CSRF guard for cookie-presented refresh: the Origin (or Referer origin)
 * must match a configured dashboard origin. Body-token flows are bearer-style
 * and need no Origin check.
 */
function assertWebOrigin(request: Request): void {
  const allowed = new Set(
    (env.DASHBOARD_URL || '')
      .split(',')
      .map((s) => {
        try {
          return new URL(s.trim()).origin;
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  );
  if (env.WORKOS_REDIRECT_URI) {
    try {
      allowed.add(new URL(env.WORKOS_REDIRECT_URI).origin);
    } catch {
      // ignore malformed redirect URI
    }
  }
  const origin = request.headers.get('origin');
  let candidate: string | null = origin;
  if (!candidate) {
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        candidate = new URL(referer).origin;
      } catch {
        candidate = null;
      }
    }
  }
  if (!candidate || !allowed.has(candidate)) {
    throw httpError(403, 'Cross-site refresh not allowed');
  }
}

/**
 * Auth routes — /v1/auth/*
 */
export const authRoutes = new Elysia({ prefix: '/auth', tags: ['Auth'] })

  // ── WorkOS Authentication Flows ─────────────────────────────────────────────
  // GET /v1/auth/workos/google-url
  .get(
    '/workos/google-url',
    async ({ query, set }) => {
      try {
        return getGoogleAuthorizationUrl(query.redirectUri);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      query: t.Optional(
        t.Object({
          redirectUri: t.Optional(t.String()),
        })
      ),
      detail: { summary: 'Get Google OAuth authorization URL via WorkOS' },
    }
  )

  // POST /v1/auth/workos/sso-url
  .post(
    '/workos/sso-url',
    async ({ body, set }) => {
      try {
        return await getSSOAuthorizationUrl(db, body.domain, body.redirectUri);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        domain: t.String({ minLength: 1 }),
        redirectUri: t.Optional(t.String()),
      }),
      detail: { summary: 'Get domain-routed Enterprise SSO authorization URL via WorkOS' },
    }
  )

  // POST /v1/auth/workos/callback
  .post(
    '/workos/callback',
    async ({ body, set, request }) => {
      try {
        const result = await authenticateWithWorkOSCode(db, body.code, refreshContext(request));
        set.headers['Set-Cookie'] = refreshCookieHeader(
          result.refreshToken,
          result.user.isPlatformAdmin
        );
        return result;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        code: t.String({ minLength: 1 }),
      }),
      detail: { summary: 'Authenticate user via WorkOS authorization code' },
    }
  )

  // POST /v1/auth/sign-up
  .post(
    '/sign-up',
    async ({ body, set, request }) => {
      try {
        const result = await signUp(db, body, refreshContext(request));
        set.headers['Set-Cookie'] = refreshCookieHeader(
          result.refreshToken,
          result.user.isPlatformAdmin
        );
        set.status = 201;
        return result;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 8 }),
        orgName: t.String({ minLength: 2 }),
        orgSlug: t.String({ minLength: 2 }),
      }),
      detail: { summary: 'Register new user + organization' },
    }
  )

  // POST /v1/auth/sign-in
  .post(
    '/sign-in',
    async ({ body, set, request }) => {
      try {
        const result = await signIn(db, body, refreshContext(request));
        set.headers['Set-Cookie'] = refreshCookieHeader(
          result.refreshToken,
          result.user.isPlatformAdmin
        );
        return result;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 1 }),
      }),
      detail: { summary: 'Sign in with email + password' },
    }
  )

  // POST /v1/auth/refresh
  .post(
    '/refresh',
    async ({ body, set, request }) => {
      try {
        const cookies = parseCookies(request.headers.get('cookie'));
        const viaCookie = !body.refreshToken && !!cookies[REFRESH_COOKIE];
        if (viaCookie) assertWebOrigin(request);
        const raw = body.refreshToken ?? cookies[REFRESH_COOKIE];
        if (!raw) throw httpError(400, 'Refresh token is required');
        const result = await refreshTokens(db, raw, refreshContext(request));
        // Keep the cookie in sync so cookie-only clients survive rotation.
        if (viaCookie || cookies[REFRESH_COOKIE]) {
          set.headers['Set-Cookie'] = refreshCookieHeader(result.refreshToken);
        }
        return result;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({ refreshToken: t.Optional(t.String()) }),
      detail: { summary: 'Rotate refresh token — returns new access + refresh token pair' },
    }
  )

  // GET /v1/auth/invitation
  .get(
    '/invitation',
    async ({ query, set }) => {
      try {
        return await getInvitationInfo(db, query.token);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      query: t.Object({
        token: t.String({ minLength: 1 }),
      }),
      detail: { summary: 'Get invitation details by token' },
    }
  )

  // POST /v1/auth/accept-invite
  .post(
    '/accept-invite',
    async ({ body, set, request }) => {
      try {
        const result = await acceptInvitation(db, body, refreshContext(request));
        set.headers['Set-Cookie'] = refreshCookieHeader(
          result.refreshToken,
          result.user.isPlatformAdmin
        );
        return result;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1 }),
        name: t.Optional(t.String()),
        password: t.Optional(t.String()),
      }),
      detail: { summary: 'Accept organization invitation and activate membership' },
    }
  )

  // ── Protected auth routes ──────────────────────────────────────────────────
  .use(authPlugin)

  // POST /v1/auth/sign-out  (requires auth)
  .post(
    '/sign-out',
    async ({ body, user, set, request }) => {
      try {
        const cookies = parseCookies(request.headers.get('cookie'));
        const raw = body.refreshToken ?? cookies[REFRESH_COOKIE];
        if (raw) await signOut(db, raw, user.userId);
        set.headers['Set-Cookie'] = clearRefreshCookieHeader();
        return { message: 'Signed out' };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({ refreshToken: t.Optional(t.String()) }),
      detail: { summary: 'Sign out — revokes refresh token' },
    }
  )

  // GET /v1/auth/me  (requires auth)
  .get(
    '/me',
    async ({ user, set }) => {
      try {
        return await getMe(db, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      detail: { summary: 'Get current authenticated user profile' },
    }
  )

  // PATCH /v1/auth/profile  (requires auth)
  .patch(
    '/profile',
    async ({ user, body, set }) => {
      try {
        return await updateProfile(db, user.userId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        avatarUrl: t.Optional(t.Union([HttpsUrlSchema, t.Null()])),
        timezone: t.Optional(t.Union([t.String({ maxLength: 64 }), t.Null()])),
        email: t.Optional(t.String({ format: 'email' })),
      }),
      detail: { summary: 'Update user profile details' },
    }
  )

  // POST /v1/auth/change-password  (requires auth)
  .post(
    '/change-password',
    async ({ user, body, set }) => {
      try {
        return await changePassword(db, user.userId, body, { keepFamilyId: user.sid });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        currentPassword: t.Optional(t.String()),
        newPassword: t.String({ minLength: 8 }),
      }),
      detail: { summary: 'Change user account password' },
    }
  )

  // GET /v1/auth/permissions (requires auth)
  .get(
    '/permissions',
    async ({ user, set }) => {
      try {
        return await getMyPermissions(db, user.userId, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      detail: { summary: 'Get current user role and detailed RBAC permission matrix' },
    }
  );
