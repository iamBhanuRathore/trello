/**
 * Platform detection utility for cross-OS shortcut formatting.
 */

export function isMac(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  // Modern Client Hints API
  const navAny = navigator as any;
  if (navAny.userAgentData?.platform) {
    return /mac/i.test(navAny.userAgentData.platform);
  }
  // Standard navigator fallback
  const platform = navigator.platform || '';
  const userAgent = navigator.userAgent || '';
  return /Mac|iPhone|iPod|iPad/i.test(platform) || /Macintosh|Mac OS X/i.test(userAgent);
}

/**
 * Returns '⌘' on macOS / iOS, and 'Ctrl' on Windows / Linux / other OS.
 */
export function getModKey(format: 'symbol' | 'text' = 'symbol'): string {
  const mac = isMac();
  if (format === 'text') {
    return mac ? 'Cmd' : 'Ctrl';
  }
  return mac ? '⌘' : 'Ctrl';
}

/**
 * Formats a shortcut string dynamically based on the current platform.
 * Example:
 * formatShortcut('mod+enter') -> "⌘ + Enter" on Mac, "Ctrl + Enter" on Win
 * formatShortcut('mod+k')     -> "⌘K" on Mac, "Ctrl+K" on Win
 */
export function formatShortcut(shortcut: string, separator: string = ' + '): string {
  const mac = isMac();
  const parts = shortcut.split('+').map((p) => p.trim());

  const formatted = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === 'mod' || lower === 'cmd' || lower === 'ctrl') {
      return mac ? '⌘' : 'Ctrl';
    }
    if (lower === 'alt' || lower === 'opt' || lower === 'option') {
      return mac ? '⌥' : 'Alt';
    }
    if (lower === 'shift') {
      return mac ? '⇧' : 'Shift';
    }
    if (lower === 'enter' || lower === 'return') {
      return 'Enter';
    }
    return part.toUpperCase();
  });

  // For compact 2-token shortcuts like ⌘K, omit separator on mac if second key is a single letter
  if (formatted.length === 2 && formatted[0] === '⌘' && formatted[1].length === 1) {
    return `⌘${formatted[1]}`;
  }
  if (formatted.length === 2 && formatted[0] === 'Ctrl' && formatted[1].length === 1) {
    return `Ctrl+${formatted[1]}`;
  }

  return formatted.join(separator);
}
