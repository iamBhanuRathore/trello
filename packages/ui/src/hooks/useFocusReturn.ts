import { useLayoutEffect } from 'react';

interface StampedFocus {
  el: HTMLElement;
  at: number;
}

let lastExternalFocus: StampedFocus | null = null;
let focusListenerAttached = false;
let suppressRecording = false;

/**
 * Tracks the most recently focused element that lives outside any
 * `role="dialog"` subtree. Module-level: a single capture-phase listener
 * records focus *before* a newly opened dialog's autoFocus can overwrite
 * `document.activeElement` (passive effects always lose that race).
 */
function ensureFocusTracker() {
  if (focusListenerAttached || typeof document === 'undefined') return;
  focusListenerAttached = true;
  document.addEventListener(
    'focusin',
    (e) => {
      if (suppressRecording) return;
      const target = e.target as HTMLElement | null;
      if (!target || target === document.body) return;
      if (target.closest?.('[role="dialog"]')) return;
      lastExternalFocus = { el: target, at: Date.now() };
    },
    true
  );
}

/**
 * WAI-ARIA focus restoration for dialogs: when `isOpen` flips true → false,
 * return focus to the invoking control — but only if focus is currently
 * stranded (body) and the recorded invoker is fresh (< 10s) and connected.
 * Without this, focus strands on <body> after close, and the next bare `c`
 * keystroke (documented "New DM" shortcut, fires outside text fields) pops
 * the dialog "by itself", repeating on every close.
 */
export function useRestoreFocusOnClose(isOpen: boolean, maxAgeMs = 10000) {
  // Layout effect: restores focus synchronously with the unmount commit,
  // before paint — no flash of body-focus, no race with post-close reads.
  useLayoutEffect(() => {
    ensureFocusTracker();
    if (isOpen) return;
    const record = lastExternalFocus;
    lastExternalFocus = null;
    if (!record) return;
    if (Date.now() - record.at > maxAgeMs) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    if (document.contains(record.el)) {
      // Synchronous: callers assert focus immediately after close, and the
      // unmount has already committed. Suppress re-recording so a later,
      // unrelated close doesn't snap back here.
      suppressRecording = true;
      try {
        record.el.focus({ preventScroll: true });
      } finally {
        suppressRecording = false;
      }
    }
  }, [isOpen, maxAgeMs]);
}
