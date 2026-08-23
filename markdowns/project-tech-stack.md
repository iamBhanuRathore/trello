# Project Tech Stack — Boardly

Final technology decisions across all apps/services. Pairs with `trello-clone-architecture.md` (system design, data model, features).

---

## 1. Overview

| App/Service                                          | Stack                                       |
| ---------------------------------------------------- | ------------------------------------------- |
| Dashboard (Super Admin / Company Admin / User panel) | Vite + TypeScript + Bun + React             |
| Marketing Website                                    | Next.js                                     |
| Mobile Apps (iOS/Android)                            | Expo (React Native)                         |
| Backend API                                          | Bun + Elysia (TypeScript)                   |
| Database                                             | PostgreSQL                                  |
| Cache / Queue                                        | Redis + BullMQ                              |
| Search                                               | OpenSearch / Elasticsearch                  |
| Real-time                                            | Bun WebSockets (native) via Elysia          |
| Infra                                                | Docker + Kubernetes                         |
| Observability                                        | OpenTelemetry + Grafana/Prometheus + Sentry |

**Guiding principle:** one language (TypeScript) across dashboard, website, mobile, and backend. Shared validation schemas (Zod), shared types, faster hiring, faster iteration on a feature-heavy product. Revisit Rust later only for isolated hot paths (e.g. a dedicated realtime fan-out service or search-indexing pipeline) once real scale problems appear — not by default.

---

## 2. Dashboard (Web App)

| Concern                 | Choice                                                     | Why                                                                             |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Build tool              | **Vite**                                                   | Fast dev server/HMR, first-class TS+React support, minimal config               |
| Language                | **TypeScript**                                             | Type safety across a large, RBAC-heavy, multi-tenant codebase                   |
| Runtime/package manager | **Bun**                                                    | Fast installs, fast script execution, native TS execution for tooling scripts   |
| UI framework            | **React 18+**                                              | Ecosystem maturity, hiring pool, drag-and-drop libraries (`dnd-kit`)            |
| State management        | Zustand or Redux Toolkit                                   | Zustand for simplicity; RTK if the team prefers stricter conventions            |
| Styling                 | Tailwind CSS                                               | Fast iteration, consistent design tokens, easy theming for white-label branding |
| Data fetching           | TanStack Query                                             | Caching, background refetch, optimistic updates for card drag-drop              |
| Forms                   | React Hook Form + Zod                                      | Shared Zod schemas with backend for validation parity                           |
| Drag & drop             | `dnd-kit`                                                  | Actively maintained, accessible, performant for Kanban boards                   |
| Rich text editor        | TipTap (ProseMirror)                                       | Used for card descriptions and Docs/Wiki module — one editor, two use cases     |
| Realtime client         | native WebSocket / Socket.IO client (match backend choice) | Board live-updates, presence, typing indicators                                 |
| Charts                  | Recharts or Visx                                           | Burndown/velocity/cumulative flow diagrams                                      |

### Testing

| Type                         | Tool                                                   | Why                                                                                               |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Unit / component             | **Vitest**                                             | Same transform pipeline as Vite, zero extra config, fast                                          |
| Component rendering          | React Testing Library                                  | Standard pairing with Vitest for component behavior tests                                         |
| E2E                          | **Playwright**                                         | Multi-browser, strong parallelization, network mocking/tracing, better CI ergonomics than Cypress |
| Visual regression (optional) | Playwright's built-in screenshot diffing, or Chromatic | Catch unintended UI drift on the board/card UI                                                    |

---

## 3. Marketing Website

| Concern        | Choice                                                               | Why                                                                                             |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Framework      | **Next.js** (App Router)                                             | Best-in-class SEO: SSR/SSG/ISR, meta tag control, sitemap/robots generation, image optimization |
| Language       | TypeScript                                                           | Consistency with rest of stack                                                                  |
| Styling        | Tailwind CSS                                                         | Shared design tokens with dashboard if desired                                                  |
| CMS (optional) | Headless CMS (e.g. Sanity, Contentful) for blog/docs marketing pages | Non-engineers can publish content without deploys                                               |
| Hosting        | Vercel (best Next.js integration) or self-hosted via Docker          | Vercel simplest for SEO features (edge caching, ISR)                                            |
| Analytics      | Plausible/PostHog (privacy-friendly) or GA4                          | Track conversion funnel from marketing site → signup                                            |

Keep this as a **separate app/repo** from the dashboard — different deploy cadence, different audience, avoids bloating the authenticated app's bundle with marketing-only code. Share a component/design-token package if visual consistency matters.

---

## 4. Mobile Apps

| Concern            | Choice                                                                    | Why                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | **Expo (React Native)**                                                   | Faster path to app-store-ready builds, managed native modules, EAS Build/Submit, OTA updates for JS-only changes without app-store review delay |
| Language           | TypeScript                                                                | Shared types with backend/dashboard                                                                                                             |
| Navigation         | Expo Router or React Navigation                                           | Expo Router if you want file-based routing consistency with Next.js patterns                                                                    |
| State/data         | TanStack Query + Zustand                                                  | Same patterns as dashboard, easier context-switching for the team                                                                               |
| Push notifications | Expo Notifications + FCM (Android) / APNs (iOS)                           | Native push infra, integrates directly with backend notification service                                                                        |
| Offline support    | TanStack Query persistence + local SQLite (Expo SQLite) for critical data | Needed for "view boards with spotty connection" use case                                                                                        |

### Testing

| Type             | Tool                                | Why                                                       |
| ---------------- | ----------------------------------- | --------------------------------------------------------- |
| Unit / component | Jest + React Native Testing Library | Standard for RN/Expo apps                                 |
| E2E              | **Maestro**                         | Simple YAML-based flows, much less CI friction than Detox |

**Rollout plan:** Phase 1 — read, comment, basic card edit, push notifications. Phase 2 — full board editing, drag-drop, offline action queue.

---

## 5. Backend API

| Concern         | Choice                                                                             | Why                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime         | **Bun**                                                                            | Fast startup, native TS execution (no separate build step for dev), built-in test runner, native WebSocket support                                                                   |
| Framework       | **Elysia**                                                                         | Bun-native, very fast, end-to-end type safety via Eden Treaty (client infers types directly from server routes — similar to tRPC), clean modern API, built-in validation via TypeBox |
| Validation      | Elysia's built-in TypeBox schemas (or Zod via adapter)                             | Keep request/response validation co-located with route definitions; reuse schema shapes with frontend where practical                                                                |
| ORM / DB access | **Drizzle ORM**                                                                    | TypeScript-first, lightweight, SQL-like query builder (not heavy abstraction like Prisma), great for Postgres RLS-based multi-tenancy since queries stay close to raw SQL            |
| Auth            | Lucia Auth or custom JWT + refresh token flow; WorkOS for enterprise SSO/SAML/SCIM | WorkOS specifically to avoid building SAML/SCIM from scratch — this is a notoriously painful enterprise requirement to DIY                                                           |
| Background jobs | BullMQ (Redis-backed)                                                              | Automations, webhook dispatch, digest notifications, sprint auto-generation                                                                                                          |
| Realtime        | Bun's native WebSocket support (via Elysia's `ws` plugin)                          | No need for Socket.IO given Bun's WebSocket performance; use Redis Pub/Sub as the shared backbone once you run multiple backend instances                                            |
| API style       | REST (primary) + optionally GraphQL for complex nested board/card fetching         | Keep REST as the default for simplicity; add GraphQL only if the dashboard's data-fetching patterns actually demand it                                                               |

### Since Elysia's ecosystem is younger than NestJS's, be deliberate about:

- **Module structure discipline**: Elysia doesn't hand you NestJS-style DI/module conventions — establish your own folder/module conventions early (e.g. `modules/boards`, `modules/cards`, each with `routes.ts`, `service.ts`, `schema.ts`) so the RBAC/multi-tenant logic in §5 of the architecture doc stays consistent as the codebase grows.
- **RBAC as middleware/guards**: write a reusable `requirePermission('card.delete')` Elysia plugin/derive function applied per route group, mirroring the permission-check pattern already defined in the architecture doc.
- **Multi-tenancy enforcement**: pair app-level `organization_id` scoping in every query with Postgres Row-Level Security as the last line of defense — don't rely on Elysia guards alone.

### Testing

| Type         | Tool                                                                           | Why                                                                                                         |
| ------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Unit         | **`bun test`** (built-in)                                                      | Fast, zero extra dependency, Jest-compatible API                                                            |
| Integration  | `bun test` + a test Postgres instance (Docker)                                 | Verify RBAC/multi-tenant query scoping actually works end-to-end at the DB layer                            |
| API/E2E      | Playwright (API testing mode) or Supertest-equivalent via Elysia's test client | Elysia has a built-in `.handle()` testing pattern for route-level testing without spinning up a real server |
| Load testing | k6 or Artillery                                                                | Validate board/card pagination and search performance under realistic load before enterprise clients hit it |

---

## 6. Data & Infra Layer

| Concern                   | Choice                                                                                                                               | Why                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Primary DB                | **PostgreSQL**                                                                                                                       | Row-Level Security for tenant isolation, JSONB for custom fields/stage configs, mature ecosystem                     |
| Cache                     | **Redis**                                                                                                                            | Sessions, rate limiting, WebSocket pub/sub backbone, BullMQ job queue                                                |
| Search                    | **OpenSearch** (or Elasticsearch)                                                                                                    | Global search, saved searches/JQL-style query DSL, wiki full-text search                                             |
| Object storage            | S3-compatible (AWS S3, Cloudflare R2, or MinIO self-hosted)                                                                          | Attachments, avatars, exported reports                                                                               |
| Analytics/reporting store | Start with Postgres materialized views; move to **ClickHouse** once event volume (cycle time/CFD/portfolio dashboards) outgrows OLTP | Keep it simple until you actually need it — don't pre-build an OLAP pipeline before Phase 3 reporting features exist |
| Containers/orchestration  | Docker + Kubernetes                                                                                                                  | Standard, supports multi-AZ, autoscaling per service                                                                 |
| CI/CD                     | GitHub Actions                                                                                                                       | Native GitHub integration, good Bun/Docker support, matrix testing across dashboard/backend/mobile                   |
| Observability             | OpenTelemetry (tracing) + Prometheus/Grafana (metrics) + Sentry (errors)                                                             | Standard modern stack, works across Bun/Node-based services                                                          |
| Billing                   | Stripe Billing                                                                                                                       | Subscriptions, metered seats, invoicing                                                                              |
| Enterprise SSO            | WorkOS                                                                                                                               | SAML/OIDC/SCIM without building it in-house                                                                          |

---

## 7. Monorepo Structure (recommended)

Since dashboard, website, mobile, and backend all share TypeScript + Zod/TypeBox schemas, a monorepo avoids type drift:

```
/apps
  /dashboard      (Vite + React + TS)
  /website        (Next.js)
  /mobile         (Expo)
  /backend        (Bun + Elysia)
/packages
  /shared-types   (Zod/TypeBox schemas, shared enums, permission keys)
  /ui             (shared design-system components, optional)
  /config         (eslint, tsconfig, tailwind config presets)
```

Use **Turborepo** (works well with Bun) for task orchestration/caching across apps — keeps CI fast as the codebase grows, and lets `packages/shared-types` changes propagate type-checked everywhere immediately.

---

## 8. Test-First Strategy (TDD)

Since the plan is unit + E2E in combination, written test-first, here's how that actually plays out per layer so it doesn't become "tests bolted on after."

### 8.1 The workflow (red → green → refactor)

1. **Write the failing test first** — for backend: a `bun test` case hitting the Elysia route handler or service function before it exists. For frontend: a Vitest test asserting component behavior/output before the component is built.
2. **Write the minimum code to pass it.**
3. **Refactor** with the test as your safety net.
4. **E2E tests come after the feature works end-to-end at the unit level** — they verify integration, not logic branches. Don't try to TDD at the E2E layer; it's too slow a feedback loop for red-green-refactor cycles. Use E2E to lock in critical user flows once built, not to drive the implementation.

### 8.2 Test pyramid — where effort should actually go

```
        /\
       /E2E\          ← few, slow, high-value: critical flows only
      /------\
     /  Integ. \      ← moderate: RBAC scoping, multi-tenant isolation, DB queries
    /------------\
   /   Unit Tests  \  ← many, fast: business logic, permission checks, validators
  /------------------\
```

Don't invert this — a common mistake is writing lots of E2E tests because they "feel more real." E2E suites are slow and flaky at scale; keep them to the ~15-25 flows that actually matter (login, create board, drag card, invite user, checkout, SSO login) and push everything else down into unit/integration tests where feedback is fast enough to actually support TDD.

### 8.3 What must be test-first, non-negotiably

Given this app's specific risk areas, these categories should never ship without a test written first:

- **Every permission check** (`requirePermission('card.delete')` etc.) — write the test asserting a Viewer _cannot_ delete, a Board Admin _can_, before wiring the guard.
- **Multi-tenant data isolation** — an integration test that asserts Org A's API calls can never return Org B's rows, run against a real test Postgres instance (Docker), not mocked. This is the single most damaging class of bug possible in this architecture (a tenant data leak), so verify it constantly, not just once.
- **Stage/Sprint/Phase transition logic** — state machine correctness (e.g. can't move a card into a sprint that's already `completed`).
- **Billing/seat-counting logic** — off-by-one errors here cost real money either direction.
- **Report/analytics calculations** (cycle time, lead time, velocity) — these are pure functions once event data is fetched; ideal, cheap unit-test targets, and wrong numbers erode trust in the product fast.

### 8.4 Per-app test setup

**Backend (Bun + Elysia)**

- `bun test` for unit tests on services/validators/permission logic — fast enough to run on every save.
- Integration tests spin up a throwaway Postgres (via `testcontainers` or a Docker Compose test profile) and run real Drizzle queries — critical for the multi-tenant isolation tests above.
- Elysia's `.handle()` test client for route-level tests without a running server.
- Target: **fast unit suite runs in seconds**, integration suite in CI runs in a couple minutes.

**Dashboard (Vite + React)**

- Vitest + React Testing Library, written against component _behavior_ (what the user sees/clicks), not implementation details — this keeps tests useful through refactors instead of breaking on every internal change.
- Mock the backend via MSW (Mock Service Worker) so component tests don't depend on a live API.
- Playwright E2E covers the ~15-25 critical flows: sign up → create org → create board → drag card across stages → invite teammate → assign/watch a card → permission-denied states for a Viewer role.

**Mobile (Expo)**

- Jest + RN Testing Library for components/hooks.
- Maestro for the handful of critical mobile flows (login, view board, comment, push notification tap-through).

### 8.5 CI gates

- PRs blocked from merging unless: unit test suite passes, coverage doesn't regress below an agreed threshold (aim for meaningful coverage on business logic/permissions, not a vanity 100% number), and the critical-path E2E suite passes on the PR's preview deployment.
- Run the full E2E suite on every merge to `main` and nightly; running it on every single commit/PR push is usually too slow — use a smaller smoke-test subset there and save the full suite for merge/nightly.
- Multi-tenant isolation integration tests should be part of the **required, non-skippable** gate — treat a failure there like a security incident, not a flaky test to retry.

---

## 9. Additional Engineering Practices

Beyond the core stack, these practices matter for long-term stability, compliance, and team scalability — cheap to establish now, expensive to retrofit later.

### 9.1 Database Migrations & Zero-Downtime Deploys

- Use **Drizzle Kit** for schema migrations, but enforce an additive-first discipline: add column as nullable → backfill data → make required → deploy code that depends on it → remove old column in a later release. Never change a table and deploy dependent code in the same step.
- Goal: a bad migration should never be able to take down the whole platform mid-deploy, especially once enterprise customers are on the platform.

### 9.2 Secrets Management

- Don't store secrets in `.env` files committed to repos or loosely-scoped CI variables.
- Use **Doppler**, **AWS Secrets Manager**, or **HashiCorp Vault** from day one — retrofitting this after a SOC 2 audit starts asking questions is far more painful than starting clean.

### 9.3 Preview/Ephemeral Environments per PR

- Spin up a full ephemeral environment (DB + backend + dashboard) per pull request so the "E2E suite passes on PR" CI gate (§8.5) is testing something real, not theoretical.
- Vercel handles this natively for the website/dashboard. For backend + DB, use a Docker Compose stack in CI, or a platform like Railway/Render with PR environment support.

### 9.4 Storybook for the Design System

- Build shared UI components (used across Super Admin / Company Admin / User panels) in **Storybook**, in isolation, before wiring them into real pages.
- Pair with **Chromatic** (or Playwright's built-in screenshot diffing) for visual regression testing — important here specifically because theming/branding is data-driven per tenant, so one bad CSS variable change could silently break every client's UI simultaneously.

### 9.5 Accessibility (a11y) Testing

- Enterprise procurement — especially government, education, and large-corp buyers — often contractually requires WCAG 2.1 AA compliance.
- Add `axe-core` into the existing test suites now (`@axe-core/playwright` for E2E, `vitest-axe` for component tests) rather than retrofitting accessibility across dozens of components later, which is significantly more expensive.

### 9.6 Test Data / Fixtures Strategy

- As RBAC and multi-tenancy complexity grows, hand-writing test setup per test becomes unsustainable.
- Build a shared **factory/seeder layer** (e.g. `packages/test-fixtures`) with functions like `createOrgWithUsers()`, `createBoardWithCards()`, `createOrgWithSSOEnabled()` — reused across unit, integration, and E2E tests for consistent, fast test setup.

### 9.7 API Contract Stability / Versioning

- Elysia's Eden Treaty gives type-safe client-server contracts for free within the monorepo, but a public API and third-party plugin marketplace (architecture doc §11) will eventually need external contract stability too.
- Adopt a simple `/v1/` prefix convention plus a defined deprecation window policy now, before mobile apps or external integrations depend on endpoints that need to change — avoids breaking older, un-updated mobile app versions still in the wild.

### 9.8 Architecture Decision Records (ADRs)

- Keep a lightweight `docs/adr/` folder — one short markdown file per major technical decision (context, decision, consequences), e.g. "Why Elysia over NestJS," "Why TypeScript over Rust for the backend," "Why event-sourcing for reporting."
- Cheap to maintain now, saves significant "why did we choose X?" archaeology once more engineers join the team.

### 9.9 Cost Guardrails

- Set up cloud billing alerts and per-service cost dashboards **before** scale hits, not after a surprise invoice.
- Multi-tenant SaaS with Elasticsearch/OpenSearch, Redis, Kubernetes, and eventually a ClickHouse analytics store (architecture doc §11.1) can get expensive quickly if left unmonitored — build cost visibility into the same observability stack (§6) from the start.

---

## 10. Summary Table (quick reference)

| Layer                               | Technology                                                   |
| ----------------------------------- | ------------------------------------------------------------ |
| Dashboard                           | Vite + TypeScript + Bun + React + Tailwind + TanStack Query  |
| Dashboard unit tests                | Vitest                                                       |
| Dashboard E2E tests                 | Playwright                                                   |
| Website                             | Next.js                                                      |
| Mobile                              | Expo (React Native)                                          |
| Mobile unit tests                   | Jest + RN Testing Library                                    |
| Mobile E2E tests                    | Maestro                                                      |
| Backend runtime                     | Bun                                                          |
| Backend framework                   | Elysia                                                       |
| Backend ORM                         | Drizzle ORM                                                  |
| Backend tests                       | `bun test` + Elysia test client                              |
| Database                            | PostgreSQL (RLS for multi-tenancy)                           |
| Cache/Queue                         | Redis + BullMQ                                               |
| Search                              | OpenSearch                                                   |
| Realtime                            | Bun native WebSockets + Redis Pub/Sub                        |
| Auth                                | JWT/Lucia + WorkOS (enterprise SSO/SCIM)                     |
| Storage                             | S3-compatible                                                |
| Infra                               | Docker + Kubernetes                                          |
| CI/CD                               | GitHub Actions                                               |
| Monitoring                          | OpenTelemetry + Grafana/Prometheus + Sentry                  |
| Monorepo tooling                    | Turborepo                                                    |
| Migrations                          | Drizzle Kit (additive-first discipline)                      |
| Secrets management                  | Doppler / AWS Secrets Manager / Vault                        |
| PR preview environments             | Vercel (web) + Docker Compose or Railway/Render (backend+DB) |
| Design system / component isolation | Storybook + Chromatic (visual regression)                    |
| Accessibility testing               | axe-core (`@axe-core/playwright`, `vitest-axe`)              |
| Test fixtures                       | Shared `packages/test-fixtures` factory/seeder layer         |
| API versioning                      | `/v1/` prefix + deprecation window policy                    |
| Decision tracking                   | `docs/adr/` — Architecture Decision Records                  |
| Cost monitoring                     | Cloud billing alerts + per-service cost dashboards           |
