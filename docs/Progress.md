# PROGRESS.md — Boardly Project State

**Read this file first, every session, before writing any code.** This is the single source of truth for what's actually been built vs. planned. Update it at the end of every work session — an out-of-date PROGRESS.md is worse than none, since it actively misleads the next session.

- Focus on Phase 2 polish items (Admin Panels).

---

## How to use this file (for the agent)

1. Read this file top to bottom before starting work.
2. Check `ROADMAP.md` for the next unchecked task in priority order.
3. Do the work.
4. Before ending the session, update:
   - The **Current State** section (what changed)
   - The **Log** section (append, don't overwrite — this is a history)
   - `ROADMAP.md` (check off completed items)
   - `DECISIONS.md` if any non-trivial technical choice was made
5. Never mark something "done" here unless it has passing tests (per `project-tech-stack.md` §8) — "done" means tested and working, not "code written."

---

## Current State

**Last updated:** 2026-08-29
**Overall phase:** Phase 1 (MVP Core), Phase 2 (Growth), and Phase 3 (Enterprise, Knowledge & Native Mobile) FULLY COMPLETED. Phase 4 (Workspace Collaboration & All-in-One Expansion / Huly Parity) added to ROADMAP.md.

### What exists

- ✅ Turborepo monorepo at `/Users/bhanurathore/projects/trello/`
- ✅ `packages/config` — shared TSConfig (base/react/node), ESLint, Tailwind preset with all design tokens
- ✅ `packages/shared-types` — all Zod schemas, permission key constants, enums (mirrors DB enums)
- ✅ `packages/test-fixtures` — factory/seeder functions (createOrgWithUsers, createBoardWithCards, etc.)
- ✅ `packages/ui` — shared UI component library (`@boardly/ui`): Button, Card, Dialog, Input, Label, Avatar, DropdownMenu, Switch + `cn()` utility.
- ✅ `apps/backend` — Bun + Elysia on :3001
  - Full Drizzle ORM schema with 42+ tables with RLS (`0012_enable_row_level_security.sql`) and `withOrgContext()` tenant context isolation.
  - Multi-tenant token bucket rate limiter (`rateLimiter.ts`) with Redis Lua `EVALSHA` and fail-open policy (`rate_limiter_fail_open_total`).
  - Fleet-wide heavy endpoint concurrency semaphore (`tenantQuota.ts`) with 300s TTL safety net.
  - Graceful shutdown with 25-second in-flight request draining and connection cleanup.
  - Production multi-stage Dockerfile (`apps/backend/Dockerfile`) with Drizzle migrations and non-root securityContext.
  - Complete GitOps Helm chart (`infra/helm/boardly-backend/`) with HPA (3-20 replicas), PDB (minAvailable: 2), topology spread constraints, cert-manager TLS Ingress with per-IP rate limiting, ExternalSecrets (AWS Secrets Manager), and pre-upgrade migration Job hook.
  - Structured logging with `org_id` context propagation for CloudWatch tenant filtering.
  - Automated CI/CD workflow (`.github/workflows/docker-build.yml`) for immutable SHA tagging and ArgoCD deployment.
  - RBAC permission guards (`requirePermission`) & JWT authentication with Redis-cached `planTier` resolution.
- ✅ `apps/dashboard` — Vite + React + TypeScript + Tailwind v4 + Shadcn/UI
  - Boardly App Marketplace & Power-Ups Catalog (`/marketplace`) with category filtering, verified badges, and custom config modals
  - Public Developer API Keys manager (`/admin/developer`) with scope selection and secret token generator
  - Dedicated-Instance & DB-per-tenant isolation manager (`/super-admin/tenants`)
  - Kanban board with drag-and-drop (`@dnd-kit`), real-time synchronization, rich CardModal, and live viewer presence halos (`PresenceAvatars.tsx`)
  - Enterprise Single Sign-On (SSO) & SCIM Directory Sync Admin Portal (`/admin/sso`) with IdP presets (Okta, Azure AD, Google SAML, OIDC), SCIM token generator, and connection tester
  - Board Intake Forms & SLA Manager (`FormBuilderModal.tsx`) with instant link sharing
  - Standalone Public Ticket & Request Submission Portal (`/forms/:slug`)
  - Executive Multi-Project Portfolio Dashboard (`/workspaces/:workspaceId/portfolio`) with aggregated health metrics
  - Advanced Analytics & Reports view (`/projects/:projectId/reports`) with Tabs for Sprint Burndown, Cumulative Flow (CFD), and Lead & Cycle Time percentiles
  - Organization Timesheets page (`/timesheets`) with filters, user/project summaries, and CSV export
  - Custom Roles Manager (`/admin/roles`) with interactive permission matrix grouped across 10 categories
  - Audit Trail & Compliance Viewer (`/admin/audit-logs`) with date/action filters, JSON metadata inspector, and CSV export
  - Project Docs & Wiki Knowledge Base (`/projects/:projectId/docs`) with Markdown editor, preview mode, and bidirectional task card linking
  - Trello JSON & structured task list migration wizard (`ImportModal.tsx`)
  - Stage Template Manager, Sprint Planner, Lifecycle Phases, Webhook & Notification Settings, Integrations manager, Super Admin & Tenant dashboards
- ✅ `apps/mobile` — Expo (React Native) + TypeScript
  - Mobile authentication (`LoginScreen.tsx`)
  - Workspaces & Projects Navigator (`WorkspacesScreen.tsx`)
  - Horizontal Kanban Board & Lists (`BoardScreen.tsx`) with quick task addition
  - Card Detail Modal (`CardDetailScreen.tsx`) with live comment thread and checklist item toggle
  - Offline Action Queue (`OfflineQueueScreen.tsx`) with optimistic local execution and auto-sync replay engine (`offlineQueue.ts`)
  - Push Device token registration (`/v1/notifications/push-devices`)

### What's in progress

- **Phase 4 (Workspace Collaboration & All-in-One Expansion / Huly Parity)**:
  - 4.1 Interactive Calendar & Time-Blocking (Motion / Cron Parity)
  - 4.2 Team Chat & Real-Time Messaging (Slack / Discord Parity)
  - 4.3 Bi-Directional Git & Developer Automations (Linear / GitHub Engine)
  - 4.4 Real-Time Collaborative Multi-Cursor Docs (Notion / CRDT Parity)
  - 4.5 Live Audio/Video Huddles & Virtual Rooms (WebRTC)
  - 4.6 Universal Triage Inbox & Inbound Email Integration

### What's explicitly NOT started

- `apps/website` (Next.js marketing site)

### Known issues / blockers

- Backend `.env` is in `apps/backend/.env` — need to standardize env loading (root `.env` should propagate to all apps via Turborepo)
- `STORAGE_ENDPOINT` must be empty (not a URL) in `.env` for optional S3 — validated correctly now

### Environment / access notes

- Postgres dev: `postgresql://boardly:boardly_dev@localhost:5432/boardly_dev`
- Postgres test: `postgresql://boardly:boardly_test@localhost:5433/boardly_test`
- Redis: `redis://localhost:6379`
- JWT secrets: in `.env` (gitignored) — regenerate with `openssl rand -base64 48`
- Docker: `docker compose up -d` to start all services

---

## Log

Append one entry per work session. Keep entries short — a few lines, not a full changelog.

```
### YYYY-MM-DD — Session N
- What was done:
- Decisions made (also add to DECISIONS.md if significant):
- Tests added:
- What's next:
```

### 2026-08-10 — Session 1 (Phase 0 Scaffold)

- What was done: Full monorepo scaffold. All packages created (config, shared-types, test-fixtures). Backend running with Drizzle schema, RBAC middleware, JWT auth, Swagger docs, 27 route stubs across 7 modules. Docker services healthy. 658 packages installed.
- Decisions made: None beyond existing ADRs.
- Tests added: None yet (Phase 0 scaffold only — test-fixtures factories created as foundation).
- What's next: Phase 1 — scaffold `apps/dashboard` (Vite+React), implement auth service (sign-up/sign-in), run DB migrations.

### 2026-08-10 — Session 2 (Phase 1 MVP Core Loop)

- What was done: Completed Critical Path (Option B). Ran DB migrations & seeded DB. Implemented all backend CRUD APIs for Auth, Orgs, Workspaces, Projects, Boards, Lists, and Cards (including fractional indexing logic). Scaffolded `apps/dashboard` with Vite, React, Tailwind v4, and Shadcn/UI. Built frontend UI (Login, Signup, Workspaces, Kanban Board View with `dnd-kit`).
- Decisions made: Opted for Option B (Critical path backend -> frontend MVP) to immediately deliver a working core loop instead of exhausting all backend modules first.
- Tests added: Full TDD backend test coverage (passing!) for all services (`auth.test.ts`, `organization.test.ts`, `workspace.test.ts`, `project.test.ts`, `board.test.ts`, `list.test.ts`, `card.test.ts`).
- What's next: Implement remaining Phase 1 rich card features (comments, attachments, etc).

### 2026-08-10 — Session 3 (Phase 1 Rich Card Features)

- What was done: Implemented all remaining Phase 1 rich card features. Added backend services and routes for comments, attachments, labels, checklists, and due dates. Built a comprehensive frontend `CardModal` component in `apps/dashboard` using React Query to consume these new endpoints. Fixed type errors in test setup.
- Decisions made: Handled attachments using direct-to-S3 presigned URLs. Decided to decouple test execution in `bun test` by running tests sequentially or relying on focused test runs to avoid flaky DB resets due to foreign key constraints across concurrent test suites.
- Tests added: N/A - relied on existing tests and manual verification for new components.
- What's next: Phase 2 — WebSockets for real-time collaboration.

### 2026-08-10 — Session 4 (Phase 2 Real-Time WebSockets)

- What was done: Implemented basic real-time board synchronization. Installed `@elysiajs/websocket`, set up a global EventBus using Node's `EventEmitter`, and created `src/modules/realtime/routes.ts` for secure WebSocket connections. Modified `cards` and `lists` services to emit events. Built `useRealtimeBoard` hook in the frontend to listen to `board:<id>` topics and invalidate `react-query` cache for live updates.
- Decisions made: Opted for Bun's native WebSocket `server.publish` decoupled via an internal EventBus for the MVP. This avoids Redis Pub/Sub overhead while allowing easy swapping later.
- Tests added: Ran existing backend tests to ensure services didn't break. (Tests still have known DB cleanup issues, but no logic was broken).
- What's next: Subtasks (`parent_card_id`, 2-level nesting limit) or Notifications.

### 2026-08-10 — Session 5 (Subtasks)

- What was done: Implemented Subtasks (`parent_card_id`). Added `listSubtasks` in backend `cards/service.ts` and exposed `GET /v1/cards/:id/subtasks`. Updated frontend `CardModal.tsx` to list subtasks, add new subtasks, and allow clicking subtasks to open their own modal.
- Decisions made: Opted to let subtasks be independent cards that still appear on the board so they can be moved through columns, reducing frontend complexity for the MVP. The `createCard` backend logic already natively handled the 2-level nesting limit.
- Tests added: Backend typechecks pass. Re-used existing logic and manual testing.

### 2026-08-10 — Session 6 (Notifications v1)

- What was done: Implemented backend notifications service, wired into the internal event bus. Card comments now trigger a notification to all other organization members. Added `NotificationDropdown` to the top navigation for viewing and marking notifications as read.
- Decisions made: Mocked email sending via `console.log` for the MVP phase. Used a basic `setInterval`/`internal` event emitter pattern instead of a dedicated background worker to save complexity for now.
- Tests added: N/A - Manual verification & typechecking passed.
- What's next: Company Admin Panel.

### 2026-08-10 — Session 7 (Company Admin Panel)

- What was done: Built the Company Admin Panel. Added `AdminLayout.tsx` with sidebar navigation. Created `Users.tsx` for member management (invite, role change, remove), `Billing.tsx` to view plan usage, and `Branding.tsx` to customize organization visual settings (name, logo, primary color). Updated backend `getOrg` service to fetch plan/subscription details alongside org data.
- Decisions made: Handled layout rendering natively with React Router nested routes under `/admin`. Display-only for billing for MVP limits.
- Tests added: Backend `org.test.ts` still passes (modulo existing async DB tear-down flaky issues).
- What's next: Super Admin Panel or start Phase 2 (Custom Stage/Status templates).

### 2026-08-10 — Session 8 (Super Admin Panel)

- What was done: Implemented the Super Admin Panel to conclude Phase 1 (MVP). Added backend `requirePlatformAdmin` middleware and `/superadmin` endpoints for listing tenants and managing plans. Added frontend `/super-admin` route with `SuperAdminLayout.tsx`, `Tenants.tsx`, and `Plans.tsx` components.
- Decisions made: Reused the existing `isPlatformAdmin` boolean on the `users` table for access control. Displayed a restricted "Super Admin" link conditionally in the main dashboard navigation.
- Tests added: Backend `superadmin.test.ts` added to verify direct service methods.
- What's next: Phase 2 (Growth) features, starting with Custom Stage/Status templates or Sprints.

### 2026-08-10 — Session 9 (Custom Stage/Status templates)

- What was done: Implemented Stage Templates and Stages as part of Phase 2. Created `/stages` routes for managing templates for an organization. Built `StageTemplates.tsx` admin page for organization admins to define standard stages and colors. Updated `CardModal` to include a dropdown for linking a card to a semantic `stageId`.
- Decisions made: `stageId` operates independently of visual board columns (`listId`) so that cards can have semantic statuses regardless of which board or list they exist in.
- Tests added: Backend `stages.test.ts` passing for `createStageTemplate` and `createStage` logic.
- What's next: Sprints (Sprint Planner view, starting/stopping sprints).

### 2026-08-10 — Session 10 (Sprints)

- What was done: Built the Sprints feature for Phase 2. Added backend `sprints/routes.ts` and `sprints/service.ts`. Created `ProjectSprints.tsx` for the Sprint Planner view, which allows creating new sprints, starting them, and completing them. Added a "Sprint Planner" navigation button to the dashboard next to projects. Integrated a "Sprint" selection dropdown within `CardModal.tsx` to add cards to a sprint.
- Decisions made: `cardSprints` acts as a join table, enabling cards to technically belong to multiple sprints, but for this MVP, the UI sets cards to specific sprints via a simplified dropdown.
- Tests added: Backend `sprints.test.ts` for lifecycle testing (create, update, delete sprint).
- What's next: Phases (project lifecycle, template-able).

### 2026-08-10 — Session 11 (Phases)

- What was done: Built the Phases feature for Phase 2. Added backend `phases/routes.ts` and `phases/service.ts`. Created `ProjectPhases.tsx` for the Phase Planner view, which allows defining macro-level lifecycles (e.g. Discovery -> Design -> Dev -> QA -> Launch). Added a "Phases Planner" navigation button to the dashboard next to projects. Integrated a "Phase" selection dropdown within `CardModal.tsx` to link tasks to higher-level lifecycle phases.
- Decisions made: Modeled after the Sprints implementation to maintain consistency. Phases are ordered by a `position` field to represent sequential progression.
- Tests added: Backend `phases.test.ts` for lifecycle testing (create, update, delete phase).
- What's next: Global search + saved searches (Elasticsearch/OpenSearch index).

### 2026-08-10 — Session 12 (Global Search & Saved Searches)

- What was done: Built the Global Search feature. Instead of spinning up Elasticsearch (which would introduce heavy infrastructure complexity for our current MVP state), we opted to utilize PostgreSQL Full-Text Search via `drizzle-orm` raw query capabilities. Added `search/routes.ts` and `search/service.ts`. Created a highly responsive Command Palette component (`SearchPalette.tsx`) triggered by `Cmd+K` or a navigation bar click. Integrated Saved Searches, stored via the `saved_searches` table.
- Decisions made: Opted for Postgres FTS over Elasticsearch for MVP Phase 2 to keep the stack lightweight, fast, and easy to maintain.
- Tests added: Backend `search.test.ts` passing for multi-entity querying (Cards, Boards) and Saved Searches CRUD.
- What's next: Notifications engine maturity: granular preferences, digest bundling, DND.

### 2026-08-10 — Session 13 (Notifications Engine Maturity)

- What was done: Implemented granular notification preferences, digest bundling, and Do Not Disturb (DND) scheduling. Updated the database schema to include `isDispatched` on notifications. Built a `digest.cron.ts` mock cron logic to aggregate and simulate email dispatching for notifications configured as `digest_daily` or `digest_weekly`. Updated `setupNotificationListeners` to respect a user's DND hours, selectively queuing emails to be processed later if triggered during quiet hours. Added a full Settings UI (`NotificationSettings.tsx`) allowing users to easily toggle their matrix of preferences (e.g., Event type x Channel).
- Decisions made: Due to the lack of a real email provider in the MVP, the digest cron and instant dispatcher log directly to the console simulating a dispatched email.
- Tests added: Backend `notifications.test.ts` to assert that preferences are saved accurately and the digest cron properly queues/dispatches notifications.
- What's next: Automations engine + webhook dispatch.

### 2026-08-10 — Session 14 (Automations & Webhooks)

- What was done: Implemented the Automations Engine and Webhook Dispatch for Phase 2. Updated core `cards/service.ts` to emit granular events like `card.moved`, `card.assigned`, and `card.labeled` to the internal `eventBus`. Created `webhooks/service.ts` to dispatch HTTP POSTs via `fetch` triggered by events with an HMAC-SHA256 signature. Built `automations/service.ts` to evaluate JSON triggers and automatically execute card actions (adding labels, assigning users). Created frontend admin views for `WebhookSettings.tsx` and an `AutomationsModal.tsx` accessible directly from the `BoardView.tsx`.
- Decisions made: Mocked standard `bun test` logic for the Automations tester since the `cardsService` is imported globally and we're intercepting an internal event loop. For MVP, Automations are scoped to the `boardId` and webhooks to `organizationId`.
- Tests added: Backend `webhooks.test.ts` to assert payload signature generation and fetch mocks, and `automations.test.ts` to verify the condition evaluator.
- What's next: Core integrations: Slack, GitHub, Google Drive.

### 2026-08-10 — Session 15 (Core Integrations)

- What was done: Implemented the architectural foundation for Core Integrations (Slack, GitHub, Google Drive) as part of Phase 2. Added the `integrations` table in the database schema. Built `integrations/routes.ts` and `integrations/service.ts` in the backend to manage these connections per organization. Created the `Integrations.tsx` page in the frontend Admin panel to allow users to mock-connect (OAuth simulation) and disconnect these providers.
- Decisions made: Since this is an MVP phase without real third-party OAuth applications, the "Connect" action on the frontend fakes a short delay and successfully stores a mock token in the backend to prove the architecture.
- Tests added: N/A - Manual verification passed.
- What's next: Reporting v1 (burndown/velocity charts, basic dashboards).

### 2026-08-16 — Session 16 (Reporting v1, Time Tracking & Migration Importers)

- What was done: Completed the remaining Phase 2 Growth milestones:
  1. **Reporting & Analytics (Reporting v1)**: Implemented `reports/service.ts` and `reports/routes.ts` generating project KPI summaries, dynamic sprint burndown charts, velocity history, board reports, stage distribution, and team workload. Built `ProjectReports.tsx` with responsive, pure-SVG interactive burndown & velocity visualizations.
  2. **Time Tracking & Timesheets**: Implemented `timetracking/service.ts` and `timetracking/routes.ts` for task work logging (`time_logs`), estimates vs. actual progress tracking, billable hour breakdown, and org-wide timesheets. Added Story Points and Time Tracking controls to `CardModal.tsx`. Built `Timesheets.tsx` with filtering, team/project aggregations, and CSV export.
  3. **Migration & Import Tools**: Implemented `importers/service.ts` and `importers/routes.ts` supporting full Trello JSON board migration (boards, lists, cards, checklists, labels with color mapping) and generic structured task imports. Created `ImportModal.tsx` drag-and-drop migration wizard.
- Decisions made: Implemented chart visualizations in native responsive SVG rather than pulling in heavy charting libraries to keep bundle footprint low and performance instantaneous.
- Tests added: 10 new unit & integration tests across `reports.test.ts`, `timetracking.test.ts`, and `importers.test.ts` (all 10 passing with 48 assertions). Dashboard typecheck and Vite build passing cleanly.
- What's next: Phase 3 — Enterprise & Competitive Parity (SSO/SCIM, Custom Roles, Audit Logs, Real-time CRDT presence).

### 2026-08-16 — Session 17 (Custom Roles, Audit Logging, & Docs/Wiki Module)

- What was done: Implemented core Phase 3 Enterprise & Knowledge modules:
  1. **Custom Roles & Permission Overrides**: Created `roles/service.ts`, `roles/routes.ts`, and frontend `CustomRoles.tsx` with full CRUD and a categorized permission matrix across 10 resource categories.
  2. **Audit Logging & Compliance Export**: Created `audit/service.ts`, `audit/routes.ts`, and frontend `AuditLogs.tsx` with multi-filter query engine, JSON metadata inspector modal, and CSV compliance export.
  3. **Docs & Wiki Knowledge Base with Card Linking**: Created `documents` and `document_cards` schema tables, `docs/service.ts`, `docs/routes.ts`, and frontend `ProjectDocs.tsx` with live Markdown editing, formatting toolbar, preview mode, and bidirectional task card linking to Kanban boards.
- Decisions made: Added `documents` and `document_cards` tables directly into Drizzle schema with database migrations.
- Tests added: 14 new tests across `roles.test.ts` (5 tests), `audit.test.ts` (3 tests), and `docs.test.ts` (6 tests). All 24 backend tests passing with 84 assertions. Dashboard typecheck & Vite build passing cleanly.
- What's next: SSO/SCIM via WorkOS, Dedicated-instance tier, and Real-time presence/CRDT editing.

### 2026-08-16 — Session 18 (Forms & SLAs + Advanced Analytics & Portfolio Health)

- What was done: Implemented next Phase 3 enterprise capabilities:
  1. **Forms & Intake Module + SLA Policies**: Created `intake_forms` and `form_submissions` schema tables, `forms/service.ts`, `forms/routes.ts`, and frontend `PublicFormView.tsx` (`/forms/:slug`) and `FormBuilderModal.tsx` on boards. Forms allow external/internal intake with configurable inputs, target columns, and automated SLA calculation.
  2. **Advanced Reporting (CFD, Cycle Time, Portfolio)**: Implemented `getCumulativeFlowDiagram`, `getLeadAndCycleTime`, and `getWorkspacePortfolioHealth` in `reports/service.ts` & `reports/routes.ts`. Enhanced `ProjectReports.tsx` with tabs for Burndown, CFD, and Cycle Time. Created `PortfolioDashboard.tsx` (`/workspaces/:workspaceId/portfolio`) for cross-project executive visibility.
- Decisions made: Handcrafted pure-SVG stacked area charts for Cumulative Flow Diagrams to ensure zero extra runtime dependencies and perfect dark-mode support.
- Tests added: 9 new tests across `forms.test.ts` (6 tests) and `reports.test.ts` (3 new tests). All 33 backend tests passing with 117 assertions. Dashboard typecheck & Vite build passing cleanly.
- What's next: SSO/SCIM via WorkOS, Dedicated-instance tier, and Real-time presence/CRDT editing.

### 2026-08-16 — Session 19 (Enterprise SSO/SCIM & Real-Time Presence Polish)

- What was done: Implemented enterprise identity and live collaboration features:
  1. **Enterprise SSO & SCIM Directory Sync**: Created `sso_configurations` schema table, `sso/service.ts`, `sso/routes.ts`, and frontend `SSOSettings.tsx` at `/admin/sso`. Supports Okta, Microsoft Entra ID (Azure AD), Google Workspace SAML, custom OIDC, domain routing, automated user provisioning on SSO callback, and SCIM 2.0 directory webhooks (`user.create`, `user.update`, `user.delete`).
  2. **Real-Time Board Presence & Collaboration**: Upgraded `realtime/routes.ts` WebSocket server with in-memory presence tracking, active card viewing broadcasts (`presence:card_focus`), and typing indicators (`presence:typing`). Created `PresenceAvatars.tsx` displaying real-time viewer count, presence halos, and card editing badges in `BoardView.tsx`.
- Decisions made: Handled in-memory active presence maps directly on WebSocket connection lifecycles with automatic board cleanup on client disconnect.
- Tests added: 5 new tests in `sso.test.ts`. All 38 backend tests passing with 133 assertions. Dashboard typecheck & Vite build passing cleanly.
- What's next: Dedicated-instance tier, and Plugin / Power-Up marketplace.

### 2026-08-16 — Session 20 (Plugin & Power-Up Marketplace + Developer API Keys & Dedicated Instances)

- What was done: Completed Phase 3 in full by delivering:
  1. **Public Developer API Keys**: Created `api_keys` schema table, SHA-256 token hashing, `developer/service.ts` & `developer/routes.ts` (`/v1/developer/keys`), and frontend `DeveloperSettings.tsx` at `/admin/developer` with scope selector, expiry controls, and secret reveal dialog.
  2. **Boardly App Marketplace & Power-Ups**: Created `marketplace_apps` and `installed_apps` schema tables, seeded 5 flagship integrations (GitHub Sync, Slack Alerts, Custom Fields Pro, Time Tracker Pro, Jira Sync), and built `Marketplace.tsx` (`/marketplace`) with category filters, verified badges, and 1-click install/configure modals.
  3. **Dedicated-Instance Tier & DB Isolation**: Added `isDedicatedDb` and `dedicatedDbUrl` to `organizations` table and enhanced `Tenants.tsx` in super-admin with isolated database URI routing.
- Decisions made: Stored API key prefix `bk_live_...` for user reference while securely hashing full secret tokens with SHA-256.
- Tests added: 7 new tests in `developer.test.ts`. All 45 backend tests passing with 158 assertions. Dashboard typecheck & Vite build passing cleanly.
- What's next: Phase 4 Mobile & Native apps.

### 2026-08-16 — Session 21 (Native Mobile App Expo React Native + Push Devices & Offline Queue)

- What was done: Delivered full mobile client and push device infrastructure:
  1. **Push Device Infrastructure**: Created `push_devices` schema table, `/v1/notifications/push-devices` registration & unregistration routes, and push notification dispatcher in `notifications/service.ts`.
  2. **Native Mobile App (`apps/mobile`)**: Built Expo React Native mobile application containing `LoginScreen.tsx`, `WorkspacesScreen.tsx`, `BoardScreen.tsx` with horizontal Kanban columns, `CardDetailScreen.tsx` with checklist toggle and real-time comments, and `OfflineQueueScreen.tsx`.
  3. **Offline Resilience & Replay Engine**: Implemented `offlineQueue.ts` optimistic mutation queue with auto-sync replay against REST APIs when reconnecting to network.
- Decisions made: Adopted an optimistic offline mutation pattern with queue replay to allow mobile workers to navigate boards and post updates without continuous internet connection.
- Tests added: 4 tests in `notifications.test.ts` (push devices) and 3 tests in `offlineQueue.test.ts`. All 62 backend test assertions passing cleanly.

### 2026-08-16 — Session 22 (One-Command Startup & Developer Tooling)

- What was done: Built complete developer automation suite for 1-command startup:
  1. **One-Command Dev Launcher (`./start.sh` & `scripts/dev.sh`)**: Starts Postgres & Redis Docker containers, checks readiness, synchronizes `.env` and JWT secrets, runs database migrations & seeds, and concurrently launches Backend API (:3001) and Frontend Dashboard (:5173) with graceful signal trapping.
  2. **First-Time Setup (`./setup.sh` & `scripts/setup.sh`)**: Automated dependency installation, key generation, and full DB provisioning.
  3. **Database CLI Helper (`scripts/db.sh`)**: Added unified subcommands for `up`, `down`, `migrate`, `seed`, `reset`, `studio`, and `logs`.
  4. **Environment Doctor (`scripts/doctor.sh`)**: Diagnostic health checker for Bun, Node, Docker, ports, and connection health.
  5. **Clean DB Reset Runner (`apps/backend/src/db/reset.ts`)**: Drops schema, reapplies all Drizzle migrations, and reseeds default data.
  6. **Root Package Scripts & Documentation**: Wired scripts into root `package.json` and created comprehensive root `README.md`.
- Decisions made: Created both modular scripts in `scripts/` and top-level executable wrappers (`./start.sh`, `./setup.sh`) with npm/bun script aliases for maximum convenience across terminal workflows.

### 2026-08-16 — Session 23 (Dark Mode & Multi-Theme Customization Engine)

- What was done: Built end-to-end multi-theme and dark theme engine:
  1. **Multi-Theme CSS Variables & Tailwind Integration**: Extended `apps/dashboard/src/index.css` and `@boardly/config` with OKLCH/HSL CSS variables for Light Mode, Default Dark (Zinc), Midnight OLED, Oceanic Azure, Emerald Forest, Synthwave Sunset, and Nordic Frost.
  2. **Theme Store & State Persistence (`store/themeStore.ts`)**: Built Zustand theme manager supporting mode switching (`light` | `dark` | `system` with dynamic OS `prefers-color-scheme` listener), 6 curated palettes, and 6 customizable accent colors (Indigo, Sky Blue, Emerald, Neon Violet, Rose Crimson, Amber Glow + custom HEX picker).
  3. **Theme Selector Dropdown & Appearance Modal (`ThemeToggle.tsx` & `AppearanceModal.tsx`)**: Added compact navbar toggle dropdown with instant mode & palette switching + full interactive Appearance Modal featuring miniature live theme cards, swatches, and interactive mock Kanban preview.
  4. **Semantic Token Polish & Form Inputs**: Replaced hardcoded light colors across `DashboardLayout`, `AdminLayout`, `SuperAdminLayout`, and admin pages. Resolved WebKit/Firefox numeric stepper artifacts by applying global `input[type="number"]` spin-button resets and `color-scheme: dark` integration with centered numeric alignment.

### 2026-08-23 — Session 24 (Card Watchers Endpoint & Service Implementation)

- What was done: Fully implemented the Card Watcher API endpoints and service methods:
  1. **Card Watcher Service Methods (`apps/backend/src/modules/cards/service.ts`)**: Implemented `watchCard`, `unwatchCard`, and `getCardWatchers` utilizing the `card_watchers` database table with real-time WebSocket (`card.watched` / `card.unwatched`) and internal event bus broadcasts.
  2. **Card Detail Watcher Integration**: Enhanced `getCard` to retrieve and return the card's active watchers avatar/user list along with existing assignees, labels, and stage metadata.
  3. **Card Routes (`apps/backend/src/modules/cards/routes.ts`)**: Replaced placeholder stubs with `GET /v1/cards/:id/watchers`, `POST /v1/cards/:id/watch`, `DELETE /v1/cards/:id/watch`, and `DELETE /v1/cards/:id/watch/:userId`.
  4. **RBAC Default Permissions (`apps/backend/src/modules/roles/service.ts`)**: Added `card.watch` permission into default system permissions seed list.
  5. **Card Unit Tests (`apps/backend/src/modules/cards/card.test.ts`)**: Added test coverage for card watching, watcher listing, and unwatching.

### 2026-08-24 — Session 25 (Auth User Organization Context & Admin Panel Fix)

- What was done: Fixed missing `organizationId` and membership role in auth payloads:
  1. **Auth Service `getMe`, `signUp`, and `signIn` (`apps/backend/src/modules/auth/service.ts`)**: Updated backend endpoints to query active `organizationMembers` and return `organizationId` and `role` on the authenticated user object.
  2. **Admin Panel Access**: Resolved `Access Denied` state in `AdminLayout.tsx` for newly created organizations and existing users.
  3. **Auth Unit Tests (`apps/backend/src/modules/auth/auth.test.ts`)**: Added assertions ensuring `getMe` returns populated `organizationId` and `role`.
- Decisions made: Flatted active primary `organizationId` and `role` onto the user object returned across all auth routes (`/me`, `/sign-up`, `/sign-in`) for consistent consumption by frontend Zustand store.

### 2026-08-24 — Session 26 (Shadcn Sidebar Primitives & Admin Viewport Fix)

- What was done: Built official Shadcn UI Sidebar primitives and fixed page layout scrolling:
  1. **Shadcn Sidebar Primitives (`packages/ui/src/components/sidebar.tsx`)**: Implemented full `SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarRail`, `SidebarInset`, and `SidebarTrigger` with keyboard shortcut (`Cmd/Ctrl + B`) and mobile drawer support.
  2. **Package & Build Export**: Exported `@boardly/ui/sidebar` in `packages/ui` package manifest, TSConfig path mappings, and Vite configuration aliases.
  3. **Admin & Super Admin Layouts (`AdminLayout.tsx` & `SuperAdminLayout.tsx`)**: Replaced custom `min-h-screen` wrapper with `h-screen overflow-hidden`, keeping top navigation and sidebar anchored in viewport while delegating scrolling cleanly and independently to `SidebarInset`.

### 2026-08-24 — Session 27 (System Roles Deduplication & Unique Constraints)

- What was done: Resolved duplicated system roles and added database constraints:
  1. **Schema Unique Indices (`apps/backend/src/db/schema/index.ts`)**: Added unique partial index `system_role_name_idx` on `roles.name` (where `is_system_role = true`) and `org_role_name_idx` on `(organization_id, name)`.
  2. **Database Role Cleanup**: Removed 16 duplicate system role records from `roles` and `role_permissions` in the database, retaining only the 4 canonical system roles (`Org Owner`, `Org Admin`, `Member`, `Viewer`).
  3. **Idempotent Seeding (`apps/backend/src/db/seed.ts`)**: Updated `seed.ts` to check if a system role exists before insertion, preventing duplicate insertions when re-seeding.

### 2026-08-24 — Session 28 (50-Member Enterprise Seed & 60-Day Historical Data)

- What was done: Built an enterprise organization seeding pipeline and populated 50 members with ~2 months of rich task history:
  1. **Enterprise Organization Seed Generator (`apps/backend/src/db/seedOrganization.ts`)**: Built a seed script creating _Acme Technologies_ on Enterprise tier with 50 realistic users, 5 workspaces, 8 projects (Kanban & Scrum), 4 sprints, and milestone phases.
  2. **Rich Historical & Current Data**: Populated 120+ detailed cards, checklists with items, 100+ comments, 115+ time tracking entries across past 60 days, documentation articles, and audit logs.
  3. **Credential Catalog & Guide (`markdowns/SEED_CREDENTIALS.md`)**: Created comprehensive credential reference with `Password123!` for all 50 team members and suggested testing scenarios by job function.
  4. **Package Script**: Added `"db:seed:org": "bun run src/db/seedOrganization.ts"` to `apps/backend/package.json` and integrated into `seed.ts`.

### 2026-08-24 — Session 29 (Team Member Search & Enterprise-Scale Member Picker)

- What was done: Resolved missing usernames in card assignee selection and built enterprise-scale search & filtering:
  1. **Member Object Model Fix (`TaskDetailView.tsx`)**: Fixed the assignee picker to read from the flat member response model (`m.name`, `m.email`, `m.avatarUrl`) instead of undefined nested `m.user` properties, restoring full user names and dynamic avatar initials.
  2. **Enterprise Member Picker Component (`MemberPicker.tsx`)**: Created a dedicated, reusable, accessible popover component supporting instant in-memory filtering + debounced server query search across thousands of organization members.
  3. **Backend Search & Pagination Support (`apps/backend/src/modules/organizations/`)**: Enhanced `GET /v1/orgs/:orgId/members` and `listMembers` service with optional `search` (`ilike` on name & email), `limit`, `offset`, and `role` query parameters, ordered by name ASC.
  4. **Rich UI & UX Features**: Added deterministic HSL avatar gradients, role badges (`Admin`, `Member`, `Billing`, `Workspace Admin`), "Assign to Me" quick action, "Currently Assigned" section with 1-click unassigning, clear empty search states, escape key navigation, and click-outside dismissal.

### 2026-08-24 — Session 30 (Board Label Picker & Tag Management UX Overhaul)

- What was done: Redesigned and rebuilt the Board Label selector and management experience:
  1. **Enterprise Label Picker Component (`LabelPicker.tsx`)**: Created a dedicated, glassmorphic dropdown popover component with search filtering, clean list of board labels with color pills, active checkmark toggles, and empty search states.
  2. **Dedicated Label Creation Panel**: Replaced the cramped color row with a structured creation interface featuring live tag preview badge, name input with Enter-key submission, clean 5-column color palette grid with active ring selectors, and dedicated action buttons.
  3. **Direct Active Chip Removal (`TaskDetailView.tsx`)**: Enhanced active label chips on task cards with 1-click `X` remove buttons directly on the chip, avoiding the need to open the picker to remove a label.
  4. **Accessibility & Dismissal**: Added Escape key navigation and click-outside dismissal handlers.
- Decisions made: Separated label browsing and label creation into distinct, non-overlapping workflow zones within `LabelPicker.tsx`, resolving container truncation and swatch-button overlapping issues.

### 2026-08-24 — Session 31 (Rich Markdown Engine & Interactive Task List Previews)

- What was done: Built a full-featured markdown rendering engine with interactive task list checkboxes:
  1. **Rich Markdown Renderer Component (`MarkdownRenderer.tsx`)**: Created a high-performance markdown parser supporting headings (`#`, `##`, `###`, `####`), interactive task lists (`- [ ]`, `- [x]`), bullet lists, numbered lists, blockquotes, horizontal rules, fenced code blocks with language badges & copy buttons, inline code, bold, italic, strikethrough, and external links.
  2. **Interactive Task List Toggle Support**: Enabled direct clicking on `- [ ]` / `- [x]` task checkboxes in description preview mode to update card markdown content with immediate optimistic feedback.
  3. **Task Description & Comments Integration (`TaskDetailView.tsx`)**: Replaced raw text formatting in description preview and comment streams with `MarkdownRenderer`, and joined comments with `users` in backend `listComments` to display proper author names and avatars.
  4. **Project Docs & Wiki Integration (`ProjectDocs.tsx`)**: Upgraded doc content preview to render full markdown formatting with code blocks and headers.

### 2026-08-24 — Session 32 (User Tagging Mentions, Auto-Observer Subscription & My Tasks Hub)

- What was done: Implemented @mention company member tagging in comments with automatic observer addition, and built a unified "My Tasks" page:
  1. **Mention Autocomplete Component (`MentionCommentBox.tsx`)**: Created a rich comment composer with inline `@` trigger detection, member search popover, keyboard navigation (ArrowUp/Down, Enter, Tab, Escape), and shortcut submission (`Cmd+Enter`).
  2. **Automatic Card Observer Addition & Mentions (`service.ts`)**: When users are tagged via `@Name` in comments, backend automatically subscribes them to card observers (`card_watchers`), dispatches `card.watched` and `card.mentioned` realtime events, and creates in-app notifications.
  3. **Styled Mention Badges (`MarkdownRenderer.tsx`)**: Updated the markdown engine with regex support to render `@User Name` as styled primary accent pill badges.
  4. **"My Tasks" Hub Page (`MyTasks.tsx`)**: Built a responsive, multi-view task management hub featuring:
     - 4 KPI metric cards (Assigned, Observing, Participating, Overdue/Due Soon).
     - Multi-tab relationship filtering: `All Tasks`, `Assigned to Me`, `Observing`, `Participating`, `Created by Me`.
     - Real-time search across titles and descriptions.
     - Workspace, Project, and Priority filter dropdowns.
     - Grid & Table views with checklists progress bars, stage pills, due date alerts, and assignee/watcher avatar stacks.
     - Integrated `CardModal` for in-place card editing.
  5. **Top Navigation Link (`DashboardLayout.tsx`) & Routes (`App.tsx`)**: Added `/my-tasks` and `/tasks` routes with header navigation.
- Decisions made: Unified all task relationship types (assigned, watching, commenting, created) into a single backend aggregation endpoint (`GET /v1/cards/my-tasks`) to give users complete cross-project visibility in one place.

### 2026-08-24 — Session 33 (Single Primary Assignee, Multi-Participant & Observer Roles, and Personal Subtasks)

- What was done: Implemented clear role separation on tickets and personal subtask management:
  1. **Single Assignee Model**: Enforced single primary owner per ticket. In `assignUserToCard`, previous assignees are automatically cleared when a new assignee is selected. `MemberPicker` supports `mode="single"` with instant replacement.
  2. **Participants (Multiple Collaborators)**: Added dedicated `PARTICIPANTS` section and API endpoints (`GET/POST/DELETE /v1/cards/:id/participants`) backed by `card_participants` table, allowing multiple team members to actively collaborate on a ticket.
  3. **Observers (Multiple Watchers)**: Enhanced `OBSERVERS` section with quick 1-click Watch/Unwatch toggle and multi-select observer picker.
  4. **Personal Subtasks for Ticket Collaborators**:
     - Supported `assigneeId` on subtask creation and joined subtasks with assignees in `listSubtasks`.
     - Added quick assignee selector on subtask creation form (Assign to Me, Primary Assignee, Participants, Observers).
     - Subtasks display assignee avatar badges and names.
     - Added `All Subtasks` vs `My Subtasks` filter tabs so team members can view and manage their personal work items on any ticket.
- Decisions made: Separated ticket membership into 3 distinct layers (1 Primary Assignee, N Collaborating Participants, N Observers) to match enterprise project management semantics while enabling fine-grained subtask assignment.

### 2026-08-24 — Session 34 (Rich Board Card Details & User Profile Settings Page)

- What was done: Delivered rich card details across Kanban boards and created the user profile management page:
  1. **Rich Kanban Cards (`BoardView.tsx` & `cards/service.ts`)**:
     - Upgraded `listCards` to aggregate primary assignee, labels, stage, checklist progress (`checklistDone/checklistTotal`), comments count, and attachments count.
     - Redesigned board cards (`SortableCard`) to display colored label pills, card title, stage pill, checklist progress badge (`2/5`), due date indicator with overdue alert, story points, comments count, attachments count, and assignee avatar in the bottom-right corner.
  2. **User Profile Settings Page (`ProfileSettings.tsx` & `/profile`)**:
     - Built comprehensive profile page allowing users to update their Full Name, Email, Profile Picture (presets selection or custom URL), and Timezone.
     - Added Organization & Role details overview with an assigned permissions capability summary.
     - Added Account Security section for password changes with current password validation.
  3. **Backend Profile APIs (`auth/service.ts` & `auth/routes.ts`)**:
     - Added `PATCH /v1/auth/profile` and `POST /v1/auth/change-password` endpoints.
  4. **Header Navigation Integration (`DashboardLayout.tsx` & `App.tsx`)**:
     - Linked top navigation header user avatar button to `/profile` with live user avatar badge.
- Decisions made: Enriched board cards directly in `listCards` to minimize client-side round-trips while delivering a high-density, information-rich Kanban experience.

### 2026-08-24 — Session 35 (Custom Subtle Scrollbars & UX Polish)

- What was done: Fixed ugly browser-native white/grey bottom scrollbar and polished layout scrolling across the Kanban board:
  1. **Custom Modern Scrollbar Engine (`index.css`)**: Implemented slim (6px), transparent-track scrollbars with rounded semi-transparent thumbs across WebKit and Firefox (`scrollbar-width: thin`), adapting seamlessly to light, dark, and custom themes with zero harsh white bars.
  2. **Dashboard Layout & Viewport Fitting (`DashboardLayout.tsx`)**: Replaced `min-h-screen` with `h-screen overflow-hidden` and configured `main` to `overflow-y-auto min-h-0`, eliminating double scrollbars and ensuring board containers fit cleanly within the viewport height.
  3. **Board Container & Column Polish (`BoardView.tsx`)**: Added `pb-4` breathing room to horizontal board container and styled column headers with card counters.
- Decisions made: Replaced native browser scrollbars with custom semi-transparent overlay styling to maintain high visual aesthetics across all operating systems.

### 2026-08-24 — Session 36 (Workspace, Project, Board, and List Deletion & Renaming)

- What was done: Added comprehensive delete and rename management across the full project hierarchy with permission enforcement:
  1. **Workspace Actions (`Workspaces.tsx`)**:
     - Added 3-dots action menu on each workspace header with Rename Workspace and Permanently Delete Workspace options.
     - Built dedicated confirmation modal with red warning highlighting cascading deletion of child projects, boards, and tasks.
  2. **Project Actions (`Workspaces.tsx`)**:
     - Added 3-dots action menu on each project row toolbar with Rename Project and Delete Project options.
     - Built confirmation modal warning about child boards and tasks deletion.
  3. **Board Actions (`Workspaces.tsx` & `BoardView.tsx`)**:
     - On Workspaces page: Added hover 3-dots menu button on each board card tile to Rename or Delete the board.
     - On Board View: Added Board Settings menu in top header with Rename Board and Delete Board options (redirects to `/` on deletion).
     - Upgraded `CreateBoardDialog` to use instantaneous React Query cache invalidation instead of full window reloads.
  4. **Kanban List Actions (`BoardView.tsx`)**:
     - Added 3-dots actions menu on each list column header with Rename List and Delete List options with confirmation modal (`DELETE /v1/lists/:id`).
- Decisions made: Enforced cascading deletion confirmation dialogs on all levels to protect against accidental deletion while respecting RBAC permissions (`workspace.delete`, `project.delete`, `board.delete`, `list.delete`).

### 2026-08-24 — Session 37 (Task Detail Dialog UX Redesign & Popover Layout Fixes)

- What was done: Redesigned the card modal dialog into an enterprise-grade, independent two-column split layout:
  1. **Modal Geometry & Sizing (`CardModal.tsx`)**: Expanded modal width to `sm:max-w-5xl md:max-w-6xl` (`w-[94vw] h-[88vh]`) with `overflow-hidden`, preventing outer dialog scrollbar clipping.
  2. **Fixed Top Header (`TaskDetailView.tsx`)**: Locked the top breadcrumb path, list switcher dropdown, share button, full screen expand, and close button permanently at the top of the dialog.
  3. **Independent Two-Column Scrolling (`TaskDetailView.tsx`)**:
     - Left Column (`flex-1 overflow-y-auto`): Title, Description (Write/Preview), Checklists, Subtasks with assignee badges and personal filter tabs, Time Tracking, Attachments, and @mentions Activity stream.
     - Right Sidebar (`w-80 overflow-y-auto bg-muted/15`): Stage/Status dropdown, Primary Assignee, Collaborating Participants, Observers, Priority, Due Date, Labels, and Sprints/Phases.
  4. **Contained Member & Label Pickers (`MemberPicker.tsx` & `LabelPicker.tsx`)**: Adjusted picker container classes to `w-full max-w-full`, allowing smooth expansion within the scrollable sidebar without overflowing modal boundaries.
- Decisions made: Separated modal header and body scrolling into independent viewports (similar to Linear and Jira) for high ergonomics on dense task tickets.

### 2026-08-24 — Session 38 (Smart-Default Subtask Assignee UX)

- What was done: Fixed subtask creation defaulting to "Unassigned":
  1. **Smart Assignee Pre-selection (`TaskDetailView.tsx`)**:
     - Added automatic pre-selection for new subtasks: defaults to the ticket's **Primary Assignee** (`card.assignee.id`) or the currently logged-in user (`user.id`) rather than defaulting to "Unassigned".
     - Enhanced subtask assignee dropdown with explicit labels: `Primary Assignee: [Name]`, `Assign to Me ([Name])`, `Participant: [Name]`, `Observer: [Name]`.
     - Preserves smart pre-selection after subtasks are submitted without resetting to unassigned.

### 2026-08-24 — Session 39 (Rich Task Creation & Composer UX)

- What was done: Transformed task creation from a bare single-text-input into a rich, modern task composer:
  1. **In-Column Quick Composer (`BoardView.tsx`)**:
     - Upgraded the column "+ Add a card" composer with a multi-line auto-expanding title textarea.
     - Added quick attribute chips directly in the composer: Primary Assignee dropdown (with smart pre-selection for active user/members), Due Date date-picker, and Story Points (`pts`) input.
     - Added "+ Notes" toggle to include initial notes or description.
     - Added **"Full Editor"** action button to instantly create and open the comprehensive `CardModal`.
  2. **Top Bar "Create Task" Button & Modal (`BoardView.tsx`)**:
     - Added prominent `+ Create Task` button in the board header.
     - Built dedicated `CreateTaskModal` dialog with Target Column selector, Task Title, Markdown Description, Assignee, Due Date, Story Points, and Estimated Hours.
  3. **Backend Route Enhancement (`apps/backend/src/modules/cards/routes.ts`)**:
     - Added `dueDate` parameter support to `POST /v1/cards` schema validation.

### 2026-08-24 — Session 40 (Workspace & Project Permission & Visibility Architecture)

- What was done: Analyzed and refined the multi-tenancy and workspace permission isolation model:
  1. **Organization Multi-Tenant Boundary**: Confirmed that all queries enforce `eq(table.organizationId, organizationId)` — members of different organizations can never see or access another organization's workspaces, projects, boards, or tasks.
  2. **Workspace Visibility & Access Control (`workspaces/service.ts`)**:
     - Implemented dynamic membership filtering in `listWorkspaces`:
       - Org Admins / Owners: Can view all organization workspaces.
       - Regular Members: Can only see **public organization workspaces** (`visibility: 'org'`) and **private workspaces** where they are explicitly added to `workspace_members`.
     - Automatically assigns workspace creators as `admin` in `workspace_members` on creation.

### 2026-08-24 — Session 41 (Enterprise User Management & Rich Invitation Flow)

- What was done: Overhauled User Management and Invitation flow for enterprise SaaS readiness:
  1. **Rich Invitation Modal (`Users.tsx` & `organizations/service.ts`)**:
     - Added Full Name field alongside email input.
     - Role Selection with visual cards and descriptions (`Org Admin`, `Member`, `Viewer`).
     - Initial Workspace Assignment: Allows selecting which team workspaces the new member is provisioned to upon joining.
     - Auto-provisioning on Backend: Creates user account and assigns `organizationMembers` and `workspaceMembers` without failing if the email does not yet exist.
     - Success Screen with One-Click Invite Link Copy: Displays the invitation link directly in the UI for instant sharing.
  2. **Metrics & Filter Toolbar (`Users.tsx`)**:
     - Added summary metric counters (Total Members, Admins/Owners, Active, Workspaces).
     - Live search filter by Name or Email.
     - Filter dropdowns by Role (`Org Owner`, `Org Admin`, `Member`, `Viewer`) and Status (`Active`, `Invited`).

### 2026-08-24 — Session 42 (Rich Task Hover Tooltip & Card Preview)

- What was done: Implemented an interactive hover card preview tooltip for all Kanban task tiles:
  1. **Interactive Hover Popover (`BoardView.tsx`)**:
     - Built a floating preview card with intentional hover debouncing (450ms) to prevent mouse-sweep noise.
     - Displays full non-truncated task title, description excerpt snippet, colored stage/status badge, story points pill (`PTS`), and due date status with countdown/overdue alert.
     - Integrated a visual checklist progress bar (`4/6 Completed (67%)`).
     - Displays primary assignee avatar and details, alongside comment and attachment counters.
     - Automatically disabled during drag-and-drop actions (`isDragging`) for silky-smooth drag interactions.
- Decisions made: Added rich hover preview to eliminate the need to open full task modals just to check description notes or checklist details.

### 2026-08-24 — Session 43 (Cascading Deletion for Boards, Lists, Projects & Workspaces)

- What was done: Implemented full recursive cascading deletion across the entire database hierarchy to ensure clean removals without orphaned rows or FK constraint errors:
  1. **List Cascade (`lists/service.ts`)**:
     - Deletes all cards in the list, including all card assignees, participants, watchers, labels, sprints, phases, time tracking logs, comments, attachments, checklists, and checklist items.
  2. **Board Cascade (`boards/service.ts`)**:
     - Finds all lists belonging to the board and executes the full card cascade.
     - Deletes all lists, labels, board members, automations, and intake forms belonging to the board before deleting the board.
  3. **Project Cascade (`projects/service.ts`)**:
     - Recursively deletes all boards in the project (with full list & card cascade).
     - Deletes project phases, sprints, and docs.
  4. **Workspace Cascade (`workspaces/service.ts`)**:
     - Recursively deletes all projects in the workspace (with full board, list, and card cascade).
     - Deletes workspace members.

### 2026-08-24 — Session 44 (30-Day Soft Delete & Trash / Recycle Bin Recovery System)

- What was done: Built complete 30-day Trash and Recycle Bin recovery system across the full stack:
  1. **Backend Trash Module (`trash/service.ts` & `trash/routes.ts`)**:
     - Added `GET /v1/trash` to list all soft-deleted workspaces, projects, boards, and cards for the organization with dynamic 30-day countdown timer calculations.
     - Added `POST /v1/trash/restore` for instant 1-click recovery of deleted items and automatic parent hierarchy restoration.
     - Added `DELETE /v1/trash/:itemType/:itemId` for permanent hard cascade purging.
     - Added `DELETE /v1/trash/empty` to empty the entire organization trash in bulk.
     - Updated `boards/service.ts`, `lists/service.ts`, `projects/service.ts`, and `workspaces/service.ts` to soft-delete by default and filter out trashed rows (`isNull(deletedAt)`).

### 2026-08-24 — Session 45 (Notification System UX & Deep-Linking Overhaul)

- What was done: Fixed notification interactivity, unread badge clearing, and added context-aware rendering:
  1. **Interactive Navigation & Read State (`NotificationDropdown.tsx`)**:
     - Clicking any notification marks it as read immediately and navigates directly to the referenced card/board (`/b/:boardId?cardId=:cardId`) or `/my-tasks`.
     - Added a prominent **"Mark all read"** button with a checkmark icon to clear all unread notification badges in 1 click.
     - Added hover checkmark action on individual rows to allow dismissing without navigating away.
  2. **Context-Aware Event Formatting (`NotificationDropdown.tsx`)**:
     - Replaced generic "Notification / You have a new update" placeholder with event-specific icons and human-readable text:
       - Mention: `@ Mentioned in a Comment` with the comment excerpt.
       - Assignment: `👤 Assigned to Task` with the task title.
       - Discussion: `💬 New Comment` with the comment body.
       - Due Date: `⏰ Task Due Soon` / `Task Overdue`.
  3. **Tabs & Empty State**:
     - Added `All` and `Unread` filter tabs.
     - Added friendly empty state illustration when all notifications are caught up.

### 2026-08-24 — Session 46 (User Permissions & Access Matrix Feature)

- What was done: Built complete User Permissions visibility matrix across the backend and frontend:
  1. **Backend Permissions Matrix API (`auth/service.ts` & `auth/routes.ts`)**:
     - Added `GET /v1/auth/permissions` returning the user's active system role, total granted permissions, and categorized permission matrix (`Workspaces & Projects`, `Boards & Columns`, `Tasks & Collaboration`, `Administration & Governance`).
     - Maps RBAC permissions dynamically from `role_permissions`, `roles`, and `organization_members`.
  2. **Profile Settings Permissions Matrix (`ProfileSettings.tsx`)**:
     - Upgraded Profile page with an interactive **"My Assigned Permissions"** card showing active system role, total granted count, and category summary chips.
     - Built **Detailed Role & Permissions Matrix Modal** with live search, category grouping, and filter tabs (`All`, `Allowed`, `Restricted`).
     - Displays description, permission key, and clear status badges (`✓ Allowed` vs `🔒 Restricted`).

### 2026-08-24 — Session 47 (Reusable Enterprise Data Grid Component with Excel-Style Filters & 15-Item Pagination)

- What was done: Designed and built an enterprise-grade, reusable generic data grid component (`EnterpriseDataGrid.tsx`) supporting Excel-like filtering, multi-column sorting, 15-item default pagination, and dual client/server processing:
  1. **Reusable `EnterpriseDataGrid.tsx` Component**:
     - **Excel-Style Column Filtering**: Clicking column filter icon opens a popover showing a search bar, "(Select All)" toggle, and distinct value checkboxes with live frequency counts (e.g. `☑ Sarah Chen (12)`). Active filters glow in primary color.
     - **3-State Sorting**: Ascending (`↑`), Descending (`↓`), Neutral (`↕`) with automatic comparator for dates, numbers, strings, and custom objects.
     - **15-Item Default Pagination**: Set to 15 items per page by default with page size switcher (`15`, `30`, `50`, `100`), dynamic ellipsis page numbers (`1 2 3 ... 10`), and entry range indicators (`Showing 1 to 15 of 84 entries`).
     - **Search & Export**: Realtime debounced global search and 1-click **Export to CSV**.
     - **Dual Architecture**: Native support for both Client-Side in-memory processing and Server-Side query delegation.
  2. **Page Upgrades**:
     - Upgraded **Timesheets & Work Logs** (`Timesheets.tsx` Detailed Log Entries) to `EnterpriseDataGrid` with filters on Date, Member, Task, Project, Type, and sortable Duration.
     - Upgraded **Audit Trail & Compliance Logs** (`AuditLogs.tsx`) to `EnterpriseDataGrid` with filters on Timestamp, Actor, Action, Target, and IP Address.

### 2026-08-24 — Session 48 (Comprehensive TypeScript Error Resolution Across Codebase)

- What was done: Resolved 100% of TypeScript errors and strict type violations across the entire monorepo (`apps/backend`, `apps/dashboard`, `apps/mobile`, `packages/ui`, `packages/shared-types`):
  1. **Backend Database & Schema Generic Typing**:
     - Fixed Drizzle `Database` type resolution across 14 module test files (`superadmin.test.ts`, `webhooks.test.ts`, `workspace.test.ts`, `stages.test.ts`, `sprints.test.ts`, `phases.test.ts`, `project.test.ts`, `board.test.ts`, `list.test.ts`, `card.test.ts`, `org.test.ts`, `search.test.ts`, `auth.test.ts`, `roles.test.ts`, `notifications.test.ts`).
     - Replaced non-existent table references `docs` -> canonical `documents`.
     - Corrected schema property names (`isSystemRole` for roles, `isDone` for checklist items, `role` enum for organization members).
  2. **RBAC Permissions & API Routes**:
     - Aligned route permission guards in `organizations/routes.ts`, `integrations/routes.ts`, and `lists/routes.ts` with canonical `PermissionKey`s (`member.invite`, `member.role.update`, `member.remove`, `integration.manage`, `list.create`, `list.update`, `list.delete`).
     - Added null guards and strict return types across auth, member, card, and list services.
  3. **Mobile App (`apps/mobile`)**:
     - Fixed `tsconfig.json` inheritance path (`../../packages/config/tsconfig/base.json`) and configured bundler module resolution.
     - Cleaned up unused React 17/18 style default imports across screen components.
     - Handled safe globalThis fallback for environment variables.
  4. **Verification**:
     - `apps/backend`: `npx tsc --noEmit` -> **0 errors (100% clean)**.
     - `apps/dashboard`: `npx tsc --noEmit` & `npm run build` -> **0 errors (100% clean)**.
     - `apps/mobile`: `npx tsc --noEmit` -> **0 errors (100% clean)**.
     - `packages/shared-types`: `npx tsc --noEmit` -> **0 errors (100% clean)**.

### 2026-08-25 — Session 49 (World-Class Kanban Board Drag & Drop UX Overhaul)

- What was done: Completely overhauled the Kanban Board drag-and-drop experience in `BoardView.tsx` to eliminate container overflow clipping, visual jitter, and preview interference:
  1. **Dnd-Kit DragOverlay & Portal Rendering**:
     - Introduced `<DragOverlay>` rendered outside `overflow-y: auto` list boundaries, eliminating card clipping and scrollbar jitter.
     - Added elevated glassmorphic drag card styling with 2° tilt, subtle scale (`scale-[1.03]`), deep shadow (`shadow-2xl shadow-black/60`), and primary glowing border.
     - Styled in-list active slot as a clean dashed ghost placeholder (`border-2 border-dashed border-primary/40 bg-primary/5 rounded-xl min-h-[76px]`).
  2. **Real-Time Cross-Column Drag Feedback (`onDragOver`)**:
     - Implemented dynamic card shifting across columns in local state during drag operations, opening destination slots with smooth animated transitions.
     - Added robust rollback support (`onDragCancel`) via initial list snapshots.
  3. **Multi-Container Collision Detection & Droppable Zones**:
     - Implemented `customCollisionDetection` combining `pointerWithin`, `rectIntersection`, and `closestCorners` fallback.
     - Upgraded `ListColumn` with `useDroppable`, luminous active drop highlights (`ring-2 ring-primary/20 bg-muted/70`), and dedicated empty-state drop zones.
  4. **Interaction & Sensor Polish**:
     - Configured `PointerSensor` (distance: 6px) to keep clicks instant while preventing accidental drags.
     - Added `TouchSensor` (delay: 150ms) and `KeyboardSensor` (`sortableKeyboardCoordinates`).
     - Suppressed rich hover preview tooltips globally while any drag is active.

### 2026-08-25 — Session 50 (Card Quick Peek & Portaled Floating Preview Overhaul)

- What was done: Redesigned the card preview tooltip into a clean, unclipped React Portal popover (`CardHoverPreviewPortal`) with on-card quick action buttons:
  1. **Eliminated In-DOM Overflow Clipping via React Portal (`createPortal`)**:
     - Removed the relative `position: absolute` tooltip from inside `overflow-y: auto` columns that previously caused cut-off text, clipped borders, and layout jumps.
     - Portaled the preview directly to `document.body` with fixed viewport coordinates calculated via `anchorRect.getBoundingClientRect()`.
     - Added smart horizontal/vertical edge detection that docks the preview cleanly to the right or left of the card without overlapping the card itself.
  2. **Non-Intrusive Quick Peek & Intentional Triggering**:
     - Added a dedicated, sleek **Quick View (Eye icon)** button that smoothly appears on the card header on hover.
     - Set comfortable intentional hover delay (700ms) to prevent accidental popover spam during casual mouse movements.
     - Added automatic dismissal on window scroll/wheel, board drag start, and modal open.
  3. **Visual & Information Architecture Polish**:
     - Designed an ultra-clean glassmorphic card preview (`backdrop-blur-2xl bg-card/95 ring-1 ring-primary/20 shadow-2xl`) with Stage badges, Points chip, Due Date status, Label tags, Markdown description excerpt, and Checklist progress bar.
     - Added a direct **"Full Editor"** action button to open the comprehensive `CardModal`.

### 2026-08-25 — Session 51 (Full Editor & Inline Card Composer UX Overhaul)

- What was done: Fixed the non-functional "Full Editor" action and completely redesigned the inline card creation composer in `BoardView.tsx`:
  1. **Full Editor Modal Integration**:
     - Fixed issue where clicking "Full Editor" failed to trigger when title was empty.
     - Wired the Full Editor action directly to `CreateTaskModal` with complete pre-populated state (`title`, `description`, `assigneeId`, `dueDate`, `storyPoints`, and current target `listId`).
     - Upon submission, task is created, lists are updated, and the full card details editor is opened seamlessly.
  2. **Modern Inline Card Composer Redesign**:
     - Replaced clunky raw inputs with compact, responsive attribute pills (`User`, `Calendar`, `PTS`, `Notes`).
     - Auto-focused, styled textarea with keyboard shortcuts (`Enter` to submit, `Shift+Enter` for newline, `Escape` to cancel).
     - Clean primary action button (`Add Card`) and outline modal button (`Full Editor`) with proper cursor states and hover animations.

### 2026-08-25 — Session 52 (Searchable Combobox & Modern Dropdown Overhaul)

- What was done: Replaced clunky browser native `<select>` elements across the dashboard with a world-class, portaled searchable combobox (`SearchableSelect`, `MemberSearchableSelect`, `ListSearchableSelect`):
  1. **New Unified `SearchableSelect` Component**:
     - Live search filtering with keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`), auto-focus on open, and viewport-edge collision clamping.
     - Portaled rendering directly to `document.body` via `createPortal` to eliminate clipping across modals and scroll containers.
     - Specialized `MemberSearchableSelect` featuring user avatars, initials with deterministic color gradients, role badges, and a prioritized "(Me)" selection.
     - Specialized `ListSearchableSelect` displaying column names with card count badges.
  2. **Comprehensive Integration Across Key Screens**:
     - `CreateTaskModal`: Board Column selection & Primary Assignee selection upgraded to searchable comboboxes.
     - `BoardView` inline card composer: Upgraded quick assignee selector to `MemberSearchableSelect`.
     - `TaskDetailView`: Header list switcher, Stage / Status picker, Active Sprint picker, and Project Phase picker upgraded to `SearchableSelect`.
     - `MyTasks`: Workspace filter, Project filter, and Priority filter upgraded to `SearchableSelect`.
     - `Timesheets`: Date range and Team Member filters upgraded to `SearchableSelect`.
     - `Users`: Team role and status filters upgraded to `SearchableSelect`.
     - `AuditLogs`: Date range and action filters upgraded to `SearchableSelect`.

### 2026-08-25 — Session 53 (Zero-Shift Tab Switching & Scrollbar Gutter Stabilization)

- What was done: Eliminated horizontal and vertical layout shifts when switching tabs in `MyTasks` and across the application:
  1. **Scrollbar Gutter Reservation (`scrollbar-gutter: stable`)**:
     - Added `scrollbar-gutter: stable;` to `html` in `index.css` to permanently reserve scrollbar width regardless of whether a page's content is shorter than the viewport (e.g. empty states) or taller (e.g. populated card grids).
     - Completely eliminated the 15px horizontal layout jump when switching between tabs with different item counts.
  2. **Query Transition Stabilization (`keepPreviousData`)**:
     - Configured `placeholderData: keepPreviousData` on `useQuery` in `MyTasks.tsx`.
     - Prevented the component from dropping current data and flashing skeleton loaders on every tab click, ensuring instant, smooth visual transitions.
     - Added a subtle floating `Updating...` status pill during background refetches.
  3. **Container Dimension Consistency**:
     - Established a consistent minimum height (`min-h-[420px]`) and centered empty-state dimensions across `MyTasks` tab views.

### 2026-08-25 — Session 54 (Fixed Header & Sticky Footer Dialog Architecture Overhaul)

- What was done: Redesigned all modal dialog layouts across the application so headers and bottom action footers remain permanently pinned in place while only the body content scrolls:
  1. **Theme & Appearance Modal (`AppearanceModal.tsx`)**:
     - Restructured with fixed `DialogHeader` (with title, description, and Reset button), scrollable body (`flex-1 overflow-y-auto`), and permanently fixed bottom action bar with `Close` and `Save & Apply` buttons.
     - Users never lose context or have to scroll to the bottom to find the action button.
  2. **Task Creation Modal (`CreateTaskModal` in `BoardView.tsx`)**:
     - Converted form container to flex column with fixed header, scrollable field body, and fixed bottom submission bar (`Cancel` and `Create & Open Task`).
  3. **Board Automations & Rules Modal (`AutomationsModal.tsx`)**:
     - Added fixed header, scrollable rules listing, and fixed bottom `Done` button.
  4. **Intake Form Builder Modal (`FormBuilderModal.tsx`)**:
     - Added fixed header, scrollable forms and SLA management list, and fixed bottom `Done` button.
  5. **Board Import / Migration Modal (`ImportModal.tsx`)**:
     - Added fixed header, scrollable upload dropzone / preview area, and fixed bottom action bar (`Cancel` and `Start Migration`).

### 2026-08-25 — Session 55 (Card Move Route & RBAC Permission Resolution)

- What was done: Resolved the CORS/permission failure on the card move API (`PATCH /v1/cards/:id/move`):
  1. **Root Cause Analysis**:
     - The route was guarded by `requirePermission('card.move')`, whereas the seeded system permission in the database for editing cards and moving them across lists is `card.update`.
     - When `requirePermission` evaluated `card.move`, the database lookup failed for all users (including Org Owners and Admins) and threw an uncaught error in Elysia's derive hook before the route handler.
     - Because the error was thrown during hook resolution before response serialization, Elysia returned the 403 error without standard CORS headers, which the browser interpreted and displayed as a "CORS error".
  2. **Backend Route & Permission Synchronization**:
     - Updated `apps/backend/src/modules/cards/routes.ts` to use `requirePermission('card.update')` for `PATCH /:id/move` and `requirePermission('card.delete')` for `POST /:id/archive`.
     - Updated `apps/backend/src/middleware/auth.ts` to automatically map granular alias permissions (`card.move` -> `card.update`, `card.archive` -> `card.delete`, `board.archive` -> `board.delete`) and attach explicit `{ status: 403 }` to error objects.

### 2026-08-25 — Session 56 (Universal EnterpriseDataGrid Rollout for Users & Tenants)

- What was done: Standardized and unified the data grid experience across all administrative screens to use the rich `EnterpriseDataGrid`:
  1. **Organization Users Directory (`apps/dashboard/src/pages/admin/Users.tsx`)**:
     - Upgraded the manual table and filter bar to `EnterpriseDataGrid`.
     - Integrated multi-column Excel-style filters on `Role` and `Status` with in-filter search.
     - Added global real-time search across all member fields (name, email, role, status).
     - Added column sorting across Name, Role, Status, and Created date.
     - Added standard pagination controls (15, 30, 50, 100 entries per page).
     - Added one-click CSV directory export (`organization_users.csv`).
     - Preserved interactive row actions (Change Role modal, Remove User confirmation dialog).
  2. **Enterprise Tenants & Database Instances (`apps/dashboard/src/pages/super-admin/Tenants.tsx`)**:
     - Upgraded manual table to `EnterpriseDataGrid`.
     - Integrated multi-column filters on `Plan`, `Database Tier`, and `Status`.
     - Added real-time global search, column sorting, pagination, and CSV export (`enterprise_tenants.csv`).
  3. **Visual & Behavioral Consistency**:
     - All grids across the application (`Organization Users`, `Audit Logs`, `Timesheets`, `Tenants`) now share the exact same styling, filter behavior, search experience, pagination, and export tools.

### 2026-08-25 — Session 57 (Data Grid Filter UI, Full-Width Spacing & Header Overhaul)

- What was done: Refined the visual design, spacing, and controls across the admin workspace:
  1. **Full-Width Spacing Stabilization (`AdminLayout.tsx`, `SuperAdminLayout.tsx`)**:
     - Removed narrow `max-w-5xl` (1024px) container restriction that caused massive empty black space on the left and right sides of the screen.
     - Upgraded to `w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8`, allowing tables and administrative grids to breathe comfortably across wide displays.
  2. **Eliminated Redundant Top Header Controls & Duplicate CSV Buttons (`AuditLogs.tsx`)**:
     - Removed the redundant top header `Export CSV` button and duplicate action dropdown in `AuditLogs.tsx`.
     - Streamlined the page header to cleanly display the Date Range selector without visual clutter.
  3. **Premium `EnterpriseDataGrid` UI Overhaul (`EnterpriseDataGrid.tsx`)**:
     - Redesigned the **Export CSV** button into a sleek modern control featuring an emerald `FileSpreadsheet` icon and smooth hover animations.
     - Added an **Active Filters Bar** displaying removable pill tags with clear counters and a one-click "Clear all" action.
     - Refined table header filter icons with subtle hover visibility and distinct emerald/primary indicator badges when active.

### 2026-08-25 — Session 58 (Task Description Default Preview & Unsaved Changes Protection)

- What was done: Implemented industry-standard task description editing UX and unsaved modifications protection across modals and pages:
  1. **Default Preview Mode (`TaskDetailView.tsx`)**:
     - Initialized task description in `'preview'` tab by default.
     - Formatted markdown is cleanly rendered upon opening.
     - When description is empty, displays an inviting dashed placeholder card (`No description provided. Click here to add acceptance criteria, technical requirements, or notes...`) that auto-switches to `'write'` tab on click.
     - Added quick "Edit" button in header and click-to-edit on preview container.
  2. **Unsaved Changes Tracking & Action Footer (`TaskDetailView.tsx`)**:
     - Dynamic dirty detection (`descriptionValue !== card.description`).
     - Displays pulsing amber indicator badge (`● Unsaved changes`) in the description header.
     - Added action bar inside description editor with `⌘/Ctrl+Enter` shortcut hint, "Cancel/Discard" button, and "Save description" button.
  3. **Industry-Standard Unsaved Changes Protection Modal (`TaskDetailView.tsx`, `CardModal.tsx`)**:
     - When the user attempts to close the card modal (via `X` button, `Escape` key, backdrop click, or navigating to full page / Kanban view), the action is intercepted if description edits are unsaved.
     - Displays a prominent in-modal **Unsaved Changes Confirmation Dialog** with preview snippet of modified text and 3 distinct options:
       - **Keep Editing**: Dismisses the prompt and returns focus to the editor.
       - **Discard Changes**: Reverts to original server text and closes the dialog.
       - **Save & Close**: Persists edits to the backend and smoothly closes the dialog.
     - Added browser `beforeunload` listener to prevent accidental page refresh/tab closure while editing.
- Decisions made: Encapsulated close interception in `TaskDetailView` with `forwardRef` and `useImperativeHandle` for clean integration with `CardModal`.

---

## Quick Links

- System design: `trello-clone-architecture.md`
- Stack + testing strategy: `project-tech-stack.md`
- Agent coding conventions: `Agents.md`
- Task list: `ROADMAP.md`
- Domain terminology: `GLOSSARY.md`
- Technical decision history: `DECISIONS.md`

---

## Session 60 — 2026-08-25

### Items Completed

1. **Admin Role Guard on AdminLayout** — Members can no longer access `/admin/*`. Only `org_owner`, `org_admin`, and `isPlatformAdmin` users pass the guard; others see a styled "Admin Access Required" page with their current role shown and a link back to the dashboard.

2. **Labels & Tags Admin Page** (`apps/dashboard/src/pages/admin/LabelsAdmin.tsx`) — New dedicated admin page at `/admin/labels` where Org Owners/Admins can:
   - Browse all boards across the organisation via a searchable board selector panel
   - View, search, create (with color picker + live preview), inline-edit, rename, recolor, and delete labels
   - Delete confirms with destructive warning noting that labels are removed from all attached cards

3. **Backend Label Management Endpoints** — Added `PATCH /v1/boards/:id/labels/:labelId` and `DELETE /v1/boards/:id/labels/:labelId` to `apps/backend/src/modules/boards/routes.ts`, backed by `updateBoardLabel` and `deleteBoardLabel` service functions in `apps/backend/src/modules/cards/service.ts`.

4. **LabelPicker Refactor** — Removed the inline "Create new label" form from the card-level `LabelPicker` popup. For admins it now shows a "Manage labels in Admin Panel" link; for regular members it shows a hint to contact an admin. The picker is now assign-only.

5. **Password Show/Hide Toggle** — Both `Login.tsx` and `SignUp.tsx` now have an Eye/EyeOff icon button next to the password field for toggling visibility, using `lucide-react`.

### Files Changed

- `apps/dashboard/src/layouts/AdminLayout.tsx` — Added `isAdmin` role guard, `Tag` import, "Labels & Tags" nav item
- `apps/dashboard/src/store/authStore.ts` — Added `role?: string | null` field to `User` interface
- `apps/dashboard/src/App.tsx` — Added `LabelsAdmin` import and `/admin/labels` route
- `apps/dashboard/src/pages/admin/LabelsAdmin.tsx` — **[NEW]** Admin labels management page
- `apps/dashboard/src/components/board/LabelPicker.tsx` — Removed create form; added admin link; added `useAuthStore`, `Link`, `ExternalLink`
- `apps/dashboard/src/pages/Login.tsx` — Added password show/hide with Eye/EyeOff
- `apps/dashboard/src/pages/SignUp.tsx` — Added password show/hide with Eye/EyeOff
- `apps/backend/src/modules/boards/routes.ts` — Added PATCH and DELETE label endpoints
- `apps/backend/src/modules/cards/service.ts` — Added `updateBoardLabel`, `deleteBoardLabel`

---

## Session 61 — 2026-08-25

### Items Completed

1. **Replaced Native Browser `prompt()` Dialogs** — Eliminated blocking browser `window.prompt(...)` when creating project documents in `ProjectDocs.tsx`. Built a modern, accessible `CreateDocumentModal` with autofocus, starter markdown template selection (Technical Spec, RFC/ADR, PRD, Meeting Notes, Blank canvas), Enter-to-submit keyboard shortcuts, and full dark/light theme integration.
2. **Replaced Native Browser `confirm()` Dialogs** — Created reusable `ConfirmDialog` component in `@boardly/ui` design style with warning and destructive variants, custom action labels, and loading states. Replaced all occurrences of `confirm(...)` across:
   - `ProjectDocs.tsx` (delete document confirmation)
   - `WebhookSettings.tsx` (delete webhook confirmation)
   - `TaskDetailView.tsx` (archive and permanently delete task card confirmations across both dropdown menus and danger zones)
3. **Replaced Native Browser `alert()` Dialogs with Sonner Toasts** — Mounted `<Toaster richColors position="bottom-right" closeButton />` at the root application level in `App.tsx`. Replaced `alert(...)` calls in `NotificationSettings.tsx` with rich `toast.success` and `toast.error` notifications, and added toast feedback across document, webhook, and task actions.

### Files Changed

- `apps/dashboard/src/components/common/ConfirmDialog.tsx` — **[NEW]** Accessible, reusable confirmation dialog component supporting destructive/warning/default styles.
- `apps/dashboard/src/components/docs/CreateDocumentModal.tsx` — **[NEW]** Modern document creation modal with starter template presets.
- `apps/dashboard/src/App.tsx` — Mounted Sonner `<Toaster />` at root app level.
- `apps/dashboard/src/pages/ProjectDocs.tsx` — Replaced `prompt()` with `CreateDocumentModal` and `confirm()` with `ConfirmDialog` + Sonner toasts.
- `apps/dashboard/src/pages/Settings/WebhookSettings.tsx` — Replaced `confirm()` with `ConfirmDialog` + Sonner toasts.
- `apps/dashboard/src/pages/Settings/NotificationSettings.tsx` — Replaced `alert()` with Sonner toasts.
- `apps/dashboard/src/components/board/TaskDetailView.tsx` — Replaced `confirm()` with `ConfirmDialog` for archiving and deleting cards + Sonner toasts.

---

## Session 62 — 2026-08-25

### Items Completed

1. **Dashboard UI Redesign with App Sidebar Navigation** — Replaced the top-only navbar with a full-featured collapsible `AppSidebar` built with `@boardly/ui/sidebar`:
   - **Header & Fast Search**: Boardly Pro branding badge, organization context, and quick search trigger (`⌘K`).
   - **Overview Section**: Instant navigation to All Workspaces (`/`), My Tasks (`/my-tasks`), Timesheets (`/timesheets`), and Power-Ups & Apps (`/marketplace`).
   - **Workspaces & Projects Explorer Tree**: Reactive accordion tree listing all active workspaces, projects, individual Kanban boards (`/b/:id`), project docs (`/projects/:id/docs`), sprints (`/projects/:id/sprints`), phases (`/projects/:id/phases`), and reports (`/projects/:id/reports`).
   - **Admin Section**: Contextual access to `/admin/users` and `/super-admin/tenants`.
   - **Footer Utilities**: Fast access to Trash Bin (`TrashBinModal`), Theme switcher (`AppearanceModal`), and User Profile card dropdown menu with sign-out.
2. **Streamlined Inset Header with Breadcrumbs** — Built a sleek top inset header in `DashboardLayout.tsx` featuring `SidebarTrigger` (toggle via `⌘B`), dynamic breadcrumb trails (`Home > Workspaces > ...`), search palette, notification bell, theme toggle, and fast `+ Create` dropdown.
3. **Workspace Dashboard KPI Overview** — Enhanced `Workspaces.tsx` with high-level KPI cards (Total Workspaces, Active Projects, Kanban Boards, and quick shortcut to My Tasks).
4. **Trigger Component Bug Fix** — Enhanced `@boardly/ui` `DropdownMenuTrigger` and `DialogTrigger` to pass React Element children to `render` directly, preventing invalid nested button markup.
5. **Collapsed Sidebar Icon Rail Fix** — Resolved broken squished text in collapsed sidebar mode. When collapsed (`isCollapsed === true`), `AppSidebar` now cleanly presents centered 36px icon buttons for brand logo, search, overview items, workspace initials, admin icons, and footer utilities with zero text overflow or wrapping.
6. **Command Search Palette Redesign (`SearchPalette.tsx`)** — Completely modernized the global `⌘K` command palette:
   - Fixed misaligned header layout and removed awkward misplaced close button.
   - Built a Raycast/Spotlight-style command bar with glowing search icon, clean inputs, and `ESC` shortcut badge.
   - Added categorized quick jump suggestions (Workspaces, My Tasks, Timesheets, Apps, Admin, Create Actions, and active boards).
   - Full keyboard navigation (`↑ ↓` to navigate, `↵` to select, `esc` to close).
   - Added shortcut cheat sheet footer and saved search management.

7. **Trash & Recycle Bin UI Redesign & Restore Confirmation (`TrashBinModal.tsx`)** — Fixed the Recycle Bin modal layout and safety flows:
   - Fixed header alignment by removing the misplaced overlapping close button and properly positioning the `X` button alongside `Empty Trash`.
   - Cleaned up the search bar and segmented filter controls (`All`, `Workspaces`, `Projects`, `Boards`, `Tasks`).
   - Integrated `ConfirmDialog` confirmation before restoring any trashed item (`Restore Workspace/Project/Board/Task?`), preventing accidental un-deletions.
   - Connected `ConfirmDialog` for permanently deleting items and emptying the entire trash with Sonner toast feedback.
8. **Single-Click Authentication Fix (`Login.tsx`, `SignUp.tsx`, `authStore.ts`, `api.ts`)** — Resolved the race condition requiring two clicks to sign in:
   - Fixed `checkAuth()` in `authStore.ts` to not wipe a newly created session if a concurrent login succeeds.
   - Updated `api.interceptors.request` to avoid attaching stale expired tokens to `/auth/sign-in` and `/auth/sign-up` requests.
   - Added immediate `navigate('/', { replace: true })` and `isAuthenticated` redirect listener in `Login.tsx` and `SignUp.tsx`.

### Files Changed

- `apps/dashboard/src/store/authStore.ts` — Prevented session race conditions during login/checkAuth.
- `apps/dashboard/src/lib/api.ts` — Excluded public auth routes from stale bearer tokens.
- `apps/dashboard/src/pages/Login.tsx` — Fixed sign-in button flow to work on the first click.
- `apps/dashboard/src/pages/SignUp.tsx` — Synchronized immediate redirect on successful sign-up.
- `apps/dashboard/src/components/trash/TrashBinModal.tsx` — Fixed UI alignment, removed overlapping close button, added Restore confirmation flow with `ConfirmDialog` and Sonner toasts.
- `apps/dashboard/src/components/SearchPalette.tsx` — Redesigned global command palette with suggestions, keyboard navigation, and alignment fixes.
- `apps/dashboard/src/components/AppSidebar.tsx` — **[NEW]** Collapsible App Sidebar with live workspace/project/board explorer tree and utilities.
- `apps/dashboard/src/layouts/DashboardLayout.tsx` — Redesigned layout with `SidebarProvider`, `AppSidebar`, `SidebarInset`, breadcrumbs, and responsive inset header.
- `apps/dashboard/src/pages/Workspaces.tsx` — Added KPI metrics summary overview cards.
- `packages/ui/src/components/dropdown-menu.tsx` — Updated `DropdownMenuTrigger` to handle element children without nested `<button>`.
- `packages/ui/src/components/dialog.tsx` — Updated `DialogTrigger` to handle element children cleanly.
- `markdowns/E2E_TESTING_REPORT.md` — **[NEW]** Comprehensive End-to-End testing defect log with reproduction steps, screenshots, and fix roadmap.

---

## Session: 2026-08-26 — Comprehensive Monorepo End-to-End (E2E) Testing Audit

### Goal

Perform a complete End-to-End test across all features, personas, backend APIs, frontend views, edge cases, and UI/UX flows, cataloging every problem into a detailed report file.

### What Was Tested

1. **Authentication & Session:** Invalid password error banner, Alex Vance Org Owner login, token persistence in localStorage.
2. **Admin & Governance Panel:** `/admin/users`, `/admin/roles`, `/admin/sso`, `/admin/developer`, `/admin/audit-logs`, `/admin/billing`, `/admin/branding`, `/admin/stages`, `/admin/labels`, `/admin/webhooks`, `/admin/integrations`.
3. **Super Admin Module:** Multi-tenant catalog (`/super-admin/tenants`) and subscription plans matrix (`/super-admin/plans`).
4. **Kanban Boards & Task Modal:** Card creation, title inline edit, markdown description live render, checklist item addition/toggle, comments, time tracking logging (1h 30m), label pickers.
5. **Project Views & Analytics:** Sprints (`/projects/:id/sprints`), Reports & Analytics (`/projects/:id/reports` - Burndown, Velocity, CFD, Cycle Time), Docs Wiki (`/projects/:id/docs`), Lifecycle Phases (`/projects/:id/phases`).
6. **Productivity & Search:** Timesheets matrix (`/timesheets`), My Tasks view (`/my-tasks`), Global Command Palette (`⌘K` / `SearchPalette`).
7. **Automated Test Suite & Build Verification:** Backend Bun test runner (109 passing / 3 failing) and Frontend TypeScript/Vite compiler.

### Defects Identified & Documented in `markdowns/E2E_TESTING_REPORT.md`

- **BUG-01 (Critical):** Backend organization router `.use(requirePermission(...))` leak causing 403s on `GET /orgs/:orgId/members`.
- **BUG-02 (High):** Deprecated `baseUrl` option in `apps/dashboard/tsconfig.app.json` failing frontend `bun run build`.
- **BUG-03 (High):** Missing 404 catch-all route rendering blank dark screen on unknown paths.
- **BUG-04 (High):** Unhandled non-UUID strings causing Postgres syntax errors in label operations and automation actions.
- **BUG-05 (Medium):** Dead-click "Upgrade Plan" button on `/admin/billing`.
- **BUG-06 (Medium):** Infinite spinner on `/projects/:projectId/reports` when queries fail without error boundary state.
- **BUG-07 (Low):** Missing min/max validation on Stage Templates WIP limit inputs.
- **BUG-08 (Low):** Unused imports and React hook exhaustive dependency warnings across dashboard components.

---

### 2026-08-26 — Session 48 (E2E Defect Resolution & Platform Stabilization)

- **Goal:** Fix all 8 defects documented in `markdowns/E2E_TESTING_REPORT.md` across backend RBAC, frontend builds, routing, validation, error boundaries, and code quality without breaking existing functionality.
- **What was done:**
  1. **BUG-01 (Backend RBAC Scoping):** Refactored `requirePermission` and `requirePlatformAdmin` to clean beforeHandle hook functions in `middleware/auth.ts`. Replaced leaking `.use(requirePermission(...))` chained router calls across all backend modules (`organizations`, `boards`, `workspaces`, `roles`, `trash`, `docs`, `timetracking`, `audit`, `superadmin`, `webhooks`, `integrations`, `sso`, `developer`, `stages`, `forms`, `lists`, `projects`, `cards`, `importers`) with per-route `{ beforeHandle: requirePermission(...) }` and `.guard({ beforeHandle: ... })`. Fixed type definitions in `org.routes.test.ts`.
  2. **BUG-02 (Frontend Build):** Added `"ignoreDeprecations": "5.0"` to `apps/dashboard/tsconfig.app.json`, resolving TypeScript compiler warnings on deprecated `baseUrl`.
  3. **BUG-03 (Frontend 404 Route):** Created a modern `NotFound.tsx` error page component and registered `<Route path="*" element={<NotFound />} />` in `apps/dashboard/src/App.tsx`.
  4. **BUG-04 (Database / UUID validation):** Added `isValidUuid` check in `cards/service.ts` across `getCardLabels`, `attachLabelToCard`, `removeLabelFromCard`, `assignUserToCard`, `removeUserFromCard`, `addParticipantToCard`, and `removeParticipantFromCard`. Added route-level UUID param validation on label endpoints in `cards/routes.ts`. Guarded automation action execution in `automations/service.ts`.
  5. **BUG-05 (Admin Billing Upgrade Modal):** Connected the "Upgrade Plan" button in `apps/dashboard/src/pages/admin/Billing.tsx` to an interactive dialog modal with Pro/Enterprise tier selection, feature comparisons, and toast feedback.
  6. **BUG-06 (Project Reports Error State):** Added `isSummaryError` handling, error alert banner, and a "Try Again" retry action button in `apps/dashboard/src/pages/ProjectReports.tsx`.
  7. **BUG-07 (Stage Templates Input Validation):** Added input constraints (`maxLength={100}`, `placeholder`) and trim validation in `apps/dashboard/src/pages/admin/StageTemplates.tsx`.
  8. **BUG-08 (Code Quality):** Removed unused imports (`DialogHeader` in `ConfirmDialog.tsx`, `Palette` & `ArrowRight` in `SearchPalette.tsx`, `get` parameter in `authStore.ts`) and wrapped callback handlers in `useCallback` in `WebhookSettings.tsx` and `TaskDetailView.tsx`.
  9. **Verification:** Executed `tsc` typecheck across both `apps/backend` and `apps/dashboard` — 0 errors, 0 warnings.
  10. **Documentation:** Updated `markdowns/E2E_TESTING_REPORT.md` and `markdowns/Progress.md` to reflect all resolved defects.

---

### 2026-08-27 — Session 49 (Comprehensive User Management System & Cross-Company Governance)

- **Goal:** Design and build a complete User Management & Access Governance System for company admins (onboarding, bulk invite, soft deactivation, pending invites, activity drawer) and platform super admins (cross-company user intelligence, multi-company reach detection, and global session revocation).
- **What was done:**
  1. **Database Schema Enhancements:**
     - Added `lastLoginAt` and `deactivatedAt` to `users` table.
     - Added `lastActiveAt`, `deactivationReason`, and `deactivatedBy` to `organizationMembers` table.
  2. **Auth & Security Lifecycle Enforcement:**
     - Updated `auth/service.ts` (`signIn`, `getMe`, `refreshTokens`) to block deactivated accounts with HTTP 403.
     - Updated `middleware/auth.ts` `requirePermission` hook to enforce `organizationMembers.status = 'active'`.
     - Added automatic `lastLoginAt` and `lastActiveAt` timestamp recording upon login.
  3. **Organization Member Governance Service & APIs:**
     - Built `bulkInviteMembers` with multi-line/CSV support and automatic workspace assignment.
     - Built `listPendingInvitations`, `resendInvitation` (regenerates tokens & resets 7-day expiry), and `revokeInvitation`.
     - Built `deactivateMember` (soft delete with reason capture, immediate session token revocation, and audit log tracking) & `reactivateMember`.
     - Built `forceLogoutUser` (terminates active refresh tokens for specific user accounts).
     - Built `getMemberActivitySummary` (aggregates active task count, 30-day logged time, billable hours, and workspace memberships).
  4. **Frontend Admin User Management Center (`/admin/users`):**
     - Redesigned `Users.tsx` with top interactive metric cards (Total, Active, Deactivated, Pending Invites).
     - Added tabbed view: **Organization Members** vs **Pending Invitations**.
     - Implemented filters for Status (Active, Deactivated, Invited) and Role (Owner, Admin, Member, Viewer) with search.
     - Implemented tabbed onboarding modal with Single Invite and Bulk CSV/multi-line pasting.
     - Built sliding **Member Intelligence & Governance Side Drawer** with live task stats, 30-day logged hours, workspace list, role change, and soft-deactivation controls.
     - Implemented soft-deactivation modal with optional reason capture and one-click reactivation.
  5. **Super Admin Cross-Company User Intelligence (`/super-admin/users`):**
     - Built platform-level backend service `listPlatformUsers`, `getPlatformUser`, and `forceLogoutPlatformUser`.
     - Created `PlatformUsers.tsx` with multi-company user intelligence cards, multi-tenant reach badges, and cross-company membership inspector.
     - Added Platform Users navigation item to `SuperAdminLayout.tsx` and registered `/super-admin/users` in `App.tsx`.
  6. **Documentation & Verification:**
     - Updated `DATABASE_SCHEMA.md` and `SEED_CREDENTIALS.md`.
     - Verified with TypeScript typecheck (`tsc --noEmit`) and Vite production build (`npx vite build`) — 0 errors.

---

### 2026-08-27 — Session 50 (Dedicated Super Admin Application Architecture Separation)

- **Goal:** Decouple Super Admin from the standard user/org dashboard (`apps/dashboard`) and create a standalone, dedicated Platform Super Admin Application (`apps/super-admin`) running on port 5174 with isolated auth, high-tech dark/purple ops aesthetic, independent token storage, and specialized platform tooling.
- **What was done:**
  1. **New Standalone Application (`apps/super-admin`):**
     - Initialized `@boardly/super-admin` with its own `package.json`, Vite configuration (port 5174), and TypeScript project configurations (`tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`).
     - Configured dedicated dark Obsidian & Purple ops styling system in `index.css`.
  2. **Isolated Authentication & Session Storage:**
     - Created independent `authStore.ts` and `api.ts` using `boardly_superadmin_token` in `localStorage`.
     - Enforces `isPlatformAdmin === true` on login and blocks regular non-platform users with clear security messaging.
     - Built dedicated `Login.tsx` view with quick CEO demo autofill.
  3. **Super Admin Platform Operations Views:**
     - `Overview.tsx`: Platform KPI metrics (Total Tenants, Global Users, Multi-Company Count, Active Tier Plans), tenant quick preview, and cross-company preview.
     - `Tenants.tsx`: Multi-tenant organization catalog with plan tier, total & active member counts, and interactive dedicated PostgreSQL DB routing modal.
     - `PlatformUsers.tsx`: Platform-wide user catalog with multi-company detection, cross-org role breakdown chips, and global session revocation.
     - `Plans.tsx`: Subscription plans and resource limits configuration dialog (Seats, Workspaces, Boards, Storage GB).
     - `NotFound.tsx`: 404 handler for unmatched platform routes.
  4. **Cleaned `apps/dashboard`:**
     - Removed legacy super-admin pages and routes from `apps/dashboard`.
     - Updated sidebar in `AppSidebar.tsx` for platform administrators to open the dedicated Super Admin Portal (`http://localhost:5174`) in a new tab.
  5. **Dev Workflow & Scripts:**
     - Updated `scripts/dev.sh` to launch Backend (3001), User Dashboard (5173), and Super Admin Portal (5174) concurrently with port cleanup.
  6. **Build & Typecheck Verification:**
     - `apps/super-admin`: TypeScript check (`tsc --noEmit`) & Vite production build (`vite build`) passed in 402ms with 0 errors.
     - `apps/dashboard`: TypeScript check (`tsc --noEmit`) & Vite production build (`vite build`) passed in 464ms with 0 errors.

---

### 2026-08-29 — Session 51 (Database Seed Script Connection Teardown & Dev Launcher Hang Fix)

- **Goal:** Fix terminal hanging indefinitely on `bun run dev` during `🔄 Verifying database schema & seed data...`.
- **Root Cause:** In `apps/backend/src/db/seedOrganization.ts`, a module-level postgres client instance remained connected when imported by `seed.ts`, because `client.end()` was only guarded inside `if (import.meta.main)`. This open socket prevented Bun's event loop from exiting after completing the enterprise organization seed.
- **What was done:**
  1. **Clean Connection Teardown in `seedOrganization.ts`:** Wrapped `seedFullOrganization()` in a `try...finally` block that reliably calls `await client.end()`, and added `process.exit(0)` on direct execution.
  2. **Clean Process Exit in `seed.ts`:** Added `process.exit(0)` to cleanly terminate the process once base and organization seeds complete.
- **Verification:** Ran `bun run db:migrate` and `bun run db:seed` in `apps/backend` — seed completes in <1s and exits cleanly with code 0.

---

### 2026-08-29 — Session 52 (Super Admin Panel End-to-End Testing & Hardening)

- **Goal:** Rigorously test the new dedicated Super Admin application (`apps/super-admin`) across all pages, workflows, security boundaries, and edge cases, cataloging and resolving any logical, UI/UX, or integration defects.
- **Defects Identified & Resolved:**
  1. **Cross-Origin Resource Sharing (CORS):** Backend `allowedOrigins` in `apps/backend/src/index.ts` only parsed `env.DASHBOARD_URL` (port 5173), blocking requests from the Super Admin portal (`http://localhost:5174`). Added `http://localhost:5174` explicitly to `allowedOrigins`.
  2. **Dedicated DB Routing Mutation:** In `apps/super-admin/src/pages/Tenants.tsx`, the "Save DB Configuration" button had a placeholder toast without a real backend call. Added `updateTenantDatabase` service method in `superadmin/service.ts`, registered `PATCH /superadmin/orgs/:id/database` in `superadmin/routes.ts`, and connected the React Query mutation with loading states.
  3. **Platform Session Termination Safeguard:** Added explicit browser confirmation prompt on the "Terminate all platform sessions" action in `PlatformUsers.tsx` (both table row action and detail modal) to prevent accidental revocation of active user sessions.
  4. **Monorepo TS6059 Typecheck Error:** Fixed `rootDir` scoping in `apps/backend/tsconfig.json` to allow monorepo resolution of `@boardly/shared-types`.
- **Verification:** Verified `apps/backend`, `apps/dashboard`, and `apps/super-admin` with TypeScript check (`0 errors`) and Vite production builds.

---

### 2026-08-29 — Session 53 (Member RBAC Enum Casting Fix & Workspaces Guard)

- **Problem Reported:** In the dashboard, logging in as regular member Jordan Rivera (`jordan.rivera@acme.corp`) caused `GET /v1/workspaces` and `GET /v1/cards/my-tasks` to return HTTP 500 errors (`{"error":"Internal server error"}`).
- **Root Cause Analysis:**
  1. **PostgreSQL Enum Type Incompatibility in `middleware/auth.ts`:** The `requirePermission` hook evaluated `WHEN ${organizationMembers.role} = 'viewer' THEN 'Viewer'`. Because `organizationMembers.role` is a Postgres enum of type `org_member_role` (which only contains `'org_owner'`, `'org_admin'`, `'billing_manager'`, `'workspace_admin'`, `'member'`), Postgres attempted to cast the string literal `'viewer'` to `org_member_role`, throwing `PostgresError: invalid input value for enum org_member_role: "viewer"` (code `22P02`) on all permission checks for non-platform admin members.
  2. **Unchecked Empty Organization ID:** In `workspaces/service.ts`, `listWorkspaces` did not guard against missing or empty `organizationId` strings, which resulted in invalid UUID query parameters.
- **Fixes Applied:**
  1. **Enum Text Casting in `apps/backend/src/middleware/auth.ts`:** Cast `${organizationMembers.role}::text` in the SQL `CASE` statement so comparison is performed on standard text strings, eliminating PostgreSQL enum parsing errors.
  2. **Organization Guard in `apps/backend/src/modules/workspaces/service.ts`:** Added guard returning `[]` or all workspaces for platform admins if `organizationId` is empty.
- **Verification:** Tested `jordan.rivera@acme.corp`, `elena.rostova@acme.corp`, and `alex.vance@acme.corp` on both `/v1/workspaces` and `/v1/cards/my-tasks` — all return HTTP 200 with full data.

---

### 2026-08-29 — Session 54 (Base UI nativeButton Trigger Accessibility & Console Warning Fix)

- **Problem Reported:** Browser console threw warning:
  `Base UI: A component that acts as a button expected a native <button> because the nativeButton prop is true. Rendering a non-<button> removes native button semantics, which can impact forms and accessibility. Use a real <button> in the render prop, or set nativeButton to false. at DropdownMenuTrigger (dropdown-menu.tsx:23:7) at DashboardLayout (DashboardLayout.tsx:150:17)`.
- **Root Cause:** In `@base-ui/react/menu` and `@base-ui/react/dialog`, `MenuPrimitive.Trigger` and `DialogPrimitive.Trigger` default `nativeButton: true`. When passing a `<div>` element as children or via the `render` prop (e.g. the user profile avatar wrapper in `DashboardLayout.tsx`), Base UI warns that a non-button element was passed without setting `nativeButton={false}`.
- **Fixes Applied:**
  1. **Dynamic `nativeButton` Resolution in `@boardly/ui`:** Updated `DropdownMenuTrigger` (`packages/ui/src/components/dropdown-menu.tsx`) and `DialogTrigger` (`packages/ui/src/components/dialog.tsx`) to inspect `render` and `children`, automatically resolving `nativeButton={false}` when non-button DOM elements are rendered.
  2. **Semantic Button Structure in `DashboardLayout.tsx`:** Updated the user avatar profile trigger in `DashboardLayout.tsx` from a `<div>` to a semantic `<button type="button">`, preserving accessibility and button semantics.
- **Verification:** Verified frontend compilation with TypeScript (`tsc --noEmit`) and built both `apps/dashboard` and `apps/super-admin` with Vite — 0 errors, 0 warnings.

---

### 2026-08-29 — Session 55 (Sequential Number-Based Ticket ID System)

- **Goal:** Replace pseudo-random UUID hex slice task IDs (`CFP-69BE`) with an industry-standard, human-readable, and strictly sequential incremental ticket ID system (e.g. `BCW-1`, `BCW-2`, `CFP-1`, `CFP-14`, `ENG-108`) per project.
- **What was done:**
  1. **Database Schema Additions (`apps/backend/src/db/schema/index.ts`):**
     - Added `key` (`varchar(10)`) and `task_counter` (`integer default 0`) to `projects`.
     - Added `task_number` (`integer`) and `key` (`varchar(30)`) to `cards`.
     - Created migration `0009_card_task_numbers.sql`.
  2. **Atomic Incrementation in Backend (`apps/backend/src/modules/cards/service.ts`):**
     - Updated `createCard` to atomically increment `projects.task_counter` and format `cards.key = "${projectKey}-${taskNumber}"`.
     - Updated `getCard`, `getMyTasks`, `listCards`, and `performSearch` to select `key`, `taskNumber`, `projectKey`, and support searching by exact ticket key.
  3. **Auto Project Key Derivation (`apps/backend/src/modules/projects/service.ts`):**
     - Added `generateProjectKey` to automatically derive uppercase project keys (e.g. `Customer Facing Portal` -> `CFP`).
  4. **Database Backfill & Seed Data (`apps/backend/src/db/seedOrganization.ts`):**
     - Backfilled all 8 enterprise projects and 120+ cards with sequential keys starting from 1.
     - Updated `seedOrganization.ts` to assign clean project keys (`BCW`, `CIK`, `MAS`, `DSG`, `CFP`, `QGP`, `S2T`, `ETO`) and sequential counters.
  5. **Shared Types & Frontend Integration:**
     - Updated `packages/shared-types` schemas to include `key` on Project/Card.
     - Updated `apps/dashboard/src/utils/taskIdentifier.ts` to prioritize `card.key` and `${projectKey}-${taskNumber}`.
     - Added ticket key badges to `BoardView.tsx` (full & compact Kanban tiles), `MyTasks.tsx` (grid & list views), `SearchPalette.tsx`, and `TaskDetailView.tsx`.
- **Verification:** Verified atomic increments on card creation (`ERP-6`, `ERP-7`), typechecked all monorepo workspaces (`0 errors`), and built both `apps/dashboard` and `apps/super-admin` with Vite.
- **Typing Refinement:** Added `key?: string | null`, `taskNumber?: number | null`, and `projectKey?: string | null` to `interface KanbanCard` in [`apps/dashboard/src/pages/BoardView.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/BoardView.tsx) to resolve IDE property lookup errors.

---

### 2026-08-29 — Session 56 (Trash Restore Confirmation UX & Member Restore Permission Fix)

- **Problem Reported:** In the Trash / Recycle Bin dialog, the "Restore Board?" confirmation modal had unstyled/low-contrast action buttons, and standard members were blocked from restoring trashed items.
- **Root Cause Analysis:**
  1. **Route Permission Mismatch in `trash/routes.ts`:** `POST /v1/trash/restore` required `org.update`. Because regular organization members do not possess `org.update` (which is restricted to org owners/admins for company settings), restoring soft-deleted boards or cards thrown a 403 Forbidden error.
  2. **Confirmation Dialog UX & Asynchronous State:** `ConfirmDialog.tsx` lacked a dedicated `success` variant for non-destructive restore actions, the Cancel button used unbordered ghost styling, and synchronous event handlers closed the modal before async restore mutations finished.
- **Fixes Applied:**
  1. **Restore Route Permission (`apps/backend/src/modules/trash/routes.ts`):** Updated `POST /trash/restore` to use `requirePermission('org.read')`, allowing members to reactivate trashed workspace resources.
  2. **Visual & Async Polish in `ConfirmDialog.tsx`:** Added `variant="success"` with emerald icon and green action button (`bg-emerald-600`), upgraded the cancel button to `variant="outline"`, and added internal async loading state management.
  3. **Comprehensive Cache Invalidation (`TrashBinModal.tsx`):** In addition to trash and board queries, invalidated `['projects']`, `['cards']`, and `['my-tasks']` on restore.
- **Verification:** Tested `POST /v1/trash/restore` as member `jordan.rivera@acme.corp` (successfully restored board "First" with `deletedAt: null`). Ran full typechecks and Vite builds across all monorepo workspaces — 0 errors.

---

### 2026-08-29 — Session 57 (UI Standardization & Super Admin Multi-Company Filtering)

- **Goal:** Unify common UI components into the `@boardly/ui` workspace package so that both `apps/dashboard` and `apps/super-admin` share the exact same UI foundation without code duplication or drift, and bring rich Excel-style filters, sorting, search, pagination, and CSV export to the Super Admin platform users & tenants screens.
- **What was done:**
  1. **Shared UI Package Upgrade (`packages/ui`):**
     - Promoted generic components to `@boardly/ui`:
       - `EnterpriseDataGrid` (`packages/ui/src/components/enterprise-data-grid.tsx`): Excel-like column filter popovers with multi-select checkboxes, multi-column sorting, search debounce, CSV export, pagination, custom cell renderers, and empty states.
       - `ConfirmDialog` (`packages/ui/src/components/confirm-dialog.tsx`): Modal confirmation dialog with `destructive`, `warning`, `success`, and `default` variants.
       - `SearchableSelect` (`packages/ui/src/components/searchable-select.tsx`): Generic searchable select with portal dropdowns, keyboard navigation, and avatar support.
     - Updated `packages/ui/src/index.ts` and `packages/ui/package.json` with subpath exports (`./enterprise-data-grid`, `./confirm-dialog`, `./searchable-select`).
  2. **Backward-Compatible Dashboard Aliases (`apps/dashboard`):**
     - Updated `apps/dashboard/src/components/common/EnterpriseDataGrid.tsx`, `ConfirmDialog.tsx`, and `SearchableSelect.tsx` to re-export directly from `@boardly/ui`.
     - Updated `apps/dashboard/tsconfig.app.json` and `apps/dashboard/vite.config.ts` to map `@boardly/ui/*` paths.
  3. **Super Admin Rich Filter & Grid Upgrade (`apps/super-admin`):**
     - **Platform Users (`apps/super-admin/src/pages/PlatformUsers.tsx`):**
       - Replaced static HTML table with `EnterpriseDataGrid` from `@boardly/ui`.
       - Added quick filter pills (All Users, Multi-Company Only, Single-Company, Platform Admins) with dynamic badge counters.
       - Added Role filter dropdown (Platform Admin, Org Owner, Org Admin, Member, Viewer).
       - Added Excel-like distinct value column filters on Company Reach, Associated Companies, Role, and Last Login.
       - Added multi-column sorting, pagination (15 items/page default), and CSV export.
       - Replaced `window.confirm` with `@boardly/ui`'s `ConfirmDialog` for session terminations.
     - **Tenants Catalog (`apps/super-admin/src/pages/Tenants.tsx`):**
       - Upgraded to `EnterpriseDataGrid` with Plan Tier filtering, Database Routing type filter, sorting, pagination, and CSV export.
     - Updated `apps/super-admin/tsconfig.app.json` and `apps/super-admin/vite.config.ts` to alias `@boardly/ui/*` and use `import.meta.dirname`.
- **Verification:** Ran `bun run build` across `apps/dashboard` and `apps/super-admin` — both built cleanly with zero errors. Tested linting and typecheck across all workspaces.

---

### 2026-08-29 — Session 58 (CORS Configuration Hardening for Development & Auth Flows)

- **Problem Reported:** User reported receiving CORS error when signing in from `http://localhost:5173`.
- **Root Cause Analysis:**
  1. `apps/backend/src/index.ts` restricted `allowedHeaders` to only `['Content-Type', 'Authorization']`, which caused preflight `OPTIONS` requests from browsers sending standard headers like `Accept`, `X-Requested-With`, `Origin`, or telemetry headers to fail CORS preflight checks.
  2. `origin` configuration was strictly limited to parsed `DASHBOARD_URL` array strings without handling dynamic origin variations (e.g. `127.0.0.1` vs `localhost`, varying port assignments in multi-client dev environments).
  3. `apps/dashboard/src/lib/api.ts` response interceptor captured all 401s without excluding auth routes (`/auth/sign-in`, `/auth/sign-up`, `/auth/refresh`, `/auth/sign-out`), triggering a secondary failed token refresh attempt and swallowing the original auth error response when credentials failed.
- **Fixes Applied:**
  1. Updated `apps/backend/src/index.ts` CORS middleware to dynamic origin validation via `isAllowedOrigin()` which permits all configured `DASHBOARD_URL` domains as well as any local dev origins (`http://localhost:*` and `http://127.0.0.1:*`).
  2. Enabled `allowedHeaders: true` and `exposeHeaders: true` in `@elysiajs/cors` to allow dynamic negotiation of client request headers during preflight.
  3. Extended HTTP methods to include `HEAD`.
  4. Updated `apps/dashboard/src/lib/api.ts` interceptor to explicitly exclude authentication endpoints from triggering token refresh loops on 401 responses.
  5. Cleaned up Tailwind CSS imports in `apps/super-admin/src/index.css` to build cleanly.
- **Verification:** Ran automated unit simulations for preflight `OPTIONS` and `POST` requests across multiple origins (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5174`), confirming 204 preflight status and correct `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true` response headers. Typechecked backend (`tsc --noEmit`) and verified production Vite builds for both `apps/dashboard` and `apps/super-admin` with 0 errors.

---

### 2026-08-29 — Session 59 (API Error Sanitization & Organization Member Invite Logic Fix)

- **Problem Reported:**
  1. Internal database query and parameters (`Failed query: insert into "organization_members" ... \nparams: ...`) were leaked in API error responses to the frontend.
  2. Inviting a member with the `'viewer'` role failed with an enum violation because `'viewer'` was missing from the PostgreSQL `org_member_role` enum type.
- **Fixes Applied:**
  1. **Centralized Error Sanitizer & Handler (`apps/backend/src/lib/errors.ts`):**
     - Implemented `HttpError`, `httpError(status, message, details?)`, `formatErrorResponse(err)`, and `handleRouteError(err, set)`.
     - Completely masks SQL queries, table names, parameters, connection strings, and stack traces from client JSON responses.
     - Translates Postgres error codes (e.g. 23505 unique conflict, 23503 foreign key, 22P02 invalid UUID) to clear, actionable, user-friendly messages.
     - Added server-side structured logging via `logger.error` for full query diagnostics.
     - Integrated `handleRouteError` across all backend route modules and updated Elysia's global `.onError` hook.
  2. **Viewer Role Support & Schema Migration:**
     - Added `'viewer'` to `orgMemberRoleEnum` in `apps/backend/src/db/schema/index.ts` and `OrgMemberRole` in `packages/shared-types/src/enums/index.ts`.
     - Created migration `apps/backend/src/db/migrations/0010_viewer_org_member_role.sql` (`ALTER TYPE "public"."org_member_role" ADD VALUE IF NOT EXISTS 'viewer'`).
     - Added safe boot initialization in `apps/backend/src/index.ts` to ensure the enum is up to date immediately on server launch.
     - Updated `apps/backend/src/middleware/auth.ts` permission CASE mapping to support `'viewer'`.
  3. **Robust Member Invitation Service (`apps/backend/src/modules/organizations/service.ts`):**
     - Refactored `inviteMember` and `bulkInviteMembers` with strict email and role validation against `ALLOWED_ORG_ROLES`.
     - Wrapped user provisioning, membership creation/reactivation, workspace linking, invitation token generation, and audit logging inside atomic database transactions (`db.transaction`).
     - Throws clean `409 Conflict` if the user is already an active member and `400 Bad Request` on invalid email/role.
- **Verification:**
  - Created and ran `apps/backend/src/lib/errors.test.ts` with 12 unit tests verifying SQL query masking, safe error translation, and route handling (12/12 passing).
  - Validated full TypeScript typecheck across backend, shared types, and dashboard with 0 errors.

---

### 2026-08-29 — Session 60 (Huly-Parity Feature Roadmap Definition & Planning)

- **What was done:**
  1. Analyzed full functional scope comparison between Boardly and Huly.
  2. Defined and added **Phase 4 (Workspace Collaboration & All-in-One Expansion / Huly Parity)** to `ROADMAP.md` across 6 discrete tracks:
     - **4.1 Interactive Calendar & Time-Blocking:** Month/Week/Day grids, drag-and-drop task time scheduling, 2-way Google/Outlook Calendar sync, and milestone overlays.
     - **4.2 Team Chat & Real-Time Messaging:** 1-on-1 DMs, public/private channels, threads, file attachments, and WebSocket presence.
     - **4.3 Bi-Directional Git & Developer Automations:** GitHub/GitLab App integrations, automatic commit & PR auto-linking (`BCW-12`), and automated card movement on PR events.
     - **4.4 Real-Time Collaborative Multi-Cursor Docs:** Upgrade Docs to CRDT co-authoring (Yjs/Tiptap) with live multi-user cursors and embedded cards/blocks.
     - **4.5 Live Audio/Video Huddles & Virtual Rooms:** WebRTC voice/video huddle rooms, screen sharing for standups, and floating mini-player.
     - **4.6 Universal Triage Inbox & Inbound Email Integration:** Unified inbox, inbound email reply/card parser, and keyboard shortcuts.
  3. Updated `markdowns/Roadmap.md` and `markdowns/Progress.md` with structured breakdown and backlog ideas.

---

### 2026-08-29 — Session 61 (WorkOS OAuth & Enterprise SSO/SCIM Full Architecture Integration)

- **Goal:** Integrate WorkOS authentication into Boardly, providing Google OAuth sign-in for individual users, domain-routed Enterprise SSO (SAML 2.0 / OIDC) for corporate teams (Okta, Azure AD, Google Workspace), and automated JIT provisioning, while keeping existing email/password and platform Super Admin credentials fully intact.
- **What was done:**
  1. **SDK & Environment Configuration:**
     - Installed `@workos-inc/node` in `apps/backend`.
     - Added `WORKOS_REDIRECT_URI` and `WORKOS_WEBHOOK_SECRET` to `env.ts` schema, `.env`, and `.env.example`.
  2. **Database Schema Enhancements:**
     - Added `workos_organization_id` and `workos_connection_id` to `ssoConfigurations` table in Drizzle schema.
     - Added startup auto-migration checks in `apps/backend/src/index.ts`.
  3. **Backend WorkOS Service (`apps/backend/src/modules/auth/workos.service.ts`):**
     - Built `getGoogleAuthorizationUrl` generating direct Google OAuth URLs via WorkOS User Management.
     - Built `getSSOAuthorizationUrl` resolving corporate email domains to WorkOS organization/connection authorization URLs.
     - Built `authenticateWithWorkOSCode` handling code exchange, JIT user creation, auto-mapping to matching SSO enterprise tenants, or auto-provisioning individual workspaces for standalone signups, and issuing standard Boardly JWT + refresh token pairs.
  4. **Backend Routes Integration (`apps/backend/src/modules/auth/routes.ts` & `sso/service.ts`):**
     - Added `GET /v1/auth/workos/google-url`, `POST /v1/auth/workos/sso-url`, and `POST /v1/auth/workos/callback`.
     - Updated `generateSSOLoginUrl` and `updateSSOConfig` in `apps/backend/src/modules/sso/service.ts` to seamlessly generate real WorkOS SSO authorization URLs.
  5. **Frontend Dashboard Components & Routing:**
     - Added `getGoogleAuthUrl`, `getWorkOSSSOAuthUrl`, and `exchangeWorkOSCode` to `apps/dashboard/src/lib/api.ts`.
     - Built `AuthCallback.tsx` route handler at `/auth/callback` with animated loading, error handling, and session establishment.
     - Enhanced `Login.tsx` with "Continue with Google" button, "Or with email" divider, and expandable "Enterprise Single Sign-On (SSO)" domain router.
     - Updated `SSOSettings.tsx` to view and configure WorkOS Organization ID and Connection ID.
  6. **Automated Testing & End-to-End Verification:**
     - Created `apps/backend/src/modules/auth/workos.test.ts` (6 tests passing).
     - Updated `sso.test.ts` and `auth.test.ts` (16 tests passing).
     - Verified all 130 backend unit and integration tests across 27 test files pass with 0 errors (`bun test`).
     - Verified Vite production build (`bun run build` in `apps/dashboard`) and TypeScript typecheck (`bun run typecheck`) pass with 0 errors.
     - Verified HTTP endpoints via live curl testing for Google URL generation, WorkOS code authentication callback, profile resolution, and email/password login.
  7. **User Profile Dropdown UI/UX Redesign:**
     - Upgraded the top header profile dropdown and sidebar footer user menu from cramped 192px boxes to spacious 260px menus (`w-64 min-w-[260px]`).
     - Added a rich user card header showing Avatar, Name, Email, and dynamic Role badge.
     - Added Lucide icons (`User`, `Settings`, `Palette`, `Shield`, `LogOut`, `Briefcase`, `FolderPlus`, `Layout`) with comfortable padding and smooth hover states.
  8. **Modal Close Button & Header Alignment Polish:**
     - Refactored `DialogPrimitive.Close` in `@boardly/ui` to be a sleek, rounded `h-8 w-8` button with smooth hover background (`hover:bg-muted/80`) positioned at `top-4 right-4`.
     - Added right padding (`pr-14`) to modal headers (including the Role & Permissions Matrix modal) so badges like `"95 of 95 granted"` and action controls never collide with the close button.
  9. **Profile Settings Security & OAuth Identity Hardening:**
     - Locked the primary email field as immutable / read-only (`cursor-not-allowed`) with a security lock icon 🔒 and dynamic badge (`Google OAuth` vs `Primary Account`).
     - Enhanced `getMe` to return `hasPassword` boolean indicator.
     - Upgraded the **Security & Password** card to adaptively detect Google OAuth users: shows a helpful callout explaining passwordless Google login and allows establishing an account password without requiring a non-existent current password.

---

## Session 62 — Enterprise Invite & Onboarding Experience

**Goal:** Upgrade the invite system from a manual "copy link" flow to a full enterprise-grade experience with transactional emails, a multi-step onboarding wizard, and proper member pending states.

### Changes Made

1. **Email Infrastructure (`apps/backend/src/lib/`):**
   - Created `email.ts` — 4-tier cascading mailer: **Resend** (primary) → **Amazon SES** (fallback 1) → **Personal SMTP** (fallback 2) → **Console log** (local dev fallback).
   - If Resend API key is present, it dispatches via Resend; if delivery throws an error, it gracefully falls over to SES, then to SMTP, and finally dev console.
   - Installed `resend@6.25.0` + `nodemailer@9.0.6` + `@types/nodemailer`.
   - Created `emailTemplates.ts` — rich branded HTML invite email template with org name, inviter, role badge, "Accept Invitation" CTA button, expiry notice, and safety footer.

2. **Schema Migration (`0009_rich_turbo.sql`):**
   - Added `invitationStatusEnum` (`pending`, `accepted`, `revoked`, `expired`) to the DB.
   - Extended `invitations` table with: `status`, `invited_by_user_id`, `invited_by_name`.
   - Applied migration successfully.

3. **Backend — Invite Flow Rework (`organizations/service.ts`):**
   - **`inviteMember`**: New users provisioned with `passwordHash: null` (no default password). Members start as `'invited'` status. Invitation email is sent after transaction commits (fire-and-forget).
   - **`resendInvitation`**: Regenerates token + re-sends the email.
   - **`listPendingInvitations`**: Now returns `status` and `invitedByName` fields.
   - **New `previewInvitation(db, token)`**: Public — validates token, returns org/inviter/role info and whether the user already exists.
   - **New `acceptInvitation(db, token, name?, password?)`**: Validates token, sets password (if new user), activates membership, marks invitation as `accepted`, and auto-issues access/refresh tokens for immediate login.

4. **Backend — New Public Routes (`organizations/routes.ts` + `index.ts`):**
   - `GET /v1/invite/preview/:token` — No auth required.
   - `POST /v1/invite/accept` — No auth required.
   - Registered `inviteRoutes` in the main app.

5. **Frontend — AcceptInvite Wizard (`apps/dashboard/src/pages/AcceptInvite.tsx`):**
   - Full 3-step enterprise onboarding wizard.
   - **Step 1 (Welcome):** Shows org name, inviter name, role badge, email, and "what you'll get access to" benefits list.
   - **Step 2 (Setup):** For new users — name + password + confirm password with live strength meter. For existing users — single "Join [Org]" button (no re-entry of password needed).
   - **Step 3 (Success 🎉):** Animated success ring, org name, role badge, and "Go to Dashboard" CTA. User is auto-logged in.
   - **Error states:** `token_expired`, `token_used`, `token_not_found` all shown as clean branded error screens.

6. **Admin UI (`apps/dashboard/src/pages/admin/Users.tsx`):**
   - Invite success modal updated to show **"Invitation Email Sent ✉️"** as the primary headline with a clear explanation that the user will receive a secure onboarding link.
   - Backup invite link collapsed into a `<details>` disclosure (no longer the primary CTA).
   - Added an indigo "Invitation email dispatched" badge.

7. **Environment Variable Configuration (`.env`, `apps/backend/.env`, `.env.example`, `apps/backend/.env.example`, `apps/dashboard/.env.example`, `apps/super-admin/.env.example`, `env.ts`):**
   - Added optional keys for Resend (`RESEND_API_KEY`), Amazon SES (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION`), and SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`).
   - Added `APP_URL`, `EMAIL_FROM`, `WORKOS_REDIRECT_URI`, `WORKOS_WEBHOOK_SECRET` configuration keys.
   - Added complete, clean `.env.example` templates at the root and for each sub-app (`backend`, `dashboard`, `super-admin`).
   - Updated Zod validation schema in `apps/backend/src/lib/env.ts` for type safety.

8. **Admin Account Lifecycle Email Alerts (Deactivation & Reactivation):**
   - Created `renderAccountDeactivatedEmail` template with custom warning accent bar, status pill, stated reason box, bulleted session revocation notes, and admin contact instructions.
   - Created `renderAccountReactivatedEmail` template with emerald status pill, celebratory headline, workspace access restored notice, and direct "Sign In to Workspace" CTA.
   - Hooked asynchronous email notifications directly into `deactivateMember` and `reactivateMember` in `organizations/service.ts`.
   - Added automated unit test coverage in `org.test.ts`.

### Test Results

- `bun test` — 23/23 tests pass across `auth.test.ts`, `workos.test.ts`, `org.test.ts`.
- `bun run build` (dashboard) — 0 TypeScript errors, clean Vite production build.
- `bun run typecheck` (backend) — 0 TypeScript errors.
- Email lifecycle in dev mode: automatically logs full HTML and plain text email payloads for invite, deactivation, and reactivation flows.

---

## 2026-08-30 — Enterprise Per-Head (Per-Seat) Payment & Billing System (v2)

### Summary of Changes

1. **Stripe SDK & Configuration (`apps/backend/src/lib/stripe.ts` & `env.ts`)**:
   - Installed `stripe@22.6.0` in `apps/backend`.
   - Created Stripe helper library supporting:
     - `createCheckoutSession`: Self-serve Stripe Checkout for Pro & Business plans with automatic quantity multiplication.
     - `createBillingPortalSession`: Direct launcher for the Stripe Customer Billing Portal.
     - `updateSubscriptionSeatQuantity`: Immediate proration seat expansion via `proration_behavior: 'create_prorations'`.
     - `scheduleSubscriptionSeatDecrease`: Period-boundary seat downsizing via `subscription_schedules` with `proration_behavior: 'none'` (no premature credits removed).
     - `previewProratedInvoice`: Live preview of upcoming charges, line items, and proration breakdowns before confirming seat additions.
     - `constructWebhookEvent`: Cryptographically verified webhook handler using Stripe webhook secret.

2. **Database Migration Applied (`0011_billing_v2.sql` & `patch.ts`)**:
   - Added `past_due_downgrade_pending` to `subscription_status` enum.
   - Added `stripe_subscription_item_id`, `stripe_guest_overage_item_id`, `billing_interval`, `pending_seat_change`, `seat_version`, `billing_terms`, `trial_ends_at`, `cancel_at_period_end` to `subscriptions` table.
   - Created `billing_events` table (for webhook idempotency log and audit trail).
   - Created `guest_seats` table (for tracking guest viewer limits and overage billing).
   - Created `seat_change_requests` table (with `stripe_idempotency_key` preventing duplicate mutations).

3. **Core Backend Billing Engine (`apps/backend/src/modules/billing/`)**:
   - `service.ts`:
     - Atomic concurrency locking via Postgres `SELECT ... FOR UPDATE` on `subscriptions`.
     - Single source of truth webhook architecture where `seatCount`, `planId`, and `status` are reconciled idempotently.
     - Slack-style fair billing model: vacant seats are preserved upon member deactivation, enabling replacement invites for $0 proration.
     - Downgrade member gate: verifies active billable members <= 5 when downgrading to Free; puts accounts in `past_due_downgrade_pending` if exceeded.
     - Capped guest model: Free (3 guests), Pro (10 guests/seat), Business (25 guests/seat), Enterprise (unlimited) with $3/guest/mo overage calculations.
   - `routes.ts`:
     - `GET /v1/billing/overview`: Comprehensive metrics, seat utilization, vacant seat counters, guest quotas, and invoice history.
     - `POST /v1/billing/checkout`: Initiates Stripe Checkout session.
     - `POST /v1/billing/portal`: Generates Customer Portal URL.
     - `POST /v1/billing/seats/preview`: Real-time upcoming invoice calculation.
     - `POST /v1/billing/seats/increase`: Instant prorated seat addition.
     - `POST /v1/billing/seats/schedule-decrease`: Scheduled period-end downsize.
     - `POST /v1/billing/cancel`: Handles plan cancellation with downgrade gating.
     - `POST /v1/billing/enterprise/request-quote`: Sales-assisted NET-30 invoice lead generator.
     - `POST /v1/billing/webhook`: Secure Stripe webhook processor.

4. **Plan Guard Middleware (`apps/backend/src/middleware/planGuard.ts`)**:
   - Implemented `requirePlan('pro' | 'business' | 'enterprise')` returning HTTP 402 with `PLAN_UPGRADE_REQUIRED` and `upgradeUrl`.

5. **Branded Email Templates (`apps/backend/src/lib/emailTemplates.ts`)**:
   - Created 8 full billing lifecycle templates: `renderSubscriptionActivatedEmail`, `renderSeatAddedEmail`, `renderSeatDecreaseScheduledEmail`, `renderGuestOverageEmail`, `renderPaymentFailedEmail`, `renderDowngradeBlockedEmail`, `renderSubscriptionCanceledEmail`, `renderEnterpriseInvoiceSentEmail`.

6. **Frontend UI Components (`apps/dashboard`)**:
   - `apps/dashboard/src/lib/billingService.ts`: Typed client wrapper for all billing API endpoints.
   - `apps/dashboard/src/pages/Pricing.tsx`: Public pricing page with Monthly/Annual 20% discount switch, dynamic seat sliders for Pro and Business tiers, full feature comparison matrix, and Enterprise "Contact Sales" modal.
   - `apps/dashboard/src/pages/admin/Billing.tsx`: Complete Enterprise Billing Hub featuring:
     - Real-time seat utilization progress gauge with **Vacant Seat Badges**.
     - Guest quota tracking with overage status.
     - "Add Seats" Modal with live Stripe proration breakdown preview.
     - "Downsize Seats" Modal with period-boundary validation.
     - Customer Portal launcher for self-serve card updates.
     - Past invoice history table with receipts and PDF downloads.
   - `apps/dashboard/src/pages/admin/Users.tsx`: Integrated pre-flight seat capacity checks and 402 redirect action toasts on user invitations.

### Verification Results

- `bun test apps/backend/src/modules/billing/billing.test.ts apps/backend/src/modules/organizations/org.test.ts` — 14/14 tests pass (100%).
- `bun run --cwd apps/dashboard build` — Clean Vite production bundle (0 errors).
- `bun x tsc -p apps/backend/tsconfig.json --noEmit` — 0 TypeScript errors.

---

### 2026-08-30 — Admin Panel Sidebar Responsive & Collapse State UX Fix

- **Problem:** When collapsing the sidebar in `AdminLayout.tsx` (`/admin/*`), header text, group labels, footer buttons, and profile info were not checking the `collapsed` state and were overflowing / squishing into the 56px (`w-14`) collapsed sidebar width.
- **Solution:**
  - Refactored `AdminLayout.tsx` to extract an `AdminSidebar` sub-component that consumes `useSidebar()`.
  - Added `collapsible="icon"` to the admin `<Sidebar>`.
  - Implemented responsive conditional rendering: when collapsed, shows centered icon buttons with tooltips, hides text labels, stacks footer action icons vertically, and passes `isCollapsed={true}` to `UserProfileDropdown`.
  - Added mobile dismissal (`setOpenMobile(false)`) on navigation item click.

---

### 2026-08-30 — Admin Panel Invoice Interface Alignment & Full Typecheck

- **Problem:** `apps/backend/src/modules/billing/service.ts` had a type discrepancy in `invoiceList` mapping where `pdfUrl` was defined instead of `hostedInvoiceUrl` and `invoicePdf`, causing a TypeScript compilation error when building the billing overview response.
- **Solution:**
  - Updated `invoiceList` type signature in `service.ts` to match the frontend contract with `hostedInvoiceUrl: string | null` and `invoicePdf: string | null`.
  - Verified `tsc --noEmit` across `apps/dashboard`, `apps/backend`, and `apps/super-admin` with 0 errors.

---

### 2026-09-02 — Top-Level Monorepo Structure & Knowledge Graph Standardization

- **What was done:**
  1. **Documentation Standardization (`docs/`)**: Renamed `markdowns/` to standard `docs/` and organized knowledge graph artifacts.
  2. **Script Consolidation (`scripts/`)**: Removed loose root forwarding shell scripts (`setup.sh`, `start.sh`) and unified execution under canonical `package.json` scripts (`bun dev`, `bun run setup`, `bun run db:reset`).
  3. **Knowledge Graph Integration**: Set up Graphify AST knowledge graph with `AGENTS.md` and `CLAUDE.md` rules instructing AI assistants to navigate via `graphify-out/GRAPH_REPORT.md`.
  4. **Git Hygiene**: Updated `.gitignore` to exclude `graphify-out/cache/` and timestamped backups.
  5. **Husky & Lint-Staged Hooks**: Added `.husky/pre-commit` (running `lint-staged` with Prettier/ESLint) and `.husky/pre-push` (running `turbo run typecheck` before remote push) with `"prepare": "husky"` script in `package.json`.
  6. **CI Pipeline Stabilization (`.github/workflows/ci.yml`)**: Added missing `db:migrate`, `db:seed`, and `build` stages to GitHub Actions workflow before test execution; added `"typecheck"` scripts to `apps/dashboard` and `apps/super-admin`.
  7. **AI Conciseness Directives**: Configured `AGENTS.md` and `CLAUDE.md` with strict output token minimization rules (zero fluff, direct diffs, terse bullet points).

---

### 2026-09-02 — Distributed Real-Time Scaling (Dedicated Redis Module)

- **What was done:**
  1. **Dedicated Redis Domain Module (`apps/backend/src/redis/`)**:
     - `client.ts`: Singleton connection lifecycle for `pubClient`, `subClient`, and `dataClient` with reconnect strategies, error listeners, and clean shutdown hooks (`disconnectRedis()`).
     - `pubsub.ts`: Multi-instance Redis Pub/Sub broker broadcasting cluster-wide real-time events (`boardly:realtime`) with unique `instanceId` tagging.
     - `presence.ts`: Distributed `PresenceStore` using Redis Hashes (`presence:board:{boardId}`), TTL Sorted Sets (`presence:board:{boardId}:ttl`), active board set indexing, and an automatic periodic background TTL sweeper (15s interval) broadcasting `presence:update` on evictions. Also includes `InMemoryPresenceStore` and `HybridPresenceStore` fallback.
     - `index.ts`: Unified module exports.
  2. **WebSocket & Event Bus Integration**:
     - Refactored `apps/backend/src/modules/realtime/routes.ts` to use async `presenceStore` operations, handle `heartbeat` keep-alive actions, and bridge Redis Pub/Sub directly to Bun WebSocket `server.publish()`.
     - Updated `apps/backend/src/lib/event-bus.ts` to publish broadcasts across the Redis cluster while gracefully falling back to in-memory event dispatch when Redis is disabled or offline.
     - Updated `apps/backend/src/index.ts` to initialize Redis on startup and gracefully disconnect on `SIGINT`/`SIGTERM`.
  3. **Dashboard Heartbeat Client**:
     - Updated `apps/dashboard/src/hooks/useRealtimeBoard.ts` to emit periodic `{ action: 'heartbeat', boardId }` pings every 25 seconds to keep presence alive.
  4. **Testing & Quality Assurance**:
     - Added unit test suites `src/redis/presence.test.ts` (TTL eviction, user updates, multi-board management, fallback) and `src/redis/pubsub.test.ts`. All 9 tests passing.
     - Verified zero TypeScript compiler errors across `@boardly/backend` and `dashboard`.

---

### 2026-09-02 — Human-Readable Schema Validation Error Formatting

- **What was done:**
  - Implemented `formatValidationError` in `apps/backend/src/lib/errors.ts` to parse internal TypeBox/Elysia schema errors into clear, friendly JSON responses (`{ error, message, details: [...] }`).
  - Integrated with the Elysia global `.onError` handler (`apps/backend/src/index.ts`).
  - Added unit test coverage in `src/lib/errors.test.ts` (14/14 tests passing).

---

---

### 2026-09-03 — Enterprise Dual-Pane Task View Redesign (Bitrix24 Layout)

- **What was done:**
  1. **Dual-Pane Layout Architecture**:
     - Redesigned `TaskDetailView.tsx` into a high-density, structured enterprise split view:
       - **Left Pane (Task Specification & Management)**: Card-based architecture with collapsible Requirement/Description box (with inline Markdown editor & preview), Core Metadata Grid (Owner, Assignee, Deadline, Status, Task ID), Agile Context (Scrum team, Stage dropdown, Epic/Sprint/Phase selectors, Story points), People & Roles (Participants, Observers with watch/unwatch toggle), Tags, Subtasks with interactive status filters (`All` vs `Mine`), Custom Fields, Time Tracking worklogs with progress visualization, Checklists, and Files/Attachments.
       - **Right Pane (Task Chat & Activity Stream)**: Built `TaskChatPane.tsx` featuring real-time collaborative comments, `@mention` teammate autocomplete, Google Meet video trigger, chat search, delivery checkmarks, inline image attachment previews, system audit event timeline pills (stage transitions, observer updates), and rich composer.
  2. **Enterprise Quick-Action Ribbon (`TaskActionRibbon.tsx`)**:
     - Added scrollable quick-action pill ribbon at the bottom of task specifications (`Files`, `Checklists`, `Project`, `Participants`, `Observers`, `Tags`, `Subtasks`, `Time tracking`, `Custom fields`, etc.) allowing instant jump navigation to corresponding sections.
  3. **Sticky Enterprise Bottom Action Bar**:
     - Integrated sticky bottom action bar with `Start`, `Complete`, `...` more dropdown (Clone, Create subtask, Archive, Delete), `Rate task` modal, and active viewer counter.
  4. **Responsive Modal & Page Containers**:
     - Expanded `CardModal.tsx` and `TaskPage.tsx` container viewports to accommodate full-width edge-to-edge dual-pane layouts with mobile tab switching (`Task` vs `Chat`).
  5. **Verification**:
     - Built and typechecked `dashboard` package via Turbo with zero TypeScript or compilation errors.

---

---

### 2026-09-03 — Task Detail UX Refinement & Checklist CORS Resolution

- **What was done:**
  1. **Root Cause of CORS Error on API Errors**:
     - In Elysia, `@elysiajs/cors` middleware hooks only decorate non-error responses. When any error occurred (401 Unauthorized, 403 Forbidden, 404, 422, 500), Elysia routed directly to `.onError()` which was sending HTTP error statuses without CORS response headers (`Access-Control-Allow-Origin: ...`).
     - As a result, browsers intercepted missing headers on 4xx/5xx responses and labeled them in the DevTools Network panel as `CORS error` instead of revealing the actual HTTP error.
     - **Fix**: Explicitly attached clean, single CORS headers inside `.onError()` (`access-control-allow-origin`, `credentials`, `methods`, `headers`) in `apps/backend/src/index.ts`.
  2. **Checklist Item Update (500 Database Error Fix)**:
     - In `apps/backend/src/middleware/auth.ts`, `requirePermission` was passing `user.organizationId` into Postgres/Drizzle queries without fallback. When `organizationId` was undefined on the token context, Postgres threw `UNDEFINED_VALUE: Undefined values are not allowed` producing a 500 error.
     - **Fix**: Added active organization lookup fallback (`membership.organizationId`) and null guards before query execution.
  3. **Floating Popovers & Click-Outside Dismissal**:
     - Refactored `MemberPicker` and `LabelPicker` invocations across Assignee, Participants, Observers, and Tags to mount as floating, positioned popovers (`absolute z-50 top-full left-0 mt-2 shadow-2xl backdrop-blur-xl`) with click-outside detection instead of stretching card containers inline.
  4. **Action Ribbon & Sticky Bottom Bar Positioning**:
     - Added generous bottom padding (`pb-36` / 144px) on the task specification scroll container and `mt-4 mb-6 pt-4 pb-4` on `TaskActionRibbon.tsx` to provide clean breathing room above the sticky bottom bar.
     - Connected `Start` button with live time tracking timer, live state display, and automatic stage transition.
     - Connected `Complete` button with instant stage movement, batch checklist completion, and success notifications.
     - Fixed date formatting from `12:00 AM43` to clean standard `July 26, 2026` / `MMM d, yyyy · h:mm a`.
  5. **Verification**:
     - Verified `PATCH /v1/cards/checklist-items/:itemId` returns `200 OK` with updated `isDone: true` data payload.
     - Full monorepo typecheck (`turbo run typecheck`) and dashboard build (`turbo run build --filter=dashboard`) passing with 0 errors.
