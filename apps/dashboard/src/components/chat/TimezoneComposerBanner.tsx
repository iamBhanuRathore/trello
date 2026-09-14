import React from 'react';
import { Moon, BellOff } from 'lucide-react';
import type { UserPresence } from '../../lib/presenceService';

interface TimezoneComposerBannerProps {
  otherUserPresence?: UserPresence | null;
  otherUserName?: string;
  isSilentSend: boolean;
  onToggleSilentSend: () => void;
}

export const TimezoneComposerBanner: React.FC<TimezoneComposerBannerProps> = ({
  otherUserPresence,
  otherUserName = 'Teammate',
  isSilentSend,
  onToggleSilentSend,
}) => {
  if (!otherUserPresence) return null;

  // Only show if user is confirmed outside their working hours
  if (otherUserPresence.isWithinWorkingHours) return null;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 border-t border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs animate-in fade-in duration-150">
      <div className="flex items-center gap-2 min-w-0">
        <Moon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="truncate">
          It's <strong>{otherUserPresence.localTime}</strong> for {otherUserName} (outside working hours).
        </span>
      </div>
      <button
        type="button"
        onClick={onToggleSilentSend}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
          isSilentSend
            ? 'bg-amber-500/30 text-amber-900 dark:text-amber-100 border border-amber-500/40'
            : 'hover:bg-amber-500/20 text-amber-800 dark:text-amber-300'
        }`}
        title="Toggle silent delivery (no push notification)"
      >
        <BellOff className="w-3 h-3" />
        <span>{isSilentSend ? 'Silent send active' : 'Send quietly'}</span>
      </button>
    </div>
  );
};
