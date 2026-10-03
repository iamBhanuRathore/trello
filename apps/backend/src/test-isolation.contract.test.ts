import { describe, it, expect } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Test-isolation contracts (P4).
 *
 * The backend suite shares one scratch database (`boardly_test`) across 59
 * files. Every suite therefore has to scope its writes and its teardown to the
 * ids it created. Two rules were being broken:
 *
 * 1. `db.delete(table)` with no `.where(...)` deletes every row in a shared
 *    table. Thirteen of these existed. `refresh_tokens` was the worst: three
 *    suites wiped all live tokens in a `beforeEach`/`afterAll`, so an unrelated
 *    suite's mid-test sign-in could 401 purely from file execution order.
 * 2. Deleting a row the suite does not own — here the global `Member` system
 *    role (`organizationId = null`), which under parallel workers could be
 *    removed while another worker was resolving against it.
 *
 * The guard below is a source scan rather than a runtime check: a destructive
 * delete is only ever observable by looking at what survived, which is exactly
 * the failure mode that hides.
 */

const SRC = join(import.meta.dir);
const read = (rel: string) => readFile(join(SRC, rel), 'utf-8');

async function testFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(SRC, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await testFiles(rel)));
    else if (entry.name.endsWith('.test.ts')) out.push(rel);
  }
  return out;
}

/**
 * Blanks out comments, preserving offsets so reported line numbers stay right.
 *
 * Needed because these very fixes are described in comments next to the code —
 * a scanner that reads comments flags its own explanation. Stripping can only
 * remove text, so it cannot manufacture a false positive; it could in principle
 * hide a delete mentioned in a comment, which is not a real delete anyway.
 */
function stripComments(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let j = i; j < stop; j++) out += src[j] === '\n' ? '\n' : ' ';
      i = stop - 1;
    } else {
      out += src[i];
    }
  }
  return out;
}

/** `db.delete(schema.x)` statements with no `.where(` before the statement ends. */
function unscopedDeletes(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const found: string[] = [];
  const re = /(?:appDb|\w*[dD]b)\s*\.\s*delete\s*\(\s*schema\.(\w+)\s*\)/g;
  for (const m of src.matchAll(re)) {
    // Walk forward from the match to the end of the statement, tracking nesting,
    // and look for a `.where(` at depth 0.
    let i = m.index! + m[0].length;
    let depth = 0;
    let sawWhere = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && src.startsWith('.where(', i)) {
        sawWhere = true;
        break;
      } else if (depth === 0 && c === ';') break;
    }
    if (!sawWhere) {
      const line = src.slice(0, m.index!).split('\n').length;
      found.push(`schema.${m[1]} @${line}`);
    }
  }
  return found;
}

describe('no test deletes a shared table wholesale', () => {
  it('every delete in a test file is scoped with .where()', async () => {
    const files = await testFiles('.');
    const offenders: string[] = [];
    for (const f of files) {
      const bad = unscopedDeletes(await read(f));
      if (bad.length) offenders.push(`${f}: ${bad.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('teardown goes through the sanctioned helpers', async () => {
    const utils = await read('test-utils.ts');
    expect(utils).toContain('export async function deleteTestOrg');
    expect(utils).toContain('export async function deleteTestUser');
    // Added for the three suites that were resetting token state with a bare
    // `db.delete(refreshTokens)`.
    expect(utils).toContain('export async function deleteTestUserTokens');
  });
});

describe('tests do not delete rows they do not own', () => {
  it('no test deletes a global (organizationId = null) system role', async () => {
    const files = await testFiles('.');
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(await read(f));
      // A `roles` delete is only legitimate when it is scoped by the suite's own
      // org. The dangerous shape is the reverse: creating and removing the
      // seeded global role.
      if (
        /organizationId:\s*null[\s\S]{0,400}?delete\(\s*(?:appDb|\w*[dD]b)?\s*\.?\s*roles\s*\)/.test(
          src
        )
      ) {
        const line = src.split('\n').findIndex((l) => /organizationId:\s*null/.test(l)) + 1;
        offenders.push(`${f}: inserts a global role near line ${line} and deletes it`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
