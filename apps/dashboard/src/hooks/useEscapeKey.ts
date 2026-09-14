import { useEffect } from 'react';

/**
 * Global LIFO stack for Escape key dismissal.
 * Ensures that when multiple modals, sheets, or popovers are stacked,
 * only the topmost active modal is dismissed per Escape keystroke.
 */
const escapeStack: Array<() => void> = [];
let isGlobalListenerAttached = false;

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    if (escapeStack.length > 0) {
      // Find the topmost handler and execute it
      const topHandler = escapeStack[escapeStack.length - 1];
      if (topHandler) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        topHandler();
      }
    }
  }
}

export function registerEscapeHandler(onEscape: () => void): () => void {
  if (typeof window !== 'undefined' && !isGlobalListenerAttached) {
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    isGlobalListenerAttached = true;
  }

  escapeStack.push(onEscape);

  return () => {
    const idx = escapeStack.lastIndexOf(onEscape);
    if (idx !== -1) {
      escapeStack.splice(idx, 1);
    }
  };
}

/**
 * Hook to execute a callback when the Escape key is pressed.
 * Automatically handles registration onto the global LIFO stack and cleanup.
 *
 * @param onEscape Callback to invoke when Escape is pressed
 * @param active Whether the listener is currently active (defaults to true)
 */
export function useEscapeKey(onEscape?: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active || !onEscape) return;
    return registerEscapeHandler(onEscape);
  }, [onEscape, active]);
}
