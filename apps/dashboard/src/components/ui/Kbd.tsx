import React, { useMemo } from 'react';
import { formatShortcut } from '../../lib/platform';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  shortcut?: string; // e.g. 'mod+k', 'mod+enter', 'shift+enter'
  children?: React.ReactNode;
  separator?: string;
  size?: 'xs' | 'sm' | 'md';
}

export function Kbd({
  shortcut,
  children,
  separator = ' + ',
  size = 'xs',
  className = '',
  ...props
}: KbdProps) {
  const content = useMemo(() => {
    if (shortcut) {
      return formatShortcut(shortcut, separator);
    }
    return children;
  }, [shortcut, separator, children]);

  const sizeClass =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5'
      : size === 'sm'
        ? 'text-[11px] px-2 py-0.5'
        : 'text-xs px-2.5 py-1';

  return (
    <kbd
      className={`inline-flex items-center justify-center font-mono font-medium rounded-md bg-muted/80 border border-border/80 text-muted-foreground select-none shadow-2xs ${sizeClass} ${className}`}
      {...props}
    >
      {content}
    </kbd>
  );
}
