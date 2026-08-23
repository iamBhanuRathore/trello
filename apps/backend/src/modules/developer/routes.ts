import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  listMarketplaceApps,
  getMarketplaceApp,
  installMarketplaceApp,
  updateInstalledApp,
  uninstallMarketplaceApp,
} from './service';

export const developerRoutes = new Elysia()
  .use(authPlugin)

  // ── Developer API Keys ──────────────────────────────────────────────────────
  .group('/developer/keys', (app) =>
    app
      .use(requirePermission('org.update'))
      .get('/', async ({ user, set }) => {
        try {
          return await listApiKeys(db, user.organizationId);
        } catch (err: any) {
          set.status = err.status || 500;
          return { error: err.message };
        }
      })
      .post(
        '/',
        async ({ body, user, set }) => {
          try {
            return await generateApiKey(db, user.organizationId, body);
          } catch (err: any) {
            set.status = err.status || 500;
            return { error: err.message };
          }
        },
        {
          body: t.Object({
            name: t.String(),
            scopes: t.Optional(t.Array(t.String())),
            expiresInDays: t.Optional(t.Number()),
          }),
        }
      )
      .delete('/:id', async ({ params, user, set }) => {
        try {
          return await revokeApiKey(db, user.organizationId, params.id);
        } catch (err: any) {
          set.status = err.status || 500;
          return { error: err.message };
        }
      })
  )

  // ── Marketplace & Power-Ups ─────────────────────────────────────────────────
  .group('/marketplace/apps', (app) =>
    app
      .get('/', async ({ query, user, set }) => {
        try {
          return await listMarketplaceApps(db, user.organizationId, {
            category: query.category,
            search: query.search,
          });
        } catch (err: any) {
          set.status = err.status || 500;
          return { error: err.message };
        }
      })
      .get('/:id', async ({ params, user, set }) => {
        try {
          return await getMarketplaceApp(db, user.organizationId, params.id);
        } catch (err: any) {
          set.status = err.status || 500;
          return { error: err.message };
        }
      })
      .use(requirePermission('board.update'))
      .post(
        '/:id/install',
        async ({ params, body, user, set }) => {
          try {
            return await installMarketplaceApp(db, user.organizationId, {
              appId: params.id,
              boardId: body?.boardId,
              config: body?.config,
            });
          } catch (err: any) {
            set.status = err.status || 500;
            return { error: err.message };
          }
        },
        {
          body: t.Optional(
            t.Object({
              boardId: t.Optional(t.String()),
              config: t.Optional(t.Record(t.String(), t.Any())),
            })
          ),
        }
      )
      .patch(
        '/installed/:id',
        async ({ params, body, user, set }) => {
          try {
            return await updateInstalledApp(db, user.organizationId, params.id, body);
          } catch (err: any) {
            set.status = err.status || 500;
            return { error: err.message };
          }
        },
        {
          body: t.Object({
            config: t.Optional(t.Record(t.String(), t.Any())),
            isEnabled: t.Optional(t.Boolean()),
          }),
        }
      )
      .delete('/installed/:id', async ({ params, user, set }) => {
        try {
          return await uninstallMarketplaceApp(db, user.organizationId, params.id);
        } catch (err: any) {
          set.status = err.status || 500;
          return { error: err.message };
        }
      })
  );
