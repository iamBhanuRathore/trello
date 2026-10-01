import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import { requestUpload, confirmUpload, presignedGet, findMedia } from '../../lib/storage';
import { assertMediaReadable } from './service';
import { scanMetricsSnapshot, sidecarHealth } from './scan';

// Unified media surface (5.5). Legacy card/chat mint endpoints stay as thin
// wrappers (see cards/routes.ts, chat/routes.ts) so old clients keep working;
// all reads go through GET /v1/media/:id/file (fail-closed scan gate).
//
// Readiness codes: scanning → 202 (retry), staged → 409 (confirm first),
// blocked/infected → 410, missing/cross-org/failed → 404.

async function cardOrChatPerm({ user, set, body, params }: any) {
  // Resolve the media kind without leaking existence: unknown ids fall through
  // to the handler's 404.
  let kind: string | undefined = (body as any)?.kind;
  if (!kind && (params as any)?.id) {
    const media = await findMedia(db, String((params as any).id)).catch(() => null);
    kind = media?.kind;
  }
  if (kind === 'card') {
    const gate = requirePermission('card.update');
    return gate({ user, set });
  }
  return undefined;
}

async function readPerm({ user, set, params }: any) {
  const media = await findMedia(db, String(params.id)).catch(() => null);
  if (media?.kind === 'card') {
    const gate = requirePermission('card.read');
    return gate({ user, set });
  }
  return undefined;
}

/** Scan metrics are an integration-health surface: org admins only. */
const adminPerm = requirePermission('integration.manage');

export const mediaRoutes = new Elysia({ prefix: '/media', tags: ['Media'] })
  .use(authPlugin)
  .post(
    '/request-upload',
    async ({ body, user, set }) => {
      try {
        return await requestUpload(db, user.organizationId, user.userId, {
          kind: body.kind,
          refId: body.refId,
          fileName: body.fileName,
          declaredMime: body.declaredMime,
          sizeBytes: body.sizeBytes,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: cardOrChatPerm,
      body: t.Object({
        kind: t.Union([t.Literal('card'), t.Literal('chat')]),
        refId: t.String({ format: 'uuid' }),
        fileName: t.String({ minLength: 1, maxLength: 255 }),
        declaredMime: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$',
          })
        ),
        sizeBytes: t.Optional(t.Number({ minimum: 0, maximum: 25 * 1024 * 1024 })),
      }),
    }
  )
  .post(
    '/:id/confirm',
    async ({ params, user, set }) => {
      try {
        // Chat leg needs membership before HEAD/transition work.
        await assertMediaReadable(db, user.organizationId, user.userId, params.id).catch(
          (err: any) => {
            // Card leg: assertMediaReadable passes through — perm gate already ran.
            if (err?.status === 404) {
              const mediaPromise = findMedia(db, params.id);
              return mediaPromise.then((m) => {
                if (m?.kind === 'card') return m;
                throw err;
              });
            }
            throw err;
          }
        );
        return await confirmUpload(db, user.organizationId, params.id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: cardOrChatPerm,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
    }
  )
  .get(
    '/:id/file',
    async ({ params, user, set }) => {
      try {
        await assertMediaReadable(db, user.organizationId, user.userId, params.id);
        const read = await presignedGet(db, user.organizationId, params.id);
        if (read.mode === 's3') {
          set.status = 302;
          (set.headers as Record<string, string>)['location'] = read.url;
          (set.headers as Record<string, string>)['cache-control'] = 'private, max-age=600';
          return `Redirecting to ${read.fileName}`;
        }
        const file = Bun.file(read.absPath);
        (set.headers as Record<string, string>)['Content-Disposition'] =
          `${read.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename="${read.fileName.replace(/"/g, '_')}"`;
        (set.headers as Record<string, string>)['X-Content-Type-Options'] = 'nosniff';
        (set.headers as Record<string, string>)['Content-Type'] = read.mime;
        (set.headers as Record<string, string>)['Cache-Control'] = 'private, max-age=600';
        return file;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: readPerm,
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
    }
  )
  .get(
    '/scan-metrics',
    async ({ set }) => {
      try {
        // PING the sidecar so the response is a live health probe, not a cached flag.
        await sidecarHealth();
        return scanMetricsSnapshot();
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: adminPerm }
  );
