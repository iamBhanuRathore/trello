import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Plus, Clock, Hash } from 'lucide-react';
import { chatService } from '../lib/chatService';
import { useChatStore } from '../store/chatStore';
import { useChatRealtime } from '../hooks/useChatRealtime';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { ChatFeed } from '../components/chat/ChatFeed';
import { ChatThreadPane } from '../components/chat/ChatThreadPane';
import { ChatDetailsPane } from '../components/chat/ChatDetailsPane';
import { NewDirectMessageModal } from '../components/chat/NewDirectMessageModal';
import { NewChannelModal } from '../components/chat/NewChannelModal';
import { WorkingHoursModal } from '../components/chat/WorkingHoursModal';

export const ChatPage: React.FC = () => {
  const { channelId: routeChannelId } = useParams<{ channelId?: string }>();
  const navigate = useNavigate();

  // Mount real-time gateway listeners (socket, typing, presence, messages)
  useChatRealtime();

  const {
    activeChannelId,
    setActiveChannelId,
    activeThreadMessage,
    setActiveThreadMessage,
    isDetailsPaneOpen,
    setDetailsPaneOpen,
  } = useChatStore();

  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const [isWorkingHoursOpen, setIsWorkingHoursOpen] = useState(false);

  // Fetch channels
  const { data: channels = [] } = useQuery({
    queryKey: ['chat', 'channels'],
    queryFn: () => chatService.listChannels(),
    refetchInterval: 10000,
  });

  // Sync route param with store
  useEffect(() => {
    if (routeChannelId && routeChannelId !== activeChannelId) {
      setActiveChannelId(routeChannelId);
    } else if (!routeChannelId && channels.length > 0 && !activeChannelId) {
      // Auto-select first channel or pinned channel
      const firstChannel = channels.find((c) => c.isPinned) || channels[0];
      if (firstChannel) {
        setActiveChannelId(firstChannel.id);
        navigate(`/chat/${firstChannel.id}`, { replace: true });
      }
    }
  }, [routeChannelId, activeChannelId, channels, navigate, setActiveChannelId]);

  // When activeChannelId changes from sidebar, sync URL
  useEffect(() => {
    if (activeChannelId && activeChannelId !== routeChannelId) {
      navigate(`/chat/${activeChannelId}`);
    }
  }, [activeChannelId, routeChannelId, navigate]);

  // Find active channel object
  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId),
    [channels, activeChannelId]
  );

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Left Navigation Rail (Teams Sidebar) */}
      <ChatSidebar />

      {/* Center Feed Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {activeChannel ? (
          <ChatFeed channel={activeChannel} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <MessageSquare className="w-8 h-8" />
            </div>

            <div className="space-y-1 max-w-md">
              <h2 className="text-xl font-bold text-foreground">Welcome to Boardly Chat</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect with teammates across timezones, collaborate in public or private group
                channels, discuss cards directly, and coordinate effortlessly.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsNewDmOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Direct Message</span>
              </button>
              <button
                type="button"
                onClick={() => setIsNewChannelOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition-colors cursor-pointer border border-border shadow-2xs"
              >
                <Hash className="w-4 h-4 text-primary" />
                <span>Create Channel</span>
              </button>
              <button
                type="button"
                onClick={() => setIsWorkingHoursOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition-colors cursor-pointer border border-border shadow-2xs"
              >
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Set Working Hours</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Slide-over Panels (Thread replies OR Channel details) */}
      {activeThreadMessage && (
        <ChatThreadPane
          parentMessage={activeThreadMessage}
          onClose={() => setActiveThreadMessage(null)}
        />
      )}

      {!activeThreadMessage && isDetailsPaneOpen && activeChannel && (
        <ChatDetailsPane
          channel={activeChannel}
          onClose={() => setDetailsPaneOpen(false)}
        />
      )}

      {/* Global Modals for Empty State Actions */}
      <NewDirectMessageModal
        isOpen={isNewDmOpen}
        onClose={() => setIsNewDmOpen(false)}
      />
      <NewChannelModal
        isOpen={isNewChannelOpen}
        onClose={() => setIsNewChannelOpen(false)}
      />
      <WorkingHoursModal
        isOpen={isWorkingHoursOpen}
        onClose={() => setIsWorkingHoursOpen(false)}
      />
    </div>
  );
};
