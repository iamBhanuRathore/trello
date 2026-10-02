import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index';
import { chatChannels, chatChannelMembers } from '../../db/schema/index';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function requireChannelMembership(
  db: Database,
  channelId: string,
  organizationId: string,
  userId: string
) {
  const [channel] = await db
    .select({ id: chatChannels.id, organizationId: chatChannels.organizationId })
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');
  if (channel.organizationId !== organizationId) throw httpError(404, 'Channel not found');
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);
  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');
  return membership;
}

export async function requireChannelAdmin(
  db: Database,
  channelId: string,
  actorId: string,
  organizationId: string
) {
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');
  if (channel.organizationId !== organizationId) throw httpError(404, 'Channel not found');

  const [member] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId)))
    .limit(1);

  if (!member) {
    throw httpError(403, 'Access denied: not a member of this channel');
  }

  if (channel.type === 'direct') {
    throw httpError(400, 'Direct message channels cannot be linked to a project');
  }

  if (member.role !== 'owner' && member.role !== 'admin') {
    throw httpError(403, 'Permission denied: must be Channel Owner or Admin');
  }

  return channel;
}
