import Elysia, { t } from 'elysia';
import { authPlugin } from '../../middleware/auth';
import { db } from '../../db/index';
import { listAutomations, createAutomation, updateAutomation, deleteAutomation } from './service';

export const automationRoutes = new Elysia({ prefix: '/boards/:id/automations', tags: ['Automations'] })
  .use(authPlugin)

  .get('/', async ({ params }) => {
    return await listAutomations(db, params.id);
  })

  .post('/', async ({ params, body }) => {
    return await createAutomation(db, params.id, body);
  }, {
    body: t.Object({
      name: t.String(),
      triggerJson: t.Any(),
      actionJson: t.Any(),
    })
  })

  .put('/:automationId', async ({ params, body, set }) => {
    try {
      return await updateAutomation(db, params.id, params.automationId, body);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      triggerJson: t.Optional(t.Any()),
      actionJson: t.Optional(t.Any()),
      isEnabled: t.Optional(t.Boolean()),
    })
  })

  .delete('/:automationId', async ({ params, set }) => {
    try {
      return await deleteAutomation(db, params.id, params.automationId);
    } catch (err: any) {
      set.status = err.status || 500;
      return { error: err.message };
    }
  });
