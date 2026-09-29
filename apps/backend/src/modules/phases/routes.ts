import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import {
  listPhases,
  getPhase,
  createPhase,
  updatePhase,
  deletePhase,
  addCardToPhase,
  removeCardFromPhase,
  listPhaseCards,
} from './service';

export const phaseRoutes = new Elysia({ prefix: '/phases' })
  .use(authPlugin)

  .get(
    '/projects/:projectId',
    async ({ params: { projectId }, user }) => {
      return listPhases(db, projectId, user.organizationId);
    },
    {
      params: t.Object({ projectId: t.String() }),
    }
  )

  .post(
    '/projects/:projectId',
    async ({ params: { projectId }, body, user }) => {
      return createPhase(db, projectId, body as any, user.organizationId);
    },
    {
      params: t.Object({ projectId: t.String() }),
      body: t.Object({
        name: t.String(),
        position: t.Number(),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    }
  )

  .get(
    '/:id',
    async ({ params: { id }, user }) => {
      return getPhase(db, id, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  .patch(
    '/:id',
    async ({ params: { id }, body, user }) => {
      return updatePhase(db, id, body as any, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        position: t.Optional(t.Number()),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal('not_started'),
            t.Literal('active'),
            t.Literal('completed'),
            t.Literal('blocked'),
          ])
        ),
      }),
    }
  )

  .delete(
    '/:id',
    async ({ params: { id }, user }) => {
      return deletePhase(db, id, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  .get(
    '/:id/cards',
    async ({ params: { id }, user }) => {
      return listPhaseCards(db, id, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
    }
  )

  .post(
    '/:id/cards',
    async ({ params: { id }, body, user }) => {
      return addCardToPhase(db, id, body.cardId, user.organizationId);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ cardId: t.String() }),
    }
  )

  .delete(
    '/:id/cards/:cardId',
    async ({ params: { id, cardId }, user }) => {
      return removeCardFromPhase(db, id, cardId, user.organizationId);
    },
    {
      params: t.Object({ id: t.String(), cardId: t.String() }),
    }
  );
