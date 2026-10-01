import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { chatAttachments, chatChannels, chatChannelMembers } from '../../db/schema/index';
import { findMedia, type MediaRow } from '../../lib/storage';
import { httpError } from '../organizations/service';

// Read-access assertion for GET /v1/media/:id/file (chat leg).
// Card media: org scoping happens in storage.presignedGet (404 fail-closed)
// and the route additionally requires `card.read`. Chat media: the caller must
// be a member of the owning channel; cross-org and non-member reads 404.
export async function assertMediaReadable(
  db: Database,
  organizationId: string,
  userId: string,
  mediaId: string
): Promise<MediaRow> {
  const media = await findMedia(db, mediaId);
  if (!media) throw httpError(404, 'Upload not found');
  if (media.kind === 'card') return media;
  const [row] = await db
    .select({ organizationId: chatChannels.organizationId })
    .from(chatAttachments)
    .innerJoin(chatChannels, eq(chatChannels.id, chatAttachments.channelId))
    .innerJoin(
      chatChannelMembers,
      and(
        eq(chatChannelMembers.channelId, chatAttachments.channelId),
        eq(chatChannelMembers.userId, userId)
      )
    )
    .where(eq(chatAttachments.id, mediaId))
    .limit(1);
  if (!row) throw httpError(404, 'Upload not found');
  if (row.organizationId !== organizationId) throw httpError(404, 'Upload not found');
  return media;
}
