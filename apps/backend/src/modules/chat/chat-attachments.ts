import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { chatChannels, chatChannelMembers, chatAttachments } from '../../db/schema/index';
import { generatePresignedUploadUrl, isLocalUploadKeyAllowed, s3Client } from '../../lib/s3';
import { httpError } from './chat-common';

export const CHAT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export async function createChatAttachment(
  db: Database,
  channelId: string,
  userId: string,
  organizationId: string,
  input: { fileName: string; fileType?: string; fileSize?: number }
) {
  if (!input.fileName || input.fileName.trim().length === 0) {
    throw httpError(400, 'fileName is required');
  }
  if (input.fileSize && input.fileSize > CHAT_UPLOAD_MAX_BYTES) {
    throw httpError(400, 'File exceeds the 25 MB chat upload limit');
  }
  // Local-dev buffer serves bytes back: fail fast before the DB record exists.
  if (!s3Client && !isLocalUploadKeyAllowed(input.fileName)) {
    throw httpError(400, 'File type not allowed');
  }

  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(and(eq(chatChannels.id, channelId), eq(chatChannels.organizationId, organizationId)))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');

  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);
  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');

  if (channel.isAnnouncementOnly && membership.role === 'member') {
    throw httpError(403, 'Only channel admins can post in this announcement channel');
  }

  const { uploadUrl, publicUrl } = await generatePresignedUploadUrl(
    organizationId,
    channelId,
    input.fileName,
    input.fileType,
    `chat/${channelId}`
  );

  const [attachment] = await db
    .insert(chatAttachments)
    .values({
      messageId: null,
      channelId,
      uploadedBy: userId,
      fileName: input.fileName.trim(),
      fileUrl: publicUrl,
      fileSize: input.fileSize ?? 0,
      fileType: input.fileType || 'application/octet-stream',
    })
    .returning();

  if (!attachment) throw httpError(500, 'Failed to create attachment record');

  return { uploadUrl, attachment };
}
