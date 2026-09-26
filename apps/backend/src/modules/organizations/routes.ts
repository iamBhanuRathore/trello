import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import {
  getOrg,
  updateOrg,
  listMembers,
  countMembers,
  inviteMember,
  bulkInviteMembers,
  listPendingInvitations,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
  deactivateMember,
  reactivateMember,
  forceLogoutUser,
  getMemberActivitySummary,
  removeMember,
  previewInvitation,
  acceptInvitation,
} from './service';

/** Public invite routes (no auth required) */
export const inviteRoutes = new Elysia({ prefix: '/invite', tags: ['Invitations'] })

  // GET /v1/invite/preview/:token
  .get('/preview/:token', async ({ params, set }) => {
    try {
      return await previewInvitation(db, params.token);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  // POST /v1/invite/accept
  .post(
    '/accept',
    async ({ body, set }) => {
      try {
        return await acceptInvitation(db, body.token, body.name, body.password);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        token: t.String(),
        name: t.Optional(t.String()),
        password: t.Optional(t.String()),
      }),
    }
  );

/** Organization routes — /v1/orgs/* */
export const orgRoutes = new Elysia({ prefix: '/orgs', tags: ['Organizations'] })
  .use(authPlugin)

  // GET /v1/orgs/:orgId
  .get(
    '/:orgId',
    async ({ params, set }) => {
      try {
        return await getOrg(db, params.orgId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
    }
  )

  // PATCH /v1/orgs/:orgId
  .patch(
    '/:orgId',
    async ({ params, body, set }) => {
      try {
        return await updateOrg(db, params.orgId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        name: t.Optional(t.String()),
        logoUrl: t.Optional(t.Nullable(t.String())),
        primaryColor: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  // GET /v1/orgs/:orgId/members
  .get(
    '/:orgId/members',
    async ({ params, query, set }) => {
      try {
        const userIds = query?.userIds
          ? query.userIds
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : undefined;

        const options = {
          search: query?.search?.trim() || undefined,
          limit: query?.limit ? parseInt(query.limit, 10) : undefined,
          offset: query?.offset ? parseInt(query.offset, 10) : undefined,
          role: query?.role,
          status: query?.status,
          userIds,
        };

        const [members, totalCount] = await Promise.all([
          listMembers(db, params.orgId, options),
          countMembers(db, params.orgId, options),
        ]);

        if (set?.headers) {
          set.headers['x-total-count'] = String(totalCount);
          set.headers['access-control-expose-headers'] = 'x-total-count';
        }

        return members;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
      query: t.Optional(
        t.Object({
          search: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String()),
          role: t.Optional(t.String()),
          status: t.Optional(t.String()),
          userIds: t.Optional(t.String()),
        })
      ),
    }
  )

  // POST /v1/orgs/:orgId/members/invite
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
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.invite'),
      body: t.Object({
        email: t.String({ format: 'email' }),
        role: t.String(),
        name: t.Optional(t.String()),
        workspaceIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // POST /v1/orgs/:orgId/members/bulk-invite
  .post(
    '/:orgId/members/bulk-invite',
    async ({ params, body, user, set }) => {
      try {
        return await bulkInviteMembers(db, params.orgId, body.invites, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.invite'),
      body: t.Object({
        invites: t.Array(
          t.Object({
            email: t.String({ format: 'email' }),
            name: t.Optional(t.String()),
            role: t.Optional(t.String()),
            workspaceIds: t.Optional(t.Array(t.String())),
          })
        ),
      }),
    }
  )

  // GET /v1/orgs/:orgId/invitations
  .get(
    '/:orgId/invitations',
    async ({ params, set }) => {
      try {
        return await listPendingInvitations(db, params.orgId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
    }
  )

  // POST /v1/orgs/:orgId/invitations/:invitationId/resend
  .post(
    '/:orgId/invitations/:invitationId/resend',
    async ({ params, user, set }) => {
      try {
        return await resendInvitation(db, params.orgId, params.invitationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.invite'),
    }
  )

  // DELETE /v1/orgs/:orgId/invitations/:invitationId
  .delete(
    '/:orgId/invitations/:invitationId',
    async ({ params, user, set }) => {
      try {
        return await revokeInvitation(db, params.orgId, params.invitationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.invite'),
    }
  )

  // PATCH /v1/orgs/:orgId/members/:memberId
  .patch(
    '/:orgId/members/:memberId',
    async ({ params, body, user, set }) => {
      try {
        return await updateMemberRole(db, params.orgId, params.memberId, body.role, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.role.update'),
      body: t.Object({ role: t.String() }),
    }
  )

  // POST /v1/orgs/:orgId/members/:memberId/deactivate
  .post(
    '/:orgId/members/:memberId/deactivate',
    async ({ params, body, user, set }) => {
      try {
        return await deactivateMember(db, params.orgId, params.memberId, user.userId, body?.reason);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.remove'),
      body: t.Optional(
        t.Object({
          reason: t.Optional(t.String()),
        })
      ),
    }
  )

  // POST /v1/orgs/:orgId/members/:memberId/reactivate
  .post(
    '/:orgId/members/:memberId/reactivate',
    async ({ params, user, set }) => {
      try {
        return await reactivateMember(db, params.orgId, params.memberId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.role.update'),
    }
  )

  // POST /v1/orgs/:orgId/members/:memberId/force-logout
  .post(
    '/:orgId/members/:memberId/force-logout',
    async ({ params, user, set }) => {
      try {
        return await forceLogoutUser(db, params.orgId, params.memberId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.remove'),
    }
  )

  // GET /v1/orgs/:orgId/members/:memberId/summary
  .get(
    '/:orgId/members/:memberId/summary',
    async ({ params, set }) => {
      try {
        return await getMemberActivitySummary(db, params.orgId, params.memberId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.read'),
    }
  )

  // DELETE /v1/orgs/:orgId/members/:memberId
  .delete(
    '/:orgId/members/:memberId',
    async ({ params, user, set }) => {
      try {
        await removeMember(db, params.orgId, params.memberId, user.userId);
        return { success: true };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('member.remove'),
    }
  );
