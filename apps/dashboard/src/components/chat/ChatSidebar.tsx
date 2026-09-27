import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Plus,
  MessageSquarePlus,
  Hash,
  Lock,
  Pin,
  Clock,
  CheckSquare,
  Megaphone,
  Keyboard,
} from 'lucide-react';
import { chatService, type ChatChannel } from '../../lib/chatService';
import { presenceService } from '../../lib/presenceService';
import { useChatStore } from '../../store/chatStore';
import { PresenceBadge } from './PresenceBadge';
import { NewChannelModal } from './NewChannelModal';
import { NewDirectMessageModal } from './NewDirectMessageModal';
import { WorkingHoursModal } from './WorkingHoursModal';
import { KeyboardShortcutsModal } from '../KeyboardShortcutsModal';
import { getInitials } from '../../utils/avatar';

interface ChatSidebarProps {
  onSelectChannel?: (channelId: string) => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onSelectChannel }) => {
  const navigate = useNavigate();
  const { activeChannelId, setActiveChannelId, presenceMap, setBatchPresence } = useChatStore();

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'dms' | 'groups' | 'tasks'>('all');

  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const [isNewDmOpen, setIsNewDmOpen] = useState(false);
  const [isWorkingHoursOpen, setIsWorkingHoursOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Fetch channels list.
  // No local interval: ChatPage polls this same key every 10s. A second
  // interval here interleaves refetches and stacks slow requests.
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['chat', 'channels'],
    queryFn: () => chatService.listChannels(),
  });

  // Collect other user IDs for batch presence query.
  // Sorted so list reordering (last-message bumps) doesn't mint a new key
  // per channels refetch (each new key = another request + store churn).
  const dmUserIds = useMemo(() => {
    return channels
      .filter((c) => c.type === 'direct' && c.otherUser?.id)
      .map((c) => c.otherUser!.id)
      .sort();
  }, [channels]);

  // Batch query presence
  useQuery({
    queryKey: ['presence', 'batch', dmUserIds.join(',')],
    queryFn: async () => {
      const res = await presenceService.getUsersPresence(dmUserIds);
      setBatchPresence(res);
      return res;
    },
    enabled: dmUserIds.length > 0,
    staleTime: 20000,
  });

  // Current user's presence query
  const { data: myPresence } = useQuery({
    queryKey: ['presence', 'me'],
    queryFn: () => presenceService.getMyPresence(),
    staleTime: 30000,
  });

  // Filter channels based on search and active tab
  const totalUnread = channels.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const filteredChannels = useMemo(() => {
    let list = channels;

    if (filterTab === 'unread') {
      list = list.filter((c) => c.unreadCount > 0);
    } else if (filterTab === 'dms') {
      list = list.filter((c) => c.type === 'direct');
    } else if (filterTab === 'groups') {
      list = list.filter((c) => c.type === 'group_public' || c.type === 'group_private');
    } else if (filterTab === 'tasks') {
      list = list.filter((c) => c.type === 'task_thread');
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.topic?.toLowerCase().includes(q) ||
          c.lastMessagePreview?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [channels, filterTab, search]);

  // Split into Pinned and Sections
  const pinnedChannels = useMemo(
    () => filteredChannels.filter((c) => c.isPinned),
    [filteredChannels]
  );
  const unpinnedChannels = useMemo(
    () => filteredChannels.filter((c) => !c.isPinned),
    [filteredChannels]
  );

  const dms = useMemo(
    () => unpinnedChannels.filter((c) => c.type === 'direct'),
    [unpinnedChannels]
  );
  const groups = useMemo(
    () => unpinnedChannels.filter((c) => c.type === 'group_public' || c.type === 'group_private'),
    [unpinnedChannels]
  );
  const taskThreads = useMemo(
    () => unpinnedChannels.filter((c) => c.type === 'task_thread'),
    [unpinnedChannels]
  );

  const handleChannelClick = (channelId: string) => {
    // Route is the source of truth for selection (ChatPage syncs the store
    // from the param). Navigating — not just writing the store — is what
    // makes a switch stick; store-only writes used to get yanked back.
    if (channelId === activeChannelId) return;
    setActiveChannelId(channelId);
    navigate(`/chat/${channelId}`);
    if (onSelectChannel) onSelectChannel(channelId);
  };

  const renderChannelItem = (channel: ChatChannel) => {
    const isActive = activeChannelId === channel.id;
    const otherUser = channel.otherUser;
    const presence = otherUser ? presenceMap[otherUser.id] : null;

    return (
      <button
        key={channel.id}
        type="button"
        onClick={() => handleChannelClick(channel.id)}
        className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors group cursor-pointer ${
          isActive
            ? 'bg-sidebar-accent text-sidebar-foreground font-semibold shadow-2xs'
            : 'hover:bg-sidebar-accent/50 text-muted-foreground hover:text-sidebar-foreground'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Channel Icon or Avatar */}
          {channel.type === 'direct' ? (
            <div className="relative shrink-0">
              {otherUser?.avatarUrl ? (
                <img
                  src={otherUser.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center">
                  {getInitials(channel.name)}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5">
                <PresenceBadge status={presence?.status || 'offline'} size="sm" />
              </span>
            </div>
          ) : channel.type === 'task_thread' ? (
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <CheckSquare className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-muted text-muted-foreground group-hover:text-foreground flex items-center justify-center shrink-0 transition-colors">
              {channel.isAnnouncementOnly ? (
                <Megaphone className="w-3.5 h-3.5 text-primary" />
              ) : channel.type === 'group_private' ? (
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <Hash className="w-3.5 h-3.5" />
              )}
            </div>
          )}

          {/* Title & Preview */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-xs truncate ${
                  isActive || channel.unreadCount > 0
                    ? 'font-bold text-foreground'
                    : 'font-medium text-foreground/80'
                }`}
              >
                {channel.name}
              </span>
              {presence?.localTime && channel.type === 'direct' && (
                <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                  {presence.localTime}
                </span>
              )}
            </div>

            {channel.lastMessagePreview && (
              <p
                className={`text-[11px] truncate leading-tight mt-0.5 ${
                  channel.unreadCount > 0
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {channel.lastMessagePreview}
              </p>
            )}
          </div>
        </div>

        {/* Unread Pill */}
        {channel.unreadCount > 0 && (
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0 animate-in zoom-in-50 duration-100">
            {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="w-full sm:w-72 h-full border-r border-border bg-sidebar flex flex-col shrink-0 select-none">
      {/* ── Top Header & Actions ── */}
      <div className="p-3.5 border-b border-border space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-foreground tracking-tight truncate min-w-0 flex-1">
            Chat & Teams
          </h2>

          <div className="flex items-center gap-1 shrink-0">
            {/* Direct Message trigger */}
            <button
              type="button"
              onClick={() => setIsNewDmOpen(true)}
              title="New Direct Message (C or ⌘N)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>

            {/* Create Channel trigger */}
            <button
              type="button"
              onClick={() => setIsNewChannelOpen(true)}
              title="Create Channel (⌘⇧C)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Presence Settings Trigger */}
            <button
              type="button"
              onClick={() => setIsWorkingHoursOpen(true)}
              title="Set Availability & Working Hours (⌘⇧H)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer relative"
            >
              <Clock className="w-4 h-4" />
              <span className="absolute bottom-1 right-1">
                <PresenceBadge status={myPresence?.status || 'available'} size="sm" />
              </span>
            </button>

            {/* Keyboard Shortcuts Trigger */}
            <button
              type="button"
              onClick={() => setIsShortcutsOpen(true)}
              title="Keyboard Shortcuts (⌘/ or ?)"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels or teammates..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-muted/40 border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-[11px]">
          {[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread' },
            { key: 'dms', label: 'DMs' },
            { key: 'groups', label: 'Channels' },
            { key: 'tasks', label: 'Tasks' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterTab(tab.key as any)}
              className={`px-2 py-0.8 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer inline-flex items-center gap-1 ${
                filterTab === tab.key
                  ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
              {tab.key === 'unread' && totalUnread > 0 && (
                <span
                  className={`px-1 rounded-full text-[10px] font-bold leading-tight ${
                    filterTab === 'unread'
                      ? 'bg-primary-foreground/25 text-primary-foreground'
                      : 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Channel List View ── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {isLoading && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Loading conversations...
          </div>
        )}

        {/* Pinned Section */}
        {pinnedChannels.length > 0 && (
          <div className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/70 flex items-center gap-1.5 uppercase tracking-wider">
              <Pin className="w-3 h-3 text-muted-foreground/50" />
              <span>Pinned</span>
            </div>
            {pinnedChannels.map(renderChannelItem)}
          </div>
        )}

        {/* Direct Messages Section */}
        {dms.length > 0 && (
          <div className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/70 flex items-center justify-between uppercase tracking-wider">
              <span>Direct Messages</span>
              <span className="text-[10px] text-muted-foreground/50">{dms.length}</span>
            </div>
            {dms.map(renderChannelItem)}
          </div>
        )}

        {/* Channels Section */}
        {groups.length > 0 && (
          <div className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/70 flex items-center justify-between uppercase tracking-wider">
              <span>Teams & Channels</span>
              <span className="text-[10px] text-muted-foreground/50">{groups.length}</span>
            </div>
            {groups.map(renderChannelItem)}
          </div>
        )}

        {/* Task Threads Section */}
        {taskThreads.length > 0 && (
          <div className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/70 flex items-center justify-between uppercase tracking-wider">
              <span>Task Discussions</span>
              <span className="text-[10px] text-muted-foreground/50">{taskThreads.length}</span>
            </div>
            {taskThreads.map(renderChannelItem)}
          </div>
        )}

        {!isLoading && filteredChannels.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
            <p>No conversations found</p>
            <button
              type="button"
              onClick={() => setIsNewDmOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold text-xs transition-colors cursor-pointer"
            >
              Start a chat
            </button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <NewChannelModal isOpen={isNewChannelOpen} onClose={() => setIsNewChannelOpen(false)} />
      <NewDirectMessageModal isOpen={isNewDmOpen} onClose={() => setIsNewDmOpen(false)} />
      <WorkingHoursModal isOpen={isWorkingHoursOpen} onClose={() => setIsWorkingHoursOpen(false)} />
      <KeyboardShortcutsModal open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />
    </div>
  );
};
