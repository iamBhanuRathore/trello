import { describe, it, expect } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Query-key contract — every `invalidateQueries` target must match a query
 * something actually reads.
 *
 * React Query matches an invalidated key against cached queries by **prefix**,
 * element-wise, with `===` on the runtime values. So `['board', boardId]` does
 * not invalidate a query stored under `['board', 'full', boardId]`: index 1 is
 * `boardId` against the literal `'full'`. A key that looks right and silently
 * invalidates nothing is the worst shape of bug here — there is no error, the
 * mutation succeeds, and the UI keeps showing pre-mutation data.
 *
 * That is not hypothetical. `CreateTaskFromMessageModal` invalidated
 * `['cards', boardId]` (a key **no** `useQuery` in the dashboard ever reads) and
 * `['board', boardId]` (a prefix of nothing), while the board the user is
 * looking at is stored under `['board', 'full', boardId]`. Creating a task
 * from a chat message left the kanban stale. `StageTemplates` invalidated
 * `['stageTemplates', orgId]` and `['stageTemplate', orgId]` while the task
 * stage picker reads `['stageTemplatesWithStages', orgId]` — neither is a prefix
 * of it, so an admin renaming a stage then opening a task got a 5-minute-stale
 * list and could save a task against a stage that no longer existed.
 *
 * ## What this can and cannot see
 *
 * Statically decidable: a key whose *static* prefix matches no read key is dead.
 * That is the whole class above, and it is the common one.
 *
 * Not decidable statically: a key ending in a dynamic value that happens to sit
 * where a read key has a literal — `['board', boardId]` vs `['board', 'full',
 * boardId]`. Whether it matches depends on runtime values. Those are handled by
 * fixing the call site, not by this guard; the prefix rule would be too
 * permissive to catch them and too noisy to approximate.
 */

const SRC = join(import.meta.dir, '..');

/** Every `.tsx`/`.ts` under src, minus node_modules and e2e. */
async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'e2e') continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      yield full;
    }
  }
}

/** Reads a balanced `[...]` starting at `from`, returns its end index (exclusive). */
function arrayEnd(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i]!;
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

/**
 * Splits a key literal into its top-level elements, handling nesting, quotes and
 * template literals so a computed element stays a single unit.
 */
function splitElements(literal: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < literal.length; i++) {
    const c = literal[i]!;
    if (quote) {
      current += c;
      if (c === quote && literal[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      current += c;
      continue;
    }
    if (c === '[' || c === '{' || c === '(') depth++;
    if (c === ']' || c === '}' || c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

interface Site {
  file: string;
  key: string[];
  offset: number;
}

async function collect(): Promise<{ reads: Site[]; invalidations: Site[] }> {
  const reads: Site[] = [];
  const invalidations: Site[] = [];

  for (const file of files) {
    const src = await readFile(file, 'utf-8');
    const rel = file.slice(SRC.length + 1);

    // Spans owned by `invalidateQueries(`: a queryKey inside one is a *write*,
    // never a read. Classified by offset rather than by blanking the source --
    // blanking with a regex proved too fragile (one greedy match ate real reads
    // in the same file) and silently disabled the entire guard.
    const spans: Array<[number, number]> = [];
    const invRe = /\binvalidateQueries\s*\(/g;
    let im: RegExpExecArray | null;
    while ((im = invRe.exec(src))) {
      const paren = src.indexOf('(', im.index);
      let depth = 0;
      let quote: string | null = null;
      for (let i = paren; i < src.length; i++) {
        const c = src[i]!;
        if (quote) {
          if (c === quote && src[i - 1] !== '\\') quote = null;
          continue;
        }
        if (c === "'" || c === '"' || c === '`') {
          quote = c;
          continue;
        }
        if (c === '(' || c === '{' || c === '[') depth++;
        else if (c === ')' || c === '}' || c === ']') {
          depth--;
          if (depth === 0) {
            spans.push([im.index, i + 1]);
            invRe.lastIndex = i + 1;
            break;
          }
        }
      }
    }

    const inInvalidate = (o: number) => spans.some(([a, b]) => o >= a && o < b);

    const qRe = /\bqueryKey\s*:\s*\[/g;
    let qm: RegExpExecArray | null;
    while ((qm = qRe.exec(src))) {
      const bracket = qm.index + qm[0].length - 1;
      const end = arrayEnd(src, bracket);
      const site: Site = {
        file: rel,
        key: splitElements(src.slice(bracket + 1, end - 1)),
        offset: qm.index,
      };
      if (inInvalidate(qm.index)) invalidations.push(site);
      else reads.push(site);
    }
  }
  return { reads, invalidations };
}

/** True when `read` begins with the static (non-dynamic) part of `invalidated`. */
function isPrefixedBy(read: string[], invalidated: string[]): boolean {
  if (invalidated.length > read.length) return false;
  return invalidated.every(
    (el, i) => !(el.startsWith("'") || el.startsWith('"')) || el === read[i]
  );
}

const files: string[] = [];
for await (const f of walk(SRC)) files.push(f);

interface Site {
  file: string;
  key: string[];
}

describe('query-key contract', () => {
  it('finds dashboard sources to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds both read keys and invalidation keys', async () => {
    const { reads, invalidations } = await collect();
    expect(reads.length).toBeGreaterThan(100);
    expect(invalidations.length).toBeGreaterThan(20);
  });

  it('every invalidated key is a prefix of a key some query actually reads', async () => {
    const { reads, invalidations } = await collect();
    const readKeys = reads.map((r) => r.key);

    const dead = invalidations
      .filter((inv) => !readKeys.some((read) => isPrefixedBy(read, inv.key)))
      .map((inv) => `${inv.file}: invalidates [${inv.key}], which no query reads`);

    expect(dead).toEqual([]);
  });
});
