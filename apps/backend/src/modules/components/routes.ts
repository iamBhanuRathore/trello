import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  createComponent,
  listComponents,
  updateComponent,
  deleteComponent,
  addComponentToCard,
  removeComponentFromCard,
  listCardComponents,
  setAssignmentRule,
  listAssignmentRules,
  deleteAssignmentRule,
  getAssignmentPolicy,
  updateAssignmentPolicy,
} from './service';

const ScopeBody = t.Object({
  projectId: t.Optional(t.String({ format: 'uuid' })),
  boardId: t.Optional(t.String({ format: 'uuid' })),
  componentId: t.Optional(t.String({ format: 'uuid' })),
});

/** Components + assignment rules — /v1/components/* */
export const componentRoutes = new Elysia({ prefix: '/components', tags: ['Components'] })
  .use(authPlugin)

  // GET /v1/components?boardId= — list board components
  .get(
    '/',
    async ({ query, user, set }) => {
      try {
        return await listComponents(db, user.organizationId, query.boardId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.read'),
      query: t.Object({ boardId: t.String({ format: 'uuid' }) }),
    }
  )

  // POST /v1/components — create (company/board admin)
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createComponent(db, user.organizationId, body.boardId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      body: t.Object({
        boardId: t.String({ format: 'uuid' }),
        name: t.String(),
        description: t.Optional(t.String()),
        leadUserId: t.Optional(t.String({ format: 'uuid' })),
      }),
    }
  )

  // PATCH /v1/components/:id
  .patch(
    '/:id',
    async ({ params: { id }, body, user, set }) => {
      try {
        return await updateComponent(db, user.organizationId, id, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        leadUserId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
      }),
    }
  )

  // DELETE /v1/components/:id
  .delete(
    '/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteComponent(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('board.update'),
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
    }
  )

  // GET /v1/components/cards/:cardId — components on a card
  .get(
    '/cards/:cardId',
    async ({ params: { cardId }, user, set }) => {
      try {
        return await listCardComponents(db, user.organizationId, cardId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      params: t.Object({ cardId: t.String({ format: 'uuid' }) }),
    }
  )

  // POST /v1/components/cards/:cardId — attach a component
  .post(
    '/cards/:cardId',
    async ({ params: { cardId }, body, user, set }) => {
      try {
        return await addComponentToCard(
          db,
          user.organizationId,
          cardId,
          body.componentId,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ cardId: t.String({ format: 'uuid' }) }),
      body: t.Object({ componentId: t.String({ format: 'uuid' }) }),
    }
  )

  // DELETE /v1/components/cards/:cardId/:componentId
  .delete(
    '/cards/:cardId/:componentId',
    async ({ params: { cardId, componentId }, user, set }) => {
      try {
        return await removeComponentFromCard(db, user.organizationId, cardId, componentId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({
        cardId: t.String({ format: 'uuid' }),
        componentId: t.String({ format: 'uuid' }),
      }),
    }
  )

  // GET /v1/components/assignment-rules — list org rules
  .get(
    '/assignment-rules',
    async ({ user, set }) => {
      try {
        return await listAssignmentRules(db, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('org.read') }
  )

  // PUT /v1/components/assignment-rules — upsert rule for a scope
  .put(
    '/assignment-rules',
    async ({ body, user, set }) => {
      try {
        const { projectId, boardId, componentId, ...targets } = body;
        return await setAssignmentRule(
          db,
          user.organizationId,
          { projectId, boardId, componentId },
          targets,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Composite([
        ScopeBody,
        t.Object({
          defaultRoleId: t.Optional(t.String({ format: 'uuid' })),
          defaultUserId: t.Optional(t.String({ format: 'uuid' })),
        }),
      ]),
    }
  )

  // DELETE /v1/components/assignment-rules/:id
  .delete(
    '/assignment-rules/:id',
    async ({ params: { id }, user, set }) => {
      try {
        return await deleteAssignmentRule(db, user.organizationId, id);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
    }
  )

  // GET /v1/components/assignment-policy — org allowUnassigned + strategy
  .get(
    '/assignment-policy',
    async ({ user, set }) => {
      try {
        return await getAssignmentPolicy(db, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('org.read') }
  )

  // PATCH /v1/components/assignment-policy — company admin config
  .patch(
    '/assignment-policy',
    async ({ body, user, set }) => {
      try {
        return await updateAssignmentPolicy(db, user.organizationId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('org.update'),
      body: t.Object({
        allowUnassigned: t.Optional(t.Boolean()),
        defaultAssigneeStrategy: t.Optional(t.Union([t.Literal('lead'), t.Literal('unassigned')])),
        defaultAssigneeId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
      }),
    }
  );
