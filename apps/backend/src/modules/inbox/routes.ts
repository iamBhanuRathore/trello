import { Elysia, t } from 'elysia';
import { db } from '../../db/index';
import { authPlugin } from '../../middleware/auth';
import { handleRouteError } from '../../lib/errors';
import {
  getInbox,
  snoozeInboxItem,
  archiveInboxItem,
  undoInboxItem,
  type InboxSource,
} from './service';

const SourceParam = t.Object({
  source: t.Union([
    t.Literal('notification'),
    t.Literal('dm'),
    t.Literal('task'),
    t.Literal('git'),
  ]),
  refId: t.String(),
});

export const inboxRoutes = new Elysia({ prefix: '/inbox', tags: ['Inbox'] })
  .use(authPlugin)
  // GET /v1/inbox — federated triage page (per-source caps, merged, composite cursor).
  .get(
    '/',
    async ({ user, query, set }) => {
      try {
        return await getInbox(db, user.userId, user.organizationId, {
          limit: query.limit ? Number(query.limit) : undefined,
          cursor: query.cursor,
        });
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { query: t.Object({ limit: t.Optional(t.String()), cursor: t.Optional(t.String()) }) }
  )
  // POST /v1/inbox/:source/:refId/snooze { until: '1h'|'3h'|'tomorrow'|ISO }
  .post(
    '/:source/:refId/snooze',
    async ({ params, body, user, set }) => {
      try {
        return await snoozeInboxItem(
          db,
          user.userId,
          user.organizationId,
          params.source as InboxSource,
          params.refId,
          body.until
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { params: SourceParam, body: t.Object({ until: t.String({ minLength: 1, maxLength: 64 }) }) }
  )
  // POST /v1/inbox/:source/:refId/archive (delegated per source) + undo.
  .post(
    '/:source/:refId/archive',
    async ({ params, user, set }) => {
      try {
        return await archiveInboxItem(
          db,
          user.userId,
          user.organizationId,
          params.source as InboxSource,
          params.refId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { params: SourceParam }
  )
  .post(
    '/:source/:refId/undo',
    async ({ params, user, set }) => {
      try {
        return await undoInboxItem(
          db,
          user.userId,
          user.organizationId,
          params.source as InboxSource,
          params.refId
        );
      } catch (err: unknown) {
        return handleRouteError(err, set);
      }
    },
    { params: SourceParam }
  );
