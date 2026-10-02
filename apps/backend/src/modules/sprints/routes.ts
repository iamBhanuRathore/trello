import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import {
  listSprints,
  getSprint,
  createSprint,
  updateSprint,
  deleteSprint,
  addCardToSprint,
  removeCardFromSprint,
  listSprintCards,
} from './service';

export const sprintRoutes = new Elysia({ prefix: '/sprints' })
  .use(authPlugin)

  // Note: /projects/:projectId/sprints conceptually belongs under a projects module or similar.
  // We'll define it here but the path is just a bit flat for MVP.
  .get(
    '/projects/:projectId',
    async ({ params: { projectId }, user }) => {
      return listSprints(db, projectId, user.organizationId);
    },
    {
      params: t.Object({ projectId: t.String() }),
      beforeHandle: requirePermission('project.read'),
    }
  )

  .post(
    '/projects/:projectId',
    async ({ params: { projectId }, body, user }) => {
      return createSprint(db, projectId, body as any, user.organizationId);
    },
    {
      params: t.Object({ projectId: t.String() }),
      body: t.Object({
        name: t.String(),
        type: t.Union([
          t.Literal('weekly'),
          t.Literal('biweekly'),
          t.Literal('monthly'),
          t.Literal('custom'),
        ]),
        startDate: t.String(),
        endDate: t.String(),
        goal: t.Optional(t.String()),
      }),
      beforeHandle: requirePermission('sprint.create'),
    }
  )

  .get(
    '/:id',
    async ({ params: { id }, user }) => {
      return getSprint(db, id, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
      beforeHandle: requirePermission('project.read'),
    }
  )

  .patch(
    '/:id',
    async ({ params: { id }, body, user }) => {
      return updateSprint(db, id, body as any, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        type: t.Optional(
          t.Union([
            t.Literal('weekly'),
            t.Literal('biweekly'),
            t.Literal('monthly'),
            t.Literal('custom'),
          ])
        ),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        goal: t.Optional(t.String()),
        status: t.Optional(
          t.Union([t.Literal('planned'), t.Literal('active'), t.Literal('completed')])
        ),
      }),
      beforeHandle: requirePermission('sprint.update'),
    }
  )

  .delete(
    '/:id',
    async ({ params: { id }, user }) => {
      return deleteSprint(db, id, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
      beforeHandle: requirePermission('sprint.delete'),
    }
  )

  .get(
    '/:id/cards',
    async ({ params: { id }, user }) => {
      return listSprintCards(db, id, {}, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
      beforeHandle: requirePermission('project.read'),
    }
  )

  .post(
    '/:id/cards',
    async ({ params: { id }, body, user }) => {
      return addCardToSprint(db, id, body.cardId, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ cardId: t.String() }),
      beforeHandle: requirePermission('sprint.update'),
    }
  )

  .delete(
    '/:id/cards/:cardId',
    async ({ params: { id, cardId }, user }) => {
      return removeCardFromSprint(db, id, cardId, user.organizationId);
    },
    {
      params: t.Object({ id: t.String(), cardId: t.String() }),
      beforeHandle: requirePermission('sprint.update'),
    }
  );
