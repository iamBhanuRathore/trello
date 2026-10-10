import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Dialog close contract — @boardly/ui canonical source.
 *
 * Mirrors apps/dashboard/src/hooks/useDialogClose.contract.test.ts, but pins
 * the canonical implementation (moved here in Block 5 so super-admin and the
 * shared ConfirmDialog can adopt the contract without importing dashboard
 * code). Static/lint-style by design: the contract is about *which API a
 * dialog uses*, and that is statically decidable.
 */

const HOOK = join(import.meta.dir, 'useDialogClose.ts');
const CONFIRM = join(import.meta.dir, '../components/confirm-dialog.tsx');

describe('useDialogClose canonical source', () => {
  it('is idempotent per open session — double Esc / overlay+X collapse to one close', async () => {
    const src = await readFile(HOOK, 'utf-8');
    // One close per open session: duplicate gestures bail before onClose.
    expect(src.includes('if (!openRef.current || closedRef.current) return;')).toBe(true);
    // closedRef resets on (re)open so the next session can close again.
    expect(src.includes('if (isOpen) closedRef.current = false;')).toBe(true);
  });

  it('routes dirty editors to onDirtyRequest instead of discarding', async () => {
    const src = await readFile(HOOK, 'utf-8');
    expect(src.includes('if (dirtyRef.current)')).toBe(true);
    expect(src.includes('dirtyRequestRef.current')).toBe(true);
  });

  it('captures Escape on document (capture phase, wins over inner handlers)', async () => {
    const src = await readFile(HOOK, 'utf-8');
    expect(src.includes("document.addEventListener('keydown', onKey, true)")).toBe(true);
    expect(src.includes("document.addEventListener('keydown', onKey)")).toBe(false);
    // Radix wiring + backdrop guard both delegate to the single sink.
    expect(src.match(/if \(!nextOpen\) requestClose\(\)/)).toBeTruthy();
    expect(src.includes('if (e.target === e.currentTarget) requestClose();')).toBe(true);
  });

  it('ConfirmDialog routes every dismiss gesture through the hook', async () => {
    const src = await readFile(CONFIRM, 'utf-8');
    expect(src.includes('useDialogClose')).toBe(true);
    // Radix open-change goes through the idempotent handler, not the raw prop.
    expect(src.includes('onOpenChange={handleOpenChange}')).toBe(true);
    expect(src.includes('<Dialog open={open} onOpenChange={onOpenChange}>')).toBe(false);
    // Cancel funnels through requestClose; the raw prop only survives as the
    // onClose sink and the post-confirm close.
    expect(src.includes('onClick={requestClose}')).toBe(true);
    expect(src.includes('onClose: () => onOpenChange(false)')).toBe(true);
  });
});
