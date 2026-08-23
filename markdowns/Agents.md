# AGENTS.md — Boardly

Instructions for any AI coding agent (Claude Code, Cursor, Copilot Workspace, etc.) working in this repository. Read this file before making changes. Also read `trello-clone-architecture.md` (system design) and `project-tech-stack.md` (stack + testing strategy) for full context — this file governs _how_ to write code, those govern _what_ to build.

---

## 1. Project Summary

Boardly is a multi-tenant, enterprise Trello/Jira-competitor SaaS: boards, lists, cards, sprints, phases, custom stages, subtasks, RBAC across Super Admin / Company Admin / User panels. Monorepo, TypeScript everywhere (dashboard, website, mobile, backend).

---

## 2. Monorepo Layout

```
/apps
  /dashboard      (Vite + React + TS)
  /website        (Next.js)
  /mobile         (Expo)
  /backend        (Bun + Elysia)
/packages
  /shared-types   (Zod/TypeBox schemas, enums, permission keys)
  /ui             (shared design-system components — web)
  /ui-native      (shared design-system components — mobile)
  /test-fixtures  (factory/seeder functions for tests)
  /config         (eslint, tsconfig, tailwind presets)
```

- Use **Turborepo** task pipelines (`turbo.json`) for build/test/lint across apps.
- Never duplicate a type, enum, or validation schema that already exists in `packages/shared-types` — import it. If it doesn't exist yet and is used by more than one app, create it there instead of locally.
- Don't add a new top-level app or package without checking whether one of the existing ones already fits.

---

## 3. Code Style & Conventions

### General

- **TypeScript strict mode everywhere** (`strict: true` in every `tsconfig.json`). Never weaken this to unblock a change — fix the type instead.
- No `any`. If a type is genuinely unknown, use `unknown` and narrow it, or ask before adding an escape hatch.
- Prefer explicit return types on exported functions; internal/local functions can rely on inference.
- Naming: `camelCase` for variables/functions, `PascalCase` for components/types/classes, `SCREAMING_SNAKE_CASE` for constants, `kebab-case` for file names except React component files which are `PascalCase.tsx`.
- One component/class per file where reasonable. Co-locate a component's test file next to it (`Board.tsx`, `Board.test.tsx`), not in a parallel `__tests__` tree.
- No commented-out code left in commits. No `console.log` in committed code — use the project's logger (backend: structured logger via the observability stack; frontend: remove entirely or gate behind a debug flag).
- Keep functions small and single-purpose; if a function needs a comment explaining what it does in plain English, consider whether it should be split or renamed instead.
- Prefer composition over inheritance; avoid deep class hierarchies.

### Formatting & Linting

- **ESLint + Prettier**, configured once in `packages/config` and extended by every app — never override rules per-app without a documented reason.
- Run lint/format as a pre-commit hook (Husky + lint-staged) and as a required CI check. Don't hand-fix formatting — run the formatter.
- Import order: external packages → internal packages (`@boardly/shared-types`, etc.) → relative imports, each group alphabetized, enforced via `eslint-plugin-import`.

### Git & PRs

- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`) — this also drives changelog generation.
- Branch naming: `feature/short-description`, `fix/short-description`, `chore/short-description`.
- Keep PRs scoped to one logical change. A PR that touches backend RBAC logic and unrelated dashboard styling should be two PRs.
- Every PR that changes behavior must include or update tests — see §6. A PR without a corresponding test change for a logic/behavior change should be treated as incomplete, not "tests to follow later."
- Write PR descriptions that state _what_ changed and _why_, not just a restatement of the diff.

---

## 4. UI Component Libraries

### Web (Dashboard + Website)

- **shadcn/ui** (https://ui.shadcn.com) is the base component layer — buttons, inputs, dialogs, dropdowns, forms, tables, tabs, etc. Install via the shadcn CLI directly into `packages/ui`, not by copy-pasting manually, so updates stay traceable.
- **Aceternity UI** (https://ui.aceternity.com/components) is for animated/visual-effect components — hero sections, animated backgrounds, scroll effects, marketing-page flourishes. Use this primarily in the **website** (`apps/website`) for landing/marketing pages where visual impact matters; use sparingly (if at all) in the **dashboard**, where clarity and speed matter more than animation for a daily-use product.
- **Do not** introduce a third competing component library (e.g. Chakra, MUI, Ant Design) without explicit approval — this fragments the design system and creates inconsistent UX across panels.
- Both shadcn and Aceternity components are **copy-in, not npm-dependency** by design — once copied into `packages/ui`, they belong to this codebase. Customize freely to match Boardly's design tokens, but keep customizations documented (a short comment block at the top of a modified component noting what changed from upstream and why).
- All components must pull colors/spacing/radii from the shared Tailwind config/design tokens (`packages/config/tailwind-preset.ts`) — never hardcode hex colors or pixel values that bypass the token system, since Company Admin white-label theming (architecture doc §6) depends on this consistency.

### Mobile (Expo)

- Use **React Native Reusables** (https://reactnativereusables.com) — this is the direct shadcn/ui port for React Native, built on NativeWind + universal Radix primitives. Install into `packages/ui-native` the same copy-in way as web shadcn components.
- Use **NativeWind** as the styling layer so Tailwind classes/tokens stay consistent between `packages/ui` (web) and `packages/ui-native` (mobile) — same design tokens, same naming, different rendering targets.
- Where React Native Reusables doesn't yet cover a needed component, check its documented list of community extensions before building fully custom — but custom is fine when nothing reasonable exists.
- **Design parity rule**: any shared visual pattern (button variants, color roles, spacing scale, typography scale) must be defined once in `packages/config` and consumed by both `packages/ui` and `packages/ui-native`, so the mobile app visually matches the web dashboard rather than drifting into its own look.

---

## 5. Backend Code Practices

- Follow the module structure convention from `project-tech-stack.md` §5: each domain module (`modules/boards`, `modules/cards`, `modules/sprints`, etc.) contains `routes.ts`, `service.ts`, `schema.ts` — don't mix route handlers and business logic in one file.
- Every route handler must pass through the `requirePermission()` guard pattern (architecture doc §5) — no route that mutates or reads tenant-scoped data ships without an explicit permission check, even if "it's probably fine for now."
- Every query must be scoped by `organization_id` at the application layer, in addition to Postgres RLS — RLS is the last line of defense, not the only one. If you find yourself writing a query without an org scope, stop and ask whether it should be platform-level (Super Admin only) instead.
- Validate all external input (request bodies, query params) at the route boundary using Zod/TypeBox schemas from `packages/shared-types` — never trust unvalidated input past the route layer.
- New database schema changes go through Drizzle Kit migrations, additive-first (see `project-tech-stack.md` §9.1) — no destructive migration in the same deploy as the code that depends on the new shape.

---

## 6. Testing Requirements (Test-First)

This project follows **test-first (TDD)**: unit test + E2E combo, per `project-tech-stack.md` §8.

- **Write the failing test before the implementation.** An agent should not submit a code change implementing new logic without a preceding or accompanying test that would have failed before the change.
- Follow the test pyramid: most coverage in fast unit tests, moderate integration test coverage (especially DB/multi-tenant scoping), and a small, deliberate set of E2E flows — do not default to writing E2E tests for logic that a unit test could cover faster and more reliably.
- **Non-negotiable test-first areas** — never skip tests here even under time pressure:
  - Every permission check / RBAC guard
  - Multi-tenant data isolation (Org A can never see Org B's data)
  - Stage/Sprint/Phase state-transition logic
  - Billing/seat-counting logic
  - Report/analytics calculations (cycle time, lead time, velocity)
- Use the shared `packages/test-fixtures` factories for test setup (`createOrgWithUsers()`, `createBoardWithCards()`, etc.) instead of hand-rolling setup per test file.
- Test tools per app: Vitest (dashboard unit), Playwright (dashboard/website E2E), Jest + RN Testing Library (mobile unit), Maestro (mobile E2E), `bun test` (backend unit/integration).
- A PR that fails CI test gates should not be merged by working around the gate — fix the failure or the test, don't disable it.

---

## 7. Security & Multi-Tenancy Non-Negotiables

- Never log or expose secrets, tokens, or full card/board content in error messages returned to the client.
- Never write a query that could return cross-tenant data, even in an admin-only tool — Super Admin tenant access must go through explicit impersonation/audit-logged paths (architecture doc §6), not a bypassed query.
- Any new public-facing endpoint (e.g. intake forms, architecture doc §11.4) must have rate limiting and input validation from the first commit, not added later.
- Any change touching authentication, permissions, or billing must be flagged clearly in the PR description, even if the change looks small.

---

## 8. When Unsure

- Prefer asking a clarifying question over guessing on: permission boundaries, billing logic, or anything affecting tenant data isolation.
- For everything else (naming, small refactors, minor UI choices), make a reasonable decision consistent with existing patterns in the codebase and proceed — don't block on trivial ambiguity.
- If an existing pattern in the codebase conflicts with this file, flag the inconsistency rather than silently picking one — these documents should stay in sync with reality.
