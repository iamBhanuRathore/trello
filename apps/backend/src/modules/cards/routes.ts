import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import {
  createCard, getCard, updateCard, moveCard, archiveCard, deleteCard, cloneCard, listCards, listSubtasks,
  listComments, createComment,
  listAttachments, createAttachmentRecord, deleteAttachment,
  getCardLabels, attachLabelToCard, removeLabelFromCard,
  getCardChecklists, createChecklist, createChecklistItem, updateChecklistItem,
  assignUserToCard,
  removeUserFromCard,
  addParticipantToCard,
  removeParticipantFromCard,
  getCardParticipants,
  watchCard,
  unwatchCard,
  getCardWatchers,
  getMyTasks
} from './service';
import { generatePresignedUploadUrl } from '../../lib/s3';

/** Card routes — /v1/cards/* */
export const cardRoutes = new Elysia({ prefix: '/cards', tags: ['Cards'] })
  .use(authPlugin)

  // GET /v1/cards/my-tasks
  .get('/my-tasks', async ({ query, user, set }) => {
    try {
      return await getMyTasks(db, user.organizationId, user.userId, {
        filter: query?.filter,
        search: query?.search,
        workspaceId: query?.workspaceId,
        projectId: query?.projectId,
        status: query?.status,
        priority: query?.priority,
        limit: query?.limit ? parseInt(query.limit, 10) : 50,
        offset: query?.offset ? parseInt(query.offset, 10) : 0,
      });
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.read'),
    query: t.Optional(t.Object({
      filter: t.Optional(t.String()),
      search: t.Optional(t.String()),
      workspaceId: t.Optional(t.String()),
      projectId: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }))
  })

  // GET /v1/cards?listId=...
  .get('/', async ({ query, user, set }) => {
    try {
      if (!query.listId) throw new Error('listId query parameter is required');
      return await listCards(db, query.listId, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.read'),
    query: t.Object({ listId: t.String() })
  })

  // POST /v1/cards
  .post(
    '/',
    async ({ body, user, set }) => {
      try {
        return await createCard(db, user.organizationId, {
          listId: body.listId,
          title: body.title,
          description: body.description,
          position: body.position,
          parentCardId: body.parentCardId,
          dueDate: body.dueDate,
          stageId: body.stageId,
          storyPoints: body.storyPoints,
          estimateMinutes: body.estimateMinutes,
          assigneeId: body.assigneeId,
        });
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.create'),
      body: t.Object({
        listId: t.String({ format: 'uuid' }),
        title: t.String(),
        description: t.Optional(t.String()),
        position: t.Optional(t.Number()),
        parentCardId: t.Optional(t.String()),
        dueDate: t.Optional(t.String()),
        stageId: t.Optional(t.String({ format: 'uuid' })),
        storyPoints: t.Optional(t.Number()),
        estimateMinutes: t.Optional(t.Number()),
        assigneeId: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/cards/:id
  .get('/:id', async ({ params, user, set }) => {
    try {
      return await getCard(db, params.id, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.read'),
  })

  // PATCH /v1/cards/:id
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateCard(db, params.id, user.organizationId, body);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        dueDate: t.Optional(t.String()),
        stageId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
        storyPoints: t.Optional(t.Number()),
        estimateMinutes: t.Optional(t.Number()),
      }),
    }
  )

  // PATCH /v1/cards/:id/move
  .patch(
    '/:id/move',
    async ({ params, body, user, set }) => {
      try {
        return await moveCard(db, params.id, user.organizationId, body.listId, body.position);
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({ listId: t.String({ format: 'uuid' }), position: t.Number() }),
    }
  )

  // DELETE /v1/cards/:id
  .delete('/:id', async ({ params, user, set }) => {
    try {
      return await deleteCard(db, params.id, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.delete'),
  })

  // POST /v1/cards/:id/archive
  .post('/:id/archive', async ({ params, user, set }) => {
    try {
      return await archiveCard(db, params.id, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.delete'),
  })

  // POST /v1/cards/:id/clone
  .post(
    '/:id/clone',
    async ({ params, body, user, set }) => {
      try {
        return await cloneCard(db, params.id, user.organizationId, body || {});
      } catch (err: any) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.create'),
      body: t.Optional(
        t.Object({
          listId: t.Optional(t.String({ format: 'uuid' })),
          title: t.Optional(t.String()),
          parentCardId: t.Optional(t.String({ format: 'uuid' })),
          cloneChecklists: t.Optional(t.Boolean()),
          cloneLabels: t.Optional(t.Boolean()),
          cloneAssignees: t.Optional(t.Boolean()),
        })
      ),
    }
  )

  // Assignees (Single Primary Assignee)
  .post('/:id/assignees', async ({ params, body, user, set }) => {
    try {
      return await assignUserToCard(db, params.id, body.userId, user.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Object({ userId: t.String({ format: 'uuid' }) }),
  })
  .delete('/:id/assignees/:userId', async ({ params, set }) => {
    try {
      return await removeUserFromCard(db, params.id, params.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // Participants (Multiple Collaborators)
  .get('/:id/participants', async ({ params, set }) => {
    try {
      return await getCardParticipants(db, params.id);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })
  .post('/:id/participants', async ({ params, body, user, set }) => {
    try {
      return await addParticipantToCard(db, params.id, body.userId, user.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Object({ userId: t.String({ format: 'uuid' }) }),
  })
  .delete('/:id/participants/:userId', async ({ params, set }) => {
    try {
      return await removeParticipantFromCard(db, params.id, params.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // Comments
  .get('/:id/comments', async ({ params, set }) => {
    try {
      return await listComments(db, params.id);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })
  .post('/:id/comments', async ({ params, body, user, set }) => {
    try {
      return await createComment(db, params.id, user.userId, body.body, body.mentionedUserIds);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Object({
      body: t.String(),
      mentionedUserIds: t.Optional(t.Array(t.String())),
    }),
  })

  // Attachments
  .get('/:id/attachments', async ({ params, set }) => {
    try {
      return await listAttachments(db, params.id);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })
  .post('/:id/attachments', async ({ params, body, user, set }) => {
    try {
      const { uploadUrl, publicUrl } = await generatePresignedUploadUrl(user.organizationId, params.id, body.fileName, body.fileType);
      const attachment = await createAttachmentRecord(db, params.id, user.userId, publicUrl, body.fileName, body.fileType, body.sizeBytes);
      return { uploadUrl, attachment };
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Object({ fileName: t.String(), fileType: t.Optional(t.String()), sizeBytes: t.Optional(t.Number()) })
  })
  .delete('/:id/attachments/:attachmentId', async ({ params, user, set }) => {
    try {
      return await deleteAttachment(db, params.attachmentId, user.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // Labels
  .get('/:id/labels', async ({ params, set }) => {
    try {
      return await getCardLabels(db, params.id);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.read'),
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
  })
  .post('/:id/labels', async ({ params, body, user, set }) => {
    try {
      return await attachLabelToCard(db, params.id, body.labelId, user.userId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.update'),
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({ labelId: t.String({ format: 'uuid' }) }),
  })
  .delete('/:id/labels/:labelId', async ({ params, set }) => {
    try {
      return await removeLabelFromCard(db, params.id, params.labelId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    beforeHandle: requirePermission('card.update'),
    params: t.Object({ id: t.String({ format: 'uuid' }), labelId: t.String({ format: 'uuid' }) }),
  })

  // Checklists
  .get('/:id/checklists', async ({ params, set }) => {
    try {
      return await getCardChecklists(db, params.id);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })
  .post('/:id/checklists', async ({ params, body, set }) => {
    try {
      return await createChecklist(db, params.id, body.title, body.position);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Object({ title: t.String(), position: t.Number() })
  })
  .post('/checklists/:checklistId/items', async ({ params, body, set }) => {
    try {
      return await createChecklistItem(db, params.checklistId, body.text, body.position, body.assignedTo, body.dueDate ? new Date(body.dueDate) : undefined);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Object({ text: t.String(), position: t.Number(), assignedTo: t.Optional(t.String({ format: 'uuid' })), dueDate: t.Optional(t.String()) })
  })
  .patch('/checklist-items/:itemId', async ({ params, body, set }) => {
    try {
      return await updateChecklistItem(db, params.itemId, body);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Object({ text: t.Optional(t.String()), isDone: t.Optional(t.Boolean()), position: t.Optional(t.Number()) })
  })

  // Watchers
  .get('/:id/watchers', async ({ params, set }) => {
    try {
      return await getCardWatchers(db, params.id);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })
  .post('/:id/watch', async ({ params, user, body, set }) => {
    try {
      const targetUserId = (body as any)?.userId || user.userId;
      return await watchCard(db, params.id, targetUserId, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Optional(t.Object({ userId: t.Optional(t.String({ format: 'uuid' })) }))
  })
  .delete('/:id/watch', async ({ params, user, body, set }) => {
    try {
      const targetUserId = (body as any)?.userId || user.userId;
      return await unwatchCard(db, params.id, targetUserId, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  }, {
    body: t.Optional(t.Object({ userId: t.Optional(t.String({ format: 'uuid' })) }))
  })
  .delete('/:id/watch/:userId', async ({ params, user, set }) => {
    try {
      return await unwatchCard(db, params.id, params.userId, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  })

  // Subtasks
  .get('/:id/subtasks', async ({ params, user, set }) => {
    try {
      return await listSubtasks(db, params.id, user.organizationId);
    } catch (err: any) {
      return handleRouteError(err, set);
    }
  });
