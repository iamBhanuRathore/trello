import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index';
import * as schema from '../../db/schema/index';
import { deleteTestOrg } from '../../test-utils';

/**
 * Chat test teardown.
 *
 * chat.test.ts creates 21 organizations per run (measured against
 * boardly_test, not estimated) and until recently kept none of them, so the
 * shared test database grew by 21 orgs, 21 owner users, 21 workspaces, 21
 * projects and every channel/message/attachment/reaction in them on every run.
 *
 * The delete order is not arbitrary. `chat_messages` is self-referential via
 * `parent_message_id`, `reply_to_message_id` and `forwarded_from_id`, so
 * Postgres' row-level referential-integrity check fires when the parent row goes
 * and fails while a reply still points at it — a single `DELETE` over the
 * channel's messages is not enough. Nulling those three columns first breaks the
 * cycle; then children go before parents:
 * reactions → attachments → messages → channel members → channels → workspaces
 * → projects → the sanctioned org root chain.
 *
 * Lives beside the suite rather than inside it: chat.test.ts is already the
 * largest test file in the repo, and AGENTS.md §10 is explicit about not growing
 * one file to hold every concern.
 */
export async function purgeChatOrg(db: Database, orgId: string): Promise<void> {
  const channelIds = db
    .select({ id: schema.chatChannels.id })
    .from(schema.chatChannels)
    .where(eq(schema.chatChannels.organizationId, orgId));

  const messageIds = db
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .where(inArray(schema.chatMessages.channelId, channelIds));

  await db.delete(schema.chatReactions).where(inArray(schema.chatReactions.messageId, messageIds));
  await db
    .delete(schema.chatAttachments)
    .where(inArray(schema.chatAttachments.messageId, messageIds));
  // Break the self-referential edges before deleting any message.
  await db
    .update(schema.chatMessages)
    .set({ parentMessageId: null, replyToMessageId: null, forwardedFromId: null })
    .where(inArray(schema.chatMessages.channelId, channelIds));
  await db.delete(schema.chatMessages).where(inArray(schema.chatMessages.channelId, channelIds));
  await db
    .delete(schema.chatChannelMembers)
    .where(inArray(schema.chatChannelMembers.channelId, channelIds));
  await db.delete(schema.chatChannels).where(eq(schema.chatChannels.organizationId, orgId));

  // The workspace/project rows hang off the org, not the channels — and
  // projects reference workspaces, so the workspace delete has to come second.
  // (Getting this backwards fails loudly on projects_workspace_id_workspaces_id_fk
  // rather than silently leaving rows behind.)
  await db.delete(schema.projects).where(eq(schema.projects.organizationId, orgId));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.organizationId, orgId));
  await deleteTestOrg(db, orgId);
}
