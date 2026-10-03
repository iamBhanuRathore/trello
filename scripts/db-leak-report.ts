#!/usr/bin/env bun
/**
 * Reports how many rows the backend suite leaves behind in the shared test DB.
 *
 * Why this exists: `bun test` runs 60 files against one `boardly_test` database.
 * A suite that creates an organization and never deletes it is invisible — the
 * run is green — but the database grows on every run until it is thousands of
 * rows deep, and any future test that counts orgs or users starts failing for
 * reasons unrelated to the code under test. This script makes the number
 * measurable instead of anecdotal.
 *
 * Usage:
 *   bun scripts/db-leak-report.ts            # current totals
 *   bun scripts/db-leak-report.ts --delta    # totals, minus what a suite adds
 *   bun scripts/db-leak-report.ts --slugs    # per-slug-prefix breakdown
 *
 * `--slugs` is how the remaining offenders were identified: group by the slug
 * prefix (the part before the run-unique suffix) and the suite that leaks is
 * obvious from the name — `chat-org-*` is chat.test.ts.
 */
// Resolved from apps/backend, which is where the `postgres` driver is declared.
const { default: postgres } = await import('../apps/backend/node_modules/postgres');

const DATABASE_URL =
  process.env['DATABASE_TEST_URL'] ??
  'postgresql://boardly:boardly_test@localhost:5433/boardly_test';

const TABLES = ['organizations', 'users', 'organization_members'] as const;

async function totals(sql: postgres.Sql): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const [row] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
    out[t] = (row as { n: number }).n;
  }
  return out;
}

/** Strip the run-unique suffix so the same suite's slugs group together. */
function slugGroup(slug: string): string {
  return slug.replace(/[-_]?\d{10,}.*$/, '').replace(/[-_][a-z0-9]{6,}$/, '') || slug;
}

const sql = postgres(DATABASE_URL, { max: 1 });
try {
  if (process.argv.includes('--slugs')) {
    const rows = await sql`
      SELECT slug, count(*)::int AS n FROM organizations GROUP BY slug ORDER BY n DESC`;
    const groups = new Map<string, number>();
    for (const r of rows as Array<{ slug: string; n: number }>) {
      const g = slugGroup(r.slug);
      groups.set(g, (groups.get(g) ?? 0) + r.n);
    }
    const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
    for (const [g, n] of sorted.slice(0, 40)) console.log(String(n).padStart(6), g);
    console.log(`\n${sorted.length} distinct org slug groups`);
  } else {
    const t = await totals(sql);
    console.log(JSON.stringify(t, null, 2));
    if (process.argv.includes('--delta')) {
      console.log('\nRun `bun test` in apps/backend, then re-run with --delta to compare.');
      console.log('Anything that increases is a suite that leaked.');
    }
  }
} finally {
  await sql.end();
}
