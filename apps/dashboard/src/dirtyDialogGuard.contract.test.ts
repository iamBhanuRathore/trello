import { describe, it, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Dirty-editor close guards (static guard, AGENTS.md §11).
 *
 * `CreateDocumentModal` and `ImportModal` both forwarded `onOpenChange` straight
 * to `<Dialog>`, so X / backdrop / Esc discarded a staged draft with no prompt:
 * a retyped document title, a swapped starter template, or a fully parsed and
 * previewed import file all vanished on a stray Esc. Both now declare their
 * dirty state and route a close request to a discard prompt, matching the
 * pattern `RuleEditor` already used.
 *
 * These are the dashboard-side halves of Block 5.2; the super-admin equivalents
 * live in apps/super-admin/src/dialogClose.contract.test.ts.
 */

const DOC_MODAL = join(import.meta.dir, 'components', 'docs', 'CreateDocumentModal.tsx');
const IMPORT_MODAL = join(import.meta.dir, 'components', 'board', 'ImportModal.tsx');

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

describe('CreateDocumentModal discards a drafted document only on confirmation', () => {
  it('declares dirty against the defaults it resets to on open', async () => {
    const src = code(await readFile(DOC_MODAL, 'utf-8'));
    // The modal resets title/template when `open` flips true, so those reset
    // values are the clean baseline the comparison must use — comparing against
    // anything else would make every pristine open look edited.
    expect(src).toContain("setTitle('New Specification')");
    expect(src).toContain("setSelectedTemplateId('spec')");
    expect(src).toContain('const docDirty =');
    expect(src).toContain("title.trim() !== 'New Specification'");
    expect(src).toContain("selectedTemplateId !== 'spec'");
    expect(src).toContain('isDirty: docDirty');
    expect(src).toContain('onDirtyRequest: () => setConfirmDiscard(true)');
  });

  it('routes every dismiss gesture through the hook and prompts before discarding', async () => {
    const src = code(await readFile(DOC_MODAL, 'utf-8'));
    // The bug shape: the raw prop was handed to <Dialog>, so no gesture reached
    // the dirty check at all.
    expect(src).toContain('onOpenChange={handleOpenChange}');
    expect(src).not.toContain('<Dialog open={open} onOpenChange={onOpenChange}>');
    expect(src).toContain('onClick={requestClose}');
    expect(src).toContain('<ConfirmDialog');
    expect(src).toMatch(/setConfirmDiscard\(false\);\s*\n\s*onOpenChange\(false\);/);
  });

  it('renders the discard prompt as a sibling, never inside the dialog being dismissed', async () => {
    const src = code(await readFile(DOC_MODAL, 'utf-8'));
    // Nested inside <Dialog>, the prompt would unmount the moment it opened.
    const prompt = src.indexOf('<ConfirmDialog');
    const dialogClose = src.indexOf('</Dialog>');
    expect(prompt).toBeGreaterThan(-1);
    expect(dialogClose).toBeGreaterThan(-1);
    expect(prompt).toBeGreaterThan(dialogClose);
  });
});

describe('ImportModal discards a staged file only on confirmation', () => {
  it('treats a parsed file as the whole dirty state', async () => {
    const src = code(await readFile(IMPORT_MODAL, 'utf-8'));
    // parse success is the only thing worth protecting here: a rejected or
    // unrecognised file loses nothing.
    expect(src).toContain('isDirty: parsedData !== null');
    expect(src).toContain('onDirtyRequest: () => setConfirmDiscard(true)');
  });

  it('routes every dismiss gesture through the hook', async () => {
    const src = code(await readFile(IMPORT_MODAL, 'utf-8'));
    expect(src).toContain('onOpenChange={handleOpenChange}');
    expect(src).not.toContain('<Dialog open={open} onOpenChange={onOpenChange}>');
    expect(src).toContain('onClick={requestClose}');
    expect(src).toContain('<ConfirmDialog');
    expect(src).toMatch(/setConfirmDiscard\(false\);\s*\n\s*onOpenChange\(false\);/);
  });

  it('clears staged state on close so reopening is not dirty on arrival', async () => {
    const src = code(await readFile(IMPORT_MODAL, 'utf-8'));
    // A completed import closes the dialog from inside a mutation's onSuccess,
    // which never resets parsedData. Without this, the next open raised a
    // discard prompt for a file staged in a previous session.
    expect(src).toContain('useEffect(() => {');
    expect(src).toMatch(/if \(open\) return;[\s\S]*?setParsedData\(null\)/);
    expect(src).toContain('setImportType(null)');
    expect(src).toContain("setErrorMsg('')");
  });
});
