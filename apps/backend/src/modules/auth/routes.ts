import Elysia, { t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { signUp, signIn, refreshTokens, signOut, getMe, updateProfile, changePassword, getMyPermissions } from './service';

/**
 * Auth routes — /v1/auth/*
 */
export const authRoutes = new Elysia({ prefix: '/auth', tags: ['Auth'] })

  // POST /v1/auth/sign-up
  .post(
    '/sign-up',
    async ({ body, set }) => {
      try {
        const result = await signUp(db, body);
        set.status = 201;
        return result;
      } catch (err: unknown) {
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
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
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
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
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
      }
    },
    {
      body: t.Object({ refreshToken: t.String() }),
      detail: { summary: 'Rotate refresh token — returns new access + refresh token pair' },
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
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
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
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
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
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        avatarUrl: t.Optional(t.Union([t.String(), t.Null()])),
        timezone: t.Optional(t.Union([t.String(), t.Null()])),
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
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
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
        const e = err as { status?: number; message: string };
        set.status = e.status ?? 500;
        return { error: e.message };
      }
    },
    {
      detail: { summary: 'Get current user role and detailed RBAC permission matrix' },
    }
  );
