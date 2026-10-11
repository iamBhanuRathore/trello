import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Dialog close contract — super-admin (static guard, AGENTS.md §11).
 *
 * Every dialog here previously handed `<Dialog>` an inline arrow:
 * `onOpenChange={(open) => !open && setX(null)}`. That bypasses `useDialogClose`
 * entirely, so the three dismiss gestures (X, backdrop, Esc) each act through a
 * different path and a dirty editor is discarded with no prompt — which is how
 * a half-typed tier-limit change or a database routing edit was silently lost.
 *
 * Lint-style by design, matching apps/dashboard/src/hooks/useDialogClose.contract.test.ts:
 * the contract is about *which API a dialog uses*, which is statically decidable.
 */

const PAGES = join(import.meta.dir, 'pages');

/** Source with comment lines removed, so prose cannot satisfy an assertion. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

/** Every `<Dialog …>` occurrence, as raw source. */
function dialogTags(src: string): string[] {
  return [...src.matchAll(/<Dialog\b[^>]*>/g)].map((m) => m[0]);
}

describe('super-admin dialog close contract', () => {
  it('no dialog hands an inline arrow to onOpenChange', async () => {
    const offenders: string[] = [];
    for (const page of ['PlatformUsers.tsx', 'Plans.tsx', 'Tenants.tsx']) {
      const src = await readFile(join(PAGES, page), 'utf-8');
      for (const tag of dialogTags(code(src))) {
        const m = tag.match(/onOpenChange=\{([^}]*)\}/);
        if (m?.[1]?.trim().startsWith('(')) offenders.push(`${page}: ${tag}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every page adopts the shared hook rather than a local close path', async () => {
    for (const page of ['PlatformUsers.tsx', 'Plans.tsx', 'Tenants.tsx']) {
      const src = await readFile(join(PAGES, page), 'utf-8');
      expect(src).toContain("from '@boardly/ui/hooks/use-dialog-close'");
      expect(src).toContain('useDialogClose({');
      // The idempotent sink is what makes Esc/X/backdrop collapse to one close.
      expect(src).toContain('requestClose');
      expect(src).toContain('onOpenChange={handleOpenChange}');
    }
  });

  it('PlatformUsers inspection is read-only: no dirty guard, no discard prompt', async () => {
    const src = code(await readFile(join(PAGES, 'PlatformUsers.tsx'), 'utf-8'));
    // Nothing is editable here, so a prompt would be a dead control (AGENTS.md §7).
    expect(src).not.toContain('isDirty:');
    expect(src).not.toContain('onDirtyRequest');
    expect(src).not.toContain('confirmDiscard');
    // The Terminate button swaps selectedUser for userToLogout in one tick —
    // that is a deliberate raw setter, not a dismiss gesture.
    expect(src).toContain('setSelectedUser(null)');
    expect(src).toContain('setUserToLogout(target)');
  });

  it('Plans treats any limit field differing from editingPlan as dirty', async () => {
    const src = code(await readFile(join(PAGES, 'Plans.tsx'), 'utf-8'));
    expect(src).toContain('const limitsDirty =');
    // All four editable limits participate, each compared to the open plan.
    for (const field of ['maxWorkspaces', 'maxBoards', 'maxSeats', 'maxStorageGb']) {
      expect(src).toContain(`${field} !== (editingPlan.${field} ?? '')`);
    }
    expect(src).toContain('editingPlan !== null &&');
    expect(src).toContain('isDirty: limitsDirty');
    expect(src).toContain('onDirtyRequest: () => setConfirmDiscard(true)');
  });

  it('Tenants treats toggle or URL drift from selectedOrg as dirty', async () => {
    const src = code(await readFile(join(PAGES, 'Tenants.tsx'), 'utf-8'));
    expect(src).toContain('const routingDirty =');
    expect(src).toContain('isDedicated !== (selectedOrg.isDedicatedDb || false)');
    expect(src).toContain("dedicatedUrl !== (selectedOrg.dedicatedDbUrl || '')");
    expect(src).toContain('selectedOrg !== null &&');
    expect(src).toContain('isDirty: routingDirty');
    expect(src).toContain('onDirtyRequest: () => setConfirmDiscard(true)');
  });

  it('Plans and Tenants each own a discard prompt that closes the underlying dialog', async () => {
    for (const page of ['Plans.tsx', 'Tenants.tsx']) {
      const src = code(await readFile(join(PAGES, page), 'utf-8'));
      expect(src).toContain('<ConfirmDialog');
      expect(src).toContain('open={confirmDiscard}');
      expect(src).toContain('onConfirm={() => {');
      // Discarding must actually close the parent dialog, and the prompt itself
      // gets its own idempotent close path (a confirm is never dirty).
      expect(src).toMatch(
        /setConfirmDiscard\(false\);\s*\n\s*set(EditingPlan|SelectedOrg)\(null\);/
      );
      expect(src).toContain('handleDiscardOpenChange');
    }
  });
});
