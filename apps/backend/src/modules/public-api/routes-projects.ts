import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { apiKeyAuth, requireApiScope } from './api-key-auth';
import { pickAllowed, readFields, validateWriteBody, writeFields } from './serializers';
import {
  publicCreateProject,
  publicGetProject,
  publicListProjects,
  publicUpdateProject,
} from './service';

export const publicProjectRoutes = new Elysia({ tags: ['Public API'] })
  .use(apiKeyAuth)

  .get(
    '/public/projects',
    async ({ apiKey, query }) => {
      const rows = await publicListProjects(db, apiKey.organizationId, query);
      const allowed = readFields('projects', apiKey.moduleScopes);
      return rows.map((r) => pickAllowed(r, allowed));
    },
    {
      beforeHandle: requireApiScope('projects', 'read'),
      query: t.Object({ workspaceId: t.Optional(t.String()) }),
    }
  )

  .get(
    '/public/projects/:id',
    async ({ apiKey, params }) => {
      const row = await publicGetProject(db, apiKey.organizationId, params.id);
      return pickAllowed(row, readFields('projects', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('projects', 'read') }
  )

  .post(
    '/public/projects',
    async ({ apiKey, body, set }) => {
      const input = validateWriteBody(
        'projects',
        body,
        writeFields('projects', apiKey.moduleScopes),
        'create'
      );
      const project = await publicCreateProject(db, apiKey.organizationId, input);
      set.status = 201;
      return pickAllowed(project!, readFields('projects', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('projects', 'write'), body: t.Any() }
  )

  .patch(
    '/public/projects/:id',
    async ({ apiKey, params, body }) => {
      const input = validateWriteBody(
        'projects',
        body,
        writeFields('projects', apiKey.moduleScopes),
        'update'
      );
      const row = await publicUpdateProject(db, apiKey.organizationId, params.id, input);
      return pickAllowed(row, readFields('projects', apiKey.moduleScopes));
    },
    { beforeHandle: requireApiScope('projects', 'write'), body: t.Any() }
  );
