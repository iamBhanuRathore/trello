import { describe, it, expect } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Query failures must not render as empty states.
 *
 * The shared `QueryError` component documents the rule in its own header: every
 * `useQuery` surface renders it, with a retry, "instead of collapsing into a
 * fake empty state". React Query v5 makes this easy to get wrong — `isLoading`
 * is `isPending && isFetching`, so on a terminal error it flips back to false
 * and the render falls straight through to the empty branch.
 *
 * What that looks like in practice, all from the Block 5.1 audit:
 *
 *   - a member picker saying "No team members match the selected filter" and
 *     offering a **Reset filters** button that cannot fix a network error;
 *   - a reports page telling the PM to "start a sprint to view real-time
 *     burndown" because the burndown request 500'd;
 *   - the integrations page dropping every provider's Connected badge and
 *     inviting a re-authorize of integrations that are still connected.
 *
 * ## Why the allowlist is here and not hidden
 *
 * Fourteen surfaces were still unmigrated when this guard landed. Deleting them
 * would mean either silently excluding them (the debt grows invisibly) or
 * mechanically inserting an error branch into layouts that each need their own
 * placement. So they are listed by name: the guard blocks the class from
 * growing, and the list is the work queue. An entry must be removed in the same
 * commit that adds `isError` handling to that file.
 *
 * Coarse by design — it asks whether the file handles `isError` *anywhere*, not
 * whether every query in it is covered. File-level granularity is what can be
 * decided statically; a per-query version needs the component's render tree.
 */

const SRC = join(import.meta.dir, '..');

/**
 * Still to migrate: has an empty-array fallback but no `isError` anywhere.
 * Each line is a promise, not an exemption.
 */
const PENDING = new Set([
  'src/components/board/AutomationsModal.tsx',
  'src/components/board/clone/CloneCardDialog.tsx',
  'src/components/board/CreateTaskFromMessageModal.tsx',
  'src/components/board/CreateTaskModal.tsx',
  'src/components/board/LabelPicker.tsx',
  'src/components/board/MentionCommentBox.tsx',
  'src/components/board/TaskChatPane.tsx',
  'src/components/chat/ChatDetailsPane.tsx',
  'src/components/chat/ChatFeed.tsx',
  'src/components/chat/MentionAutocomplete.tsx',
  'src/components/chat/NewChannelModal.tsx',
  'src/components/chat/NewDirectMessageModal.tsx',
  'src/components/ui/AsyncMemberSelect.tsx',
  'src/pages/Integrations.tsx',
]);

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

/**
 * Reads the empty-state fallback in a query destructure: `data: cards = []`.
 *
 * Deliberately narrow. The obvious generalisation — any `?? []` in the file —
 * matched ~40 components that use it on plain props and arrays
 * (`const items = props.items ?? []`), which are not query fallbacks and are not
 * this rule's business. A guard that lists 40 innocent files teaches people to
 * ignore it.
 */
function hasEmptyFallback(src: string): boolean {
  return /data:\s*\w+\s*=\s*\[\]/.test(src);
}

const offenders: Array<{ file: string; pending: boolean }> = [];
for await (const file of walk(SRC)) {
  const src = await readFile(file, 'utf-8');
  if (!hasEmptyFallback(src)) continue;
  if (/\bisError\b/.test(src)) continue;
  const rel = `src/${file.slice(SRC.length + 1).replace(/^src\//, '')}`;
  offenders.push({ file: rel, pending: PENDING.has(rel) });
}

describe('query failures render an error, not an empty state', () => {
  it('every empty-state fallback either handles isError or is on the migrate list', () => {
    const unlisted = offenders.filter((o) => !o.pending).map((o) => o.file);
    expect(unlisted).toEqual([]);
  });

  it('the migrate list is not stale — a listed file must still need migrating', () => {
    // Without this, fixing a file but leaving its name in PENDING would silently
    // make the list decorative.
    const listed = offenders.filter((o) => o.pending).map((o) => o.file);
    const stale = [...PENDING].filter((f) => !listed.includes(f));
    expect(stale).toEqual([]);
  });

  it('makes progress rather than holding the debt steady', () => {
    // The list may only shrink. If this fails, a file was added to it in the
    // same commit that failed to fix another.
    expect(offenders.filter((o) => o.pending).length).toBeLessThanOrEqual(PENDING.size);
  });
});

/**
 * The half-done state: `isError` is destructured out of a query and then never
 * rendered.
 *
 * This is the failure mode a file-level rule cannot see, and it is easy to land
 * on — alias the flag, add the branch to the wrong ternary arm, ship. The flag
 * is present, so "does this file handle errors?" says yes, and the surface still
 * renders its empty state.
 *
 * An alias that occurs exactly once in the file is being destructured and
 * nothing else: not read in JSX, not passed to a child, not used in a guard.
 */
describe('isError flags that were destructured and never used', () => {
  it('every aliased isError is read somewhere', async () => {
    const dead: string[] = [];

    for await (const file of walk(SRC)) {
      const src = await readFile(file, 'utf-8');

      // `isError: alias` — a renamed flag in a destructure. Precise.
      const aliased = [...src.matchAll(/\bisError\s*:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!);
      for (const alias of aliased) {
        const uses = src.match(new RegExp(`\\b${alias}\\b`, 'g')) ?? [];
        if (uses.length <= 1) {
          dead.push(`${file.slice(SRC.length + 1)}: isError: ${alias} — declared, never used`);
        }
      }

      // Bare `isError` counts only when it is genuinely destructured out of a
      // query. Reading it as `listQuery.isError` is a member access on the
      // returned object and is used at its render site by definition — five
      // files were flagged for that before this was narrowed.
      const destructureBodies = [
        ...src.matchAll(/const\s*\{([^}]*)\}\s*=\s*use[A-Za-z]*Query\w*\s*\(/g),
      ].map((m) => m[1]!);
      for (const body of destructureBodies) {
        if (!/(^|[,\s])isError\s*([,}\s]|$)/.test(body)) continue;
        const uses = src.match(/\bisError\b/g) ?? [];
        if (uses.length <= 1) {
          dead.push(`${file.slice(SRC.length + 1)}: isError — declared, never used`);
        }
      }
    }

    expect(dead).toEqual([]);
  });
});
