import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCloseAction } from './useDialogClose';

/**
 * Dialog close contract — behaviour of the shared hook in `@boardly/ui`.
 *
 * The guard that used to live here asserted on *source text* (`src.includes(
 * 'if (!openRef.current || closedRef.current) return;')`). That fails on a
 * behaviour regression — reordering the guards, inverting a condition, dropping
 * `closedRef` reset — and passes on a correct reimplementation, which is the
 * wrong direction for a test whose entire job is to catch the recurring defect
 * class (duplicate gestures closing twice, or a dirty editor discarded).
 *
 * `resolveCloseAction` is the hook's only non-trivial branch, so testing the
 * decision table directly covers the behaviour without a DOM. The two facts a
 * static read still owns — where the Escape listener is registered, and what
 * ConfirmDialog hands the Radix primitive — are asserted as such below.
 */

const HOOK = join(import.meta.dir, 'useDialogClose.ts');
const CONFIRM = join(import.meta.dir, '../components/confirm-dialog.tsx');

const open = { isOpen: true, alreadyClosed: false, isDirty: false, hasDirtyRequest: false };

describe('resolveCloseAction', () => {
  it('closes a clean dialog', () => {
    expect(resolveCloseAction(open)).toBe('close');
  });

  it('routes a dirty dialog to the prompt instead of discarding', () => {
    expect(resolveCloseAction({ ...open, isDirty: true, hasDirtyRequest: true })).toBe('dirty');
  });

  it('closes a dirty dialog that supplied no prompt handler', () => {
    // Documented in the function: trapping someone in a dialog they cannot
    // leave is a worse failure than losing the edit. A caller that sets isDirty
    // without onDirtyRequest has said nothing to protect.
    expect(resolveCloseAction({ ...open, isDirty: true, hasDirtyRequest: false })).toBe('close');
  });

  it('ignores a close request for a dialog that is not open', () => {
    // The trap this pins: naming the wrong state (drag-overlay card instead of
    // the URL param) leaves isOpen permanently false, and every gesture then
    // silently no-ops — the dialog becomes undismissable.
    expect(resolveCloseAction({ ...open, isOpen: false })).toBe('ignore');
    // Still ignored when dirty: a prompt for a closed dialog is meaningless.
    expect(
      resolveCloseAction({
        isOpen: false,
        alreadyClosed: false,
        isDirty: true,
        hasDirtyRequest: true,
      })
    ).toBe('ignore');
  });

  it('is idempotent: the second gesture in one open session is ignored', () => {
    // The double-Esc / overlay+X collapse. Every gesture funnels here, so the
    // second must not reach onClose again.
    const first = resolveCloseAction(open);
    const second = resolveCloseAction({ ...open, alreadyClosed: first === 'close' });
    expect(first).toBe('close');
    expect(second).toBe('ignore');

    // Including when the second gesture is a dirty prompt rather than a close.
    const dirtyFirst = resolveCloseAction({ ...open, isDirty: true, hasDirtyRequest: true });
    expect(resolveCloseAction({ ...open, isDirty: true, hasDirtyRequest: true })).toBe('dirty');
    // A dirty prompt does not consume the session: it opens another dialog,
    // and dismissing that one still has to work.
    expect(dirtyFirst).toBe('dirty');
    expect(resolveCloseAction(open)).toBe('close');
  });

  it('allows a close again after the dialog reopens', () => {
    // The hook resets `alreadyClosed` when isOpen flips true; the decision must
    // not latch permanently, or a dialog becomes undismissable on second use.
    expect(resolveCloseAction({ ...open, alreadyClosed: true })).toBe('ignore');
    expect(resolveCloseAction(open)).toBe('close');
  });

  it('never returns dirty for a clean dialog, whatever the handler wiring', () => {
    for (const hasDirtyRequest of [true, false]) {
      expect(resolveCloseAction({ ...open, hasDirtyRequest })).toBe('close');
    }
  });
});

describe('the hook wires that decision table in', () => {
  it('routes every gesture through the single decision, not its own guard', async () => {
    const src = await readFile(HOOK, 'utf-8');
    // requestClose must delegate; an inline guard beside it is the duplication
    // this extraction exists to prevent.
    expect(src).toContain('resolveCloseAction({');
    expect(src).toMatch(/const action = resolveCloseAction/);
    expect(src).toContain("if (action === 'ignore') return;");
    expect(src).toContain("if (action === 'dirty')");
    // Only the close branch may latch the session.
    const latch = src.match(/closedRef\.current = true/g) ?? [];
    expect(latch.length).toBe(1);
  });

  it('captures Escape on document, ahead of any bubble-phase handler', async () => {
    const src = await readFile(HOOK, 'utf-8');
    expect(src).toContain("document.addEventListener('keydown', onKey, true)");
    expect(src.includes("document.addEventListener('keydown', onKey)")).toBe(false);
    // Radix and backdrop both delegate to the same sink.
    expect(src.match(/if \(!nextOpen\) requestClose\(\)/)).toBeTruthy();
    expect(src.includes('if (e.target === e.currentTarget) requestClose();')).toBe(true);
  });

  it('ConfirmDialog routes every dismiss gesture through the hook', async () => {
    const src = await readFile(CONFIRM, 'utf-8');
    expect(src).toContain('onOpenChange={handleOpenChange}');
    expect(src.includes('<Dialog open={open} onOpenChange={onOpenChange}>')).toBe(false);
    expect(src).toContain('onClick={requestClose}');
    expect(src).toContain('onClose: () => onOpenChange(false)');
  });
});
