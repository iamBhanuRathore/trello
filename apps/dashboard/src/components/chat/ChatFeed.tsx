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
  Bold,
  Italic,
  Code,
  ArrowDown,
  Loader2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';
import { chatService, type ChatChannel, type ChatMessageItem } from '../../lib/chatService';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';
import { ChatMessageCard } from './ChatMessageCard';
import { TimezoneComposerBanner } from './TimezoneComposerBanner';
import { TaskMentionPickerModal } from './TaskMentionPickerModal';

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
    typingUsers,
    presenceMap,
    drafts,
    setDraft,
  } = useChatStore();
  const queryClient = useQueryClient();

  const [messageText, setMessageText] = useState(drafts[channel.id] || '');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [isSilentSend, setIsSilentSend] = useState(false);
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync draft on channel change
  useEffect(() => {
    setMessageText(drafts[channel.id] || '');
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

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (payload: { body: string; isAnnouncement?: boolean }) =>
      chatService.sendMessage(channel.id, payload),
    onMutate: async (newMsg) => {
      await queryClient.cancelQueries({ queryKey: ['chat', 'messages', channel.id] });
      const prevMessages = queryClient.getQueryData<ChatMessageItem[]>(['chat', 'messages', channel.id]) || [];

      const optimisticMsg: ChatMessageItem = {
        id: `temp-${Date.now()}`,
        channelId: channel.id,
        userId: user?.id || '',
        body: newMsg.body,
        isEdited: false,
        isAnnouncement: !!newMsg.isAnnouncement,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: {
          id: user?.id || '',
          name: user?.name || 'You',
          email: user?.email || '',
          avatarUrl: user?.avatarUrl,
        },
        attachments: [],
        reactions: [],
        replyCount: 0,
      };

      queryClient.setQueryData<ChatMessageItem[]>(['chat', 'messages', channel.id], [
        ...prevMessages,
        optimisticMsg,
      ]);

      return { prevMessages };
    },
    onError: (err: any, _variables, context) => {
      if (context?.prevMessages) {
        queryClient.setQueryData(['chat', 'messages', channel.id], context.prevMessages);
      }
      toast.error(err.response?.data?.message || err.message || 'Failed to send message');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', channel.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
  });

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

  const handleSendMessage = () => {
    const trimmed = messageText.trim();
    if (!trimmed || sendMutation.isPending) return;

    sendMutation.mutate({
      body: trimmed,
      isAnnouncement,
    });

    setMessageText('');
    setDraft(channel.id, '');
    setIsAnnouncement(false);
    scrollToBottom();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Insert markdown formatting
  const insertFormatting = (prefix: string, suffix = prefix) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const current = messageText;
    const selected = current.slice(start, end);
    const updated = current.slice(0, start) + prefix + (selected || 'text') + suffix + current.slice(end);
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
      ? messages.filter((m) => m.body.toLowerCase().includes(searchQuery.toLowerCase()))
      : messages;

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
                  {channel.otherUser.name.charAt(0).toUpperCase()}
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
                  <span>{channel.memberCount} members</span>
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
                    canModerate={canModerate || channel.role === 'owner' || channel.role === 'admin'}
                    onEdit={(id, body) => editMutation.mutate({ messageId: id, body })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onToggleReaction={(id, emoji) => reactionMutation.mutate({ messageId: id, emoji })}
                    onOpenThread={(parent) => setActiveThreadMessage(parent)}
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
      {channel.type === 'direct' && recipientPresence && !recipientPresence.isWithinWorkingHours && (
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
            {/* Formatting Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => insertFormatting('**')}
                  title="Bold (Cmd+B)"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('*')}
                  title="Italic (Cmd+I)"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('`')}
                  title="Code"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <div className="h-4 w-px bg-border mx-1" />
                <button
                  type="button"
                  onClick={() => setIsTaskPickerOpen(true)}
                  title="Mention Task / Card"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                  <span>Task</span>
                </button>
              </div>

              {/* Announcement mode pill for group channel admins */}
              {(channel.role === 'owner' || channel.role === 'admin') && channel.type !== 'direct' && (
                <button
                  type="button"
                  onClick={() => setIsAnnouncement(!isAnnouncement)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer border ${
                    isAnnouncement
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Megaphone className="w-3 h-3" />
                  <span>Announcement</span>
                </button>
              )}
            </div>

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
            <div className="flex items-center justify-between px-3 py-2 border-t border-border/40">
              <p className="text-[10px] text-muted-foreground/70 hidden sm:block">
                Use <span className="font-semibold">Enter</span> to send, <span className="font-semibold">Shift+Enter</span> for newline
              </p>

              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sendMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm ml-auto"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send</span>
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
