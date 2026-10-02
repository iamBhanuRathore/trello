export interface ChatMessage {
  id: string;
  type?: 'message' | 'system';
  userId?: string;
  authorName?: string;
  authorEmail?: string;
  authorAvatarUrl?: string;
  body: string;
  createdAt: string;
  isEdited?: boolean;
  attachments?: Array<{
    id: string;
    fileName: string;
    url: string;
    fileType?: string;
  }>;
}

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  name: string;
  size: number;
  type: string;
}

export interface TaskChatPaneProps {
  cardId: string;
  cardTitle: string;
  boardId?: string;
  defaultListId?: string;
  membersCount?: number;
  comments: ChatMessage[];
  systemActivities?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
  participantUserIds?: Set<string>;
  onAddParticipant?: (userId: string) => void;
  onRemoveParticipant?: (userId: string) => void;
  onSendMessage: (body: string, mentionedUserIds: string[]) => Promise<void> | void;
  onEditMessage?: (commentId: string, newBody: string) => Promise<void> | void;
  onDeleteMessage?: (commentId: string) => Promise<void> | void;
  onUploadAttachment?: (file: File) => Promise<any> | any;
  onAddMemberClick?: () => void;
  isSending?: boolean;
}
