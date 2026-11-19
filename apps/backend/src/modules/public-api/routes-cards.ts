import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { apiKeyAuth, requireApiScope } from './api-key-auth';
import { pickAllowed, readFields, validateWriteBody, writeFields } from './serializers';
import { publicCreateCard, publicGetCard, publicListCards, publicUpdateCard } from './service';

export const publicCardRoutes = new Elysia({ tags: ['Public API'] })
  .use(apiKeyAuth)

  .get(
    '/public/cards',
    async ({ apiKey, query, set }) => {
      const rows = await publicListCards(db, apiKey.organizationId, query);
      const allowed = readFields('cards', apiKey.moduleScopes);
      set.headers['X-Total-Count'] = String(rows.length);
      return rows.map((r) => pickAllowed(r, allowed));
    },
    {
      beforeHandle: requireApiScope('cards', 'read'),
      query: t.Object({
        boardId: t.Optional(t.String()),
        listId: t.Optional(t.String()),
        updatedSince: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    }
  )

  .get(
    '/public/cards/:id',
    async ({ apiKey, params }) => {
      const row = await publicGetCard(db, apiKey.organizationId, params.id);
      return pickAllowed(row, readFields('cards', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('cards', 'read') }
  )

  .post(
    '/public/cards',
    async ({ apiKey, body, set }) => {
      const input = validateWriteBody(
        'cards',
        body,
        writeFields('cards', apiKey.moduleScopes),
        'create'
      );
      const card = await publicCreateCard(db, apiKey.organizationId, input);
      set.status = 201;
      const row = await publicGetCard(db, apiKey.organizationId, card!.id);
      return pickAllowed(row, readFields('cards', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('cards', 'write'), body: t.Any() }
  )

  .patch(
    '/public/cards/:id',
    async ({ apiKey, params, body }) => {
      const input = validateWriteBody(
        'cards',
        body,
        writeFields('cards', apiKey.moduleScopes),
        'update'
      );
      const row = await publicUpdateCard(db, apiKey.organizationId, params.id, input);
      return pickAllowed(row, readFields('cards', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('cards', 'write'), body: t.Any() }
  );
