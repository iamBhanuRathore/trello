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

export type CloseAction = 'close' | 'dirty' | 'ignore';

export interface CloseDecisionInput {
  /** The dialog's real open state (AGENTS.md §11 — name the state that drives `open=`). */
  isOpen: boolean;
  /** Whether this open session has already been closed. */
  alreadyClosed: boolean;
  /** Whether there are unsaved edits. */
  isDirty: boolean;
  /** Whether a dirty prompt handler was supplied. */
  hasDirtyRequest: boolean;
}

/**
 * Decides what a close gesture does. Pure, and the whole reason the behaviour
 * is testable without a DOM: the hook's only non-trivial branch is this table,
 * and it is the part that regressed most often (duplicate gestures closing
 * twice, or discarding a dirty editor).
 *
 * `ignore` is what makes the close path idempotent. X, the backdrop and Esc all
 * land here, so a second gesture in the same open session — or one arriving
 * after the dialog is already closed — must do nothing.
 *
 * A dirty editor with **no** handler still closes. Trapping someone in a dialog
 * they cannot leave, on the strength of a prop they did not pass, is a worse
 * failure than losing the edit; `isDirty` without `onDirtyRequest` is treated as
 * "nothing to protect".
 */
export function resolveCloseAction({
  isOpen,
  alreadyClosed,
  isDirty,
  hasDirtyRequest,
}: CloseDecisionInput): CloseAction {
  if (!isOpen || alreadyClosed) return 'ignore';
  if (isDirty && hasDirtyRequest) return 'dirty';
  return 'close';
}

/**
 * The one sanctioned close path for every dialog (AGENTS.md §11 — see
 * "Dialog Close Contract" in docs/Decisions.md).
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
    const action = resolveCloseAction({
      isOpen: openRef.current,
      alreadyClosed: closedRef.current,
      isDirty: dirtyRef.current,
      hasDirtyRequest: Boolean(dirtyRequestRef.current),
    });
    if (action === 'ignore') return;
    if (action === 'dirty') {
      dirtyRequestRef.current?.();
      return;
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
