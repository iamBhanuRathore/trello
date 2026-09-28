import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  X,
  Minus,
  Maximize2,
  ChevronLeft,
  Send,
  Hash,
  Lock,
  Plus,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { chatService } from '../../lib/chatService';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { PresenceBadge } from './PresenceBadge';
import { NewDirectMessageModal } from './NewDirectMessageModal';
import { NewChannelModal } from './NewChannelModal';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { getInitials } from '../../utils/avatar';

export const GlobalChatDock: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const {
    isGlobalDockOpen,
    isDockMinimized,
    dockedChannelId,
    openGlobalDock,
    closeGlobalDock,
    toggleMinimizeDock,
    presenceMap,
  } = useChatStore();

  const [quickText, setQuickText] = useState('');
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // If already on the full /chat workspace, do not display the floating dock
  const isChatRoute = location.pathname.startsWith('/chat');

  // Close / minimize dock on Escape key if open and active
  useEscapeKey(
    () => {
      toggleMinimizeDock();
    },
    isGlobalDockOpen && !isDockMinimized && !isChatRoute
  );

  // Fetch channels list.
  // Disabled on the full /chat workspace: the dock returns null there, and
  // ChatPage already polls this key — a second poller doubles request volume
  // and stacks slow requests behind each other (see chat poll pile-up fix).
  const { data: channels = [] } = useQuery({
    queryKey: ['chat', 'channels'],
    queryFn: () => chatService.listChannels(),
    refetchInterval: 10000,
    enabled: !isChatRoute,
  });

  // Calculate total unread count
  const totalUnreadCount = useMemo(
    () => channels.reduce((acc, ch) => acc + (ch.unreadCount || 0), 0),
    [channels]
  );

  // Current active docked channel
  const currentChannel = useMemo(
    () => channels.find((c) => c.id === dockedChannelId),
    [channels, dockedChannelId]
  );

  // Fetch messages for docked channel
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: ['chat', 'messages', dockedChannelId],
    queryFn: () =>
      dockedChannelId ? chatService.listMessages(dockedChannelId, undefined, 25) : [],
    enabled: !!dockedChannelId && isGlobalDockOpen && !isDockMinimized && !isChatRoute,
    refetchInterval: 5000,
  });

  // Auto-scroll on new message
  useEffect(() => {
    if (messages.length > 0 && isGlobalDockOpen && !isDockMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isGlobalDockOpen, isDockMinimized]);

  // Quick send mutation
  const sendMutation = useMutation({
    mutationFn: (body: string) => {
      if (!dockedChannelId) throw new Error('No channel');
      return chatService.sendMessage(dockedChannelId, { body });
    },
    onSuccess: () => {
      setQuickText('');
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', dockedChannelId] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'channels'] });
    },
  });

  const handleSend = () => {
    const trimmed = quickText.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  if (isChatRoute) return null;

  // Render minimized state or floating launcher button
  if (!isGlobalDockOpen) {
    return (
      <div className="fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={() => openGlobalDock()}
          className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-2xl hover:scale-105 transition-all duration-200 cursor-pointer border border-primary/20"
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {totalUnreadCount > 0 && (
              <span className="absolute -top-2 -right-2 px-1.5 py-0.2 min-w-[18px] text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full ring-2 ring-background text-center animate-bounce">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </div>
          <span className="text-xs font-bold tracking-wide">Chat</span>
        </button>
      </div>
    );
  }

  // Render minimized dock bar
  if (isDockMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-40">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-card border border-border shadow-2xl text-foreground text-xs font-semibold">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="truncate max-w-[150px]">
              {currentChannel ? currentChannel.name : 'Boardly Chat'}
            </span>
            {totalUnreadCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full">
                {totalUnreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 pl-2 border-l border-border">
            <button
              type="button"
              onClick={toggleMinimizeDock}
              aria-label="Expand chat"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            </button>
            <button
              type="button"
              onClick={closeGlobalDock}
              aria-label="Close chat"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render expanded floating messenger window
  return (
    <div className="fixed bottom-5 right-5 w-88 sm:w-96 h-[520px] max-w-[calc(100vw-2rem)] rounded-2xl shadow-2xl bg-card border border-border flex flex-col overflow-hidden z-40 animate-in slide-in-from-bottom-5">
      {/* Dock Window Header */}
      <div className="h-13 px-3.5 border-b border-border bg-muted/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {dockedChannelId && (
            <button
              type="button"
              onClick={() => openGlobalDock(null)}
              aria-label="Back to conversations list"
              className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {currentChannel ? (
            <div className="flex items-center gap-2 min-w-0">
              {currentChannel.type === 'direct' && currentChannel.otherUser ? (
                <div className="relative shrink-0">
                  {currentChannel.otherUser.avatarUrl ? (
                    <img
                      src={currentChannel.otherUser.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center">
                      {getInitials(currentChannel.otherUser.name)}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceBadge
                      status={presenceMap[currentChannel.otherUser.id]?.status || 'offline'}
                      size="sm"
                    />
                  </span>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {currentChannel.type === 'group_private' ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <Hash className="w-3 h-3" />
                  )}
                </div>
              )}
              <span className="text-xs font-bold text-foreground truncate max-w-[140px]">
                {currentChannel.name}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground">Chat & Discussions</span>
            </div>
          )}
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              closeGlobalDock();
              navigate(dockedChannelId ? `/chat/${dockedChannelId}` : '/chat');
            }}
            title="Open Full Teams Workspace"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleMinimizeDock}
            title="Minimize"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={closeGlobalDock}
            title="Close"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dock Body */}
      <div className="flex-1 flex flex-col min-h-0">
        {dockedChannelId && currentChannel ? (
          /* Conversation View */
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {isMessagesLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  No messages yet. Send a note to say hi!
                </div>
              ) : (
                messages.map((m) => {
                  const isSelf = m.userId === user?.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                    >
                      {!isSelf && (
                        <span className="text-[10px] text-muted-foreground px-1 mb-0.5">
                          {m.author?.name || 'Teammate'}
                        </span>
                      )}
                      <div
                        className={`max-w-[82%] px-3 py-1.5 rounded-2xl text-xs break-words ${
                          isSelf
                            ? 'bg-primary text-primary-foreground rounded-br-xs'
                            : 'bg-muted/70 text-foreground rounded-bl-xs'
                        }`}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compact Composer */}
            <div className="p-2 border-t border-border bg-background/50 flex items-center gap-2">
              <input
                type="text"
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a quick message... (Enter)"
                className="flex-1 px-3 py-1.5 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!quickText.trim() || sendMutation.isPending}
                className="p-1.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          /* Channel Switcher / Inbox List */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-2.5 border-b border-border/60 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Recent Chats</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsNewDmOpen(true)}
                  title="New Direct Message"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer text-[11px] font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>DM</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewChannelOpen(true)}
                  title="New Group Channel"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer text-[11px] font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Group</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {channels.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground">
                  No conversations yet.
                </div>
              ) : (
                channels.map((ch) => {
                  const dmPresence = ch.otherUser ? presenceMap[ch.otherUser.id] : null;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => openGlobalDock(ch.id)}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          {ch.type === 'direct' && ch.otherUser ? (
                            <>
                              {ch.otherUser.avatarUrl ? (
                                <img
                                  src={ch.otherUser.avatarUrl}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                                  {getInitials(ch.otherUser.name)}
                                </div>
                              )}
                              <span className="absolute -bottom-0.5 -right-0.5">
                                <PresenceBadge status={dmPresence?.status || 'offline'} size="sm" />
                              </span>
                            </>
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                              {ch.type === 'group_private' ? (
                                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                              ) : (
                                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {ch.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[170px]">
                            {ch.lastMessagePreview || 'No messages yet'}
                          </p>
                        </div>
                      </div>

                      {ch.unreadCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                          {ch.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* New DM Modal */}
      <NewDirectMessageModal isOpen={isNewDmOpen} onClose={() => setIsNewDmOpen(false)} />

      {/* New Channel Modal */}
      <NewChannelModal isOpen={isNewChannelOpen} onClose={() => setIsNewChannelOpen(false)} />
    </div>
  );
};
