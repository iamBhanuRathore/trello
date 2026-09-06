import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import {
  listStageTemplates,
  getStageTemplateWithStages,
  createStageTemplate,
  updateStageTemplate,
  deleteStageTemplate,
  createStage,
  updateStage,
  deleteStage,
} from './service';

export const stageRoutes = new Elysia({ prefix: '/stages' })
  .use(authPlugin)

  // ─── Read Routes (Accessible to all org members with org.read) ───────────────
  .get(
    '/orgs/:orgId/templates',
    async ({ params: { orgId } }) => {
      return listStageTemplates(db, orgId);
    },
    {
      beforeHandle: requirePermission('org.read'),
      params: t.Object({ orgId: t.String() }),
    }
  )
  .get(
    '/templates/:id',
    async ({ params: { id } }) => {
      return getStageTemplateWithStages(db, id);
    },
    {
      beforeHandle: requirePermission('org.read'),
      params: t.Object({ id: t.String() }),
    }
  )

  // ─── Management Routes (Requires org.update / admin permissions) ─────────────
  .guard({ beforeHandle: requirePermission('org.update') }, (app) =>
    app
      .post(
        '/orgs/:orgId/templates',
        async ({ params: { orgId }, body }) => {
          return createStageTemplate(db, orgId, body);
        },
        {
          params: t.Object({ orgId: t.String() }),
          body: t.Object({
            name: t.String(),
            isDefault: t.Optional(t.Boolean()),
          }),
        }
      )
      .patch(
        '/templates/:id',
        async ({ params: { id }, body }) => {
          return updateStageTemplate(db, id, body);
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            name: t.Optional(t.String()),
            isDefault: t.Optional(t.Boolean()),
          }),
        }
      )
      .delete(
        '/templates/:id',
        async ({ params: { id } }) => {
          return deleteStageTemplate(db, id);
        },
        {
          params: t.Object({ id: t.String() }),
        }
      )
      .post(
        '/templates/:id/stages',
        async ({ params: { id }, body }) => {
          return createStage(db, id, body as any);
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            name: t.String(),
            color: t.String(),
            position: t.Number(),
            category: t.Union([
              t.Literal('not_started'),
              t.Literal('in_progress'),
              t.Literal('blocked'),
              t.Literal('done'),
            ]),
          }),
        }
      )
      .patch(
        '/:id',
        async ({ params: { id }, body }) => {
          return updateStage(db, id, body as any);
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            name: t.Optional(t.String()),
            color: t.Optional(t.String()),
            position: t.Optional(t.Number()),
            category: t.Optional(
              t.Union([
                t.Literal('not_started'),
                t.Literal('in_progress'),
                t.Literal('blocked'),
                t.Literal('done'),
              ])
            ),
          }),
        }
      )
      .delete(
        '/:id',
        async ({ params: { id } }) => {
          return deleteStage(db, id);
        },
        {
          params: t.Object({ id: t.String() }),
        }
      )
  );
