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
  listPhaseCards
} from './service';

export const phaseRoutes = new Elysia({ prefix: '/phases' })
  .use(authPlugin)

  .get('/projects/:projectId', async ({ params: { projectId } }) => {
    return listPhases(db, projectId);
  }, {
    params: t.Object({ projectId: t.String() })
  })

  .post('/projects/:projectId', async ({ params: { projectId }, body }) => {
    return createPhase(db, projectId, body as any);
  }, {
    params: t.Object({ projectId: t.String() }),
    body: t.Object({
      name: t.String(),
      position: t.Number(),
      startDate: t.Optional(t.String()),
      endDate: t.Optional(t.String()),
    })
  })

  .get('/:id', async ({ params: { id } }) => {
    return getPhase(db, id);
  }, {
    params: t.Object({ id: t.String() })
  })

  .patch('/:id', async ({ params: { id }, body }) => {
    return updatePhase(db, id, body as any);
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String()),
      position: t.Optional(t.Number()),
      startDate: t.Optional(t.String()),
      endDate: t.Optional(t.String()),
      status: t.Optional(t.Union([t.Literal('not_started'), t.Literal('active'), t.Literal('completed'), t.Literal('blocked')]))
    })
  })

  .delete('/:id', async ({ params: { id } }) => {
    return deletePhase(db, id);
  }, {
    params: t.Object({ id: t.String() })
  })

  .get('/:id/cards', async ({ params: { id } }) => {
    return listPhaseCards(db, id);
  }, {
    params: t.Object({ id: t.String() })
  })

  .post('/:id/cards', async ({ params: { id }, body }) => {
    return addCardToPhase(db, id, body.cardId);
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ cardId: t.String() })
  })

  .delete('/:id/cards/:cardId', async ({ params: { id, cardId } }) => {
    return removeCardFromPhase(db, id, cardId);
  }, {
    params: t.Object({ id: t.String(), cardId: t.String() })
  });
