import {
  Hash,
  Lock,
  Search,
  PanelRight,
  Pin,
  ArrowDown,
  MessagesSquare,
  AlignLeft,
} from 'lucide-react';
import type { ChatChannel } from '../../../lib/chatService';
import { PresenceBadge } from '../PresenceBadge';
import { getInitials } from '../../../utils/avatar';

interface ChatFeedHeaderProps {
  channel: ChatChannel;
  recipientPresence?: any;
  onBack?: () => void;
  messageLayout: 'classic' | 'bubbles';
  onToggleMessageLayout: () => void;
  isSearching: boolean;
  searchQuery: string;
  onToggleSearching: (active: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  isDetailsPaneOpen: boolean;
  onToggleDetailsPane: () => void;
}

export function ChatFeedHeader({
  channel,
  recipientPresence,
  onBack,
  messageLayout,
  onToggleMessageLayout,
  isSearching,
  searchQuery,
  onToggleSearching,
  onSearchQueryChange,
  isDetailsPaneOpen,
  onToggleDetailsPane,
}: ChatFeedHeaderProps) {
  return (
    <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/60 backdrop-blur-sm z-10">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            title="Back to conversations"
            className="lg:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer shrink-0"
          >
            <ArrowDown className="w-4 h-4 rotate-90" />
          </button>
        )}
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
                  onClick={onToggleDetailsPane}
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
        {/* WhatsApp bubbles / classic layout toggle (persisted per user) */}
        <button
          type="button"
          onClick={onToggleMessageLayout}
          aria-label={
            messageLayout === 'bubbles'
              ? 'Switch to classic message layout'
              : 'Switch to bubble message layout'
          }
          title={
            messageLayout === 'bubbles'
              ? 'Bubble layout (WhatsApp style) — switch to classic'
              : 'Classic layout — switch to bubbles (WhatsApp style)'
          }
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            messageLayout === 'bubbles'
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
          }`}
        >
          {messageLayout === 'bubbles' ? (
            <MessagesSquare className="w-4 h-4" />
          ) : (
            <AlignLeft className="w-4 h-4" />
          )}
        </button>

        {/* Search bar toggle */}
        {isSearching ? (
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg px-2 py-1 border border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search messages..."
              className="bg-transparent border-none text-xs text-foreground focus:outline-none w-32 md:w-48"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                onToggleSearching(false);
                onSearchQueryChange('');
              }}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onToggleSearching(true)}
            aria-label="Search channel messages"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        {/* Toggle Details Pane */}
        <button
          type="button"
          onClick={onToggleDetailsPane}
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
  );
}
