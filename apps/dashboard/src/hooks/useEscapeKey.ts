import { useEffect } from 'react';

/**
 * Hook to execute a callback when the Escape key is pressed.
 * Automatically handles event listener registration and cleanup.
 *
 * @param onEscape Callback to invoke when Escape is pressed
 * @param active Whether the listener is currently active (defaults to true)
 */
export function useEscapeKey(onEscape?: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active || !onEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, active]);
}
