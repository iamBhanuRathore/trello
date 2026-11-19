import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { httpError } from '../../lib/errors';
import {
  createInboundEndpoint,
  deleteInboundEndpoint,
  listInboundDeliveries,
  listInboundEndpoints,
  receiveInbound,
  updateInboundEndpoint,
} from './inbound-service';

const MAX_INBOUND_BYTES = 256 * 1024;

/** Admin CRUD for inbound webhook URLs. */
export const inboundWebhookAdminRoutes = new Elysia({ tags: ['Integrations'] })
  .use(authPlugin)
  .guard({ beforeHandle: requirePermission('integration.manage') }, (app) =>
    app
      .get('/integrations/inbound', async ({ user, set }) => {
        try {
          return await listInboundEndpoints(db, user.organizationId);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
      .post(
        '/integrations/inbound',
        async ({ user, body, set }) => {
          try {
            const result = await createInboundEndpoint(db, user.organizationId, {
              label: body.label,
              targetModule: body.targetModule,
              defaultRefId: body.defaultRefId,
              createdBy: user.userId,
            });
            set.status = 201;
            return result;
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        {
          body: t.Object({
            label: t.Optional(t.String()),
            targetModule: t.String(),
            defaultRefId: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        }
      )
      .patch(
        '/integrations/inbound/:id',
        async ({ user, params, body, set }) => {
          try {
            return await updateInboundEndpoint(db, user.organizationId, params.id, body);
          } catch (err: unknown) {
            return handleRouteError(err, set);
          }
        },
        {
          body: t.Object({
            label: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean()),
          }),
        }
      )
      .delete('/integrations/inbound/:id', async ({ user, params, set }) => {
        try {
          return await deleteInboundEndpoint(db, user.organizationId, params.id);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
      .get('/integrations/inbound/:id/deliveries', async ({ user, params, set }) => {
        try {
          return await listInboundDeliveries(db, user.organizationId, params.id);
        } catch (err: unknown) {
          return handleRouteError(err, set);
        }
      })
  );

/**
 * Public receiver. Authenticated by the token capability in the URL — no user
 * session and no API key. Every request is logged as a delivery.
 */
export const inboundWebhookPublicRoutes = new Elysia({ tags: ['Public API'] })
  // Reject oversized bodies before Elysia parses them. The handler checks below
  // are defense-in-depth for chunked requests that omit Content-Length; a
  // post-parse check alone lets an attacker force a large allocation.
  .onRequest(({ request, set }) => {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_INBOUND_BYTES) {
      set.status = 413;
      return new Response(JSON.stringify({ error: 'Payload too large (max 256 KB)' }), {
        status: 413,
        headers: { 'content-type': 'application/json' },
      });
    }
    return undefined;
  })
  .post(
    '/public/inbound/:token',
    async ({ params, body, request, set }) => {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > MAX_INBOUND_BYTES) {
        set.status = 413;
        return { error: 'Payload too large (max 256 KB)' };
      }
      const serialized = JSON.stringify(body ?? {});
      if (Buffer.byteLength(serialized) > MAX_INBOUND_BYTES) {
        set.status = 413;
        return { error: 'Payload too large (max 256 KB)' };
      }
      try {
        const result = await receiveInbound(
          db,
          params.token,
          body,
          request.headers.get('idempotency-key') || undefined
        );
        set.status = result.statusCode;
        return result.body;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { body: t.Any() }
  );

export function assertInboundBodyLimit(bytes: number): void {
  if (bytes > MAX_INBOUND_BYTES) throw httpError(413, 'Payload too large (max 256 KB)');
}
