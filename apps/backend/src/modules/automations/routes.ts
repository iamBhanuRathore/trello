import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import { assertBoundedJson } from '../../lib/bounded-json';
import { listAutomations, createAutomation, updateAutomation, deleteAutomation } from './service';

// Board-scoped legacy automations were auth-only: any org member could rewrite
// them. Same-permission family as project rules (automation.manage).
const MANAGE = requirePermission('automation.manage');

export const automationRoutes = new Elysia({
  prefix: '/boards/:id/automations',
  tags: ['Automations'],
})
  .use(authPlugin)

  .get(
    '/',
    async ({ params, set }) => {
      try {
        return await listAutomations(db, params.id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: MANAGE }
  )

  .post(
    '/',
    async ({ params, body, set }) => {
      try {
        assertBoundedJson(body.triggerJson, { maxBytes: 100_000, maxKeys: 200 });
        assertBoundedJson(body.actionJson, { maxBytes: 100_000, maxKeys: 200 });
        return await createAutomation(db, params.id, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        triggerJson: t.Any(),
        actionJson: t.Any(),
      }),
    }
  )

  .put(
    '/:automationId',
    async ({ params, body, set }) => {
      try {
        if (body.triggerJson !== undefined) {
          assertBoundedJson(body.triggerJson, { maxBytes: 100_000, maxKeys: 200 });
        }
        if (body.actionJson !== undefined) {
          assertBoundedJson(body.actionJson, { maxBytes: 100_000, maxKeys: 200 });
        }
        return await updateAutomation(db, params.id, params.automationId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        triggerJson: t.Optional(t.Any()),
        actionJson: t.Optional(t.Any()),
        isEnabled: t.Optional(t.Boolean()),
      }),
    }
  )

  .delete(
    '/:automationId',
    async ({ params, set }) => {
      try {
        return await deleteAutomation(db, params.id, params.automationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: MANAGE }
  );
