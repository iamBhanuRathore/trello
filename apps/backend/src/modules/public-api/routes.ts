import { Elysia } from 'elysia';
import { db } from '../../db/index';
import { apiKeyAuth } from './api-key-auth';
import { consumeGlobalHit, quotaHeaders } from './quota';
import { publicCardRoutes } from './routes-cards';
import { publicBoardRoutes } from './routes-boards';
import { publicProjectRoutes } from './routes-projects';
import { publicCommentRoutes } from './routes-comments';

/**
 * /v1/public/* — fully enforced public REST API.
 *
 * Every route below is authenticated by `apiKeyAuth` (mounted on each child)
 * and scope-checked per handler. The inbound receiver lives in its own module
 * and deliberately does NOT use API-key auth.
 */
const MAX_PUBLIC_BODY_BYTES = 1024 * 1024; // 1 MB — plenty for a card/board body

export const publicApiRoutes = new Elysia({ tags: ['Public API'] })
  // Bound bodies before parsing (this hook is scoped to this plugin's routes).
  .onRequest(({ request, set }) => {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_PUBLIC_BODY_BYTES) {
      set.status = 413;
      return new Response(JSON.stringify({ error: 'Payload too large (max 1 MB)' }), {
        status: 413,
        headers: { 'content-type': 'application/json' },
      });
    }
    return undefined;
  })
  .use(apiKeyAuth)
  .get('/public/whoami', async ({ apiKey, set }) => {
    const quota = await consumeGlobalHit(db, apiKey.id);
    if (!quota.allowed) {
      set.status = 429;
      quotaHeaders(set, quota);
      return { error: 'Monthly API quota exceeded' };
    }
    quotaHeaders(set, quota);
    return {
      keyId: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      organizationId: apiKey.organizationId,
      scopes: apiKey.moduleScopes.map((s) => ({
        module: s.module,
        read: s.read,
        write: s.write,
        fields: s.fields,
        hitLimit: s.hitLimit,
      })),
      usage: { hits: quota.hits, limit: quota.limit, periodStart: quota.periodStart },
    };
  })
  .use(publicCardRoutes)
  .use(publicBoardRoutes)
  .use(publicProjectRoutes)
  .use(publicCommentRoutes);
