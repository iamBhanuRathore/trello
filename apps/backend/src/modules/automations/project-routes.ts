import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import { assertBoundedJson } from '../../lib/bounded-json';
import { AutomationRunStatus } from '@boardly/shared-types';
import {
  listProjectRules,
  getProjectRule,
  createProjectRule,
  updateProjectRule,
  deleteProjectRule,
  toggleProjectRule,
  listRuleRuns,
  dryRunRule,
  getAutomationContext,
} from './project-service';

const MANAGE = requirePermission('automation.manage');

/** Project automation routes — /v1/projects/:id/automation-rules/* */
export const projectAutomationRoutes = new Elysia({
  prefix: '/projects/:id/automation-rules',
  tags: ['ProjectAutomations'],
})
  .use(authPlugin)

  .get(
    '/',
    async ({ params, user, set }) => {
      try {
        return await listProjectRules(db, user.organizationId, params.id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: MANAGE }
  )

  .post(
    '/',
    async ({ params, body, user, set }) => {
      try {
        assertBoundedJson(body, { maxBytes: 200_000, maxKeys: 500 });
        assertBoundedJson((body as { trigger?: unknown }).trigger, {
          maxBytes: 20_000,
          maxKeys: 50,
        });
        assertBoundedJson((body as { condition?: unknown }).condition, {
          maxBytes: 20_000,
          maxKeys: 50,
        });
        assertBoundedJson((body as { actions?: unknown }).actions, {
          maxBytes: 150_000,
          maxKeys: 400,
        });
        return await createProjectRule(db, user.organizationId, params.id, body, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        isEnabled: t.Optional(t.Boolean()),
        trigger: t.Any(),
        condition: t.Optional(t.Any()),
        actions: t.Any(),
      }),
    }
  )

  .get(
    '/:ruleId',
    async ({ params, user, set }) => {
      try {
        return await getProjectRule(db, user.organizationId, params.id, params.ruleId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: MANAGE }
  )

  .put(
    '/:ruleId',
    async ({ params, body, user, set }) => {
      try {
        assertBoundedJson(body, { maxBytes: 200_000, maxKeys: 500 });
        return await updateProjectRule(db, user.organizationId, params.id, params.ruleId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        isEnabled: t.Optional(t.Boolean()),
        trigger: t.Optional(t.Any()),
        condition: t.Optional(t.Any()),
        actions: t.Optional(t.Any()),
      }),
    }
  )

  .delete(
    '/:ruleId',
    async ({ params, user, set }) => {
      try {
        return await deleteProjectRule(db, user.organizationId, params.id, params.ruleId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: MANAGE }
  )

  .post(
    '/:ruleId/toggle',
    async ({ params, body, user, set }) => {
      try {
        return await toggleProjectRule(
          db,
          user.organizationId,
          params.id,
          params.ruleId,
          body.isEnabled
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      body: t.Object({ isEnabled: t.Boolean() }),
    }
  )

  .get(
    '/:ruleId/runs',
    async ({ params, query, user, set }) => {
      try {
        return await listRuleRuns(db, user.organizationId, params.id, params.ruleId, {
          page: query.page ? Number(query.page) : 1,
          limit: query.limit ? Number(query.limit) : 20,
          status: query.status,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        status: t.Optional(t.Enum(AutomationRunStatus)),
      }),
    }
  )

  .post(
    '/:ruleId/test',
    async ({ params, body, user, set }) => {
      try {
        return await dryRunRule(db, user.organizationId, params.id, params.ruleId, body.cardId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      body: t.Object({ cardId: t.String({ format: 'uuid' }) }),
    }
  );

/** Builder context — /v1/projects/:id/automation-context (one call, no N+1). */
export const projectAutomationContextRoutes = new Elysia({
  prefix: '/projects/:id/automation-context',
  tags: ['ProjectAutomations'],
})
  .use(authPlugin)
  .get(
    '/',
    async ({ params, query, user, set }) => {
      try {
        return await getAutomationContext(
          db,
          user.organizationId,
          params.id,
          query.memberPage ? Number(query.memberPage) : 1,
          query.memberLimit ? Number(query.memberLimit) : 20
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: MANAGE,
      query: t.Object({
        memberPage: t.Optional(t.String()),
        memberLimit: t.Optional(t.String()),
      }),
    }
  );
