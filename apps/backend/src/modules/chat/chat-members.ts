import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  chatChannels,
  chatChannelMembers,
  organizationMembers,
  users,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { httpError, requireChannelMembership } from './chat-common';

export async function addChannelMember(
  db: Database,
  channelId: string,
  organizationId: string,
  actorId: string,
  targetUserId: string,
  role: 'admin' | 'member' = 'member'
) {
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');
  if (channel.organizationId !== organizationId) throw httpError(404, 'Channel not found');

  // Invited users must belong to the organization — no cross-org force-adds.
  const [targetMember] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, targetUserId),
        isNull(organizationMembers.deletedAt)
      )
    )
    .limit(1);
  if (!targetMember) throw httpError(403, 'User is not a member of this organization');

  const [actorMember] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId)))
    .limit(1);

  const isOwnerOrAdmin = actorMember?.role === 'owner' || actorMember?.role === 'admin';

  if (!isOwnerOrAdmin && !channel.allowMemberInvites) {
    throw httpError(403, 'Permission denied: only channel admins can invite new members');
  }

  // Only owner can assign admin role directly on invite
  const assignedRole = role === 'admin' && actorMember?.role === 'owner' ? 'admin' : 'member';

  const [newMember] = await db
    .insert(chatChannelMembers)
    .values({
      channelId,
      userId: targetUserId,
      role: assignedRole,
    })
    .onConflictDoNothing()
    .returning();

  if (newMember) {
    const [u] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:member_added', {
      ...newMember,
      user: u,
    });
    await eventBus.broadcast(`user:inbox:${targetUserId}`, 'chat:channel_created', {
      channelId,
    });
  }

  return newMember;
}

export async function updateMemberRole(
  db: Database,
  channelId: string,
  organizationId: string,
  actorId: string,
  targetUserId: string,
  newRole: 'owner' | 'admin' | 'member'
) {
  await requireChannelMembership(db, channelId, organizationId, actorId);
  const [actorMember] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId)))
    .limit(1);

  if (!actorMember || actorMember.role !== 'owner') {
    throw httpError(403, 'Permission denied: only the Channel Owner can manage member roles');
  }

  if (newRole === 'owner') {
    // Transfer ownership: promote target to owner, demote actor to admin
    await db
      .update(chatChannelMembers)
      .set({ role: 'owner' })
      .where(
        and(
          eq(chatChannelMembers.channelId, channelId),
          eq(chatChannelMembers.userId, targetUserId)
        )
      );

    await db
      .update(chatChannelMembers)
      .set({ role: 'admin' })
      .where(
        and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId))
      );

    await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:ownership_transferred', {
      newOwnerId: targetUserId,
      previousOwnerId: actorId,
    });

    return { success: true, newOwnerId: targetUserId };
  }

  const [updated] = await db
    .update(chatChannelMembers)
    .set({ role: newRole })
    .where(
      and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, targetUserId))
    )
    .returning();

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:member_role_updated', updated);

  return updated;
}

export async function removeMember(
  db: Database,
  channelId: string,
  organizationId: string,
  actorId: string,
  targetUserId: string
) {
  await requireChannelMembership(db, channelId, organizationId, actorId);
  const [actorMember] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId)))
    .limit(1);

  const isSelf = actorId === targetUserId;

  if (isSelf) {
    if (actorMember?.role === 'owner') {
      throw httpError(400, 'Channel owner cannot leave without transferring ownership first');
    }
  } else {
    if (!actorMember || (actorMember.role !== 'owner' && actorMember.role !== 'admin')) {
      throw httpError(403, 'Permission denied: must be Channel Owner or Admin to remove members');
    }

    const [targetMember] = await db
      .select()
      .from(chatChannelMembers)
      .where(
        and(
          eq(chatChannelMembers.channelId, channelId),
          eq(chatChannelMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (targetMember?.role === 'owner') {
      throw httpError(403, 'Cannot remove the Channel Owner');
    }

    if (actorMember.role === 'admin' && targetMember?.role === 'admin') {
      throw httpError(403, 'Channel Admins cannot remove other Admins');
    }
  }

  await db
    .delete(chatChannelMembers)
    .where(
      and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, targetUserId))
    );

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:member_removed', {
    channelId,
    userId: targetUserId,
    removedBy: actorId,
  });

  return { success: true };
}

export async function markChannelRead(
  db: Database,
  channelId: string,
  organizationId: string,
  userId: string
) {
  await requireChannelMembership(db, channelId, organizationId, userId);
  await db
    .update(chatChannelMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)));

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:read_receipt', {
    channelId,
    userId,
    readAt: new Date(),
  });

  return { success: true };
}
