import React, { useState, useRef } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  MessageSquare,
  Pencil,
  Trash2,
  CheckSquare,
  CornerUpLeft,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { TaskPreviewCard } from './TaskPreviewCard';
import { CreateTaskFromMessageModal } from '../board/CreateTaskFromMessageModal';
import { PresenceBadge } from './PresenceBadge';
import type { ChatMessageItem } from '../../lib/chatService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { getInitials } from '../../utils/avatar';
import { MessageContextMenu } from './MessageContextMenu';

interface ChatMessageCardProps {
  message: ChatMessageItem;
  canModerate?: boolean;
  canPin?: boolean;
  isEditingExternal?: boolean;
  channelType?: 'direct' | 'group_private' | 'group_public' | 'task_thread';
  otherUserId?: string | null;
  channelMembers?: { userId: string; lastReadAt?: string }[];
  seenCount?: number;
  selectMode?: boolean;
  isSelected?: boolean;
  onCancelEdit?: () => void;
  onEdit?: (messageId: string, newBody: string) => void;
  onDelete?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onTogglePin?: (message: ChatMessageItem) => void;
  onOpenThread?: (message: ChatMessageItem) => void;
  onReply?: (message: ChatMessageItem) => void;
  onForward?: (message: ChatMessageItem) => void;
  onSelect?: (message: ChatMessageItem) => void;
  onToggleSelect?: (message: ChatMessageItem) => void;
  onTranslate?: (message: ChatMessageItem) => void;
  onShowSeen?: (message: ChatMessageItem) => void;
  onJumpToMessage?: (messageId: string) => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '🚀', '👀', '🎉'];

export const ChatMessageCard: React.FC<ChatMessageCardProps> = ({
  message,
  canModerate = false,
  canPin = true,
  isEditingExternal = false,
  channelType = 'group_public',
  otherUserId = null,
  channelMembers = [],
  seenCount = 0,
  selectMode = false,
  isSelected = false,
  onCancelEdit,
  onEdit,
  onDelete,
  onToggleReaction,
  onTogglePin,
  onOpenThread,
  onReply,
  onForward,
  onSelect,
  onToggleSelect,
  onTranslate,
  onShowSeen,
  onJumpToMessage,
}) => {
  const { user } = useAuthStore();
  const { presenceMap, readReceipts } = useChatStore();

  const isAuthor = message.userId === user?.id;
  const canDelete = isAuthor || canModerate;

  const [isEditingInternal, setIsEditingInternal] = useState(false);
  const isEditing = isEditingInternal || isEditingExternal;
  const [editBody, setEditBody] = useState(message.body);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  // Telegram-style context menu (right-click / long-press). Disabled for
  // system pills and unsynced optimistic/failed messages (actions would 404).
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const menuAvailable =
    !message.isSystem && !message.id.startsWith('temp-') && message.status !== 'failed';
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTouch = useRef<{ x: number; y: number } | null>(null);
  const suppressNextContextMenu = useRef(false);

  const openMenu = (x: number, y: number) => {
    if (!menuAvailable) return;
    setMenuAnchor({ x, y });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (suppressNextContextMenu.current) {
      suppressNextContextMenu.current = false;
      return;
    }
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    longPressTouch.current = { x: touch.clientX, y: touch.clientY };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      const origin = longPressTouch.current;
      if (!origin) return;
      suppressNextContextMenu.current = true;
      // Swallow the synthetic click some browsers fire after long-press.
      openMenu(origin.x, origin.y);
    }, 550);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const origin = longPressTouch.current;
    if (!touch || !origin) return;
    if (Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > 10) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTouch.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTouch.current = null;
  };

  const handleCopyText = () => {
    const text = message.body;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const imageAttachments = (message.attachments || []).filter((a) =>
    (a.fileType || '').startsWith('image/')
  );
  const hasMedia = imageAttachments.length > 0;
  const hasAttachments = (message.attachments || []).length > 0;

  const handleCopyMedia = async () => {
    const img = imageAttachments[0];
    if (!img) return;
    try {
      const res = await fetch(img.fileUrl);
      const blob = await res.blob();
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return;
      }
      window.open(img.fileUrl, '_blank', 'noopener');
    } catch {
      window.open(img.fileUrl, '_blank', 'noopener');
    }
  };

  const handleSaveAs = () => {
    for (const att of message.attachments || []) {
      const a = document.createElement('a');
      a.href = att.fileUrl;
      a.download = att.fileName || 'attachment';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Seen count fallback: derive from channel lastReadAt when feed didn't supply one
  // (Telegram "N Seen" parity for groups).
  const derivedSeenCount = React.useMemo(() => {
    if (seenCount > 0) return seenCount;
    if (channelType === 'direct' || isAuthor) {
      const msgTime = new Date(message.createdAt).getTime();
      const others =
        channelType === 'direct' && otherUserId
          ? channelMembers.filter((m) => m.userId === otherUserId)
          : (channelMembers || []).filter((m) => m.userId !== user?.id);
      return others.filter((m) => m.lastReadAt && new Date(m.lastReadAt).getTime() >= msgTime)
        .length;
    }
    return 0;
  }, [seenCount, channelType, channelMembers, message.createdAt, isAuthor, otherUserId, user?.id]);

  const fallbackCopy = (text: string) => {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.focus();
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    } catch {
      // Clipboard unavailable — menu already confirmed optimistically.
    }
  };

  React.useEffect(() => {
    if (isEditingExternal) {
      setEditBody(message.body);
    }
  }, [isEditingExternal, message.body]);

  const authorPresence = presenceMap[message.userId];

  // Parse task mentions: [task:ID:TITLE]
  const renderMessageContent = () => {
    const taskMentionRegex = /\[task:([a-f0-9-]+):([^\]]+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = taskMentionRegex.exec(message.body)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <MarkdownRenderer key={lastIndex} content={message.body.slice(lastIndex, match.index)} />
        );
      }

      const cardId = match[1];
      const cardTitle = match[2];
      parts.push(<TaskPreviewCard key={match.index} cardId={cardId} title={cardTitle} />);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.body.length) {
      parts.push(<MarkdownRenderer key={lastIndex} content={message.body.slice(lastIndex)} />);
    }

    return parts;
  };

  const handleSaveEdit = () => {
    if (!editBody.trim() || editBody.trim() === message.body) {
      setIsEditingInternal(false);
      onCancelEdit?.();
      return;
    }
    if (onEdit) onEdit(message.id, editBody.trim());
    setIsEditingInternal(false);
    onCancelEdit?.();
  };

  const handleCancelEdit = () => {
    setIsEditingInternal(false);
    setEditBody(message.body);
    onCancelEdit?.();
  };

  const formattedTime = () => {
    const date = new Date(message.createdAt);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
    return format(date, 'MMM d, h:mm a');
  };

  // Delivery status calculation for author's messages (WhatsApp/Telegram/Slack benchmark)
  const deliveryStatus = React.useMemo(() => {
    if (!isAuthor) return null;

    // 1. Sending or temporary optimistic outbox message
    if (message.status === 'sending' || message.id.startsWith('temp-')) {
      const isOnline = typeof navigator === 'undefined' || navigator.onLine;
      return {
        type: 'sending' as const,
        label: isOnline ? 'Sending...' : 'Queued (offline)',
      };
    }

    if (message.status === 'failed') {
      return {
        type: 'failed' as const,
        label: 'Failed to send — click to retry',
      };
    }

    const messageTime = new Date(message.createdAt).getTime();

    // 2. Direct message
    if (channelType === 'direct' && otherUserId) {
      const liveReadReceipt = readReceipts[message.channelId]?.[otherUserId];
      const memberRecord = channelMembers?.find((m) => m.userId === otherUserId);
      const lastReadTimeStr = liveReadReceipt || memberRecord?.lastReadAt;

      if (lastReadTimeStr && new Date(lastReadTimeStr).getTime() >= messageTime) {
        return { type: 'read' as const, label: 'Read' };
      }

      const isRecipientOnline =
        presenceMap[otherUserId]?.status && presenceMap[otherUserId]?.status !== 'offline';
      if (isRecipientOnline) {
        return { type: 'delivered' as const, label: 'Delivered' };
      }

      return { type: 'sent' as const, label: 'Sent' };
    }

    // 3. Group channel
    const otherMembers = (channelMembers || []).filter((m) => m.userId !== user?.id);
    const hasAnyRead = otherMembers.some((m) => {
      const liveReadReceipt = readReceipts[message.channelId]?.[m.userId];
      const readTime = liveReadReceipt || m.lastReadAt;
      return readTime && new Date(readTime).getTime() >= messageTime;
    });

    if (hasAnyRead) {
      return { type: 'read' as const, label: 'Read' };
    }

    const hasAnyOnline = otherMembers.some(
      (m) => presenceMap[m.userId]?.status && presenceMap[m.userId]?.status !== 'offline'
    );
    if (hasAnyOnline) {
      return { type: 'delivered' as const, label: 'Delivered' };
    }

    return { type: 'sent' as const, label: 'Sent' };
  }, [
    isAuthor,
    message.status,
    message.id,
    message.createdAt,
    message.channelId,
    channelType,
    otherUserId,
    readReceipts,
    channelMembers,
    presenceMap,
    user?.id,
  ]);

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative flex items-start gap-3 p-2.5 -mx-2 rounded-xl hover:bg-muted/30 transition-all duration-300 ${
        isSelected ? 'bg-primary/10 ring-1 ring-primary/40' : ''
      }`}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={selectMode ? () => onToggleSelect?.(message) : undefined}
    >
      {selectMode && (
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={isSelected ? 'Deselect message' : 'Select message'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(message);
          }}
          className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
            isSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-border bg-background text-transparent hover:border-primary'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}
      {menuAnchor && (
        <MessageContextMenu
          anchor={menuAnchor}
          canEdit={isAuthor}
          canDelete={canDelete}
          canPin={canPin && !message.parentMessageId}
          isPinned={!!message.isPinned}
          hasMedia={hasMedia}
          hasAttachments={hasAttachments}
          seenCount={derivedSeenCount}
          onClose={() => setMenuAnchor(null)}
          actions={{
            onReply: () => onReply && onReply(message),
            onTranslate: () => onTranslate && onTranslate(message),
            onCopy: handleCopyText,
            onCopyMedia: hasMedia ? handleCopyMedia : undefined,
            onSaveAs: hasAttachments ? handleSaveAs : undefined,
            onEdit: () => setIsEditingInternal(true),
            onPin: () => onTogglePin && onTogglePin(message),
            onForward: () => onForward && onForward(message),
            onSelect: () => onSelect && onSelect(message),
            onShowSeen: () => onShowSeen && onShowSeen(message),
            onDelete: () => onDelete && onDelete(message.id),
            onToggleReaction: (emoji) => onToggleReaction && onToggleReaction(message.id, emoji),
          }}
        />
      )}
      {message.isSystem ? (
        <div className="w-full flex justify-center py-0.5">
          <span className="inline-flex items-center gap-1.5 max-w-full px-3 py-1 rounded-full bg-muted/60 border border-border/60 text-[11px] text-muted-foreground text-center">
            <MarkdownRenderer content={message.body} />
            <span className="font-mono text-[10px] opacity-70 shrink-0">{formattedTime()}</span>
          </span>
        </div>
      ) : (
        <>
          {/* Author Avatar with Presence Indicator */}
          <div className="relative shrink-0 mt-0.5">
            {message.author?.avatarUrl ? (
              <img
                src={message.author.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                {getInitials(message.author?.name)}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5">
              <PresenceBadge status={authorPresence?.status || 'offline'} size="sm" />
            </span>
          </div>

          {/* Main Message Body */}
          <div className="min-w-0 flex-1 space-y-1">
            {/* Author Header */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-foreground truncate">
                {message.author?.name || 'Teammate'}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">{formattedTime()}</span>
              {authorPresence?.localTime && (
                <span className="text-[10px] text-muted-foreground/60 font-mono hidden sm:inline">
                  ({authorPresence.localTime})
                </span>
              )}
              {message.isEdited && (
                <span className="text-[10px] text-muted-foreground italic">(edited)</span>
              )}
              {message.isAnnouncement && (
                <span className="px-1.5 py-0.2 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[9px] border border-amber-500/20">
                  ANNOUNCEMENT
                </span>
              )}
              {message.isPinned && (
                <span className="px-1.5 py-0.2 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[9px] border border-blue-500/20">
                  PINNED
                </span>
              )}
              {message.forwardedFromId && (
                <span className="text-[10px] text-muted-foreground italic">forwarded</span>
              )}

              {/* Delivery Status Indicator for current user's sent messages */}
              {isAuthor && deliveryStatus && (
                <span
                  className="inline-flex items-center ml-0.5 select-none"
                  title={deliveryStatus.label}
                  aria-label={deliveryStatus.label}
                >
                  {deliveryStatus.type === 'sending' && (
                    <Clock className="w-3 h-3 text-muted-foreground/70 animate-pulse" />
                  )}
                  {deliveryStatus.type === 'sent' && (
                    <Check className="w-3.5 h-3.5 text-muted-foreground/70" />
                  )}
                  {deliveryStatus.type === 'delivered' && (
                    <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  {deliveryStatus.type === 'read' && (
                    <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                  )}
                  {deliveryStatus.type === 'failed' && (
                    <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                  )}
                </span>
              )}
            </div>

            {/* Content or Edit Mode */}
            {isEditing ? (
              <div className="space-y-2 mt-1">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelEdit();
                    }
                  }}
                  rows={2}
                  className="w-full p-2.5 text-xs rounded-xl bg-background border border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none shadow-inner"
                  autoFocus
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span>
                      escape to <strong className="text-foreground font-medium">cancel</strong>
                    </span>
                    <span>•</span>
                    <span>
                      enter to <strong className="text-foreground font-medium">save</strong>
                    </span>
                  </span>
                </div>
              </div>
            ) : (
              <>
                {/* Quoted Message Preview */}
                {message.replyTo && (
                  <button
                    type="button"
                    onClick={() => onJumpToMessage?.(message.replyTo!.id)}
                    className="w-full text-left flex items-start gap-2 px-2.5 py-1.5 mb-1.5 rounded-lg bg-muted/40 border-l-2 border-primary text-xs hover:bg-muted/70 transition-colors cursor-pointer group/quote"
                    title="Jump to quoted message"
                  >
                    <CornerUpLeft className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-[11px] text-primary block truncate">
                        {message.replyTo.authorName}
                      </span>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 truncate font-normal">
                        {message.replyTo.body}
                      </p>
                    </div>
                  </button>
                )}
                <div className="text-xs text-foreground/90 leading-relaxed break-words">
                  {renderMessageContent()}
                </div>
              </>
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {message.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border hover:bg-muted text-xs text-foreground transition-colors"
                  >
                    <span className="truncate max-w-xs font-medium">{att.fileName}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Reactions Tray */}
            {message.reactions && message.reactions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {message.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => onToggleReaction && onToggleReaction(message.id, r.emoji)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors cursor-pointer border ${
                      r.hasReacted
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold'
                        : 'bg-muted/40 border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <span>{r.emoji}</span>
                    <span className="text-[11px]">{r.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Reply in Thread Count Preview */}
            {message.replyCount > 0 && (
              <button
                type="button"
                onClick={() => onOpenThread && onOpenThread(message)}
                className="inline-flex items-center gap-1.5 mt-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <MessageSquare className="w-3 h-3" />
                <span>
                  {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
                </span>
              </button>
            )}
          </div>

          {/* Floating Hover Action Menu (hidden for system activity pills) */}
          {!message.isSystem && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-card border border-border shadow-md rounded-xl p-0.5 gap-0.5 z-10">
              {/* Quick Reaction Emojis */}
              <div className="flex items-center">
                {COMMON_EMOJIS.slice(0, 3).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onToggleReaction && onToggleReaction(message.id, emoji)}
                    className="p-1 hover:bg-muted rounded-lg text-xs transition-transform hover:scale-125 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="w-px h-3.5 bg-border mx-0.5" />

              {/* Reply (Quote message) */}
              <button
                type="button"
                onClick={() => onReply && onReply(message)}
                title="Reply"
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
              >
                <CornerUpLeft className="w-3.5 h-3.5" />
              </button>

              {/* Reply in thread */}
              <button
                type="button"
                onClick={() => onOpenThread && onOpenThread(message)}
                title="Reply in thread"
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>

              {/* Create Task From Message */}
              <button
                type="button"
                onClick={() => setIsCreateTaskOpen(true)}
                title="Create task from message"
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-primary rounded-lg transition-colors cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
              </button>

              {/* Edit Message (Author only) */}
              {isAuthor && (
                <button
                  type="button"
                  onClick={() => setIsEditingInternal(true)}
                  title="Edit message"
                  className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Delete Message (Author or Group/Org Admin) */}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete && onDelete(message.id)}
                  title="Delete message"
                  className="p-1.5 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Create Task Modal Integration */}
          {isCreateTaskOpen && !message.isSystem && (
            <CreateTaskFromMessageModal
              isOpen={isCreateTaskOpen}
              onClose={() => setIsCreateTaskOpen(false)}
              comment={{
                id: message.id,
                body: message.body,
                createdAt: message.createdAt,
                authorName: message.author?.name,
                authorEmail: message.author?.email,
                authorAvatarUrl: message.author?.avatarUrl || undefined,
              }}
              cardTitle="Chat Discussion"
            />
          )}
        </>
      )}
    </div>
  );
};
