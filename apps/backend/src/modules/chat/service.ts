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
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';

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

  const result = [];

  for (const row of memberships) {
    const channel = row.channel;
    const member = row.member;

    // Calculate unread count
    const readCutoff = member.lastReadAt
      ? new Date(member.lastReadAt).toISOString()
      : '1970-01-01T00:00:00.000Z';
    const [unreadResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.channelId, channel.id),
          sql`${chatMessages.createdAt} > ${readCutoff}::timestamp`,
          sql`${chatMessages.userId} != ${userId}`,
          isNull(chatMessages.deletedAt)
        )
      );

    const unreadCount = Number(unreadResult?.count || 0);

    // If direct message, find other user
    let otherUser: any = null;
    if (channel.type === 'direct') {
      const [otherMember] = await db
        .select({
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
            eq(chatChannelMembers.channelId, channel.id),
            sql`${chatChannelMembers.userId} != ${userId}`
          )
        )
        .limit(1);

      otherUser = otherMember || null;
    }

    // Count total members
    const [membersCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.channelId, channel.id));

    result.push({
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
      unreadCount,
      isPinned: member.isPinned,
      isMuted: member.isMuted,
      role: member.role,
      memberCount: Number(membersCountRow?.count || 1),
      otherUser,
    });
  }

  return result;
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

  return {
    ...channel,
    name: channel.type === 'direct' ? otherUser?.name || 'Direct Message' : channel.name,
    avatarUrl: channel.type === 'direct' ? otherUser?.avatarUrl : channel.avatarUrl,
    myRole: membership?.role || null,
    isPinned: membership?.isPinned || false,
    isMuted: membership?.isMuted || false,
    members,
    otherUser,
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

  // Link attachments if provided
  if (input.attachmentIds && input.attachmentIds.length > 0) {
    await db
      .update(chatAttachments)
      .set({ messageId: message.id })
      .where(inArray(chatAttachments.id, input.attachmentIds));
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
