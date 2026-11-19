import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { apiKeyAuth, requireApiScope } from './api-key-auth';
import { pickAllowed, readFields, validateWriteBody, writeFields } from './serializers';
import { publicCreateComment, publicListComments } from './service';

export const publicCommentRoutes = new Elysia({ tags: ['Public API'] })
  .use(apiKeyAuth)

  .get(
    '/public/cards/:id/comments',
    async ({ apiKey, params, query }) => {
      const rows = await publicListComments(db, apiKey.organizationId, params.id, query);
      const allowed = readFields('comments', apiKey.moduleScopes);
      return rows.map((r) => pickAllowed(r, allowed));
    },
    {
      beforeHandle: requireApiScope('comments', 'read'),
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    }
  )

  .post(
    '/public/cards/:id/comments',
    async ({ apiKey, params, body, set }) => {
      const raw = (body ?? {}) as Record<string, unknown>;
      if (raw.cardId !== undefined && raw.cardId !== params.id) {
        set.status = 422;
        return { error: 'cardId in body must match the card in the path' };
      }
      const input = validateWriteBody(
        'comments',
        { ...raw, cardId: params.id },
        writeFields('comments', apiKey.moduleScopes),
        'create'
      );
      const comment = await publicCreateComment(
        db,
        apiKey.organizationId,
        params.id,
        input.body as string
      );
      set.status = 201;
      return pickAllowed(comment, readFields('comments', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('comments', 'write'), body: t.Any() }
  );
