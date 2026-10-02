import { MessageSquare, Video, UserPlus, Search, X } from 'lucide-react';
import { MemberPicker } from '../MemberPicker';

interface TaskChatHeaderProps {
  cardTitle: string;
  membersCount: number;
  showSearch: boolean;
  searchQuery: string;
  showMemberPicker: boolean;
  orgId?: string;
  participantUserIds?: Set<string>;
  currentUserId?: string;
  onOpenGlobalDock: () => void;
  onToggleSearch: () => void;
  onSearchQueryChange: (q: string) => void;
  onAddMemberClick?: () => void;
  onAddParticipant?: (userId: string) => void;
  onRemoveParticipant?: (userId: string) => void;
  onToggleMemberPicker: () => void;
  onCloseMemberPicker: () => void;
}

export function TaskChatHeader({
  cardTitle,
  membersCount,
  showSearch,
  searchQuery,
  showMemberPicker,
  orgId,
  participantUserIds,
  currentUserId,
  onOpenGlobalDock,
  onToggleSearch,
  onSearchQueryChange,
  onAddMemberClick,
  onAddParticipant,
  onRemoveParticipant,
  onToggleMemberPicker,
  onCloseMemberPicker,
}: TaskChatHeaderProps) {
  return (
    <>
      {/* ─── Task Chat Header ─── */}
      <div className="relative z-30 flex items-center justify-between px-4 py-3 border-b border-border/70 bg-card/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0" title={`Chat for task: ${cardTitle}`}>
            <h4 className="text-sm font-bold text-foreground truncate leading-tight">Task chat</h4>
            <p className="text-[11px] text-muted-foreground font-medium">
              {membersCount} {membersCount === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>

        {/* Top Right Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Video Call / Meet */}
          <button
            type="button"
            className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-colors"
            title="Start Video Meeting"
            onClick={() => {
              window.open(
                `https://meet.google.com/new?authuser=0&hs=179`,
                '_blank',
                'noopener,noreferrer'
              );
            }}
          >
            <Video className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Meet</span>
          </button>

          {/* Floating Messenger Quick Launcher */}
          <button
            type="button"
            className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors border border-border/60"
            title="Open Chat Messenger"
            onClick={onOpenGlobalDock}
          >
            <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden sm:inline">Chat</span>
          </button>

          {/* Add Member shortcut with directly anchored popover */}
          <div className="relative">
            <button
              type="button"
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                showMemberPicker
                  ? 'bg-primary/15 text-primary'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title="Add participants to task chat"
              onClick={() => {
                if (onAddMemberClick && !onAddParticipant) {
                  onAddMemberClick();
                } else {
                  onToggleMemberPicker();
                }
              }}
            >
              <UserPlus className="w-4 h-4" />
            </button>

            {showMemberPicker && (
              <div className="absolute z-50 top-full right-0 mt-2 w-[340px] sm:w-[380px] max-w-[calc(100vw-2rem)] shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                <MemberPicker
                  orgId={orgId}
                  assignedUserIds={participantUserIds || new Set()}
                  onAssign={(userId) => onAddParticipant?.(userId)}
                  onRemove={(userId) => onRemoveParticipant?.(userId)}
                  onClose={onCloseMemberPicker}
                  currentUserId={currentUserId}
                  title="Add Participants"
                  mode="multiple"
                />
              </div>
            )}
          </div>

          {/* Search toggle */}
          <button
            type="button"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              showSearch
                ? 'bg-primary/15 text-primary'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title="Search task chat"
            onClick={onToggleSearch}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Search Input Bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center gap-2 animate-in fade-in-50 duration-150 shrink-0">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search discussion and activity messages..."
            className="w-full bg-transparent border-none text-xs outline-none text-foreground placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              onClick={() => onSearchQueryChange('')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
