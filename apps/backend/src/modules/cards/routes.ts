import Elysia, { t } from 'elysia';
import { authPlugin, requirePermission } from '../../middleware/auth';
import { db } from '../../db/index';
import { handleRouteError } from '../../lib/errors';
import {
  createCard,
  getCard,
  updateCard,
  moveCard,
  archiveCard,
  deleteCard,
  cloneCard,
  listCards,
  listSubtasks,
  listComments,
  createComment,
  updateComment,
  deleteComment,
  listAttachments,
  deleteAttachment,
  getCardLabels,
  attachLabelToCard,
  removeLabelFromCard,
  getCardChecklists,
  createChecklist,
  createBulkChecklistItems,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  updateChecklist,
  deleteChecklist,
  assignUserToCard,
  removeUserFromCard,
  addParticipantToCard,
  removeParticipantFromCard,
  getCardParticipants,
  watchCard,
  unwatchCard,
  getCardWatchers,
  getMyTasks,
  recordCardView,
  getCardViewers,
} from './service';
import path from 'path';
import { LOCAL_UPLOADS_DIR, isLocalUploadKeyAllowed } from '../../lib/s3';
import { requestUpload, findMedia } from '../../lib/storage';
import { env } from '../../lib/env';

/** Local-dev upload buffer — disabled outside development/test (open write + world-readable). */
const localUploadsEnabled = env.NODE_ENV !== 'production';

/** Serve-time key guard (single source: lib/s3). */
function safeLocalKey(raw: string): string | null {
  if (!isLocalUploadKeyAllowed(raw)) return null;
  return path.basename(raw).toLowerCase();
}

/** Attached to authed cardRoutes below — uploads require a signed-in org member. */
export const cardPublicRoutes = new Elysia({ prefix: '/cards', tags: ['Cards'] });

/** Card routes — /v1/cards/* */
export const cardRoutes = new Elysia({ prefix: '/cards', tags: ['Cards'] })
  .use(authPlugin)

  // GET /v1/cards/my-tasks
  .get(
    '/my-tasks',
    async ({ query, user, set }) => {
      try {
        return await getMyTasks(db, user.organizationId, user.userId, {
          filter: query?.filter,
          search: query?.search,
          workspaceId: query?.workspaceId,
          projectId: query?.projectId,
          status: query?.status,
          priority: query?.priority,
          limit: query?.limit ? Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100) : 50,
          offset: query?.offset ? Math.max(parseInt(query.offset, 10) || 0, 0) : 0,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      query: t.Optional(
        t.Object({
          filter: t.Optional(t.String()),
          search: t.Optional(t.String()),
          workspaceId: t.Optional(t.String()),
          projectId: t.Optional(t.String()),
          status: t.Optional(t.String()),
          priority: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String()),
        })
      ),
    }
  )

  // GET /v1/cards?listId=...
  .get(
    '/',
    async ({ query, user, set }) => {
      try {
        if (!query.listId) throw new Error('listId query parameter is required');
        return await listCards(db, query.listId, user.organizationId, { limit: query.limit });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      query: t.Object({ listId: t.String(), limit: t.Optional(t.String()) }),
    }
  )

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
          priorityId: body.priorityId,
          storyPoints: body.storyPoints,
          estimateMinutes: body.estimateMinutes,
          assigneeId: body.assigneeId,
          componentIds: body.componentIds,
          labelIds: body.labelIds,
          participantIds: body.participantIds,
          watcherIds: body.watcherIds,
          checklist: body.checklist,
          actorId: user.userId,
        });
      } catch (err: unknown) {
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
        priorityId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
        storyPoints: t.Optional(t.Number()),
        estimateMinutes: t.Optional(t.Number()),
        assigneeId: t.Optional(t.String()),
        componentIds: t.Optional(t.Array(t.String())),
        labelIds: t.Optional(t.Array(t.String())),
        participantIds: t.Optional(t.Array(t.String())),
        watcherIds: t.Optional(t.Array(t.String())),
        checklist: t.Optional(
          t.Object({
            title: t.Optional(t.String()),
            items: t.Optional(t.Array(t.String())),
          })
        ),
      }),
    }
  )

  // GET /v1/cards/:id
  .get(
    '/:id',
    async ({ params, user, set }) => {
      try {
        const card = await getCard(db, params.id, user.organizationId);
        // Fire-and-forget view ledger — never blocks the read.
        recordCardView(db, params.id, user.userId);
        return card;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
    }
  )

  // GET /v1/cards/:id/viewers - "Viewed by" ledger
  .get(
    '/:id/viewers',
    async ({ params, user, set }) => {
      try {
        return await getCardViewers(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
    }
  )

  // PATCH /v1/cards/:id
  .patch(
    '/:id',
    async ({ params, body, user, set }) => {
      try {
        return await updateCard(db, params.id, user.organizationId, body);
      } catch (err: unknown) {
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
        priorityId: t.Optional(t.Union([t.String({ format: 'uuid' }), t.Null()])),
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
        return await moveCard(
          db,
          params.id,
          user.organizationId,
          body.listId,
          body.position,
          user.userId,
          body.expectedVersion
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({
        listId: t.String({ format: 'uuid' }),
        position: t.Number(),
        expectedVersion: t.Optional(t.Number()),
      }),
    }
  )

  // DELETE /v1/cards/:id
  .delete(
    '/:id',
    async ({ params, user, set }) => {
      try {
        return await deleteCard(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.delete'),
    }
  )

  // POST /v1/cards/:id/archive
  .post(
    '/:id/archive',
    async ({ params, user, set }) => {
      try {
        return await archiveCard(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.delete'),
    }
  )

  // POST /v1/cards/:id/clone
  .post(
    '/:id/clone',
    async ({ params, body, user, set }) => {
      try {
        return await cloneCard(db, params.id, user.organizationId, body || {});
      } catch (err: unknown) {
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
  .post(
    '/:id/assignees',
    async ({ params, body, user, set }) => {
      try {
        return await assignUserToCard(db, params.id, user.organizationId, body.userId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.assign'),
      body: t.Object({ userId: t.String({ format: 'uuid' }) }),
    }
  )
  .delete(
    '/:id/assignees/:userId',
    async ({ params, user, set }) => {
      try {
        return await removeUserFromCard(
          db,
          params.id,
          user.organizationId,
          params.userId,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.assign') }
  )

  // Participants (Multiple Collaborators)
  .get(
    '/:id/participants',
    async ({ params, user, set }) => {
      try {
        return await getCardParticipants(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.read') }
  )
  .post(
    '/:id/participants',
    async ({ params, body, user, set }) => {
      try {
        return await addParticipantToCard(
          db,
          params.id,
          user.organizationId,
          body.userId,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({ userId: t.String({ format: 'uuid' }) }),
    }
  )
  .delete(
    '/:id/participants/:userId',
    async ({ params, user, set }) => {
      try {
        return await removeParticipantFromCard(
          db,
          params.id,
          user.organizationId,
          params.userId,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.update') }
  )

  // Comments
  .get(
    '/:id/comments',
    async ({ params, query, user, set }) => {
      try {
        return await listComments(db, params.id, user.organizationId, { limit: query.limit });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      query: t.Object({ limit: t.Optional(t.String()) }),
    }
  )
  .post(
    '/:id/comments',
    async ({ params, body, user, set }) => {
      try {
        return await createComment(
          db,
          params.id,
          user.organizationId,
          user.userId,
          body.body,
          body.mentionedUserIds
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({
        body: t.String(),
        mentionedUserIds: t.Optional(t.Array(t.String())),
      }),
    }
  )
  .patch(
    '/comments/:commentId',
    async ({ params, body, user, set }) => {
      try {
        return await updateComment(
          db,
          params.commentId,
          user.userId,
          user.organizationId,
          body.body,
          user.isPlatformAdmin
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ commentId: t.String({ format: 'uuid' }) }),
      body: t.Object({ body: t.String({ minLength: 1, maxLength: 10000 }) }),
    }
  )
  .delete(
    '/comments/:commentId',
    async ({ params, user, set }) => {
      try {
        return await deleteComment(
          db,
          params.commentId,
          user.userId,
          user.organizationId,
          user.isPlatformAdmin
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ commentId: t.String({ format: 'uuid' }) }),
    }
  )

  // Attachments (25 MB cap mirrors chat staging)
  .get(
    '/:id/attachments',
    async ({ params, query, user, set }) => {
      try {
        return await listAttachments(db, params.id, user.organizationId, { limit: query.limit });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      query: t.Object({ limit: t.Optional(t.String()) }),
    }
  )
  .post(
    '/:id/attachments',
    async ({ params, body, user, set }) => {
      try {
        // Thin wrapper over the unified media surface (5.5): same staged-row
        // + 5-min PUT contract, now scan-gated. Response shape unchanged.
        const { uploadUrl, mediaId } = await requestUpload(db, user.organizationId, user.userId, {
          kind: 'card',
          refId: params.id,
          fileName: body.fileName,
          declaredMime: body.fileType,
          sizeBytes: body.sizeBytes,
        });
        const media = await findMedia(db, mediaId);
        // Back-compat envelope: legacy clients expect `{ uploadUrl, attachment }`.
        const attachment = media
          ? {
              id: media.mediaId,
              cardId: params.id,
              fileName: media.fileName,
              url: media.url,
              fileType: media.mime,
              sizeBytes: media.sizeBytes,
              status: media.status,
              scanStatus: media.scanStatus,
            }
          : { id: mediaId };
        return { uploadUrl, attachment };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({
        fileName: t.String({ minLength: 1, maxLength: 255 }),
        fileType: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$',
          })
        ),
        sizeBytes: t.Optional(t.Number({ minimum: 0, maximum: 25 * 1024 * 1024 })),
      }),
    }
  )
  .delete(
    '/:id/attachments/:attachmentId',
    async ({ params, user, set }) => {
      try {
        return await deleteAttachment(db, params.attachmentId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.update') }
  )
  // Local-dev upload buffer (same paths as before, now behind auth + guards).
  .put(
    '/attachments/local-upload',
    async ({ query, request, set }) => {
      try {
        if (!localUploadsEnabled) {
          set.status = 404;
          return { error: 'Not found' };
        }
        const safeKey = safeLocalKey(String((query as any)?.key || ''));
        if (!safeKey) {
          set.status = 400;
          return { error: 'Missing or disallowed file key' };
        }
        const arrayBuffer = await request.arrayBuffer();
        if (arrayBuffer.byteLength > 25 * 1024 * 1024) {
          set.status = 400;
          return { error: 'File exceeds the 25 MB limit' };
        }
        await Bun.write(path.join(LOCAL_UPLOADS_DIR, safeKey), arrayBuffer);
        return { success: true };
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.update') }
  )
  .get(
    '/attachments/file/:key',
    async ({ params, set }) => {
      try {
        if (!localUploadsEnabled) {
          set.status = 404;
          return { error: 'Not found' };
        }
        const safeKey = safeLocalKey(params.key);
        if (!safeKey) {
          set.status = 404;
          return 'File not found';
        }
        const file = Bun.file(path.join(LOCAL_UPLOADS_DIR, safeKey));
        if (!(await file.exists())) {
          set.status = 404;
          return 'File not found';
        }
        // Force download + no sniffing: uploaded bytes never execute as page JS.
        set.headers['Content-Disposition'] = `attachment; filename="${safeKey}"`;
        set.headers['X-Content-Type-Options'] = 'nosniff';
        return file;
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.read') }
  )

  // Labels
  .get(
    '/:id/labels',
    async ({ params, user, set }) => {
      try {
        return await getCardLabels(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
    }
  )
  .post(
    '/:id/labels',
    async ({ params, body, user, set }) => {
      try {
        return await attachLabelToCard(
          db,
          params.id,
          user.organizationId,
          body.labelId,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({ labelId: t.String({ format: 'uuid' }) }),
    }
  )
  .delete(
    '/:id/labels/:labelId',
    async ({ params, user, set }) => {
      try {
        return await removeLabelFromCard(
          db,
          params.id,
          user.organizationId,
          params.labelId,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ id: t.String({ format: 'uuid' }), labelId: t.String({ format: 'uuid' }) }),
    }
  )

  // Checklists
  .get(
    '/:id/checklists',
    async ({ params, user, set }) => {
      try {
        return await getCardChecklists(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.read') }
  )
  .post(
    '/:id/checklists',
    async ({ params, body, user, set }) => {
      try {
        return await createChecklist(
          db,
          params.id,
          user.organizationId,
          body.title,
          body.position,
          user.userId,
          body.items
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({
        title: t.String(),
        position: t.Number(),
        items: t.Optional(t.Array(t.String())),
      }),
    }
  )
  .post(
    '/checklists/:checklistId/bulk-items',
    async ({ params, body, user, set }) => {
      try {
        return await createBulkChecklistItems(
          db,
          params.checklistId,
          user.organizationId,
          body.items,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ checklistId: t.String() }),
      body: t.Object({
        items: t.Array(t.String()),
      }),
    }
  )
  .post(
    '/checklists/:checklistId/items',
    async ({ params, body, user, set }) => {
      try {
        return await createChecklistItem(
          db,
          params.checklistId,
          user.organizationId,
          body.text,
          body.position,
          body.assignedTo,
          body.dueDate ? new Date(body.dueDate) : undefined,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      body: t.Object({
        text: t.String(),
        position: t.Number(),
        assignedTo: t.Optional(t.String({ format: 'uuid' })),
        dueDate: t.Optional(t.String()),
      }),
    }
  )
  .patch(
    '/checklist-items/:itemId',
    async ({ params, body, user, set }) => {
      try {
        return await updateChecklistItem(db, params.itemId, user.organizationId, body, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ itemId: t.String() }),
      body: t.Object({
        text: t.Optional(t.String()),
        isDone: t.Optional(t.Boolean()),
        position: t.Optional(t.Number()),
      }),
    }
  )
  .delete(
    '/checklist-items/:itemId',
    async ({ params, user, set }) => {
      try {
        return await deleteChecklistItem(db, params.itemId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ itemId: t.String() }),
    }
  )
  .patch(
    '/checklists/:checklistId',
    async ({ params, body, user, set }) => {
      try {
        return await updateChecklist(
          db,
          params.checklistId,
          user.organizationId,
          body.title,
          user.userId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ checklistId: t.String() }),
      body: t.Object({ title: t.String() }),
    }
  )
  .delete(
    '/checklists/:checklistId',
    async ({ params, user, set }) => {
      try {
        return await deleteChecklist(db, params.checklistId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.update'),
      params: t.Object({ checklistId: t.String() }),
    }
  )

  // Watchers
  .get(
    '/:id/watchers',
    async ({ params, user, set }) => {
      try {
        return await getCardWatchers(db, params.id, user.organizationId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.read') }
  )
  .post(
    '/:id/watch',
    async ({ params, user, body, set }) => {
      try {
        const targetUserId = (body as any)?.userId || user.userId;
        // Self-watch needs card.watch; targeting anyone else needs card.update.
        const denied = await requirePermission(
          targetUserId === user.userId ? 'card.watch' : 'card.update'
        )({ user, set } as any);
        if (denied) return denied;
        return await watchCard(db, params.id, targetUserId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      body: t.Optional(t.Object({ userId: t.Optional(t.String({ format: 'uuid' })) })),
    }
  )
  .delete(
    '/:id/watch',
    async ({ params, user, body, set }) => {
      try {
        const targetUserId = (body as any)?.userId || user.userId;
        const denied = await requirePermission(
          targetUserId === user.userId ? 'card.watch' : 'card.update'
        )({ user, set } as any);
        if (denied) return denied;
        return await unwatchCard(db, params.id, targetUserId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      body: t.Optional(t.Object({ userId: t.Optional(t.String({ format: 'uuid' })) })),
    }
  )
  .delete(
    '/:id/watch/:userId',
    async ({ params, user, set }) => {
      try {
        const denied = await requirePermission(
          params.userId === user.userId ? 'card.watch' : 'card.update'
        )({ user, set } as any);
        if (denied) return denied;
        return await unwatchCard(db, params.id, params.userId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.read') }
  )
  .post(
    '/:id/unwatch',
    async ({ params, user, body, set }) => {
      try {
        const targetUserId = (body as any)?.userId || user.userId;
        const denied = await requirePermission(
          targetUserId === user.userId ? 'card.watch' : 'card.update'
        )({ user, set } as any);
        if (denied) return denied;
        return await unwatchCard(db, params.id, targetUserId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      body: t.Optional(t.Object({ userId: t.Optional(t.String({ format: 'uuid' })) })),
    }
  )
  .delete(
    '/:id/unwatch',
    async ({ params, user, body, set }) => {
      try {
        const targetUserId = (body as any)?.userId || user.userId;
        const denied = await requirePermission(
          targetUserId === user.userId ? 'card.watch' : 'card.update'
        )({ user, set } as any);
        if (denied) return denied;
        return await unwatchCard(db, params.id, targetUserId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      body: t.Optional(t.Object({ userId: t.Optional(t.String({ format: 'uuid' })) })),
    }
  )
  .delete(
    '/:id/unwatch/:userId',
    async ({ params, user, set }) => {
      try {
        const denied = await requirePermission(
          params.userId === user.userId ? 'card.watch' : 'card.update'
        )({ user, set } as any);
        if (denied) return denied;
        return await unwatchCard(db, params.id, params.userId, user.organizationId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { beforeHandle: requirePermission('card.read') }
  )

  // Subtasks
  .get(
    '/:id/subtasks',
    async ({ params, query, user, set }) => {
      try {
        return await listSubtasks(db, params.id, user.organizationId, { limit: query.limit });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      beforeHandle: requirePermission('card.read'),
      query: t.Object({ limit: t.Optional(t.String()) }),
    }
  );
