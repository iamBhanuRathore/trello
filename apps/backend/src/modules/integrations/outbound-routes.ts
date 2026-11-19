import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  createOutboundIntegration,
  deleteOutboundIntegration,
  getOutboundIntegration,
  listOutboundIntegrations,
  listOutboundRuns,
  setOutboundActive,
  updateOutboundIntegration,
  type OutboundInput,
} from './outbound-service';
import { executeAuthCall, testOutboundIntegration } from './outbound-engine';
import type { AuthConfig } from './outbound-service';

const outboundBody = t.Object({
  name: t.String(),
  sourceModule: t.String(),
  triggerEvents: t.Array(t.String()),
  triggerFilter: t.Optional(
    t.Union([
      t.Object({ listId: t.Optional(t.String()), stageId: t.Optional(t.String()) }),
      t.Null(),
    ])
  ),
  authEnabled: t.Optional(t.Boolean()),
  authConfig: t.Optional(t.Any()),
  dataConfig: t.Any(),
  fieldMappings: t.Optional(t.Array(t.Any())),
  successCheck: t.Optional(
    t.Union([t.Object({ path: t.Optional(t.String()), equals: t.Optional(t.String()) }), t.Null()])
  ),
  isActive: t.Optional(t.Boolean()),
});

export const outboundRoutes = new Elysia({ tags: ['Integrations'] })
  .use(authPlugin)
  .guard({ beforeHandle: requirePermission('integration.manage') }, (app) =>
    app
      .get('/integrations/outbound', async ({ user, set }) => {
        try {
          return await listOutboundIntegrations(db, user.organizationId);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
      .get('/integrations/outbound/:id', async ({ user, params, set }) => {
        try {
          return await getOutboundIntegration(db, user.organizationId, params.id);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
      .post(
        '/integrations/outbound',
        async ({ user, body, set }) => {
          try {
            const result = await createOutboundIntegration(
              db,
              user.organizationId,
              body as OutboundInput
            );
            set.status = 201;
            return result;
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        { body: outboundBody }
      )
      .put(
        '/integrations/outbound/:id',
        async ({ user, params, body, set }) => {
          try {
            return await updateOutboundIntegration(
              db,
              user.organizationId,
              params.id,
              body as OutboundInput
            );
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        { body: outboundBody }
      )
      .patch(
        '/integrations/outbound/:id',
        async ({ user, params, body, set }) => {
          try {
            return await setOutboundActive(db, user.organizationId, params.id, body.isActive);
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        { body: t.Object({ isActive: t.Boolean() }) }
      )
      .delete('/integrations/outbound/:id', async ({ user, params, set }) => {
        try {
          return await deleteOutboundIntegration(db, user.organizationId, params.id);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
      .get('/integrations/outbound/:id/runs', async ({ user, params, set }) => {
        try {
          return await listOutboundRuns(db, user.organizationId, params.id);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
      .post(
        '/integrations/outbound/test-auth',
        async ({ body, set }) => {
          try {
            const result = await executeAuthCall(body as unknown as AuthConfig);
            return {
              ok: result.ok,
              status: result.status,
              tokenPreview: result.token ? `${result.token.slice(0, 6)}…` : null,
              hasSecondToken: !!result.token2,
              candidatePaths: result.candidatePaths,
              responsePreview: result.responsePreview,
            };
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        { body: t.Any() }
      )
      .post('/integrations/outbound/:id/test', async ({ user, params, set }) => {
        try {
          return await testOutboundIntegration(db, user.organizationId, params.id);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
  );
