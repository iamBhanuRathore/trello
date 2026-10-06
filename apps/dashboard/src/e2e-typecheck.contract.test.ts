import { describe, it, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * The Playwright suite must be type-checked by `bun run typecheck`.
 *
 * e2e/ lived outside every tsconfig, so `tsc -b` reported a clean dashboard
 * while the specs rotted. Two failures shipped that way:
 *
 *  1. `Cannot find name 'process'` on `helpers.ts:3` (no `@types/node` ambient
 *     types in scope) — the error in the screenshot.
 *  2. `automation.spec.ts` passing `{ timeout: 180000 }` as the second argument
 *     to `test()`. Playwright 1.63's `TestDetails` has no `timeout` field, so
 *     TypeScript flagged it — and had it not, the timeout would have been
 *     *silently dropped at runtime*, letting a 3-minute automation rule test run
 *     on the 30s default. Fixed with `test.setTimeout()`.
 *
 * Three guards: the e2e project is reachable from the root tsconfig (so
 * `tsc -b` follows the reference), it covers e2e/ with node types in scope, and
 * the real compiler is actually run against it.
 */

// Tests live in src/ but assert on repo-root configs and e2e/ — one level up.
const APP = join(import.meta.dir, '..');
const read = (rel: string) => readFileSync(join(APP, rel), 'utf-8');
const readJson = (rel: string) => JSON.parse(stripJsonComments(read(rel)));

function stripJsonComments(src: string): string {
  // tsconfig files are JSONC; bun's JSON.parse rejects trailing commas/comments.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

describe('e2e type-check coverage', () => {
  it('root tsconfig references the e2e project so `tsc -b` type-checks it', () => {
    const refs = readJson('tsconfig.json').references ?? [];
    expect(refs.map((r: { path: string }) => r.path)).toContain('./tsconfig.e2e.json');
  });

  it('the e2e project includes specs + playwright config with node types in scope', () => {
    const cfg = readJson('tsconfig.e2e.json');
    expect(cfg.include).toContain('e2e');
    expect(cfg.include).toContain('playwright.config.ts');
    // `process` in helpers.ts / playwright.config.ts resolves only via these.
    expect(cfg.compilerOptions.types).toContain('node');
  });

  it('the e2e project compiles clean (guards the exact TS2353/TestDetails drift)', () => {
    // bun hoists to the workspace root, so fall back up the tree for .bin/tsc.
    const tsc =
      [join(APP, 'node_modules/.bin/tsc'), join(APP, '../../node_modules/.bin/tsc')].find(
        existsSync
      ) ?? 'tsc';
    const proc = Bun.spawnSync([tsc, '-p', join(APP, 'tsconfig.e2e.json'), '--noEmit'], {
      cwd: APP,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = proc.stdout.toString() + proc.stderr.toString();
    expect(out.trim()).toBe('');
    expect(proc.exitCode).toBe(0);
  });
});

describe('test() details never carry a silently-ignored timeout', () => {
  it('finds no test(title, { timeout }) call in e2e/', () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith('.ts')) {
          const src = read(rel);
          const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
          const visit = (node: ts.Node) => {
            if (
              ts.isCallExpression(node) &&
              ts.isIdentifier(node.expression) &&
              (node.expression.text === 'test' ||
                node.expression.text.endsWith('.only') ||
                node.expression.text.endsWith('.skip')) &&
              node.arguments.length === 3 &&
              ts.isObjectLiteralExpression(node.arguments[1])
            ) {
              const keys = (node.arguments[1] as ts.ObjectLiteralExpression).properties
                .filter(ts.isPropertyAssignment)
                .map((p) => p.name.getText(sf));
              if (keys.includes('timeout'))
                offenders.push(
                  `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
                );
            }
            ts.forEachChild(node, visit);
          };
          visit(sf);
        }
      }
    };

    walk('e2e');
    expect(offenders).toEqual([]);
  });
});
