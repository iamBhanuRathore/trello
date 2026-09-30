# PROMPT_PATTERNS.md — AI Prompt Guide for Boardly

Cheat sheet of prompt structures that consistently produce good results when working with AI coding agents on this project. Use these patterns to get faster, more accurate output and avoid common failure modes.

**This file is for the human developer.** It is not read by agents during normal sessions — it's a reference for _you_ to craft better prompts.

---

## 1. The Golden Rule: Give Context Upfront

AI agents work best when they have the full picture before writing code. Always lead with:

1. **What file/module you're working in** (e.g. `apps/backend/src/modules/cards/`)
2. **Which architectural doc section is relevant** (e.g. "See `project.md` §4a for the card people model")
3. **What already exists** (e.g. "The `boards` module already exists with `routes.ts`, `service.ts`, `schema.ts` following the established pattern")
4. **What specifically you want built or changed**

---

## 2. Starting a New Work Session

Use this at the start of every session to orient the agent:

```
Read these files before starting:
1. docs/Progress.md — current project state and what was done last session
2. docs/Roadmap.md — pick the first unchecked item (or I'll tell you which one)
3. AGENTS.md (repo root) — coding conventions you must follow

Current task: [describe the task]

Do NOT start coding until you confirm you've read all three files and understood the task.
```

---

## 3. Building a New Backend Module

Template for asking an agent to build a new Elysia route module (e.g. cards, boards, sprints):

```
Build the `[module name]` backend module at `apps/backend/src/modules/[name]/`.

Follow the exact module structure from AGENTS.md (root) §5 and docs/project-tech-stack.md §5:
- routes.ts — Elysia route handlers only, no business logic
- service.ts — all business logic and DB queries via Drizzle
- validation schemas live at the route boundary (only modules/importers keeps a dedicated schema.ts; shared shapes belong in packages/shared-types)

Rules to follow:
- Every mutating route must call requirePermission('[permission.key]') — see PERMISSIONS_MATRIX.md for the correct key
- Every Drizzle query must be scoped by organization_id — see DATABASE_SCHEMA.md for the correct column names
- Write failing tests first in [module name].test.ts using `bun test`
- Follow the Drizzle schema exactly as defined in DATABASE_SCHEMA.md §[N] — do not invent column names

The module must handle: [list the specific operations, e.g. "create card, update card, move card between lists, archive card"]

Enterprise standard (AGENTS.md §7): match Linear/Jira/Notion interaction quality — optimistic UI with rollback, loading/empty/error states for every async surface, no dead controls. State the benchmark product for each operation.

Reference: project.md §[N] for the data model context.
```

---

## 4. Building a New Dashboard Component

Template for asking an agent to build a React component:

````
Build the `[ComponentName]` component at `apps/dashboard/src/components/[path]/[ComponentName].tsx`.

Design tokens to use (from DESIGN_TOKENS.md):
- Colors: [list relevant tokens, e.g. "surface-raised for background, brand-500 for interactive elements"]
- Typography: [e.g. "text-sm font-medium for labels"]
- Spacing: use Tailwind tokens from packages/config/tailwind/preset.ts — no hardcoded px values

UI component library: use shadcn/ui components from @boardly/ui where possible (Button, Input, Dialog, etc.)

Behavior:
- [describe what the component does]
- [list props/state it needs]
- [list interactions — hover, click, keyboard nav]

Tests: add a Playwright flow in apps/dashboard/e2e/smoke/ (see e2e/helpers.ts personas + e2e/README.md).
There is no dashboard unit-test setup (no Vitest) — test component behavior
through the UI, NOT implementation internals. Backend logic gets `bun test`
service tests co-located as [name].test.ts.

Code-splitting (mandatory for every new page/route — see Decisions.md 2026-09-09):
- NEVER static-import a page into `App.tsx`. Register it as a `React.lazy` chunk:
  ```tsx
  const MyPage = lazy(() => import('./pages/MyPage').then((m) => ({ default: m.MyPage })));
````

(`.then()` mapping is required because pages use named exports, not default exports.)

- The `<Routes>` tree is already wrapped in `<Suspense fallback={<RouteFallback />}>` — new routes inherit it automatically.
- Heavy below-the-fold UI (modals, drawers, wizards opened on click) MUST also be `React.lazy` + mounted only when opened (`{isOpen && <Suspense>…}`), following `BoardView.tsx` (`CardModal`/`AutomationsModal`/`FormBuilderModal`) and `DashboardLayout.tsx` (`TrashBinModal`/`AppearanceModal`).
- Shared fallback lives at `apps/dashboard/src/components/common/RouteFallback.tsx` — reuse it, don't invent per-page spinners.

Enterprise standard (AGENTS.md §7): match Linear/Jira/Notion interaction quality —

- Keyboard: `Enter` submits, `Shift+Enter` newline in multi-line inputs, `Escape` cancels.
- Save buttons are dirty-tracked (disabled when pristine, with explanatory tooltip).
- Every async surface has loading/empty/error states; mutations are optimistic with rollback.
- No control that silently does nothing.

Reference: [architecture doc section] for the feature context.

```

---

## 5. Adding a Permission Check

When you realize a route or component is missing a permission gate:

```

Add a permission check to [route/component].

Permission key: '[correct.key]' — verify this exists in PERMISSIONS_MATRIX.md before using it.

Backend: wrap the route with requirePermission('[key]') using the Elysia plugin guard pattern from Agents.md §5.

Frontend: wrap the UI element with usePermission('[key]') and hide/disable it when the user lacks permission — do NOT just hide it, also disable it to prevent keyboard/screenreader access.

Add a test asserting:

- A user WITH the permission CAN perform the action
- A user WITHOUT the permission gets a 403 (backend) / sees the element hidden (frontend)

```

---

## 6. Database Schema Change

When adding a new table or column:

```

Add [describe the change] to the database schema.

1. Update DATABASE_SCHEMA.md §[N] first with the Drizzle ORM definition
2. Add the schema to apps/backend/src/db/schema/[file].ts
3. Run: bun drizzle-kit generate (this generates the migration file — DO NOT edit migration files manually)
4. Follow additive-first discipline (project-tech-stack.md §9.1): if this adds a NOT NULL column to an existing table, make it nullable first and note that a backfill + NOT NULL constraint should follow in a subsequent migration

Every new table must have:

- UUID primary key with defaultRandom()
- organization_id FK (if it's a tenant-scoped table)
- created_at, updated_at timestamps
- deleted_at (nullable) for soft deletes

Do not apply the migration yet — I'll run it manually after reviewing the generated file.

```

---

## 7. Writing Tests

When asking specifically for tests:

```

Write tests for [feature/function] in [file path].

Test tool: [bun test (backend, hits the test Postgres via DATABASE_TEST_URL — no testcontainers) / Playwright (dashboard e2e, apps/dashboard/e2e) — match the app]

Test pyramid priority:

1. Unit tests for business logic in service.ts — `bun test`, co-located `[name].test.ts`
2. Integration tests for DB queries — same `bun test` setup against the test Postgres instance (DATABASE_TEST_URL env var)
3. E2E only if this is a critical user flow (see apps/dashboard/e2e/README.md for the smoke/full tiers)

Non-negotiable test cases to include (see project-tech-stack.md §8.3):

- [list any that apply: permission checks, multi-tenant isolation, state transitions, billing calculations]

Use shared fixtures from @boardly/test-fixtures — specifically createOrgWithUsers(), createBoardWithCards() etc. — do NOT hand-roll test data setup.

Test file location: co-located with the source file ([filename].test.ts), NOT in a separate **tests** directory.

```

---

## 8. Multi-Tenant Isolation Verification

Use this pattern anytime you're unsure whether a new query is properly tenant-scoped:

```

Review this query/function for multi-tenant data isolation:

[paste the query or function]

Verify:

1. Is organization_id present in the WHERE clause at the application layer?
2. Does the Drizzle query use the organization_id variable from the authenticated user's session, NOT from a URL param that could be spoofed?
3. App-layer scoping is the enforcement (Postgres RLS is deliberately unenforced — accepted risk, see docs/Decisions.md 2026-09-28 Security entry). Do NOT assume an RLS policy backs the table.
4. Write an integration test that creates two separate orgs (Org A and Org B), seeds data in both, makes an API call authenticated as Org A, and asserts that Org B's data is NEVER returned.

Flag any issue as a security concern, not a bug.

```

---

## 9. Code Review / Audit Prompt

Before merging a PR or finishing a feature, ask the agent to self-audit:

```

Audit the code in [path or list of files] before I consider it done.

Check for:

1. Missing permission checks (every mutating route should call requirePermission())
2. Missing organization_id scoping in any Drizzle query
3. Any `any` TypeScript types (Agents.md §3 forbids these)
4. console.log or commented-out code left in (Agents.md §3)
5. Missing tests for any business logic added (Agents.md §6)
6. Hardcoded hex colors or pixel values that should use design tokens (DESIGN_TOKENS.md)
7. Any import that should come from @boardly/shared-types but was defined locally instead
8. Enterprise-standard gaps (AGENTS.md §7): single-line inputs where multi-line is expected, missing Enter/Shift+Enter/Escape handling, enabled buttons with nothing to do, missing loading/empty/error states

Report issues as a numbered list. Fix them in order, one at a time.

```

---

## 10. Debugging a Failing Test

```

This test is failing. Debug it without changing the test unless the test itself is wrong.

Test file: [path]
Test name: "[exact test name]"
Error output: [paste the error]

Approach:

1. Read the test and understand what it's asserting
2. Read the implementation it's testing
3. Identify the gap
4. Fix the implementation, not the test assertion (unless the test assertion is provably wrong)
5. Confirm the fix makes conceptual sense against the relevant spec in project.md or DATABASE_SCHEMA.md

```

---

## 11. Session End — Updating Progress Docs

Always end a session with this prompt:

```

We're wrapping up this session. Please update the following files:

1. docs/Progress.md:
   - Update "Current State" → "What exists" to reflect what was built today
   - Append a log entry for today's session using the template in that file
   - Update "What's in progress" and "What's explicitly NOT started"

2. docs/Roadmap.md:
   - Check off any tasks completed today (use [x])
   - Mark any in-progress tasks with [/] if partially done

3. docs/Decisions.md:
   - Add an entry for any non-trivial technical decisions made today (use today's date, follow the template at the top of that file)

Do these updates in order. Summarize what was done in one paragraph after updating.

```

---

## 12. Common Failure Modes (and how to prevent them)

| Failure | What causes it | How to prevent |
|---|---|---|
| Agent uses wrong column name in a query | Didn't read DATABASE_SCHEMA.md | Always reference the relevant §N in DATABASE_SCHEMA.md in your prompt |
| Agent invents a new permission key | Didn't check PERMISSIONS_MATRIX.md | Explicitly say "check PERMISSIONS_MATRIX.md — do not invent a new key" |
| Agent skips writing tests | Not explicitly instructed | Include "write failing tests first" in every build prompt |
| Agent hardcodes hex colors | Didn't know about design tokens | Include "use tokens from DESIGN_TOKENS.md" in every UI prompt |
| Agent forgets organization_id scoping | Didn't read the backend practices | Include "every query must be scoped by organization_id" in every backend prompt (see docs/project-tech-stack.md §5) |
| Agent makes up a file structure | Didn't read the monorepo layout (AGENTS.md §2) | Reference "follow the monorepo layout in AGENTS.md §2" |
| Agent writes E2E tests for simple logic | Default preference for high-level tests | Specify the test level explicitly: "write unit tests only for this" |
| Progress.md goes stale | Session ends without update | Make session-end doc updates a non-negotiable final step (use prompt pattern #11) |

---

## 13. Useful One-Liners

Quick prompts for small tasks:

- **"Did we already build X?"** → `"Check docs/Progress.md and docs/Roadmap.md. Has [feature] been built yet? If yes, where is it? If no, confirm it's in the Roadmap."`
- **"What's next?"** → `"Read docs/Progress.md and docs/Roadmap.md. What is the next unchecked task in priority order? Describe what building it will involve before starting."`
- **"Is this type safe?"** → `"Run tsc --noEmit across the whole monorepo and report any type errors. Fix them without weakening strictness."`
- **"Clean up this PR"** → `"Run the code audit from PROMPT_PATTERNS.md §9 on all changed files. Fix every issue found."`
```
