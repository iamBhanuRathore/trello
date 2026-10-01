import { api, uploadMediaFile } from './api';

export interface ChatChannel {
  id: string;
  type: 'direct' | 'group_private' | 'group_public' | 'task_thread';
  name: string;
  topic?: string | null;
  avatarUrl?: string | null;
  lastMessageAt: string;
  lastMessagePreview?: string | null;
  isAnnouncementOnly: boolean;
  allowMemberInvites: boolean;
  cardId?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string; key?: string | null } | null;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
  otherUser?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    timezone?: string;
  } | null;
}

export interface ChatChannelMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  timezone?: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  isPinned: boolean;
  isMuted: boolean;
}

export interface ChatAttachment {
  id: string;
  messageId: string | null;
  channelId?: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
  status?: 'staged' | 'scanning' | 'ready' | 'blocked' | 'failed';
  scanStatus?: 'pending' | 'clean' | 'infected' | 'error' | 'skipped';
}

export interface ChatReaction {
  emoji: string;
  count: number;
  userIds: string[];
  hasReacted: boolean;
}

export interface ChatMessageItem {
  id: string;
  channelId: string;
  userId: string;
  body: string;
  parentMessageId?: string | null;
  replyToMessageId?: string | null;
  replyTo?: {
    id: string;
    body: string;
    authorName: string;
  } | null;
  status?: 'sending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  isEdited: boolean;
  isSystem?: boolean;
  isAnnouncement: boolean;
  isPinned?: boolean;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  forwardedFromId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  author: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    timezone?: string;
  };
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  replyCount: number;
}

export interface SeenByResult {
  count: number;
  readers: { userId: string; name: string; avatarUrl?: string | null }[];
  messageId: string;
  channelId: string;
}

export const chatService = {
  async listChannels(): Promise<ChatChannel[]> {
    const res = await api.get('/chat/channels');
    return res.data;
  },

  async createDirectMessage(targetUserId: string): Promise<any> {
    const res = await api.post('/chat/channels/direct', { targetUserId });
    return res.data;
  },

  async createGroupChannel(payload: {
    name: string;
    topic?: string;
    isPrivate?: boolean;
    memberUserIds?: string[];
    isAnnouncementOnly?: boolean;
    allowMemberInvites?: boolean;
    cardId?: string;
  }): Promise<any> {
    const res = await api.post('/chat/channels/group', payload);
    return res.data;
  },

  async getChannelDetails(channelId: string): Promise<any> {
    const res = await api.get(`/chat/channels/${channelId}`);
    return res.data;
  },

  async updateChannel(
    channelId: string,
    payload: {
      name?: string;
      topic?: string;
      isAnnouncementOnly?: boolean;
      allowMemberInvites?: boolean;
      isArchived?: boolean;
    }
  ): Promise<any> {
    const res = await api.patch(`/chat/channels/${channelId}`, payload);
    return res.data;
  },

  async togglePinChannel(channelId: string): Promise<any> {
    const res = await api.post(`/chat/channels/${channelId}/pin`);
    return res.data;
  },

  async addMember(
    channelId: string,
    userId: string,
    role: 'admin' | 'member' = 'member'
  ): Promise<any> {
    const res = await api.post(`/chat/channels/${channelId}/members`, { userId, role });
    return res.data;
  },

  async updateMemberRole(
    channelId: string,
    targetUserId: string,
    role: 'owner' | 'admin' | 'member'
  ): Promise<any> {
    const res = await api.patch(`/chat/channels/${channelId}/members/${targetUserId}`, { role });
    return res.data;
  },

  async removeMember(channelId: string, targetUserId: string): Promise<any> {
    const res = await api.delete(`/chat/channels/${channelId}/members/${targetUserId}`);
    return res.data;
  },

  async getSharedChannels(userId: string): Promise<{ count: number; channels: any[] }> {
    const res = await api.get('/chat/shared-channels', { params: { userId } });
    return res.data;
  },

  async listMessages(channelId: string, cursor?: string, limit = 50): Promise<ChatMessageItem[]> {
    const res = await api.get(`/chat/channels/${channelId}/messages`, {
      params: { cursor, limit: String(limit) },
    });
    return res.data;
  },

  async sendMessage(
    channelId: string,
    payload: {
      body: string;
      parentMessageId?: string;
      replyToMessageId?: string;
      isAnnouncement?: boolean;
      attachmentIds?: string[];
    }
  ): Promise<ChatMessageItem> {
    const res = await api.post(`/chat/channels/${channelId}/messages`, payload);
    return res.data;
  },

  async editMessage(messageId: string, body: string): Promise<any> {
    const res = await api.patch(`/chat/messages/${messageId}`, { body });
    return res.data;
  },

  async deleteMessage(messageId: string): Promise<any> {
    const res = await api.delete(`/chat/messages/${messageId}`);
    return res.data;
  },

  async toggleReaction(messageId: string, emoji: string): Promise<any> {
    const res = await api.post(`/chat/messages/${messageId}/reactions`, { emoji });
    return res.data;
  },

  async listThreadReplies(messageId: string): Promise<ChatMessageItem[]> {
    const res = await api.get(`/chat/messages/${messageId}/replies`);
    return res.data;
  },

  async markChannelRead(channelId: string): Promise<any> {
    const res = await api.post(`/chat/channels/${channelId}/read`);
    return res.data;
  },

  async pinMessage(messageId: string, pinned: boolean): Promise<any> {
    const res = await api.post(`/chat/messages/${messageId}/pin`, { pinned });
    return res.data;
  },

  async listPinned(channelId: string): Promise<ChatMessageItem[]> {
    const res = await api.get(`/chat/channels/${channelId}/pinned`);
    return res.data;
  },

  async forwardMessage(messageId: string, targetChannelId: string): Promise<ChatMessageItem> {
    const res = await api.post(`/chat/messages/${messageId}/forward`, { targetChannelId });
    return res.data;
  },

  async getSeenBy(messageId: string): Promise<SeenByResult> {
    const res = await api.get(`/chat/messages/${messageId}/seen`);
    return res.data;
  },

  async linkProject(channelId: string, projectId: string): Promise<any> {
    const res = await api.post(`/chat/channels/${channelId}/project`, { projectId });
    return res.data;
  },

  async unlinkProject(channelId: string): Promise<any> {
    const res = await api.delete(`/chat/channels/${channelId}/project`);
    return res.data;
  },

  async stageAttachment(
    channelId: string,
    file: File
  ): Promise<{ uploadUrl: string; attachment: ChatAttachment }> {
    // Unified media flow (5.5): request → PUT → confirm. Errors throw; the
    // caller toasts (no success noise — the staged chip is the feedback).
    const { uploadUrl, mediaId } = await uploadMediaFile('chat', channelId, file);
    return {
      uploadUrl,
      attachment: {
        id: mediaId,
        messageId: null,
        channelId,
        fileName: file.name,
        fileUrl: '',
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        createdAt: new Date().toISOString(),
        status: 'scanning',
        scanStatus: 'pending',
      },
    };
  },
};
