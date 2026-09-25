import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Hash,
  Lock,
  Search,
  PanelRight,
  Pin,
  Megaphone,
  CheckSquare,
  ArrowDown,
  Loader2,
  Users,
  CornerUpLeft,
  X,
  WifiOff,
  Paperclip,
  FileText,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';
import {
  chatService,
  type ChatChannel,
  type ChatMessageItem,
  type ChatAttachment,
} from '../../lib/chatService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';
import { ChatMessageCard } from './ChatMessageCard';
import { TimezoneComposerBanner } from './TimezoneComposerBanner';
import { TaskMentionPickerModal } from './TaskMentionPickerModal';
import { getInitials } from '../../utils/avatar';

interface ChatFeedProps {
  channel: ChatChannel;
  canModerate?: boolean;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({ channel, canModerate = false }) => {
  const { user } = useAuthStore();
  const {
    setActiveThreadMessage,
    toggleDetailsPane,
    isDetailsPaneOpen,
    replyingToMessage,
    setReplyingToMessage,
    typingUsers,
    presenceMap,
    drafts,
    setDraft,
    outbox,
    enqueueOutbox,
    removeFromOutbox,
    processOutbox,
  } = useChatStore();
  const queryClient = useQueryClient();

  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOutbox();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processOutbox]);

  const [messageText, setMessageText] = useState(drafts[channel.id] || '');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [isSilentSend, setIsSilentSend] = useState(false);
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlusOpen, setIsPlusOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Close the + menu on outside click / Escape
  useEffect(() => {
    if (!isPlusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!plusMenuRef.current?.contains(e.target as Node)) setIsPlusOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPlusOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isPlusOpen]);

  // Sync draft on channel change
  useEffect(() => {
    setMessageText(drafts[channel.id] || '');
    setPendingAttachments([]);
  }, [channel.id, drafts]);

  // Persist draft on text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessageText(val);
    setDraft(channel.id, val);
  };

  // Fetch messages query
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: ['chat', 'messages', channel.id],
    queryFn: () => chatService.listMessages(channel.id, undefined, 50),
    refetchInterval: 6000,
  });

  // Fetch channel details (for members, roles, and read receipts)
  const { data: channelDetails } = useQuery({
    queryKey: ['chat', 'channel-details', channel.id],
    queryFn: () => chatService.getChannelDetails(channel.id),
    staleTime: 30000,
  });
  const channelMembers = channelDetails?.members || [];

  // Merge in pending outbox messages for this channel
  const mergedMessages = useMemo(() => {
    const existingIds = new Set(messages.map((m) => m.id));
    const channelOutbox = outbox
      .filter((o) => o.channelId === channel.id && !existingIds.has(o.tempId))
      .map((o): ChatMessageItem => ({
        id: o.tempId,
        channelId: o.channelId,
        userId: o.userId,
        body: o.body,
        parentMessageId: o.parentMessageId,
        replyToMessageId: o.replyToMessageId,
        replyTo: o.replyTo,
        status: o.status,
        isEdited: false,
        isAnnouncement: !!o.isAnnouncement,
        createdAt: o.createdAt,
        updatedAt: o.createdAt,
        author: {
          id: o.userId,
          name: o.author.name,
          email: o.author.email,
          avatarUrl: o.author.avatarUrl,
        },
        attachments: [],
        reactions: [],
        replyCount: 0,
      }));

    return [...messages, ...channelOutbox];
  }, [messages, outbox, channel.id]);

  // Mark channel read when entering or messages update
  useEffect(() => {
    if (channel.unreadCount > 0) {
      chatService.markChannelRead(channel.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
      });
    }
  }, [channel.id, channel.unreadCount, messages.length, queryClient]);

  // Scroll to bottom on initial load and message count change
  useEffect(() => {
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, showScrollBottom]);

  // Handle scroll detection for "Scroll to bottom" button
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isFarUp = scrollHeight - scrollTop - clientHeight > 180;
    setShowScrollBottom(isFarUp);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  // Edit message mutation
  const editMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) =>
      chatService.editMessage(messageId, body),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
    },
  });

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => chatService.deleteMessage(messageId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
    },
  });

  // Reaction mutation
  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      chatService.toggleReaction(messageId, emoji),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
    },
  });

  const scrollToMessage = (targetId: string) => {
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-primary/20', 'ring-1', 'ring-primary/40');
      setTimeout(() => {
        el.classList.remove('bg-primary/20', 'ring-1', 'ring-primary/40');
      }, 2000);
    }
  };

  const handleSendMessage = () => {
    const trimmed = messageText.trim();
    const stagedIds = pendingAttachments.map((a) => a.id);
    if (!trimmed && stagedIds.length === 0) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const currentReply = replyingToMessage;
    const replyTo = currentReply
      ? {
          id: currentReply.id,
          body: currentReply.body,
          authorName: currentReply.author?.name || 'Teammate',
        }
      : null;

    const optimisticMsg: ChatMessageItem = {
      id: tempId,
      channelId: channel.id,
      userId: user?.id || '',
      body: trimmed || '📎 Attachment',
      replyToMessageId: replyTo?.id,
      replyTo,
      status: isOnline ? 'sending' : 'queued',
      isEdited: false,
      isAnnouncement,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: user?.id || '',
        name: user?.name || 'You',
        email: user?.email || '',
        avatarUrl: user?.avatarUrl,
      },
      attachments: pendingAttachments,
      reactions: [],
      replyCount: 0,
    };

    // Immediately add to TanStack query cache for instantaneous UI feedback
    queryClient.setQueryData<ChatMessageItem[]>(['chat', 'messages', channel.id], (old) => [
      ...(old || []),
      optimisticMsg,
    ]);

    // Enqueue in Outbox
    enqueueOutbox({
      tempId,
      channelId: channel.id,
      userId: user?.id || '',
      body: trimmed || '📎 Attachment',
      parentMessageId: null,
      replyToMessageId: replyTo?.id,
      replyTo,
      isAnnouncement,
      attachmentIds: stagedIds.length > 0 ? stagedIds : undefined,
      createdAt: optimisticMsg.createdAt,
      author: optimisticMsg.author,
      status: isOnline ? 'sending' : 'queued',
      retryCount: 0,
    });

    // Instantly reset composer and keep keyboard focus
    setMessageText('');
    setPendingAttachments([]);
    setDraft(channel.id, '');
    setReplyingToMessage(null);
    setIsAnnouncement(false);
    scrollToBottom();
    textareaRef.current?.focus();

    // If online, dispatch immediately in background without blocking
    if (isOnline) {
      chatService
        .sendMessage(channel.id, {
          body: trimmed || '📎 Attachment',
          replyToMessageId: replyTo?.id,
          isAnnouncement,
          attachmentIds: stagedIds.length > 0 ? stagedIds : undefined,
        })
        .then((serverMsg) => {
          removeFromOutbox(tempId);
          queryClient.setQueryData<ChatMessageItem[]>(['chat', 'messages', channel.id], (old) =>
            old
              ? old.map((m) => (m.id === tempId ? { ...serverMsg, status: 'sent' } : m))
              : [serverMsg]
          );
          queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
        })
        .catch((err) => {
          if (!navigator.onLine || err.message?.includes('Network Error') || !err.response) {
            useChatStore.getState().updateOutboxStatus(tempId, 'queued');
          } else {
            useChatStore.getState().updateOutboxStatus(tempId, 'failed');
            toast.error(err.response?.data?.message || err.message || 'Failed to send message');
          }
        });
    }
  };

  const handleAttachFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (!isOnline) {
      toast.error('You are offline. File uploads require a connection.');
      return;
    }
    const oversized = files.find((f) => f.size > 25 * 1024 * 1024);
    if (oversized) {
      toast.error(`"${oversized.name}" exceeds the 25 MB chat upload limit.`);
      return;
    }
    setIsUploading(true);
    try {
      for (const file of files) {
        const { attachment } = await chatService.stageAttachment(channel.id, file);
        setPendingAttachments((prev) => [...prev, attachment]);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
      textareaRef.current?.focus();
    }
  };

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertFormatting('**');
      return;
    }
    if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertFormatting('*');
      return;
    }
    if (mod && e.key === '`') {
      e.preventDefault();
      insertFormatting('`');
      return;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'ArrowUp' && !messageText.trim()) {
      // Find latest message authored by current user that is not deleted
      const userLastMessage = [...mergedMessages]
        .reverse()
        .find((m) => m.userId === user?.id && !m.deletedAt);
      if (userLastMessage) {
        e.preventDefault();
        setEditingMessageId(userLastMessage.id);
      }
    } else if (e.key === 'Escape') {
      if (replyingToMessage) {
        setReplyingToMessage(null);
      } else {
        textareaRef.current?.blur();
      }
    }
  };

  // Insert markdown formatting
  const insertFormatting = (prefix: string, suffix = prefix) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const current = messageText;
    const selected = current.slice(start, end);
    const updated =
      current.slice(0, start) + prefix + (selected || 'text') + suffix + current.slice(end);
    setMessageText(updated);
    setDraft(channel.id, updated);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        start + prefix.length,
        end + prefix.length + (selected ? 0 : 4)
      );
    }, 0);
  };

  const handleSelectTask = (task: { id: string; title: string }) => {
    const taskEmbed = ` [task:${task.id}:${task.title}] `;
    setMessageText((prev) => prev + taskEmbed);
    setDraft(channel.id, messageText + taskEmbed);
    setIsTaskPickerOpen(false);
    textareaRef.current?.focus();
  };

  // Recipient presence if DM
  const recipientPresence = channel.otherUser ? presenceMap[channel.otherUser.id] : null;

  // Typing users
  const activeTyping = (typingUsers[channel.id] || []).filter(
    (t) => t.userId !== user?.id && Date.now() - t.timestamp < 3500
  );

  // Group messages with date dividers
  const groupedMessages = useMemo(() => {
    const filtered = searchQuery.trim()
      ? mergedMessages.filter((m) => m.body.toLowerCase().includes(searchQuery.toLowerCase()))
      : mergedMessages;

    const groups: { dateLabel: string; items: ChatMessageItem[] }[] = [];
    let currentDateLabel = '';
    let currentGroup: ChatMessageItem[] = [];

    for (const msg of filtered) {
      const msgDate = new Date(msg.createdAt);
      let label = format(msgDate, 'MMMM d, yyyy');
      if (isToday(msgDate)) label = 'Today';
      else if (isYesterday(msgDate)) label = 'Yesterday';

      if (label !== currentDateLabel) {
        if (currentGroup.length > 0) {
          groups.push({ dateLabel: currentDateLabel, items: currentGroup });
        }
        currentDateLabel = label;
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ dateLabel: currentDateLabel, items: currentGroup });
    }

    return groups;
  }, [messages, searchQuery]);

  // Check announcement permissions
  const isAnnouncementRestricted =
    channel.isAnnouncementOnly && channel.role !== 'owner' && channel.role !== 'admin';

  return (
    <div className="flex-1 flex flex-col h-full bg-background min-w-0 relative">
      {/* Header */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/60 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          {channel.type === 'direct' && channel.otherUser ? (
            <div className="relative shrink-0">
              {channel.otherUser.avatarUrl ? (
                <img
                  src={channel.otherUser.avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                  {getInitials(channel.otherUser.name)}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5">
                <PresenceBadge status={recipientPresence?.status || 'offline'} size="sm" />
              </span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {channel.type === 'group_private' ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Hash className="w-4 h-4" />
              )}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground truncate">{channel.name}</h2>
              {channel.isPinned && <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 truncate">
              {channel.type === 'direct' && recipientPresence ? (
                <>
                  <span className="capitalize">{recipientPresence.status}</span>
                  {recipientPresence.localTime && (
                    <>
                      <span>•</span>
                      <span>Local time: {recipientPresence.localTime}</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleDetailsPane}
                    className="hover:text-foreground hover:underline transition-colors cursor-pointer"
                    title="View channel members and details"
                  >
                    {channel.memberCount} members
                  </button>
                  {channel.topic && (
                    <>
                      <span>•</span>
                      <span className="truncate">{channel.topic}</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Search bar toggle */}
          {isSearching ? (
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg px-2 py-1 border border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="bg-transparent border-none text-xs text-foreground focus:outline-none w-32 md:w-48"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setIsSearching(false);
                  setSearchQuery('');
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsSearching(true)}
              aria-label="Search channel messages"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Toggle Details Pane */}
          <button
            type="button"
            onClick={toggleDetailsPane}
            aria-label="Toggle details panel"
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isDetailsPaneOpen
                ? 'bg-primary/10 text-primary font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
            }`}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
      >
        {isMessagesLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
              {channel.type === 'direct' ? (
                <Users className="w-6 h-6" />
              ) : (
                <Hash className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {channel.type === 'direct'
                ? `This is the start of your direct chat with ${channel.name}`
                : `Welcome to the #${channel.name} channel!`}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Send a message, mention a task, or share files to collaborate in real-time.
            </p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.dateLabel} className="space-y-3">
              {/* Date Divider */}
              <div className="relative flex items-center justify-center my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative bg-card px-3 py-1 rounded-full border border-border text-[11px] font-semibold text-muted-foreground shadow-xs">
                  {group.dateLabel}
                </div>
              </div>

              {/* Message Cards */}
              <div className="space-y-1">
                {group.items.map((msg) => (
                  <ChatMessageCard
                    key={msg.id}
                    message={msg}
                    isEditingExternal={editingMessageId === msg.id}
                    channelType={channel.type}
                    otherUserId={channel.otherUser?.id}
                    channelMembers={channelMembers}
                    onCancelEdit={() => setEditingMessageId(null)}
                    canModerate={
                      canModerate || channel.role === 'owner' || channel.role === 'admin'
                    }
                    onEdit={(id, body) => {
                      editMutation.mutate({ messageId: id, body });
                      setEditingMessageId(null);
                    }}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onToggleReaction={(id, emoji) =>
                      reactionMutation.mutate({ messageId: id, emoji })
                    }
                    onOpenThread={(parent) => setActiveThreadMessage(parent)}
                    onReply={(targetMsg) => {
                      setReplyingToMessage(targetMsg);
                      textareaRef.current?.focus();
                    }}
                    onJumpToMessage={scrollToMessage}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-32 right-6 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-all z-20 cursor-pointer"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Typing Indicator Bar */}
      {activeTyping.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-muted-foreground italic flex items-center gap-1.5 animate-pulse">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
          <span>
            {activeTyping.map((t) => t.userName).join(', ')}{' '}
            {activeTyping.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Off-Hours Banner for DMs */}
      {channel.type === 'direct' &&
        recipientPresence &&
        !recipientPresence.isWithinWorkingHours && (
          <div className="px-4 pt-2">
            <TimezoneComposerBanner
              otherUserPresence={recipientPresence}
              otherUserName={channel.name}
              isSilentSend={isSilentSend}
              onToggleSilentSend={() => setIsSilentSend(!isSilentSend)}
            />
          </div>
        )}

      {/* Composer Section */}
      <div className="p-4 border-t border-border bg-card/40 backdrop-blur-sm shrink-0">
        {isAnnouncementRestricted ? (
          <div className="p-3 rounded-xl bg-muted/40 border border-border text-center text-xs text-muted-foreground">
            📢 This channel is in announcement-only mode. Only channel admins can post messages.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-background focus-within:border-primary shadow-xs transition-colors">
            {/* Announcement active indicator */}
            {isAnnouncement && (
              <div className="flex items-center justify-between px-3 py-1 border-b border-amber-500/25 bg-amber-500/10 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <span className="inline-flex items-center gap-1.5">
                  <Megaphone className="w-3 h-3" />
                  Announcement — visible to everyone
                </span>
                <button
                  type="button"
                  onClick={() => setIsAnnouncement(false)}
                  className="p-0.5 rounded hover:bg-amber-500/20 cursor-pointer"
                  aria-label="Turn off announcement mode"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Replying to Message Preview Banner */}
            {replyingToMessage && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-primary/10 border-b border-primary/20 text-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2 min-w-0">
                  <CornerUpLeft className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-[11px] text-muted-foreground truncate">
                    Replying to{' '}
                    <strong className="text-foreground font-semibold">
                      {replyingToMessage.author?.name || 'Teammate'}
                    </strong>
                    : &ldquo;{replyingToMessage.body}&rdquo;
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingToMessage(null)}
                  title="Cancel reply (Esc)"
                  className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer shrink-0 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Offline Notification Banner */}
            {!isOnline && (
              <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                <span>
                  You are offline. Messages will be queued and sent automatically when connection
                  returns.
                </span>
              </div>
            )}

            {/* Staged Attachment Chips */}
            {(pendingAttachments.length > 0 || isUploading) && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border/40">
                {pendingAttachments.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-muted/60 border border-border text-[11px] font-medium max-w-[220px]"
                  >
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{att.fileName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))
                      }
                      aria-label={`Remove ${att.fileName}`}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {isUploading && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading...
                  </span>
                )}
              </div>
            )}

            {/* Input Textarea */}
            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${channel.type === 'direct' ? channel.name : '#' + channel.name}... (Enter to send)`}
              rows={2}
              className="w-full px-4 py-2 text-xs bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground leading-relaxed"
            />

            {/* Bottom Actions Bar */}
            <div className="flex items-center gap-1 px-2 py-1.5">
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleAttachFiles}
                  aria-label="Attach files"
                />
                <button
                  type="button"
                  onClick={() => setIsPlusOpen((v) => !v)}
                  title="More actions"
                  aria-label="More message actions"
                  aria-expanded={isPlusOpen}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isPlusOpen
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                </button>
                {isPlusOpen && (
                  <div
                    ref={plusMenuRef}
                    className="absolute bottom-full left-0 mb-1.5 w-60 rounded-xl border border-border bg-popover shadow-xl p-1 z-30 animate-in fade-in-50 duration-100"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlusOpen(false);
                        if (isOnline) fileInputRef.current?.click();
                        else toast.error('You are offline. File uploads require a connection.');
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-muted transition-colors cursor-pointer text-left"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Attach files</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">25 MB max</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlusOpen(false);
                        setIsTaskPickerOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-muted transition-colors cursor-pointer text-left"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                      <span>Mention task</span>
                    </button>
                    {(channel.role === 'owner' || channel.role === 'admin') &&
                      channel.type !== 'direct' && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlusOpen(false);
                            setIsAnnouncement((v) => !v);
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-muted transition-colors cursor-pointer text-left"
                        >
                          <Megaphone
                            className={`w-3.5 h-3.5 ${isAnnouncement ? 'text-amber-500' : 'text-muted-foreground'}`}
                          />
                          <span>Announcement {isAnnouncement ? 'on' : 'off'}</span>
                        </button>
                      )}
                    <div className="mt-1 pt-1 border-t border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
                      <span className="font-mono">⌘B</span> bold ·{' '}
                      <span className="font-mono">⌘I</span> italic ·{' '}
                      <span className="font-mono">⌘`</span> code
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!messageText.trim() && pendingAttachments.length === 0}
                aria-label="Send message"
                className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task Mention Picker Modal */}
      <TaskMentionPickerModal
        isOpen={isTaskPickerOpen}
        onClose={() => setIsTaskPickerOpen(false)}
        onSelectTask={handleSelectTask}
      />
    </div>
  );
};
