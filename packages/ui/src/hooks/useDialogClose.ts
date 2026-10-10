import { useCallback, useEffect, useRef } from 'react';
import { useRestoreFocusOnClose } from './useFocusReturn';

interface UseDialogCloseOptions {
  /** Current open state — close requests are ignored when false. */
  isOpen: boolean;
  /** Single close sink (parent setState). Called at most once per open session. */
  onClose: () => void;
  /** When true, close requests route to onDirtyRequest instead of onClose. */
  isDirty?: boolean;
  /** E.g. open the unsaved-changes prompt. Defaults to onClose. */
  onDirtyRequest?: () => void;
  /** Attach our own Esc listener (hand-rolled portals). Default true. */
  handleEscape?: boolean;
}

/**
 * The one sanctioned close path for every dialog (AGENTS.md §9-adjacent UI
 * standard — see "Dialog Close Contract" in docs/Decisions.md).
 *
 * Every close gesture — X button, backdrop click, Esc — funnels through
 * `requestClose`, which is idempotent per open session: duplicate gestures
 * (double Esc listeners, overlay + button both firing, React double-effects)
 * can never double-close or reopen. Dirty editors route to `onDirtyRequest`
 * instead of silently discarding.
 *
 * Radix dialogs: pass `handleOpenChange` to `<Dialog onOpenChange>`.
 * Hand-rolled portals: spread `overlayProps` onto the backdrop div and call
 * `requestClose` from the X button.
 */
export function useDialogClose({
  isOpen,
  onClose,
  isDirty = false,
  onDirtyRequest,
  handleEscape = true,
}: UseDialogCloseOptions) {
  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dirtyRequestRef = useRef(onDirtyRequest);
  dirtyRequestRef.current = onDirtyRequest;

  // One close per open session — resets whenever the dialog (re)opens.
  const closedRef = useRef(false);
  useEffect(() => {
    if (isOpen) closedRef.current = false;
  }, [isOpen]);

  const requestClose = useCallback(() => {
    if (!openRef.current || closedRef.current) return;
    if (dirtyRef.current) {
      const fn = dirtyRequestRef.current;
      if (fn) {
        fn();
        return;
      }
    }
    closedRef.current = true;
    closeRef.current();
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) requestClose();
    },
    [requestClose]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      // Only genuine backdrop clicks — never content clicks bubbling up.
      if (e.target === e.currentTarget) requestClose();
    },
    [requestClose]
  );

  useEffect(() => {
    if (!handleEscape || !isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
      }
    };
    // Capture phase: wins over in-dialog key handlers so Esc can't both
    // dismiss a popup and close the dialog in one keypress.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [handleEscape, isOpen, requestClose]);

  // Invoker focus restoration (prevents bare-shortcut re-trigger loops).
  // Always called — unconditional hook order.
  useRestoreFocusOnClose(isOpen);

  return { requestClose, handleOpenChange, handleOverlayClick };
}
