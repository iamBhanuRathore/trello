import Elysia, { t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
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
} from './service';
import {
  getGoogleAuthorizationUrl,
  getSSOAuthorizationUrl,
  authenticateWithWorkOSCode,
} from './workos.service';
import { HttpsUrlSchema } from '../../lib/validators';

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
    async ({ body, set }) => {
      try {
        return await authenticateWithWorkOSCode(db, body.code);
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
    async ({ body, set }) => {
      try {
        const result = await signUp(db, body);
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
    async ({ body, set }) => {
      try {
        return await signIn(db, body);
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
    async ({ body, set }) => {
      try {
        return await refreshTokens(db, body.refreshToken);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({ refreshToken: t.String() }),
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
    async ({ body, set }) => {
      try {
        return await acceptInvitation(db, body);
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
    async ({ body, user, set }) => {
      try {
        await signOut(db, body.refreshToken, user.userId);
        return { message: 'Signed out' };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({ refreshToken: t.String() }),
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
        return await changePassword(db, user.userId, body);
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
