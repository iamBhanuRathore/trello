import React from 'react';

interface PresenceBadgeProps {
  status?: 'available' | 'busy' | 'away' | 'leave' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
  localTime?: string;
}

export const PresenceBadge: React.FC<PresenceBadgeProps> = ({
  status = 'offline',
  size = 'md',
  showLabel = false,
  className = '',
  localTime,
}) => {
  const dotSizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3.5 h-3.5 ring-2 ring-background',
  }[size];

  const statusConfig = {
    available: {
      color: 'bg-emerald-500',
      label: 'Available',
      ringColor: 'ring-emerald-500/20',
    },
    busy: {
      color: 'bg-rose-500',
      label: 'Busy',
      ringColor: 'ring-rose-500/20',
    },
    away: {
      color: 'bg-amber-500',
      label: 'Away',
      ringColor: 'ring-amber-500/20',
    },
    leave: {
      color: 'bg-purple-500',
      label: 'On Leave',
      ringColor: 'ring-purple-500/20',
    },
    offline: {
      color: 'bg-zinc-400 dark:bg-zinc-500',
      label: 'Offline',
      ringColor: 'ring-zinc-400/20',
    },
  }[status] || {
    color: 'bg-zinc-400',
    label: 'Offline',
    ringColor: 'ring-zinc-400/20',
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`relative inline-block rounded-full ${dotSizeClasses} ${statusConfig.color} shrink-0`}
        title={statusConfig.label}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground font-medium truncate">
          {statusConfig.label}
        </span>
      )}
      {localTime && (
        <span className="text-[11px] text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded-md font-mono">
          {localTime}
        </span>
      )}
    </div>
  );
};
