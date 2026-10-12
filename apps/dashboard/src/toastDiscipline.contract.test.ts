import { describe, it, expect } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Toast discipline (AGENTS.md §5).
 *
 * §5: never fire a success toast for a routine, immediate local interaction
 * where the UI already gives direct feedback. Only failures, or completed
 * asynchronous backend actions.
 *
 * The failure this catches is not "a toast appeared" — it is a toast that
 * **lies**. Two shapes showed up during the Block 5.1 audit:
 *
 *  - A clipboard write whose promise was never awaited. `navigator.clipboard.
 *    writeText` rejects when the browser denies access, so the handler showed
 *    "Copied" (icon swap, label change, and a toast) and threw an unhandled
 *    rejection. Three success signals, none of them true.
 *  - A toast duplicating an inline confirmation the user was already looking
 *    at — `setCopied(true)` swaps Copy for Check for 2s, and the toast said the
 *    same thing a moment later.
 *
 * The repo already fixed this by hand in several places (`TaskDetailView`'s
 * link copy, `ChatMessageItem`'s task link, `ShareTaskModal`), each with a
 * comment saying so. This makes the convention mechanical instead of a set of
 * comments that decays.
 */

const SRC = join(import.meta.dir, '..');

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

/** Strips comments so prose describing a toast cannot satisfy an assertion. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const files: string[] = [];
for await (const f of walk(SRC)) files.push(f);

describe('toast discipline', () => {
  it('finds dashboard tsx files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no clipboard write claims success without handling failure', async () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = code(await readFile(file, 'utf-8'));
      const lines = body.split('\n');
      lines.forEach((line, i) => {
        if (!/clipboard\s*\.\s*writeText\s*\(/.test(line)) return;
        // Look through the end of the enclosing handler for a rejection path.
        const window = lines.slice(i, i + 12).join('\n');
        const handled =
          /\.catch\s*\(/.test(window) ||
          /try\s*\{/.test(lines.slice(Math.max(0, i - 3), i + 1).join('\n'));
        if (!handled) {
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('no success toast duplicates an inline confirmation set in the same handler', async () => {
    // `setCopiedX(true)` already swaps a Copy icon for a Check and/or rewrites
    // a label. A toast in the same handler says the same thing again.
    const INLINE =
      /set(Copied|CopiedLink|CopiedId|CopiedBranch|CopiedInviteLink|Starred|Favorited)\w*\(\s*true\s*\)/;
    const offenders: string[] = [];
    for (const file of files) {
      const body = code(await readFile(file, 'utf-8'));
      const lines = body.split('\n');
      lines.forEach((line, i) => {
        if (!/toast\.success\(/.test(line)) return;
        const window = lines.slice(Math.max(0, i - 12), i + 3).join('\n');
        if (INLINE.test(window)) {
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
