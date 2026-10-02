import { eq, and, desc, asc, sql, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index';
import {
  chatChannels,
  chatChannelMembers,
  chatMessages,
  users,
  organizationMembers,
  projects,
} from '../../db/schema/index';
import { eventBus } from '../../lib/event-bus';
import { httpError, requireChannelMembership, requireChannelAdmin } from './chat-common';
import { postSystemMessage } from './chat-messages';

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
    return getChannelDetails(db, existingDm[0].channelId, organizationId, currentUserId);
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

  return getChannelDetails(db, channel.id, organizationId, currentUserId);
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

  // Add initial members if supplied — restricted to org members so a
  // creator cannot force-add (and leak the channel to) cross-org users.
  const distinctOtherIds = Array.from(new Set(input.memberUserIds || [])).filter(
    (id) => id !== creatorId
  );
  let orgMemberIds = new Set<string>();
  if (distinctOtherIds.length > 0) {
    const rows = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          inArray(organizationMembers.userId, distinctOtherIds),
          isNull(organizationMembers.deletedAt)
        )
      );
    orgMemberIds = new Set(rows.map((r) => r.userId));
  }

  for (const uid of distinctOtherIds) {
    if (!orgMemberIds.has(uid)) continue;
    membersToAdd.push({
      channelId: channel.id,
      userId: uid,
      role: 'member',
    });
  }

  await db.insert(chatChannelMembers).values(membersToAdd);

  // Notify added members
  for (const uid of distinctOtherIds) {
    if (!orgMemberIds.has(uid)) continue;
    await eventBus.broadcast(`user:inbox:${uid}`, 'chat:channel_created', {
      channelId: channel.id,
      name: channel.name,
      type: channel.type,
    });
  }

  return getChannelDetails(db, channel.id, organizationId, creatorId);
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

export async function getChannelDetails(
  db: Database,
  channelId: string,
  organizationId: string,
  currentUserId: string
) {
  const [channel] = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);

  if (!channel) throw httpError(404, 'Channel not found');
  if (channel.organizationId !== organizationId) throw httpError(404, 'Channel not found');

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

export async function updateChannel(
  db: Database,
  channelId: string,
  organizationId: string,
  actorId: string,
  input: {
    name?: string;
    topic?: string;
    isAnnouncementOnly?: boolean;
    allowMemberInvites?: boolean;
    isArchived?: boolean;
  }
) {
  const [channel] = await db
    .select({ organizationId: chatChannels.organizationId })
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

export async function togglePinChannel(
  db: Database,
  channelId: string,
  organizationId: string,
  userId: string
) {
  await requireChannelMembership(db, channelId, organizationId, userId);
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

export async function linkChannelProject(
  db: Database,
  channelId: string,
  actorId: string,
  organizationId: string,
  projectId: string
) {
  await requireChannelAdmin(db, channelId, actorId, organizationId);

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

export async function unlinkChannelProject(
  db: Database,
  channelId: string,
  organizationId: string,
  actorId: string
) {
  await requireChannelAdmin(db, channelId, actorId, organizationId);

  const [updated] = await db
    .update(chatChannels)
    .set({ projectId: null })
    .where(eq(chatChannels.id, channelId))
    .returning();

  await eventBus.broadcast(`chat:channel:${channelId}`, 'chat:channel_updated', updated);
  await postSystemMessage(db, channelId, actorId, '🔓 Project unlinked from this channel.');

  return updated;
}
