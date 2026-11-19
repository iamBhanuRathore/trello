import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { apiKeyAuth, requireApiScope } from './api-key-auth';
import { pickAllowed, readFields, validateWriteBody, writeFields } from './serializers';
import {
  publicBoardLists,
  publicCreateBoard,
  publicGetBoard,
  publicListBoards,
  publicUpdateBoard,
} from './service';

export const publicBoardRoutes = new Elysia({ tags: ['Public API'] })
  .use(apiKeyAuth)

  .get(
    '/public/boards',
    async ({ apiKey, query }) => {
      const rows = await publicListBoards(db, apiKey.organizationId, query);
      const allowed = readFields('boards', apiKey.moduleScopes);
      return rows.map((r) => pickAllowed(r, allowed));
    },
    {
      beforeHandle: requireApiScope('boards', 'read'),
      query: t.Object({ projectId: t.Optional(t.String()) }),
    }
  )

  .get(
    '/public/boards/:id',
    async ({ apiKey, params }) => {
      const row = await publicGetBoard(db, apiKey.organizationId, params.id);
      return pickAllowed(row, readFields('boards', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('boards', 'read') }
  )

  .get(
    '/public/boards/:id/lists',
    async ({ apiKey, params }) => {
      const rows = await publicBoardLists(db, apiKey.organizationId, params.id);
      // Lists are board structure, not a catalogue resource — the board key's
      // field allowlist does not apply to list rows.
      return rows;
    },
    { beforeHandle: requireApiScope('boards', 'read') }
  )

  .post(
    '/public/boards',
    async ({ apiKey, body, set }) => {
      const input = validateWriteBody(
        'boards',
        body,
        writeFields('boards', apiKey.moduleScopes),
        'create'
      );
      const board = await publicCreateBoard(db, apiKey.organizationId, input);
      set.status = 201;
      return pickAllowed(board!, readFields('boards', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('boards', 'write'), body: t.Any() }
  )

  .patch(
    '/public/boards/:id',
    async ({ apiKey, params, body }) => {
      const input = validateWriteBody(
        'boards',
        body,
        writeFields('boards', apiKey.moduleScopes),
        'update'
      );
      const row = await publicUpdateBoard(db, apiKey.organizationId, params.id, input);
      return pickAllowed(row, readFields('boards', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('boards', 'write'), body: t.Any() }
  );
