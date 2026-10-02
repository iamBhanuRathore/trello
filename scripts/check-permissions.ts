#!/usr/bin/env bun
/**
 * check-permissions — fail on permission keys missing from the registry.
 *
 * - Every requirePermission('x') key in apps/backend must be in ALL_PERMISSION_KEYS.
 * - Every can('x') / canAll('x') / permissionReason('x') / <Can permission="x">
 *   literal in apps/dashboard must be in ALL_PERMISSION_KEYS.
 *
 * Rule (permissions.ts): never invent a key inline — add it to the registry first.
 * Usage: bun run scripts/check-permissions.ts
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { ALL_PERMISSION_KEYS } from '../packages/shared-types/src/permissions';

const ROOT = join(import.meta.dir, '..');
const registry = new Set<string>(ALL_PERMISSION_KEYS);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

let failures = 0;
function check(file: string, pattern: RegExp, origin: string) {
  const src = readFileSync(file, 'utf8');
  let m: RegExpExecArray | null;
  // Fresh regex per file (global flag is stateful).
  const re = new RegExp(pattern.source, pattern.flags);
  while ((m = re.exec(src)) !== null) {
    const key = m[1]!;
    if (!registry.has(key)) {
      console.error(`[check-permissions] ${origin} key "${key}" not in registry: ${file}`);
      failures++;
    }
  }
}

for (const f of walk(join(ROOT, 'apps/backend/src'))) {
  check(f, /requirePermission\(\s*['"]([^'"]+)['"]/g, 'backend');
}
for (const f of walk(join(ROOT, 'apps/dashboard/src'))) {
  // can()/canAll() take varargs — check EVERY quoted literal in the call.
  const src = readFileSync(f, 'utf8');
  const callRe = /\b(?:can|canAll|need|needAll)\(([^)]*)\)/g;
  let cm: RegExpExecArray | null;
  while ((cm = callRe.exec(src)) !== null) {
    const litRe = /['"]([^'"]+)['"]/g;
    let lm: RegExpExecArray | null;
    while ((lm = litRe.exec(cm[1]!)) !== null) {
      if (!registry.has(lm[1]!)) {
        console.error(`[check-permissions] frontend can() key "${lm[1]}" not in registry: ${f}`);
        failures++;
      }
    }
  }
  check(f, /permissionReason\(\s*['"]([^'"]+)['"]/g, 'frontend reason');
  check(f, /<Can(?:All)?[^>]*permission[s]?=\{?["']([^"'{}]+)["']/g, 'frontend <Can>');
}

if (failures > 0) {
  console.error(
    `[check-permissions] ${failures} unregistered key(s). Add them to packages/shared-types/src/permissions.ts first.`
  );
  process.exit(1);
}
console.log(`[check-permissions] ok — all keys registered (${registry.size} keys).`);
