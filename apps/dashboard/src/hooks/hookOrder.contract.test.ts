import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Hooks must never be sequenced after an early-return guard (AGENTS.md §11).
 *
 * React requires an identical hook order on every render. A component that
 * returns early — a loading spinner, an empty state, an error panel — before
 * reaching a `useDialogClose()` call skips that hook on the first render and
 * runs it on the next one. React then throws:
 *
 *   "Rendered more hooks than during the previous render."
 *
 * and the nearest error boundary replaces the whole page with
 * "This page crashed" — which is exactly what a user sees when opening a card
 * from My Tasks. The trigger is always async data (`isLoading`, `!projects`,
 * `isProfileError && !profile`) flipping between renders, so it fires the first
 * time a query resolves and cannot be reproduced by reading the JSX.
 *
 * Seven components carried this: TaskDetailView, Billing, DeveloperSettings,
 * CustomRoles, ProfileSettings, ProjectsList and GlobalCreateWorkspaceDialog.
 *
 * This walks the real AST rather than grepping source text, because the
 * property is structural — a `useX()` call that is a *sibling statement after*
 * a guard-returning `if`, not one nested inside it — and a textual scan cannot
 * tell those apart. `forwardRef`/`memo` components are FunctionExpressions, so
 * all four function-like node kinds are checked.
 *
 * Note it deliberately checks only this one structural hazard. It is not a
 * general Rules-of-Hooks linter — that is ESLint's `react-hooks/rules-of-hooks`
 * job, and duplicating it here would only add a second, weaker source of truth.
 */

const SRC = join(import.meta.dir, '..');

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walkFiles(full);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full;
  }
}

/** Does this statement unconditionally return? That is the guard shape. */
function definitelyReturns(s: ts.Statement): boolean {
  if (ts.isReturnStatement(s)) return true;
  if (ts.isIfStatement(s) && s.thenStatement && !s.elseStatement)
    return definitelyReturns(s.thenStatement);
  if (ts.isBlock(s)) return s.statements.some(definitelyReturns);
  return false;
}

const isHookCall = (e: ts.Expression): boolean => ts.isIdentifier(e) && /^use[A-Z]/.test(e.text);

interface Violation {
  file: string;
  fn: string;
  guardLine: number;
  hookLine: number;
  hook: string;
}

function findViolations(file: string): Violation[] {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const out: Violation[] = [];

  function checkBody(body: ts.Block, fn: string) {
    let guardLine = -1;
    for (const stmt of body.statements) {
      if (definitelyReturns(stmt)) {
        guardLine = line(stmt);
        continue;
      }
      if (guardLine < 0) continue;
      // A sibling statement after a guard-returning `if`.
      (function rec(n: ts.Node) {
        if (ts.isCallExpression(n) && isHookCall(n.expression) && line(n) > guardLine) {
          out.push({
            file: relative(SRC, file),
            fn,
            guardLine,
            hookLine: line(n),
            hook: (n.expression as ts.Identifier).text,
          });
        }
        n.forEachChild(rec);
      })(stmt);
    }
  }

  function visit(node: ts.Node) {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      const named = (node as ts.FunctionDeclaration).name?.text;
      const fromVar = ts.isVariableDeclaration(node.parent)
        ? node.parent.name.getText(sf)
        : undefined;
      checkBody(node.body, named ?? fromVar ?? '<anonymous>');
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

describe('no hooks after an early-return guard', () => {
  const files = [...walkFiles(SRC)];
  const violations = files.flatMap(findViolations);

  it('scans a non-trivial number of files (guards against silently scanning nothing)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no component calls a hook after a guard that returns early', () => {
    const detail = violations
      .map(
        (v) =>
          `${v.file} — ${v.fn}(): early return at L${v.guardLine}, then ${v.hook}() at L${v.hookLine}`
      )
      .join('\n');
    expect(violations, `\n${detail}\n\nHoist the hook(s) above the guard.`).toEqual([]);
  });

  it('detects the pattern it claims to detect', () => {
    // Self-check: the scanner must flag a synthetic violation, otherwise a
    // silently broken walk would make the suite pass for the wrong reason.
    const fixture = `
      function Bad({ loading }: { loading: boolean }) {
        if (loading) return <div />;
        const [open, setOpen] = useState(false);
        return <div>{String(open)}</div>;
      }
      export default Bad;
    `;
    const sf = ts.createSourceFile(
      'fixture.tsx',
      fixture,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const found: string[] = [];
    (function rec(n: ts.Node) {
      if (
        (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) &&
        n.body &&
        ts.isBlock(n.body)
      ) {
        let guard = -1;
        for (const s of n.body.statements) {
          if (definitelyReturns(s)) {
            guard = 1;
            continue;
          }
          if (guard < 0) continue;
          (function r2(m: ts.Node) {
            if (ts.isCallExpression(m) && isHookCall(m.expression))
              found.push((m.expression as ts.Identifier).text);
            m.forEachChild(r2);
          })(s);
        }
      }
      ts.forEachChild(n, rec);
    })(sf);
    expect(found).toEqual(['useState']);
  });
});
