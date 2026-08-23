import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { getOrg, updateOrg, listMembers, inviteMember, updateMemberRole, removeMember } from './service';

/** Organization routes — /v1/orgs/* */
export const orgRoutes = new Elysia({ prefix: '/orgs', tags: ['Organizations'] })
  .use(authPlugin)

  // GET /v1/orgs/:orgId
  .use(requirePermission('org.read'))
  .get('/:orgId', async ({ params, set }) => {
    try {
      return await getOrg(db, params.orgId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  })

  // PATCH /v1/orgs/:orgId
  .use(requirePermission('org.update'))
  .patch(
    '/:orgId',
    async ({ params, body, set }) => {
      try {
        return await updateOrg(db, params.orgId, body);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        logoUrl: t.Optional(t.Nullable(t.String())),
        primaryColor: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  // GET /v1/orgs/:orgId/members
  .use(requirePermission('org.read'))
  .get(
    '/:orgId/members',
    async ({ params, query, set }) => {
      try {
        return await listMembers(db, params.orgId, {
          search: query?.search,
          limit: query?.limit ? parseInt(query.limit, 10) : undefined,
          offset: query?.offset ? parseInt(query.offset, 10) : undefined,
          role: query?.role,
        });
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      query: t.Optional(
        t.Object({
          search: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String()),
          role: t.Optional(t.String()),
        })
      ),
    }
  )

  // POST /v1/orgs/:orgId/members/invite
  .use(requirePermission('member.invite'))
  .post(
    '/:orgId/members/invite',
    async ({ params, body, user, set }) => {
      try {
        return await inviteMember(
          db,
          params.orgId,
          body.email,
          body.role,
          user.userId,
          body.name,
          body.workspaceIds
        );
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        role: t.String(),
        name: t.Optional(t.String()),
        workspaceIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PATCH /v1/orgs/:orgId/members/:memberId
  .use(requirePermission('member.role.update'))
  .patch(
    '/:orgId/members/:memberId',
    async ({ params, body, set }) => {
      try {
        return await updateMemberRole(db, params.orgId, params.memberId, body.role);
      } catch (err: any) {
        set.status = err.status || 500;
        return { error: err.message };
      }
    },
    {
      body: t.Object({ role: t.String() }),
    }
  )

  // DELETE /v1/orgs/:orgId/members/:memberId
  .use(requirePermission('member.remove'))
  .delete('/:orgId/members/:memberId', async ({ params, set }) => {
    try {
      await removeMember(db, params.orgId, params.memberId);
      return { success: true };
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  });
