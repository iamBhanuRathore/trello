import { eq, and, desc, asc, sql, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  chatAttachments,
  chatReactions,
  users,
  organizationMembers,
  projects,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { generatePresignedUploadUrl } from '../../lib/s3';

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

// ─── Channel Queries & Operations ─────────────────────────────────────────────

export async function createDirectMessage(
  db: Database,
  organizationId: string,
  currentUserId: string,
  targetUserId: string
) {
  if (currentUserId === targetUserId) {
    throw httpError(400, 'Cannot create direct message with yourself');
  }

  // Verify target is active org member
  const [targetMember] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, targetUserId),
        eq(organizationMembers.status, 'active')
      )
    )
    .limit(1);

  if (!targetMember) {
    throw httpError(404, 'Target user is not an active member of this organization');
  }

  // Check for existing DM channel between these 2 users
  const existingDm = await db
    .select({ channelId: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannelMembers.channelId, chatChannels.id))
    .where(
      and(
        eq(chatChannels.organizationId, organizationId),
        eq(chatChannels.type, 'direct'),
        inArray(chatChannelMembers.userId, [currentUserId, targetUserId])
      )
    )
    .groupBy(chatChannelMembers.channelId)
    .having(sql`count(distinct ${chatChannelMembers.userId}) = 2`)
    .limit(1);

  if (existingDm.length > 0 && existingDm[0]?.channelId) {
    return getChannelDetails(db, existingDm[0].channelId, currentUserId);
  }

  // Create new DM channel
  const [channel] = await db
    .insert(chatChannels)
    .values({
      organizationId,
      type: 'direct',
      createdBy: currentUserId,
    })
    .returning();

  if (!channel) throw httpError(500, 'Failed to create direct message channel');

  // Add both users
  await db.insert(chatChannelMembers).values([
    {
      channelId: channel.id,
      userId: currentUserId,
      role: 'member',
    },
    {
      channelId: channel.id,
      userId: targetUserId,
      role: 'member',
    },
  ]);

  // Broadcast new channel to target user's inbox
  await eventBus.broadcast(`user:inbox:${targetUserId}`, 'chat:channel_created', {
    channelId: channel.id,
    type: 'direct',
  });

  return getChannelDetails(db, channel.id, currentUserId);
}

export async function createGroupChannel(
  db: Database,
  organizationId: string,
  creatorId: string,
  input: {
    name: string;
    topic?: string;
    isPrivate?: boolean;
    memberUserIds?: string[];
    isAnnouncementOnly?: boolean;
    allowMemberInvites?: boolean;
    cardId?: string;
  }
) {
  if (!input.name || input.name.trim().length === 0) {
    throw httpError(400, 'Group channel name is required');
  }

  const channelType = input.cardId
    ? 'task_thread'
    : input.isPrivate
      ? 'group_private'
      : 'group_public';

  const [channel] = await db
    .insert(chatChannels)
    .values({
      organizationId,
      type: channelType,
      name: input.name.trim(),
      topic: input.topic?.trim() || null,
      createdBy: creatorId,
      isAnnouncementOnly: !!input.isAnnouncementOnly,
      allowMemberInvites: input.allowMemberInvites !== false,
      cardId: input.cardId || null,
    })
    .returning();

  if (!channel) throw httpError(500, 'Failed to create group channel');

  // Add creator as owner
  const membersToAdd: { channelId: string; userId: string; role: 'owner' | 'admin' | 'member' }[] =
    [
      {
        channelId: channel.id,
        userId: creatorId,
        role: 'owner',
      },
    ];

  // Add initial members if supplied
  const distinctOtherIds = Array.from(new Set(input.memberUserIds || [])).filter(
    (id) => id !== creatorId
  );

  for (const uid of distinctOtherIds) {
    membersToAdd.push({
      channelId: channel.id,
      userId: uid,
      role: 'member',
    });
  }

  await db.insert(chatChannelMembers).values(membersToAdd);

  // Notify added members
  for (const uid of distinctOtherIds) {
    await eventBus.broadcast(`user:inbox:${uid}`, 'chat:channel_created', {
      channelId: channel.id,
      name: channel.name,
      type: channel.type,
    });
  }

  return getChannelDetails(db, channel.id, creatorId);
}

export async function listUserChannels(db: Database, organizationId: string, userId: string) {
  // Query all channels where user is a member
  const memberships = await db
    .select({
      member: chatChannelMembers,
      channel: chatChannels,
    })
    .from(chatChannelMembers)
    .innerJoin(chatChannels, eq(chatChannelMembers.channelId, chatChannels.id))
    .where(
      and(
        eq(chatChannels.organizationId, organizationId),
        eq(chatChannelMembers.userId, userId),
        eq(chatChannels.isArchived, false)
      )
    )
    .orderBy(desc(chatChannelMembers.isPinned), desc(chatChannels.lastMessageAt));

  if (memberships.length === 0) return [];

  const channelIds = memberships.map((r) => r.channel.id);

  // Batched enrichments: 3 queries total regardless of channel count.
  // (The DB is remote with ~80ms RTT, so the old per-channel loop turned
  // this endpoint into seconds.) Unread counts join the reader's own
  // membership row so the per-channel lastReadAt cutoff applies inside SQL.
  const [unreadRows, memberCountRows, otherUserRows] = await Promise.all([
    db
      .select({
        channelId: chatMessages.channelId,
        count: sql<number>`count(*)`,
      })
      .from(chatMessages)
      .innerJoin(
        chatChannelMembers,
        and(
          eq(chatChannelMembers.channelId, chatMessages.channelId),
          eq(chatChannelMembers.userId, userId)
        )
      )
      .where(
        and(
          inArray(chatMessages.channelId, channelIds),
          sql`${chatMessages.userId} != ${userId}`,
          isNull(chatMessages.deletedAt),
          sql`${chatMessages.createdAt} > coalesce(${chatChannelMembers.lastReadAt}, '1970-01-01'::timestamp)`
        )
      )
      .groupBy(chatMessages.channelId),
    db
      .select({ channelId: chatChannelMembers.channelId, count: sql<number>`count(*)` })
      .from(chatChannelMembers)
      .where(inArray(chatChannelMembers.channelId, channelIds))
      .groupBy(chatChannelMembers.channelId),
    db
      .select({
        channelId: chatChannelMembers.channelId,
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      })
      .from(chatChannelMembers)
      .innerJoin(users, eq(chatChannelMembers.userId, users.id))
      .where(
        and(
          inArray(chatChannelMembers.channelId, channelIds),
          sql`${chatChannelMembers.userId} != ${userId}`
        )
      ),
  ]);

  const unreadByChannel = new Map(unreadRows.map((r) => [r.channelId, Number(r.count || 0)]));
  const memberCountByChannel = new Map(
    memberCountRows.map((r) => [r.channelId, Number(r.count || 0)])
  );
  const otherUserByChannel = new Map(otherUserRows.map((r) => [r.channelId, r]));

  return memberships.map(({ channel, member }) => {
    const otherUser = channel.type === 'direct' ? otherUserByChannel.get(channel.id) || null : null;
    return {
      id: channel.id,
      type: channel.type,
      name: channel.type === 'direct' ? otherUser?.name || 'Direct Message' : channel.name,
      topic: channel.topic,
      avatarUrl: channel.type === 'direct' ? otherUser?.avatarUrl : channel.avatarUrl,
      lastMessageAt: channel.lastMessageAt,
      lastMessagePreview: channel.lastMessagePreview,
      isAnnouncementOnly: channel.isAnnouncementOnly,
      allowMemberInvites: channel.allowMemberInvites,
      cardId: channel.cardId,
      unreadCount: unreadByChannel.get(channel.id) || 0,
      isPinned: member.isPinned,
      isMuted: member.isMuted,
      role: member.role,
      memberCount: memberCountByChannel.get(channel.id) || 1,
      otherUser,
    };
  });
}

export async function getChannelDetails(db: Database, channelId: string, currentUserId: string) {
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);

  if (!channel) throw httpError(404, 'Channel not found');

  // Verify current user membership or public channel
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(
      and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, currentUserId))
    )
    .limit(1);

  if (!membership && channel.type !== 'group_public') {
    throw httpError(403, 'Access denied: not a member of this channel');
  }

  // Get all members with user details
  const members = await db
    .select({
      id: chatChannelMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      role: chatChannelMembers.role,
      joinedAt: chatChannelMembers.joinedAt,
      isPinned: chatChannelMembers.isPinned,
      isMuted: chatChannelMembers.isMuted,
    })
    .from(chatChannelMembers)
    .innerJoin(users, eq(chatChannelMembers.userId, users.id))
    .where(eq(chatChannelMembers.channelId, channelId))
    .orderBy(asc(users.name));

  let otherUser: any = null;
  if (channel.type === 'direct') {
    otherUser = members.find((m) => m.userId !== currentUserId) || null;
  }

  let project: { id: string; name: string; key: string | null } | null = null;
  if (channel.projectId) {
    const [proj] = await db
      .select({ id: projects.id, name: projects.name, key: projects.key })
      .from(projects)
      .where(eq(projects.id, channel.projectId))
      .limit(1);
    project = proj || null;
  }

  return {
    ...channel,
    name: channel.type === 'direct' ? otherUser?.name || 'Direct Message' : channel.name,
    avatarUrl: channel.type === 'direct' ? otherUser?.avatarUrl : channel.avatarUrl,
    myRole: membership?.role || null,
    isPinned: membership?.isPinned || false,
    isMuted: membership?.isMuted || false,
    members,
    otherUser,
    project,
  };
}

/**
 * Shared groups discovery: returns count and list of mutual groups shared by two users
 */
export async function getSharedChannels(
  db: Database,
  organizationId: string,
  userAId: string,
  userBId: string
) {
  // Find group channels (not direct) where both users are members
  const mutualChannelRows = await db
    .select({
      id: chatChannels.id,
      name: chatChannels.name,
      type: chatChannels.type,
      avatarUrl: chatChannels.avatarUrl,
      topic: chatChannels.topic,
    })
    .from(chatChannels)
    .innerJoin(chatChannelMembers, eq(chatChannels.id, chatChannelMembers.channelId))
    .where(
      and(
        eq(chatChannels.organizationId, organizationId),
        sql`${chatChannels.type} != 'direct'`,
        inArray(chatChannelMembers.userId, [userAId, userBId])
      )
    )
    .groupBy(
      chatChannels.id,
      chatChannels.name,
      chatChannels.type,
      chatChannels.avatarUrl,
      chatChannels.topic
    )
    .having(sql`count(distinct ${chatChannelMembers.userId}) = 2`);

  // Count members for each shared channel
  const channelsWithCounts = await Promise.all(
    mutualChannelRows.map(async (ch) => {
      const [cnt] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatChannelMembers)
        .where(eq(chatChannelMembers.channelId, ch.id));
      return {
        ...ch,
        memberCount: Number(cnt?.count || 0),
      };
    })
  );

  return {
    count: channelsWithCounts.length,
    channels: channelsWithCounts,
  };
}

// ─── Channel Admin & Role Governance ─────────────────────────────────────────

export async function updateChannel(
  db: Database,
  channelId: string,
  actorId: string,
  input: {
    name?: string;
    topic?: string;
    isAnnouncementOnly?: boolean;
    allowMemberInvites?: boolean;
    isArchived?: boolean;
  }
) {
  const [member] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId)))
    .limit(1);

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw httpError(403, 'Permission denied: must be Channel Owner or Admin');
  }

  const updates: any = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.topic !== undefined) updates.topic = input.topic.trim();
  if (input.isAnnouncementOnly !== undefined) updates.isAnnouncementOnly = input.isAnnouncementOnly;
  if (input.allowMemberInvites !== undefined) updates.allowMemberInvites = input.allowMemberInvites;
  if (input.isArchived !== undefined) updates.isArchived = input.isArchived;

  const [updated] = await db
    .update(chatChannels)
    .set(updates)
    .where(eq(chatChannels.id, channelId))
    .returning();

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:channel_updated', updated);

  return updated;
}

export async function addChannelMember(
  db: Database,
  channelId: string,
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
  actorId: string,
  targetUserId: string,
  newRole: 'owner' | 'admin' | 'member'
) {
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
  actorId: string,
  targetUserId: string
) {
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

// ─── Messaging Operations ─────────────────────────────────────────────────────

export async function sendMessage(
  db: Database,
  channelId: string,
  userId: string,
  input: {
    body: string;
    parentMessageId?: string;
    replyToMessageId?: string;
    isAnnouncement?: boolean;
    attachmentIds?: string[];
  }
) {
  if (!input.body || input.body.trim().length === 0) {
    throw httpError(400, 'Message body cannot be empty');
  }

  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');

  // Verify membership
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);

  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');

  // Announcement check
  if (channel.isAnnouncementOnly && membership.role === 'member') {
    throw httpError(403, 'Only channel admins can post in this announcement channel');
  }

  const [message] = await db
    .insert(chatMessages)
    .values({
      channelId,
      userId,
      body: input.body.trim(),
      parentMessageId: input.parentMessageId || null,
      replyToMessageId: input.replyToMessageId || null,
      isAnnouncement: !!input.isAnnouncement,
    })
    .returning();

  if (!message) throw httpError(500, 'Failed to create message');

  // Link attachments if provided (scoped to this channel to prevent cross-channel hijack)
  if (input.attachmentIds && input.attachmentIds.length > 0) {
    await db
      .update(chatAttachments)
      .set({ messageId: message.id })
      .where(
        and(
          inArray(chatAttachments.id, input.attachmentIds),
          eq(chatAttachments.channelId, channelId)
        )
      );
  }

  // Update channel preview and timestamp if top-level
  if (!input.parentMessageId) {
    const preview = input.body.trim().slice(0, 120);
    await db
      .update(chatChannels)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: preview,
      })
      .where(eq(chatChannels.id, channelId));
  }

  // Update sender's read pointer
  await db
    .update(chatChannelMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)));

  // Fetch author details
  const [author] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Fetch quoted reply message if replyToMessageId is present
  let replyTo: { id: string; body: string; authorName: string } | null = null;
  if (input.replyToMessageId) {
    const [repliedMsg] = await db
      .select({
        id: chatMessages.id,
        body: chatMessages.body,
        authorName: users.name,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.userId, users.id))
      .where(eq(chatMessages.id, input.replyToMessageId))
      .limit(1);
    if (repliedMsg) {
      replyTo = repliedMsg;
    }
  }

  const fullMessage = {
    ...message,
    author,
    replyTo,
    attachments: [],
    reactions: [],
    replyCount: 0,
  };

  // Broadcast to channel topic
  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:message_created', fullMessage);

  // Notify channel members' inboxes for unread badge updates
  const members = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        sql`${chatChannelMembers.userId} != ${userId}`
      )
    );

  for (const m of members) {
    await eventBus.broadcast(`user:inbox:${m.userId}`, 'chat:unread_bump', {
      channelId,
      messageId: message.id,
      senderName: author?.name || 'Someone',
      preview: input.body.trim().slice(0, 80),
    });
  }

  // @[Name](userId) mentions → notify mentioned members only (never the author).
  try {
    const memberIds = new Set(members.map((m) => m.userId));
    const mentionedUserIds = [
      ...new Set(
        [...input.body.matchAll(/@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g)].map((m) => m[2] as string)
      ),
    ].filter((id) => id !== userId && memberIds.has(id));
    if (mentionedUserIds.length > 0) {
      eventBus.emit('internal', {
        event: 'chat.mentioned',
        payload: {
          channelId,
          messageId: message.id,
          mentionedUserIds,
          messagePreview: input.body.trim().slice(0, 140),
        },
        actorId: userId,
        organizationId: channel.organizationId as string,
      });
    }
  } catch {}

  return fullMessage;
}

export async function editMessage(
  db: Database,
  messageId: string,
  userId: string,
  newBody: string
) {
  if (!newBody || newBody.trim().length === 0) {
    throw httpError(400, 'Message body cannot be empty');
  }

  const [message] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);

  if (!message) throw httpError(404, 'Message not found');
  if (message.userId !== userId) {
    throw httpError(403, 'Permission denied: only author can edit message');
  }

  const [updated] = await db
    .update(chatMessages)
    .set({
      body: newBody.trim(),
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(chatMessages.id, messageId))
    .returning();

  await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:message_updated', updated);

  return updated;
}

export async function deleteMessage(db: Database, messageId: string, actorId: string) {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);

  if (!message) throw httpError(404, 'Message not found');

  // Check permissions: author OR channel owner/admin
  const isAuthor = message.userId === actorId;

  if (!isAuthor) {
    const [membership] = await db
      .select()
      .from(chatChannelMembers)
      .where(
        and(
          eq(chatChannelMembers.channelId, message.channelId),
          eq(chatChannelMembers.userId, actorId)
        )
      )
      .limit(1);

    const isGroupAdmin = membership?.role === 'owner' || membership?.role === 'admin';
    if (!isGroupAdmin) {
      throw httpError(
        403,
        'Permission denied: only message author or channel admins can delete messages'
      );
    }
  }

  // Soft-delete for enterprise audit trace
  await db
    .update(chatMessages)
    .set({
      deletedAt: new Date(),
      deletedBy: actorId,
    })
    .where(eq(chatMessages.id, messageId));

  await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:message_deleted', {
    id: messageId,
    channelId: message.channelId,
    deletedBy: actorId,
  });

  return { success: true };
}

export async function listMessages(
  db: Database,
  channelId: string,
  userId: string,
  cursor?: string,
  limit = 50
) {
  // Verify user has channel access
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);

  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');

  const conditions = [
    eq(chatMessages.channelId, channelId),
    isNull(chatMessages.parentMessageId), // Top-level stream messages
    isNull(chatMessages.deletedAt),
  ];

  if (cursor) {
    const cursorIso = new Date(cursor).toISOString();
    conditions.push(sql`${chatMessages.createdAt} < ${cursorIso}::timestamp`);
  }

  const rawMessages = await db
    .select({
      message: chatMessages,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      },
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  // Reverse so client receives chronological order
  const messagesChronological = rawMessages.reverse();

  // Attach attachments, reactions, and thread reply counts
  const enriched = await Promise.all(
    messagesChronological.map(async ({ message, author }) => {
      const attachmentsList = await db
        .select()
        .from(chatAttachments)
        .where(eq(chatAttachments.messageId, message.id));

      const reactionsList = await db
        .select({
          emoji: chatReactions.emoji,
          userId: chatReactions.userId,
        })
        .from(chatReactions)
        .where(eq(chatReactions.messageId, message.id));

      // Group reactions by emoji
      const reactionMap: Record<string, string[]> = {};
      for (const r of reactionsList) {
        const arr = reactionMap[r.emoji] ?? [];
        arr.push(r.userId);
        reactionMap[r.emoji] = arr;
      }

      const reactionsGrouped = Object.entries(reactionMap).map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        userIds,
        hasReacted: userIds.includes(userId),
      }));

      // Reply count
      const [replyResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(and(eq(chatMessages.parentMessageId, message.id), isNull(chatMessages.deletedAt)));

      // Quoted reply lookup
      let replyTo: { id: string; body: string; authorName: string } | null = null;
      if (message.replyToMessageId) {
        const [repliedMsg] = await db
          .select({
            id: chatMessages.id,
            body: chatMessages.body,
            authorName: users.name,
          })
          .from(chatMessages)
          .innerJoin(users, eq(chatMessages.userId, users.id))
          .where(eq(chatMessages.id, message.replyToMessageId))
          .limit(1);
        if (repliedMsg) {
          replyTo = repliedMsg;
        }
      }

      return {
        ...message,
        author,
        replyTo,
        attachments: attachmentsList,
        reactions: reactionsGrouped,
        replyCount: Number(replyResult?.count || 0),
      };
    })
  );

  return enriched;
}

export async function toggleReaction(
  db: Database,
  messageId: string,
  userId: string,
  emoji: string
) {
  const [existing] = await db
    .select()
    .from(chatReactions)
    .where(
      and(
        eq(chatReactions.messageId, messageId),
        eq(chatReactions.userId, userId),
        eq(chatReactions.emoji, emoji)
      )
    )
    .limit(1);

  const [message] = await db
    .select({ channelId: chatMessages.channelId })
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);

  if (!message) throw httpError(404, 'Message not found');

  if (existing) {
    await db.delete(chatReactions).where(eq(chatReactions.id, existing.id));
    await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:reaction_toggled', {
      messageId,
      channelId: message.channelId,
      userId,
      emoji,
      action: 'removed',
    });
    return { action: 'removed', emoji };
  } else {
    await db.insert(chatReactions).values({
      messageId,
      userId,
      emoji,
    });

    await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:reaction_toggled', {
      messageId,
      channelId: message.channelId,
      userId,
      emoji,
      action: 'added',
    });
    return { action: 'added', emoji };
  }
}

export async function listThreadReplies(db: Database, parentMessageId: string, userId: string) {
  const [parent] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, parentMessageId))
    .limit(1);

  if (!parent) throw httpError(404, 'Parent message not found');

  // Verify membership
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(
      and(eq(chatChannelMembers.channelId, parent.channelId), eq(chatChannelMembers.userId, userId))
    )
    .limit(1);

  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');

  const replies = await db
    .select({
      message: chatMessages,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      },
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(and(eq(chatMessages.parentMessageId, parentMessageId), isNull(chatMessages.deletedAt)))
    .orderBy(asc(chatMessages.createdAt));

  return Promise.all(
    replies.map(async ({ message, author }) => {
      let replyTo: { id: string; body: string; authorName: string } | null = null;
      if (message.replyToMessageId) {
        const [repliedMsg] = await db
          .select({
            id: chatMessages.id,
            body: chatMessages.body,
            authorName: users.name,
          })
          .from(chatMessages)
          .innerJoin(users, eq(chatMessages.userId, users.id))
          .where(eq(chatMessages.id, message.replyToMessageId))
          .limit(1);
        if (repliedMsg) {
          replyTo = repliedMsg;
        }
      }

      return {
        ...message,
        author,
        replyTo,
      };
    })
  );
}

export async function markChannelRead(db: Database, channelId: string, userId: string) {
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

export async function togglePinChannel(db: Database, channelId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);

  if (!membership) throw httpError(404, 'Not a member of this channel');

  const [updated] = await db
    .update(chatChannelMembers)
    .set({ isPinned: !membership.isPinned })
    .where(eq(chatChannelMembers.id, membership.id))
    .returning();

  return updated;
}

// ─── Channel ↔ Project Linking & Activity Feed ───────────────────────────────

async function requireChannelAdmin(db: Database, channelId: string, actorId: string) {
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');

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

export async function linkChannelProject(
  db: Database,
  channelId: string,
  actorId: string,
  organizationId: string,
  projectId: string
) {
  await requireChannelAdmin(db, channelId, actorId);

  const [project] = await db
    .select({ id: projects.id, name: projects.name, key: projects.key })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);

  if (!project) throw httpError(404, 'Project not found in this organization');

  const [updated] = await db
    .update(chatChannels)
    .set({ projectId: project.id })
    .where(eq(chatChannels.id, channelId))
    .returning();

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:channel_updated', updated);
  await postSystemMessage(
    db,
    channelId,
    actorId,
    `🔗 Linked project **${project.key ? `${project.key} — ` : ''}${project.name}** to this channel. Task activity will appear here.`
  );

  return { ...updated, project };
}

export async function unlinkChannelProject(db: Database, channelId: string, actorId: string) {
  await requireChannelAdmin(db, channelId, actorId);

  const [updated] = await db
    .update(chatChannels)
    .set({ projectId: null })
    .where(eq(chatChannels.id, channelId))
    .returning();

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:channel_updated', updated);
  await postSystemMessage(db, channelId, actorId, '🔓 Project unlinked from this channel.');

  return updated;
}

/**
 * Posts a system (activity-feed) message. Rendered as a centered pill,
 * not a regular chat bubble. Bypasses announcement-only restriction so
 * automation feedback always lands.
 */
export async function postSystemMessage(
  db: Database,
  channelId: string,
  actorId: string,
  body: string
) {
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  if (!channel) throw httpError(404, 'Channel not found');

  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, actorId)))
    .limit(1);
  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');

  const [message] = await db
    .insert(chatMessages)
    .values({ channelId, userId: actorId, body: body.trim(), isSystem: true })
    .returning();
  if (!message) throw httpError(500, 'Failed to post activity message');

  const [author] = await db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);

  const fullMessage = {
    ...message,
    author,
    replyTo: null,
    attachments: [],
    reactions: [],
    replyCount: 0,
  };

  await db
    .update(chatChannels)
    .set({ lastMessageAt: new Date(), lastMessagePreview: body.trim().slice(0, 120) })
    .where(eq(chatChannels.id, channelId));

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:message_created', fullMessage);

  const members = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        sql`${chatChannelMembers.userId} != ${actorId}`
      )
    );
  for (const m of members) {
    await eventBus.broadcast(`user:inbox:${m.userId}`, 'chat:unread_bump', {
      channelId,
      messageId: message.id,
      senderName: 'Activity',
      preview: body.trim().slice(0, 80),
    });
  }

  return fullMessage;
}

/**
 * Fan-out helper for project domain events (card created/moved/completed).
 * Never throws — activity feed must not break the underlying mutation.
 */
export async function notifyProjectChannels(
  db: Database,
  organizationId: string,
  projectId: string,
  actorId: string,
  text: string
): Promise<void> {
  try {
    const linked = await db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(
        and(
          eq(chatChannels.organizationId, organizationId),
          eq(chatChannels.projectId, projectId),
          eq(chatChannels.isArchived, false)
        )
      );
    for (const ch of linked) {
      await postSystemMessage(db, ch.id, actorId, text).catch(() => {});
    }
  } catch {
    // Activity feed is best-effort by design.
  }
}

// ─── Chat File Attachments ───────────────────────────────────────────────────

const CHAT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

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

// ─── Telegram Parity: Pin / Forward / Seen ────────────────────────────────────

async function requireChannelMembership(db: Database, channelId: string, userId: string) {
  const [membership] = await db
    .select()
    .from(chatChannelMembers)
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)))
    .limit(1);
  if (!membership) throw httpError(403, 'Access denied: not a member of this channel');
  return membership;
}

export async function pinMessage(
  db: Database,
  messageId: string,
  actorId: string,
  pinned: boolean
) {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!message) throw httpError(404, 'Message not found');
  if (message.parentMessageId) throw httpError(400, 'Thread replies cannot be pinned');
  if (message.isSystem) throw httpError(400, 'System messages cannot be pinned');

  const membership = await requireChannelMembership(db, message.channelId, actorId);
  // DMs + groups: any member can pin (Telegram behavior). Announcement-only
  // channels stay admin-gated.
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, message.channelId))
    .limit(1);
  if (channel?.isAnnouncementOnly && membership.role === 'member') {
    throw httpError(403, 'Only channel admins can pin in this channel');
  }

  const [updated] = await db
    .update(chatMessages)
    .set({
      isPinned: pinned,
      pinnedAt: pinned ? new Date() : null,
      pinnedBy: pinned ? actorId : null,
    })
    .where(eq(chatMessages.id, messageId))
    .returning();

  await eventBus.broadcast(`chat:channel:${message.channelId}`, 'chat:message_pinned', {
    messageId,
    channelId: message.channelId,
    isPinned: pinned,
    pinnedBy: actorId,
  });

  return updated;
}

export async function listPinnedMessages(db: Database, channelId: string, userId: string) {
  await requireChannelMembership(db, channelId, userId);
  const rows = await db
    .select({
      message: chatMessages,
      author: {
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      },
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.userId, users.id))
    .where(
      and(
        eq(chatMessages.channelId, channelId),
        eq(chatMessages.isPinned, true),
        isNull(chatMessages.deletedAt)
      )
    )
    .orderBy(desc(chatMessages.pinnedAt));
  return rows.map(({ message, author }) => ({ ...message, author }));
}

export async function forwardMessage(
  db: Database,
  sourceMessageId: string,
  targetChannelId: string,
  actorId: string
) {
  const [source] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, sourceMessageId), isNull(chatMessages.deletedAt)))
    .limit(1);
  if (!source) throw httpError(404, 'Source message not found');
  if (source.isSystem) throw httpError(400, 'System messages cannot be forwarded');

  await requireChannelMembership(db, source.channelId, actorId);

  const [target] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, targetChannelId))
    .limit(1);
  if (!target) throw httpError(404, 'Target channel not found');
  const targetMembership = await requireChannelMembership(db, targetChannelId, actorId);
  if (target.isAnnouncementOnly && targetMembership.role === 'member') {
    throw httpError(403, 'Only channel admins can post in this announcement channel');
  }

  const [copy] = await db
    .insert(chatMessages)
    .values({
      channelId: targetChannelId,
      userId: actorId,
      body: source.body,
      forwardedFromId: source.id,
    })
    .returning();
  if (!copy) throw httpError(500, 'Failed to forward message');

  // Clone attachments (new rows pointing at the copy, same file URLs)
  const sourceAttachments = await db
    .select()
    .from(chatAttachments)
    .where(eq(chatAttachments.messageId, source.id));
  for (const att of sourceAttachments) {
    await db.insert(chatAttachments).values({
      messageId: copy.id,
      channelId: targetChannelId,
      uploadedBy: actorId,
      fileName: att.fileName,
      fileUrl: att.fileUrl,
      fileSize: att.fileSize,
      fileType: att.fileType,
    });
  }

  const preview = source.body.trim().slice(0, 120);
  await db
    .update(chatChannels)
    .set({ lastMessageAt: new Date(), lastMessagePreview: preview })
    .where(eq(chatChannels.id, targetChannelId));

  const [author] = await db
    .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1);

  const fullMessage = {
    ...copy,
    author,
    replyTo: null,
    attachments: [],
    reactions: [],
    replyCount: 0,
  };
  await eventBus.broadcast(`chat:channel:${targetChannelId}`, 'chat:message_created', fullMessage);
  return fullMessage;
}

/**
 * Seen-by detail (Telegram "2 Seen"): members whose lastReadAt >= message.createdAt.
 * Excludes the author. Returns readers + total eligible so UI can render "N Seen".
 */
export async function getMessageSeenBy(db: Database, messageId: string, requesterId: string) {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);
  if (!message) throw httpError(404, 'Message not found');
  await requireChannelMembership(db, message.channelId, requesterId);

  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      lastReadAt: chatChannelMembers.lastReadAt,
    })
    .from(chatChannelMembers)
    .innerJoin(users, eq(chatChannelMembers.userId, users.id))
    .where(eq(chatChannelMembers.channelId, message.channelId));

  const msgTime = new Date(message.createdAt).getTime();
  const readers = members
    .filter((m) => m.userId !== message.userId)
    .filter((m) => m.lastReadAt && new Date(m.lastReadAt).getTime() >= msgTime)
    .map(({ lastReadAt, ...rest }) => rest);

  return { count: readers.length, readers, messageId, channelId: message.channelId };
}
