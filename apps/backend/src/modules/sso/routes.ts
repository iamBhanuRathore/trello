import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import {
  getSSOConfig,
  updateSSOConfig,
  generateSSOLoginUrl,
  processSSOCallback,
  processSCIMWebhook,
} from './service';

export const ssoRoutes = new Elysia({ prefix: '/sso', tags: ['SSO'] })
  // ── Public Authentication Flow ─────────────────────────────────────────────
  .post(
    '/login-url',
    async ({ body, set }) => {
      try {
        return await generateSSOLoginUrl(db, body.domain);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        domain: t.String(),
      }),
    }
  )

  .post(
    '/callback',
    async ({ body, set }) => {
      try {
        return await processSSOCallback(db, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        domain: t.String(),
        email: t.String(),
        name: t.String(),
      }),
    }
  )

  // ── SCIM 2.0 Directory Sync Webhook ────────────────────────────────────────
  .post(
    '/scim',
    async ({ headers, body, set }) => {
      try {
        const authHeader = headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        return await processSCIMWebhook(db, token, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        action: t.Union([t.Literal('user.create'), t.Literal('user.update'), t.Literal('user.delete')]),
        email: t.String(),
        name: t.Optional(t.String()),
      }),
    }
  )

  // ── Authenticated Admin Configuration ──────────────────────────────────────
  .use(authPlugin)

  // GET /v1/sso/config
  .use(requirePermission('org.update'))
  .get('/', async ({ user, set }) => {
    try {
      return await getSSOConfig(db, user.organizationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // PATCH /v1/sso/config
  .use(requirePermission('org.update'))
  .patch(
    '/',
    async ({ body, user, set }) => {
      try {
        return await updateSSOConfig(db, user.organizationId, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        provider: t.Optional(t.String()),
        domain: t.Optional(t.String()),
        idpMetadataUrl: t.Optional(t.String()),
        clientId: t.Optional(t.String()),
        clientSecret: t.Optional(t.String()),
        scimEnabled: t.Optional(t.Boolean()),
        enforceSSO: t.Optional(t.Boolean()),
      }),
    }
  );
