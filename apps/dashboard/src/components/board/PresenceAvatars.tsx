import { Users } from 'lucide-react';

export interface PresenceUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  activeCardId?: string | null;
  isTypingCardId?: string | null;
  lastActiveAt: number;
}

interface PresenceAvatarsProps {
  users: PresenceUser[];
}

export function PresenceAvatars({ users }: PresenceAvatarsProps) {
  if (!users || users.length === 0) return null;

  const displayUsers = users.slice(0, 5);
  const excessCount = users.length - displayUsers.length;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2 overflow-hidden py-1 px-1">
        {displayUsers.map((user) => {
          const initials = user.name
            ? user.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2)
            : 'U';

          const isTyping = !!user.isTypingCardId;

          return (
            <div
              key={user.id}
              className="relative group"
              title={`${user.name} (${user.email}) - ${
                isTyping ? 'Typing...' : user.activeCardId ? 'Viewing card' : 'Active on board'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-background transition-transform group-hover:scale-110 shadow-xs ${
                  isTyping
                    ? 'bg-amber-500 text-white animate-pulse'
                    : 'bg-primary/20 text-primary border border-primary/30'
                }`}
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>

              {/* Online status indicator */}
              <span
                className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-background ${
                  isTyping ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
              />

              {/* Tooltip on Hover */}
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 hidden group-hover:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-900 text-slate-100 text-[10px] py-1 px-2 rounded-md shadow-lg whitespace-nowrap border border-slate-800">
                  <span className="font-semibold">{user.name}</span>
                  {isTyping && <span className="text-amber-400 ml-1">(typing)</span>}
                </div>
              </div>
            </div>
          );
        })}

        {excessCount > 0 && (
          <div
            className="w-7 h-7 rounded-full bg-muted border border-muted-foreground/20 text-muted-foreground flex items-center justify-center text-[10px] font-bold ring-2 ring-background shadow-xs"
            title={`${excessCount} more active viewers`}
          >
            +{excessCount}
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-1">
        <Users className="w-3 h-3 text-emerald-500" />
        <span>
          {users.length} {users.length === 1 ? 'viewer' : 'viewers'}
        </span>
      </div>
    </div>
  );
}
