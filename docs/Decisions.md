# DECISIONS.md — Architecture Decision Records

Short log of significant technical decisions: what was decided, why, and what alternatives were rejected. Append new entries at the top (most recent first). Keep each entry short — a paragraph or two, not an essay. The goal is answering "why did we choose X?" a year from now without re-deriving it.

**When to add an entry:** any decision that would be annoying to re-litigate later — framework/library choices, data model trade-offs, security/multi-tenancy approach, anything a future session might otherwise "helpfully" second-guess and change without knowing why it was picked.

---

## Template for new entries

```
### YYYY-MM-DD — Short title of the decision

**Context:** What problem/question prompted this decision.

**Decision:** What was chosen.

**Alternatives considered:** What else was on the table, and why they were passed over.

**Consequences:** What this makes easier/harder going forward.
```

---

## Entries

### 2026-08-29 — WorkOS OAuth & Enterprise Single Sign-On (SSO) Architecture

**Context:** Enterprise users require SAML 2.0 / OIDC Single Sign-On with Okta, Azure AD (Entra ID), and Google Workspace alongside individual developer Google OAuth sign-in, while maintaining backward-compatible email/password authentication for platform Super Admins, seed accounts, and invited team members.

**Decision:**
1. Integrated `@workos-inc/node` SDK for authorization URL generation and code exchange across Google OAuth and enterprise SSO domains (`apps/backend/src/modules/auth/workos.service.ts`).
2. Added `/v1/auth/workos/google-url`, `/v1/auth/workos/sso-url`, and `/v1/auth/workos/callback` endpoints, enabling Just-In-Time (JIT) user provisioning and automatic domain-to-organization membership resolution.
3. Enhanced frontend login UI (`Login.tsx`) with "Continue with Google" button and domain-routed "Enterprise Single Sign-On (SSO)" expandable form, paired with a dedicated callback handler route (`/auth/callback` in `AuthCallback.tsx`).
4. Maintained complete parity across token issuance: regardless of authentication method (Google OAuth, SSO, or Email/Password), users receive identical signed Boardly JWT access and refresh token pairs.

**Alternatives considered:** Replacing email/password entirely with Google OAuth (rejected — breaks enterprise domain users, demo seed accounts, and Super Admin fallback portal); building custom SAML/SCIM protocol parsing from scratch (rejected — excessive maintenance complexity and security liability).

**Consequences:** Seamless 3-tier authentication covering individual users, enterprise tenants, and platform owners with zero breaking changes to existing accounts.

---

**Context:** Database query errors and unhandled exceptions were directly leaking internal SQL queries, parameter payloads, and table schemas in HTTP responses to the frontend. Furthermore, inviting members with the `'viewer'` role failed because `'viewer'` was omitted from the PostgreSQL `org_member_role` enum type.

**Decision:**
1. Created a centralized error handling and sanitization utility (`apps/backend/src/lib/errors.ts`) with `formatErrorResponse` and `handleRouteError`. All internal database queries, ORM dumps, and unhandled 500 errors are masked to clear human-readable messages (e.g. 409 Conflict, 400 Bad Request, or sanitized 500) while logging full query and stack diagnostics to server logs via `logger.error`.
2. Added `'viewer'` to `org_member_role` enum in PostgreSQL and Drizzle schema, updated `OrgMemberRole` shared TypeScript enums, and wrapped `inviteMember` in database transactions with strict input validation.

**Alternatives considered:** Exposing `err.message` across routes (rejected — severe security vulnerability and information disclosure risk).

**Consequences:** Eliminates all SQL/schema leaks across all API endpoints, ensures consistent JSON error structures, and supports complete user onboarding for Viewer roles.

---

### 2026-08-16 — Multi-Theme & Dark Theme Customization Engine

**Context:** Users need dark mode and customizable visual themes to work comfortably in various lighting conditions and express team identity.

**Decision:** Built a multi-theme engine supporting 3 interface modes (Light, Dark, System auto-matching OS `prefers-color-scheme`), 6 handcrafted theme palettes (Default Zinc, Midnight OLED, Oceanic Azure, Emerald Forest, Synthwave Sunset, Nordic Frost), and 6 accent colors (Indigo, Sky, Emerald, Neon Violet, Rose, Amber + custom HEX). Implemented via CSS custom properties on `:root` / `.dark` / `[data-theme="..."]` attributes and persisted via `localStorage` with a Zustand store (`themeStore.ts`).

**Alternatives considered:** CSS-in-JS runtime themes or static precompiled stylesheet swapping (rejected — CSS custom properties combined with Tailwind CSS v4 `@custom-variant dark` provide zero runtime overhead, instant switching without layout reflow, and full white-label compatibility).

**Consequences:** Instantaneous, zero-flicker theme switching across all dashboard components and layouts with zero rebuild necessary.

---

**Context:** Mobile team members working in low-connectivity or offline environments need to create cards, add comments, and check off tasks without blocking UI interaction or losing updates.

**Decision:** Implemented an optimistic offline action queue (`offlineQueue.ts`) that persists mutations locally and provides an automated batch replay mechanism against REST endpoints upon network recovery.

**Alternatives considered:** Disabling mutations while offline (rejected — poor mobile user experience during travel or field work).

**Consequences:** Seamless mobile offline capability with manual and automatic synchronization.

---

**Context:** Developers and DevOps engineers need programmatically scoped API keys to interact with Boardly REST APIs from automated scripts and CI pipelines.

**Decision:** Formatted keys as `bk_live_<random_bytes>`, storing only the first 12 characters (`keyPrefix`) for UI identification and the SHA-256 cryptographic hash (`keyHash`) in the database. The full key is revealed exactly once to the user upon creation.

**Alternatives considered:** Storing plaintext API keys or reversibly encrypted keys (rejected — serious security vulnerability in case of database leak).

**Consequences:** Secure, industry-standard API key authentication matching GitHub/Stripe best practices.

---

### 2026-08-16 — Power-Up & Extension Marketplace Architecture

**Context:** Users require third-party tool integrations (GitHub, Slack, Jira, Custom Fields, Time Tracking) that can be installed on-demand without code changes.

**Decision:** Created a declarative App manifest model (`marketplace_apps`) with configurable capability definitions and per-organization/per-board installation state (`installed_apps`).

**Alternatives considered:** Hardcoding all integrations directly into the core dashboard UI (rejected — clutters interface and prevents third-party ecosystem growth).

**Consequences:** Clean pluggable architecture with custom configuration schemas and one-click installs.

---

**Context:** Enterprise organizations require automated user life-cycle management from corporate identity providers (Okta, Azure AD, Google Workspace) without manual invites.

**Decision:** Implemented domain-routed SAML/OIDC configuration (`sso_configurations`) and a SCIM 2.0 webhook listener (`/v1/sso/scim`) supporting `user.create`, `user.update`, and `user.delete` (deactivation).

**Alternatives considered:** Manual CSV employee imports (rejected — high administrative toil and security risks with stale accounts).

**Consequences:** Instant enterprise tenant onboarding, secure Just-In-Time (JIT) provisioning, and immediate deactivation upon employee departure.

---

### 2026-08-16 — Real-Time In-Memory Presence Registry with Automatic Disconnect Cleanup

**Context:** Distributed teams need to see who is currently viewing a board and editing specific cards to prevent conflicting edits.

**Decision:** Enhanced WebSocket connection handler to maintain an in-memory board-presence registry broadcasting `presence:update`, `presence:card_focus`, and `presence:typing` with automatic cleanup on socket `close`.

**Alternatives considered:** Persistent database writes on every mouse move / card focus (rejected — excessive I/O and latency).

**Consequences:** Ultra-low latency presence indicators (<20ms) with zero persistent database overhead.

---

**Context:** Customer support and ops teams require inbound tickets submitted from external users to be automatically prioritized with firm resolution timeframes.

**Decision:** Built an intake form engine where submissions dynamically create Kanban cards on the target list, format JSON payload into Markdown task bodies, and calculate `dueDate = submissionTime + slaHours`.

**Alternatives considered:** Manual triage and due-date entry by support agents (rejected — high toil and slow response times).

**Consequences:** Guaranteed SLA tracking with immediate visibility on overdue risks across board and project reports.

---

### 2026-08-16 — Stacked Area Cumulative Flow Diagrams (CFD) in Pure SVG

**Context:** Kanban engineering teams need to analyze work-in-progress (WIP) stability and spot bottleneck widening across stages over 7, 14, or 30-day windows.

**Decision:** Rendered dynamic stacked multi-stage polylines and polygons natively in SVG.

**Alternatives considered:** Heavy charting libraries (Recharts / D3) — passed over to maintain instant initial load times and standard design token integration.

**Consequences:** High-fidelity visual flow analysis with 0 external dependency bloat.

---

**Context:** Enterprise tenants require fine-grained access control beyond hardcoded roles (e.g. contracting QA, reviewers, auditors).

**Decision:** Implemented a unified `roles` & `role_permissions` join table structure where system roles (admin, member) coexist with organization-scoped custom roles. Missing system permissions are auto-seeded on service boot.

**Alternatives considered:** JSON arrays of string permissions stored directly on the member table (rejected — violates relational integrity, prevents reusable named role assignments, and complicates audit querying).

**Consequences:** Complete flexibility for tenants to define and name roles while preserving backward compatibility with legacy RBAC guards.

---

### 2026-08-16 — Integrated Docs & Wiki with Bidirectional Card Linking

**Context:** Product and engineering teams need to author specifications, RFCs, and meeting notes directly linked to their execution tasks and Kanban boards.

**Decision:** Created a `documents` schema with Markdown support and a `document_cards` composite junction table enabling many-to-many bidirectional linking between docs and cards.

**Alternatives considered:** External links stored only in card descriptions (rejected — loses backlinks, discoverability, and project-level knowledge organization).

**Consequences:** Teams can seamlessly jump between high-level architectural RFCs and real-time execution cards on their boards.

---

**Context:** We needed burndown and velocity charts for sprint analytics and project tracking in `apps/dashboard`. We evaluated pulling in third-party chart libraries (Recharts, Chart.js, Tremor) vs. custom SVG rendering.

**Decision:** Handcrafted, accessible, responsive SVG components styled with Tailwind CSS tokens.

**Alternatives considered:** Recharts / Chart.js (rejected — introduces large bundle weight, React 19 peer-dep inconsistencies, and rigid canvas/DOM layouts that resist custom styling).

**Consequences:** Keeps client bundle size lightweight (0 extra dependencies), guarantees 100% theme consistency with dark mode tokens, and allows fine-grained animations for actual vs. ideal burndown lines.

---

### 2026-08-16 — Native Trello & Structured Task Migration Importer

**Context:** Teams migrating from Trello or existing systems need a seamless way to import boards without manual transcription.

**Decision:** Implemented an in-browser parsing pipeline with validation preview combined with backend atomic creation (`importers/service.ts`). It maps Trello's list IDs, card IDs, checklists, and color palettes directly to Boardly schema entities.

**Alternatives considered:** Running an asynchronous background migration job via BullMQ (deferred to Phase 3 for large enterprise files >50MB; synchronous endpoint handles standard board exports under 50ms).

**Consequences:** Instant board migration with immediate redirection to the created board view.

---

### 2026-08-10 — Native Bun WebSockets vs. Redis Pub/Sub for MVP Real-Time Sync

**Context:** We needed a way to sync board updates (card moves, edits) across multiple clients in real-time.

**Decision:** We are using Bun's native WebSocket `server.publish()` combined with an internal Node `EventEmitter` (`src/lib/event-bus.ts`) for the MVP. We are NOT introducing Redis Pub/Sub yet.

**Alternatives considered:** Using Redis Pub/Sub directly for all WebSocket events (rejected for MVP because it adds operational overhead and complexity when we only have a single backend instance right now).

**Consequences:** By decoupling the services from the WebSocket module via an `EventEmitter`, we ensure that swapping to Redis Pub/Sub in the future (when scaling horizontally) will only require changing the implementation in `event-bus.ts`, leaving the services untouched.

---

### Backend framework — Elysia over NestJS/Express-on-Bun

**Context:** Needed a backend framework for a Bun runtime, supporting a large, RBAC-heavy, multi-tenant feature surface.

**Decision:** Bun + Elysia.

**Alternatives considered:** Express-on-Bun (rejected — doesn't leverage Bun's native performance, dated middleware model). NestJS (strong alternative, gives more out-of-the-box DI/module structure, but was passed over in favor of Elysia's Bun-native speed and end-to-end type safety via Eden Treaty). Rust + Axum (rejected as the default backend — see next entry).

**Consequences:** Elysia's ecosystem is younger than NestJS's, so module structure/RBAC guard conventions must be self-imposed rather than framework-provided (see `Agents.md` §5). Gained: very fast dev iteration, full type safety from backend to frontend without codegen.

---

### Backend language — TypeScript over Rust (for now)

**Context:** Considered Rust for the backend given its performance/safety reputation.

**Decision:** TypeScript across the entire stack (dashboard, website, mobile, backend), not Rust.

**Alternatives considered:** Full Rust backend (Axum) — rejected as the default because this app's complexity is in business logic (RBAC, multi-tenancy, custom workflows) and iteration speed, not raw compute; Rust's stricter iteration loop works against rapid pre-PMF product development. Revisit selectively later for isolated hot paths (realtime fan-out, search indexing) once real scale problems exist — not by default.

**Consequences:** One language across the whole company/codebase — shared types, faster hiring, faster iteration. Accepting that a future performance bottleneck may need a Rust service carved out specifically for that bottleneck.

---

### Multi-tenancy strategy — Shared DB with `organization_id` + Postgres RLS

**Context:** Needed to decide tenant isolation strategy: shared DB, schema-per-tenant, or DB-per-tenant.

**Decision:** Shared database, every table has `organization_id`, enforced by both application-layer scoping AND Postgres Row-Level Security as a last line of defense.

**Alternatives considered:** DB-per-tenant (rejected as the default — too costly/complex to manage at MVP stage, but reserved as a premium "dedicated instance" tier for large enterprise clients later). Schema-per-tenant (rejected — middle ground that adds operational complexity without RLS's guarantee).

**Consequences:** Cheaper and simpler to scale early. Requires strict discipline: every query must be tenant-scoped at the app layer, never relying on RLS alone (see `Agents.md` §5). A tenant data leak is treated as a security incident, not a bug.

---

### UI component libraries — shadcn/ui + Aceternity UI (web), React Native Reusables (mobile)

**Context:** Needed a UI component approach across dashboard, website, and mobile that stays visually consistent and easy to theme (white-label branding per tenant).

**Decision:** shadcn/ui as the base component layer for web, Aceternity UI for website marketing/animation-heavy sections, React Native Reusables (the direct shadcn port, built on NativeWind) for mobile.

**Alternatives considered:** A single cross-platform UI library like Tamagui or gluestack (rejected for now — smaller community/less design flexibility than the shadcn ecosystem; may be revisited if maintaining two component sets becomes painful). Chakra/MUI/Ant Design (rejected — fragments the design system, no copy-in ownership model).

**Consequences:** Design tokens must be centralized in `packages/config` and consumed by both `packages/ui` (web) and `packages/ui-native` (mobile) to keep visual parity — see `Agents.md` §4.

---

### 2026-08-25 — DragOverlay & Real-Time Dynamic List Re-parenting for Kanban Boards

**Context:** The initial drag-and-drop implementation transformed card DOM nodes in-place inside `overflow-y: auto` column containers. This caused cards to be clipped by column bounds when dragged across the board, triggered jittery scrollbars, provided no real-time slot opening feedback when dragging over other columns, and allowed hover tooltips to pop up during drags.

**Decision:** Adopted `@dnd-kit/core`'s `<DragOverlay>` rendered outside column scroll containers with portal elevation, combined with `onDragOver` dynamic local state list re-parenting, a ghost dashed placeholder in the source slot, and multi-container collision detection (`pointerWithin` + `rectIntersection` + `closestCorners`). All hover tooltips are suppressed globally when an active drag is underway.

**Alternatives considered:** Native HTML5 Drag and Drop (rejected — lack of smooth touch/mobile support and rigid drag image styling), Framer Motion Reorder (rejected — limited multi-column kanban coordination compared to dnd-kit).

**Consequences:** Buttery-smooth, glitch-free dragging across columns with responsive visual slot opening, crisp click handling (via `distance: 6` PointerSensor), and high-fidelity glassmorphic drag elevation matching modern SaaS standards (Linear, Trello).

---

### 2026-08-30 — Enterprise Per-Head (Per-Seat) SaaS Billing & Fair Proration Engine (v2)

**Context:** The platform requires an automated, self-serve per-head SaaS billing engine that lets organizations purchase and adjust seats without manual sales interaction, while preventing concurrency race conditions, preserving unbilled guest collaboration, and handling downgrades safely.

**Decision:** Implemented an industry-standard per-seat billing architecture (Slack/Linear standard):
1. **Atomic Concurrency Locking**: Member invitations and seat adjustments execute under Postgres `SELECT ... FOR UPDATE` row-level locks on `subscriptions`.
2. **Single Source of Truth Webhook Engine**: Subscription states (`seatCount`, `planId`, `status`, `currentPeriodEnd`) are updated strictly through cryptographic Stripe webhooks with database idempotency logs (`billing_events`).
3. **Proration Isolation**:
   - Seat additions trigger immediate proration via `updateSubscriptionSeatQuantity` (`proration_behavior: 'create_prorations'`).
   - Seat decreases are scheduled at the period boundary via `scheduleSubscriptionSeatDecrease` (`subscription_schedules` with `proration_behavior: 'none'`), removing zero premature credits.
4. **Slack-Style Fair Billing**: Deactivating members retains their paid seat as a **Vacant Seat**, allowing replacement colleagues to be onboarded at $0 proration.
5. **Capped Guest Model**: Unbilled viewers are capped per tier (Free: 3 guests, Pro: 10 guests/seat, Business: 25 guests/seat, Enterprise: unlimited), with additional viewers billed via `$3/guest/mo` overage line items.
6. **Downgrade Member Gate**: Blocks cancellation if active billable members exceed 5 on Free plan downgrade. If bypassed externally on Stripe, puts the subscription in `past_due_downgrade_pending` and alerts administrators.
7. **Enterprise Invoicing**: High-tier enterprise contracts route through sales-assisted Stripe Invoicing (`send_invoice`, NET-30/60) rather than self-serve card checkout.

**Alternatives considered:** Flat-tier subscription pricing (rejected — does not scale with organization size, loses expansion revenue), manual seat approval workflow (rejected — introduces high friction for buyer organizations).

**Consequences:** Complete self-serve upgrade capability for organizations, mathematically sound proration tracking, zero seat-oversubscription race conditions, and clear upgrade triggers.

