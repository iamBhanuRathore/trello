import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  createDirectMessage,
  createGroupChannel,
  listUserChannels,
  getChannelDetails,
  getSharedChannels,
  updateChannel,
  addChannelMember,
  updateMemberRole,
  removeMember,
  sendMessage,
  editMessage,
  deleteMessage,
  listMessages,
  toggleReaction,
  listThreadReplies,
  markChannelRead,
  togglePinChannel,
  linkChannelProject,
  unlinkChannelProject,
  createChatAttachment,
  pinMessage,
  listPinnedMessages,
  forwardMessage,
  getMessageSeenBy,
} from './service';

export const chatRoutes = new Elysia({ prefix: '/chat', tags: ['Chat'] })
  .use(authPlugin)

  // GET /v1/chat/channels - List channels for current user
  .get('/channels', async ({ user, set }) => {
    try {
      return await listUserChannels(db, user.organizationId, user.userId);
    } catch (err: unknown) {
      return handleRouteError(err, set);
    }
  })

  // POST /v1/chat/channels/direct - Create or retrieve 1-on-1 DM
  .post(
    '/channels/direct',
    async ({ body, user, set }) => {
      try {
        return await createDirectMessage(db, user.organizationId, user.userId, body.targetUserId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        targetUserId: t.String(),
      }),
    }
  )

  // POST /v1/chat/channels/group - Create group channel
  .post(
    '/channels/group',
    async ({ body, user, set }) => {
      try {
        return await createGroupChannel(db, user.organizationId, user.userId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      body: t.Object({
        name: t.String(),
        topic: t.Optional(t.String()),
        isPrivate: t.Optional(t.Boolean()),
        memberUserIds: t.Optional(t.Array(t.String())),
        isAnnouncementOnly: t.Optional(t.Boolean()),
        allowMemberInvites: t.Optional(t.Boolean()),
        cardId: t.Optional(t.String()),
      }),
    }
  )

  // GET /v1/chat/channels/:channelId - Channel details & member list
  .get(
    '/channels/:channelId',
    async ({ params: { channelId }, user, set }) => {
      try {
        return await getChannelDetails(db, channelId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
    }
  )

  // PATCH /v1/chat/channels/:channelId - Update channel settings (Owner / Admin)
  .patch(
    '/channels/:channelId',
    async ({ params: { channelId }, body, user, set }) => {
      try {
        return await updateChannel(db, channelId, user.userId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        topic: t.Optional(t.String()),
        isAnnouncementOnly: t.Optional(t.Boolean()),
        allowMemberInvites: t.Optional(t.Boolean()),
        isArchived: t.Optional(t.Boolean()),
      }),
    }
  )

  // POST /v1/chat/channels/:channelId/pin - Toggle channel pin state
  .post(
    '/channels/:channelId/pin',
    async ({ params: { channelId }, user, set }) => {
      try {
        return await togglePinChannel(db, channelId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
    }
  )

  // POST /v1/chat/channels/:channelId/members - Add member to channel
  .post(
    '/channels/:channelId/members',
    async ({ params: { channelId }, body, user, set }) => {
      try {
        return await addChannelMember(db, channelId, user.userId, body.userId, body.role as any);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
      body: t.Object({
        userId: t.String(),
        role: t.Optional(t.Union([t.Literal('admin'), t.Literal('member')])),
      }),
    }
  )

  // PATCH /v1/chat/channels/:channelId/members/:targetUserId - Update member role (Owner only)
  .patch(
    '/channels/:channelId/members/:targetUserId',
    async ({ params: { channelId, targetUserId }, body, user, set }) => {
      try {
        return await updateMemberRole(db, channelId, user.userId, targetUserId, body.role as any);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({
        channelId: t.String(),
        targetUserId: t.String(),
      }),
      body: t.Object({
        role: t.Union([t.Literal('owner'), t.Literal('admin'), t.Literal('member')]),
      }),
    }
  )

  // DELETE /v1/chat/channels/:channelId/members/:targetUserId - Remove member or leave
  .delete(
    '/channels/:channelId/members/:targetUserId',
    async ({ params: { channelId, targetUserId }, user, set }) => {
      try {
        return await removeMember(db, channelId, user.userId, targetUserId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({
        channelId: t.String(),
        targetUserId: t.String(),
      }),
    }
  )

  // GET /v1/chat/shared-channels - Query mutual groups shared with another user
  .get(
    '/shared-channels',
    async ({ query, user, set }) => {
      try {
        if (!query.userId) {
          set.status = 400;
          return { error: 'userId query parameter is required' };
        }
        return await getSharedChannels(db, user.organizationId, user.userId, query.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      query: t.Object({
        userId: t.String(),
      }),
    }
  )

  // GET /v1/chat/channels/:channelId/messages - List messages (chronological)
  .get(
    '/channels/:channelId/messages',
    async ({ params: { channelId }, query, user, set }) => {
      try {
        const limit = query.limit ? Number(query.limit) : 50;
        return await listMessages(db, channelId, user.userId, query.cursor, limit);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    }
  )

  // POST /v1/chat/channels/:channelId/messages - Send a message
  .post(
    '/channels/:channelId/messages',
    async ({ params: { channelId }, body, user, set }) => {
      try {
        return await sendMessage(db, channelId, user.userId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
      body: t.Object({
        body: t.String(),
        parentMessageId: t.Optional(t.String()),
        replyToMessageId: t.Optional(t.String()),
        isAnnouncement: t.Optional(t.Boolean()),
        attachmentIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PATCH /v1/chat/messages/:messageId - Edit message (Author only)
  .patch(
    '/messages/:messageId',
    async ({ params: { messageId }, body, user, set }) => {
      try {
        return await editMessage(db, messageId, user.userId, body.body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ messageId: t.String() }),
      body: t.Object({
        body: t.String(),
      }),
    }
  )

  // DELETE /v1/chat/messages/:messageId - Delete message (Author or Channel/Org Admin)
  .delete(
    '/messages/:messageId',
    async ({ params: { messageId }, user, set }) => {
      try {
        return await deleteMessage(db, messageId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ messageId: t.String() }),
    }
  )

  // POST /v1/chat/messages/:messageId/reactions - Toggle reaction
  .post(
    '/messages/:messageId/reactions',
    async ({ params: { messageId }, body, user, set }) => {
      try {
        return await toggleReaction(db, messageId, user.userId, body.emoji);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ messageId: t.String() }),
      body: t.Object({
        emoji: t.String(),
      }),
    }
  )

  // GET /v1/chat/messages/:messageId/replies - List thread replies
  .get(
    '/messages/:messageId/replies',
    async ({ params: { messageId }, user, set }) => {
      try {
        return await listThreadReplies(db, messageId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ messageId: t.String() }),
    }
  )

  // POST /v1/chat/messages/:messageId/pin - Pin or unpin a message (Telegram parity)
  .post(
    '/messages/:messageId/pin',
    async ({ params: { messageId }, body, user, set }) => {
      try {
        return await pinMessage(db, messageId, user.userId, body.pinned);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ messageId: t.String() }),
      body: t.Object({ pinned: t.Boolean() }),
    }
  )

  // POST /v1/chat/messages/:messageId/forward - Forward to another channel/DM
  .post(
    '/messages/:messageId/forward',
    async ({ params: { messageId }, body, user, set }) => {
      try {
        return await forwardMessage(db, messageId, body.targetChannelId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ messageId: t.String() }),
      body: t.Object({ targetChannelId: t.String() }),
    }
  )

  // GET /v1/chat/messages/:messageId/seen - Who has seen this message
  .get(
    '/messages/:messageId/seen',
    async ({ params: { messageId }, user, set }) => {
      try {
        return await getMessageSeenBy(db, messageId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ messageId: t.String() }),
    }
  )

  // GET /v1/chat/channels/:channelId/pinned - List pinned messages
  .get(
    '/channels/:channelId/pinned',
    async ({ params: { channelId }, user, set }) => {
      try {
        return await listPinnedMessages(db, channelId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
    }
  )

  // POST /v1/chat/channels/:channelId/read - Mark channel as read
  .post(
    '/channels/:channelId/read',
    async ({ params: { channelId }, user, set }) => {
      try {
        return await markChannelRead(db, channelId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
    }
  )

  // POST /v1/chat/channels/:channelId/project - Link a project (Owner/Admin)
  .post(
    '/channels/:channelId/project',
    async ({ params: { channelId }, body, user, set }) => {
      try {
        return await linkChannelProject(
          db,
          channelId,
          user.userId,
          user.organizationId,
          body.projectId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
      body: t.Object({ projectId: t.String() }),
    }
  )

  // DELETE /v1/chat/channels/:channelId/project - Unlink project (Owner/Admin)
  .delete(
    '/channels/:channelId/project',
    async ({ params: { channelId }, user, set }) => {
      try {
        return await unlinkChannelProject(db, channelId, user.userId);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
    }
  )

  // POST /v1/chat/channels/:channelId/attachments - Stage a file upload
  .post(
    '/channels/:channelId/attachments',
    async ({ params: { channelId }, body, user, set }) => {
      try {
        return await createChatAttachment(db, channelId, user.userId, user.organizationId, body);
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    {
      params: t.Object({ channelId: t.String() }),
      body: t.Object({
        fileName: t.String(),
        fileType: t.Optional(t.String()),
        fileSize: t.Optional(t.Number()),
      }),
    }
  );
