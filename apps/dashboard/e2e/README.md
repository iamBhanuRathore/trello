# Dashboard E2E (Playwright)

Two-tier browser suite — the automated replacement for manual QA passes.

## Layout

- `e2e/smoke/` — gate tier. Auth across personas, role guards, core board loop.
  Runs on every PR: `bun run test:e2e:smoke`.
- `e2e/full/` — coverage tier. Chat (two users), calendar, git webhooks (HTTP),
  admin flows, productivity surfaces. Nightly + on demand: `bun run test:e2e:full`.
- `e2e/helpers.ts` — seed personas from `docs/SEED_CREDENTIALS.md`
  (all `Password123!`), UI + API login helpers.
- `playwright.config.ts` — `smoke` and `full` projects (`full` depends on `smoke`).

## Prerequisites

1. Postgres + Redis running (`bun run dev` handles Docker).
2. Migrations + seeds applied, **including the Acme demo org** (personas live there):
   `bun run --cwd apps/backend db:migrate && bun run --cwd apps/backend db:seed`
   (plus the org seed that provides `acme-corp`).
3. Backend on `:3001`, dashboard on `:5173` (`bun dev`).

Then: `bun run --cwd apps/dashboard test:e2e:smoke`.

## Conventions

- Prefer stable role/text assertions over CSS selectors; never assert on
  generated ids or timestamps.
- Mutation tests use unique `e2e-<stamp>` entities and delete them in
  `afterAll` — never mutate seed data.
- Async UI (guards, grids, realtime) gets settle-first assertions
  (`or()` + generous timeouts), never bare sleeps.
- Screenshots save automatically under `test-results/` on failure only.
