import { describe, it, expect } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Dialog Close Contract — static regression guard (AGENTS.md §11).
 *
 * Three recurring defects came out of the P2 audit, each of which had already
 * been fixed and then reintroduced by hand-rolled code:
 *
 *  1. `<Dialog onOpenChange={setX}>` or an inline `(open) => !open && setX(...)`
 *     bypasses `useDialogClose`, so a dirty editor is discarded silently and
 *     Esc/X/backdrop can each fire the close independently.
 *  2. A hand-rolled portal with no backdrop click handler — no way to dismiss
 *     on touch (ShareTaskModal had exactly this).
 *  3. `useEscapeKey(handler, true)` mounted unconditionally, which keeps a
 *     stale handler on the LIFO stack and swallows Escape from unrelated
 *     surfaces.
 *
 * This walks the dashboard source and fails on those shapes. It is deliberately
 * a lint-style check rather than a behavioural test: the contract is about
 * *which API a dialog uses*, and that is statically decidable.
 */

const SRC = join(import.meta.dir, '..');

/** Components that legitimately own their own close handling internally. */
const SELF_MANAGED = new Set(['ConfirmDialog', 'Dialog']);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'e2e') continue;
      yield* walk(full);
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      yield full;
    }
  }
}

/** Every `onOpenChange={...}` value in the file, with its line number. */
/** Source with comment lines removed, so prose cannot fake a match. */
function code(src: string): string {
  return src
    .split('\n')
    .filter(
      (l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')
    )
    .join('\n');
}

/**
 * Every `<Dialog onOpenChange={...}>` in the file.
 *
 * Scoped to the raw `Dialog` primitive on purpose. `ConfirmDialog`, `CardModal`,
 * `AppearanceModal` and friends accept `onOpenChange` as a prop and manage their
 * own close path, so passing a bare setter to those is correct — the component
 * invokes it at most once per open session. Only the raw primitive bypasses the
 * contract when handed a setter or an arrow.
 */
function dialogOnOpenChangeValues(src: string): Array<{ value: string; line: number }> {
  const out: Array<{ value: string; line: number }> = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/onOpenChange=\{([^}]*(?:\{[^}]*\})?[^}]*)\}/);
    if (!m?.[1]) return;
    // The nearest preceding opening tag owns this prop.
    for (let k = i; k >= Math.max(0, i - 8); k--) {
      const tag = lines[k]?.match(/<([A-Za-z][A-Za-z0-9_.]*)\b/);
      if (!tag) continue;
      if (tag[1] === 'Dialog') out.push({ value: m[1].trim(), line: i + 1 });
      return;
    }
  });
  return out;
}

/**
 * The rule, stated positively: `onOpenChange` must NOT be a bare setter and must
 * NOT be an inline arrow. Anything else is a named binding — either
 * `handleOpenChange` itself, a renamed alias of it (several dialogs share one
 * scope, so each gets a unique name), or a prop belonging to a component that
 * now manages its own close path.
 */
function isCompliant(value: string): boolean {
  if (value === 'onOpenChange') return true; // pass-through prop
  if (/^set[A-Z]/.test(value)) return false; // bare setState setter
  if (value.startsWith('(')) return false; // inline arrow
  return true; // a named binding (handleOpenChange or a renamed alias of it)
}

const files: string[] = [];
for await (const f of walk(SRC)) files.push(f);

describe('dialog close contract', () => {
  it('finds dashboard tsx files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no dialog passes a bare setter or inline arrow to onOpenChange', async () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = await readFile(file, 'utf-8');
      for (const { value, line } of dialogOnOpenChangeValues(src)) {
        if (isCompliant(value)) continue;
        // A bare `setX` or an inline arrow both bypass useDialogClose.
        offenders.push(`${file.replace(SRC, 'src')}:${line} -> onOpenChange={${value}}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('components that receive onOpenChange as a prop use useDialogClose internally', async () => {
    // These forward the prop straight to <Dialog>, so the fix belongs in the
    // component rather than at each call site.
    const forwarding = [
      'components/trash/TrashBinModal.tsx',
      'components/AppearanceModal.tsx',
      'components/KeyboardShortcutsModal.tsx',
    ];
    for (const rel of forwarding) {
      const src = await readFile(join(SRC, rel), 'utf-8');
      expect(src.includes('useDialogClose')).toBe(true);
      // And it must not hand the raw prop to <Dialog onOpenChange>.
      expect(/<Dialog[^>]*onOpenChange=\{onOpenChange\}/.test(src)).toBe(false);
    }
  });

  it('hand-rolled modal portals close on backdrop click', async () => {
    // A fixed-inset overlay that is not a Radix <Dialog> must wire
    // handleOverlayClick, otherwise touch users cannot dismiss it.
    const portals = [
      'components/board/ShareTaskModal.tsx',
      'components/board/CreateTaskFromMessageModal.tsx',
    ];
    for (const rel of portals) {
      const src = await readFile(join(SRC, rel), 'utf-8');
      expect(src.includes('handleOverlayClick')).toBe(true);
      expect(src.includes('useDialogClose')).toBe(true);
      // The old overlay handler called onClose directly.
      expect(code(src).includes('e.target === e.currentTarget')).toBe(false);
      expect(src.includes('useEscapeKey')).toBe(false);
      // (ShareTaskModal has onClick={(e) => ...} on its copy buttons, which is
      // unrelated to dismissal — hence the targeted check above.)
    }
  });

  it('one useDialogClose per dialog — no duplicate Escape listeners for one dialog', async () => {
    // A hook owns its own closedRef, so two instances for the same dialog each
    // fire on a single Esc. ListColumn had exactly this.
    const src = await readFile(join(SRC, 'components/board/kanban/ListColumn.tsx'), 'utf-8');
    const forEditing = (src.match(/isOpen: isEditingList/g) ?? []).length;
    const forDeleting = (src.match(/isOpen: isDeletingList/g) ?? []).length;
    expect(forEditing).toBe(1);
    expect(forDeleting).toBe(1);
  });

  it('nested dialogs make the parent stand down on Escape', async () => {
    // The parent's listener is capture-phase, so without handleEscape a single
    // Esc dismisses both the child and the parent.
    const src = await readFile(join(SRC, 'components/trash/TrashBinModal.tsx'), 'utf-8');
    expect(src.includes('handleEscape:')).toBe(true);
  });

  it('useEscapeKey is never registered unconditionally on a long-lived surface', async () => {
    // `useEscapeKey(fn, true)` on a component that stays mounted leaves a stale
    // handler on the global LIFO stack. Allowed only where the component itself
    // is conditionally mounted (popovers, context menus, drawers).
    const conditional = new Set([
      'components/calendar/QuickCreatePopover.tsx',
      'components/calendar/EventPopover.tsx',
      'components/chat/MessageContextMenu.tsx',
      'components/automation/RuleEditor.tsx',
    ]);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.replace(`${SRC}/`, '');
      if (conditional.has(rel)) continue;
      const src = await readFile(file, 'utf-8');
      if (/useEscapeKey\([^)]*,\s*true\s*\)/.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('mention menus hosted in a dialog claim Escape above the dialog', async () => {
    // The bug: Escape was handled in a BUBBLE-phase onKeyDown on the textarea,
    // but the hosting dialog listens on `document` in CAPTURE phase, which the
    // DOM delivers first. One Esc therefore closed the whole task dialog as well
    // as the menu, and the bubble handler's `return` was dead code.
    //
    // The fix registers the menu on the useEscapeKey stack: that listener is on
    // `window` in capture phase and calls stopImmediatePropagation, so it runs
    // before the dialog's document listener and the event never gets there.
    const hosted = ['components/board/TaskChatPane.tsx', 'components/board/MentionCommentBox.tsx'];
    for (const rel of hosted) {
      const body = code(await readFile(join(SRC, rel), 'utf-8'));
      // The actual CALL, not the word: a comment mentioning the hook must not
      // satisfy this assertion, and its absence must not be masked by one.
      expect(/useEscapeKey\(/.test(body)).toBe(true);
      // The ineffective bubble-phase branch must be gone.
      expect(
        /if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\);\s*setShowMentionMenu/.test(body)
      ).toBe(false);
    }
  });

  it('the contract hook captures Escape on document, not in the bubble phase', async () => {
    // This ordering is the whole reason the mention menus need the stack: capture
    // on document preempts any bubble-phase handler on a focused child.
    const src = await readFile(join(SRC, 'hooks/useDialogClose.ts'), 'utf-8');
    expect(src.includes("document.addEventListener('keydown', onKey, true)")).toBe(true);
    expect(src.includes("document.addEventListener('keydown', onKey)")).toBe(false);

    // And useEscapeKey is the stack that runs even earlier.
    const esc = await readFile(join(SRC, 'hooks/useEscapeKey.ts'), 'utf-8');
    expect(esc.includes("window.addEventListener('keydown', handleGlobalKeyDown, true)")).toBe(
      true
    );
    expect(esc.includes('stopImmediatePropagation')).toBe(true);
  });

  it('the contract hook exposes exactly one idempotent close sink', async () => {
    const src = await readFile(join(SRC, 'hooks/useDialogClose.ts'), 'utf-8');
    // Guard contract: requestClose is the single sink, handleOpenChange and
    // handleOverlayClick both delegate to it.
    expect(src.includes('requestClose')).toBe(true);
    expect(src.includes('if (!openRef.current || closedRef.current) return;')).toBe(true);
    expect(src.match(/if \(!nextOpen\) requestClose\(\)/)).toBeTruthy();
    expect(src.includes('if (e.target === e.currentTarget) requestClose();')).toBe(true);
    // Capture phase is what makes Esc unambiguous against nested surfaces.
    expect(src.includes("addEventListener('keydown', onKey, true)")).toBe(true);
  });

  it('TaskDetailView registers its close handlers BEFORE any early return', async () => {
    // Regression: the four useDialogClose() calls sat AFTER the
    // `if (isCardLoading)` / `if (!card)` guards. They were skipped on the
    // loading render and ran on the next one, so React threw "Rendered more
    // hooks than during the previous render" and the error boundary took down
    // the whole page. Hook order must be unconditional.
    const src = await readFile(join(SRC, 'components/board/TaskDetailView.tsx'), 'utf-8');
    const firstHook = src.indexOf('useDialogClose({');
    const loadingGuard = src.indexOf('if (isCardLoading)');
    const missingCardGuard = src.indexOf('if (!card)');

    expect(firstHook).toBeGreaterThan(-1);
    expect(loadingGuard).toBeGreaterThan(-1);
    expect(missingCardGuard).toBeGreaterThan(-1);

    // Every guard that returns early must come after the last close hook.
    const lastHook = src.lastIndexOf('useDialogClose({');
    expect(loadingGuard).toBeGreaterThan(lastHook);
    expect(missingCardGuard).toBeGreaterThan(lastHook);

    // And no early return may sit between the hooks and the main render.
    const between = src.slice(lastHook, src.indexOf('return (', lastHook));
    expect(between).not.toMatch(/if \([^)]*\) \{\s*return/);
  });

  it("every useDialogClose isOpen tracks state that actually drives a dialog's open prop", async () => {
    // Regression: BoardView passed `isOpen: activeCard !== null`, but
    // `activeCard` is the drag-overlay card (set at handleDragStart, cleared at
    // drag end) while the dialog's real state is the `?card=` URL param. Because
    // requestClose guards on `if (!openRef.current) return`, every close gesture
    // — X, backdrop, Esc — bailed before reaching onClose and the task dialog
    // became undismissable. The hook was correct; the call site named the wrong
    // state. A shape check cannot see that, so assert the wiring instead: each
    // identifier feeding `isOpen` must also feed some `open={...}` prop.
    const KEYWORDS = new Set(['null', 'true', 'false', 'undefined', 'boolean']);
    const identifiers = (expr: string) =>
      new Set((expr.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []).filter((id) => !KEYWORDS.has(id)));

    const offenders: string[] = [];

    for await (const file of walk(SRC)) {
      const src = code(await readFile(file, 'utf-8'));

      // `open={...}` is the dialog's real open state. No `open` prop means the
      // file controls its portal some other way — nothing to cross-check.
      const openExprs = [...src.matchAll(/open=\{([^}]*)\}/g)].map((m) => m[1]!);
      if (openExprs.length === 0) continue;

      const openIds = new Set<string>();
      for (const expr of openExprs) for (const id of identifiers(expr)) openIds.add(id);

      // Skip prop type declarations (`isOpen: boolean;`), which are pass-throughs.
      for (const m of src.matchAll(/isOpen:\s*([^,}\n]+)/g)) {
        for (const id of identifiers(m[1]!)) {
          if (!openIds.has(id)) {
            offenders.push(
              `${file.slice(SRC.length + 1)}: isOpen uses \`${id}\`, which never drives an open prop`
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  void SELF_MANAGED;
});
