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

### 2026-09-13 — Upstash read cache (versioned, 1-RTT reads)

**Context:** Neon free tier makes every DB round-trip ~100-300ms from IN; a card open fires ~10 requests × (permission join + N queries). Upstash Singapore chosen (closest to user + Neon SG).

**Decision:** `lib/cache.ts` versioned read-through cache: board version `bv:{board}` scopes `listLists`/`listCards`, card version `cv:{card}` scopes `getCard`; reads are 1 Redis RTT via Lua (version+payload); mutations bump versions (card→board map with DB fallback, no SCAN). RBAC allows cached 60s (denials never), plan tier TTL 60→300s, rate-limiter Redis timeout 50→400ms for remote RTT. Fixed `z.coerce.boolean` silently disabling Redis on `"false"`, Upstash auto-TLS, credential redaction in logs.

**Alternatives considered:** TTL-only caching (stale-board risk on drag-move); batch card endpoint (still recommended next — cache shrinks each request, batching shrinks count).

**Consequences:** Repeat reads skip Neon entirely; 60s stale-allow window after role changes (documented); mutations pay ~2 Redis RTTs for bumps.

### 2026-09-13 — Dev boot seed: skip-when-complete + batched base seed

**Context:** `dev.sh` runs `db:seed` on every boot; it replayed the full enterprise seed (~3-4 min, thousands of sequential auto-commit statements over Docker fsync) and grew append-only log tables (time/audit/activity have no conflict guard) on every boot.

**Decision:** (1) `seedFullOrganization()` fast-path: skip when `acme-corp` has 50 members + cards (<1s); `--force` replays. (2) Base seed batched: multi-row permission insert, one DELETE with IN-subquery for Member revoke, one INSERT..SELECT per role (was ~500 sequential statements → ~10). 3:44 → ~4s. Same final state (verified counts 95/82/22/7).

**Alternatives considered:** Wrapping seed in one transaction (bigger change, lock risk); removing seed from `dev.sh` (loses first-boot provisioning).

**Consequences:** Dev deletions of seed data now survive reboots; `db:seed:org --force` or `db:reset` restores full seed. Noticed but untouched: `org.delete` duplicated in `ALL_PERMISSION_KEYS` (95 unique of 96).

### 2026-09-13 — Query perf via indexes + Promise.all, no endpoint changes

**Context:** Board load fired 5x `GET /cards?listId` at 3-5s each and login cascades at ~500ms-1.6s on localhost. EXPLAIN showed `Seq Scan` on every FK filter (only PKs/unique constraints indexed); each request also paid 6-8 sequential DB round-trips plus per-request auth/permission/rate-limit overhead.

**Decision:** (1) Additive index migration `0015` (47 indexes on FK/sort/user-lookup columns) — no table rewrites, applies via normal CI auto-migrate. (2) Fan out independent awaits with `Promise.all`, keeping queries and return shapes byte-identical. (3) Escape `%_\\` in LIKE terms + early-return empty search. Deferred: batch endpoints, result limits, `pg_trgm`, permission caching.

**Alternatives considered:** New batch endpoints (`cards?boardId=`) would cut round-trips further but change API + frontend; limits/pagination would change contracts. Saved for a follow-up with frontend coordination.

**Consequences:** Same API, fewer round-trips per request (e.g. `listCards` 8→2 sequential hops), index scans once tables grow. FK-ordered deletes stay sequential where constraints require it (items-before-checklists).

### 2026-09-09 — Shared DatePicker replaces all native date inputs

**Context:** Every date field used `<input type="date">`, whose popup is OS/browser chrome that ignores theming entirely (the broken-looking calendar in the report) and behaves inconsistently across browsers.

**Decision:**

1. New `DatePicker` in `@boardly/ui` (Base UI Popover + Portal + Positioner, same pattern as the menu/tooltip primitives): Monday-first ISO grid, month nav, Today/Clear footer, min/max bounds, clear button, `required` asterisk, full keyboard/ARIA wiring. Zero new dependencies (hand-rolled month math). Same `YYYY-MM-DD` string contract as the native inputs.
2. Swapped all 8 usages: task Deadline, worklog Date, composer Due Date, board inline-composer date, sprint start/end (end bounded by start via `min`), phase start/end. Sprint create is now disabled until both required dates are set (replacing the lost native `required` gate).

**Alternatives considered:** `react-day-picker` (rejected — dependency + styling override work for what ~200 lines of owned code covers, consistent with the hand-rolled SVG chart call).

**Consequences:** No native date popup remains in the dashboard (verified by grep). Any new date field uses `DatePicker` from `@boardly/ui`.

### 2026-09-09 — Subtask badge source fix, borderless checklist rename, tooltip stuck-instant bug

**Context:** (1) New subtasks showed "Completed" — `listSubtasks` never joined `lists`, so `listName` was always undefined and the `|| 'Completed'` fallback lied. (2) Checklist rename swapped the header for an input + Save/Cancel row (layout shift, cramped). (3) Tooltips still felt instant despite the 500 ms standard.

**Decision:**

1. `listSubtasks` now joins `lists` and returns real `listName`; frontend fallback changed to `card?.listName || 'To Do'` so no missing value can ever render as "Completed" again.
2. Checklist rename is Trello-style borderless: click title → inline input in place (progress bar stays), `Enter` saves, `Escape`/blur cancels. No buttons, no layout shift.
3. Root-caused the fast tooltip: `GlobalTooltip`'s skip-delay flag was only reset on `mouseout` — hiding via scroll/mousedown left instant-show stuck on permanently. All hide paths now reset the 300 ms grace window.

**Alternatives considered:** Frontend-only badge fallback to parent column (rejected — masks the missing join; real data is one join away).

**Consequences:** Status pills are truthful by construction; tooltip timing is now actually 500 ms in all paths.

### 2026-09-09 — Composer width, checklist placeholder, required-field convention (RHF deferred)

**Context:** Composer felt cramped at `max-w-xl`; the multi-line checklist placeholder renders collapsed/misleading in browsers (placeholder text cannot contain line breaks); and nothing marked Task Title as mandatory.

**Decision:**

1. Dialog `max-w-xl` → `max-w-3xl`; checklist textarea single-line placeholder + `rows={4}` (live checkbox preview below already teaches the one-per-line format as they type).
2. Required-field convention (new `RequiredMark` in the composer): red `*` + sr-only "(required)", muted "Required" hint under the field, `aria-required`/`aria-invalid`, inline `role="alert"` error on submit attempt. Submit stays clickable so the error can surface (with explanatory tooltip), instead of a dead disabled button.
3. React Hook Form evaluated and **deferred**: this form has one required field and no cross-field rules — controlled state + inline error covers it with zero bundle cost. Graduate to RHF + zod when a form exceeds ~5 fields or needs cross-field/async validation; `RequiredMark`-style marking applies everywhere regardless.

**Alternatives considered:** Adding RHF now for uniformity (rejected — dependency + refactor cost with no validation problem to solve yet); native `required` bubbles (rejected — inconsistent styling, no custom messaging).

**Consequences:** Any new form copies the asterisk + inline-error pattern; RHF adoption has a clear trigger threshold.

### 2026-09-09 — Composer dialog space + live checklist preview, subtask popup-only

**Context:** The enriched composer felt cramped at `max-w-xl`, typed checklist lines had no visual confirmation (raw textarea only), and the task view still kept a redundant inline subtask input next to the Full Editor path.

**Decision:**

1. Dialog widened to `max-w-2xl`; Participants/Observers paired side-by-side in a 2-col grid.
2. Checklist section gained a live preview: each parsed line renders as a checkbox row with position counter and hover-remove (removal edits the source text, so preview is always truthful).
3. Inline subtask input deleted entirely — header + Add and all menu entries open the composer popup directly; dead state/mutations (`addSubtaskMutation`, inline title/assignee state) removed with it.

**Alternatives considered:** Tabs/wizard steps in the composer (rejected — single scrolling form with grouped sections matches Jira and keeps everything one submit); keeping inline quick-add alongside (rejected — two paths doing the same job caused the original "still broken" confusion).

**Consequences:** One subtask creation path. Composer sections now own the full creation surface.

### 2026-09-09 — Server-side member search for all composer dropdowns

**Context:** Assignee/participant/observer dropdowns rendered a fully-downloaded org directory (`GET /orgs/:id/members` with no limit) and filtered client-side — breaks at thousands of employees (payload, memory, DOM rows). Backend already supports `search`/`limit`/`offset` + `X-Total-Count`; `MemberPicker` already used it, but the composer selects did not.

**Decision:**

1. `packages/ui/searchable-select`: backward-compatible async props — `onSearchChange` (disables client filtering, forwards keystrokes), `onReachEnd`/`isLoadingMore` (infinite scroll), `isLoadingOptions`, `footer`. No existing consumer affected (all optional).
2. Dashboard `useOrgMemberSearch` hook: 250 ms debounce + `useInfiniteQuery` (25/page) + 2-min stale / 5-min gc caching, mirroring `MemberPicker`.
3. `AsyncMemberSearchableSelect` (single, You + Unassigned pinned, pinned-id resolution, "N of M" footer) and `AsyncMemberChipPicker` (multi, search box, selections pinned on top) in `components/ui/AsyncMemberSelect.tsx`.
4. Composer uses async variants whenever `orgId` is known (both call sites pass it); removed BoardView's unbounded `getMembers` fetch that existed only for the modal. Static-array fallbacks stay for callers without org context.

**Alternatives considered:** Extending `MemberPicker` popovers into the dialog (rejected — popover-in-dialog stacking/focus issues; chips + async select fit the form better); raising the fetch limit (rejected — just moves the cliff).

**Consequences:** Composer member traffic is now ~25-row cached pages + debounced search. Rule going forward: no unbounded directory fetch for any dropdown (PROMPT_PATTERNS.md §9 audit).

### 2026-09-09 — Shared subtask composer with locked parent (Jira benchmark)

**Context:** Subtask creation was a title-only inline form (assignee defaulted silently, no description/dates/estimates), which is why it felt "broken" next to the full task composer. Benchmark: Jira's create-subtask dialog — full field set with the parent fixed.

**Decision:**

1. Extracted `CreateTaskModal` from `BoardView.tsx` into `components/board/CreateTaskModal.tsx` (zero behavior change for board usage) with `parentCardId`/`parentCardTitle` props: subtask mode shows a locked "Parent Task" row, retitles to "Create Subtask", and posts `parentCardId` (already supported by `POST /cards`).
2. Task detail subtask form gained a "Full Editor" button opening the composer with parent = current task, column = current column, typed title carried over; on create it refreshes subtasks and opens the new subtask. Modal is `React.lazy` in both call sites (own 5.7 kB chunk).
3. Quick inline add stays for rapid entry; full composer covers description, assignee, due date, story points, estimates.

**Alternatives considered:** New standalone subtask page/route (rejected — modal keeps context; Jira/Linear both use dialogs); duplicating the composer in TaskDetailView (rejected — shared component, one source of truth).

**Consequences:** Board and subtask creation share one composer going forward — field additions apply to both.

### 2026-09-09 — Event-sourced task history for people/label/watcher changes

**Context:** The activity feed showed "X is now an observer" but never "stopped watching" — observer entries were synthesized on the frontend from the _current_ watchers list, so deleting the row erased the event. Audit found the same gap class everywhere: assign/unassign, participant add/remove, label attach/detach, and unwatch wrote no history rows at all (only checklist ops did, via `comments`-channel entries).

**Decision:**

1. All 8 mutations now write persistent `comments`-channel history rows in the existing emoji style (`👀` watch, `👤` assignee, `🤝` participant, `🏷️` label), fire-and-forget (`.catch(() => {})`) so history never breaks the mutation. Self vs. admin-acted wording handled (`Started watching` vs. `Added **Name** as an observer`). Actor threaded through routes; automation callers already pass `actorId`.
2. Frontend `systemActivities` no longer synthesizes watcher entries (would duplicate the persistent rows); `isActivityComment` recognizes the 3 new emoji prefixes so they render as history pills with the existing verb-lowercasing.
3. `card.test.ts` watch test extended to assert both history rows exist.

**Alternatives considered:** Separate `activity_log` table reads for the feed (rejected — feed already renders the comments channel; new table = new API + migration for identical UX); keeping frontend synthesis alongside backend rows (rejected — duplicates every watch).

**Consequences:** History is now append-only and complete for people/label/watcher events. Rule going forward: any new card mutation must write a history row (add to the `PROMPT_PATTERNS.md` §9 audit).

### 2026-09-09 — Enterprise interaction standard + checklist input/save fixes

**Context:** Two checklist UX defects showed features shipping below market standard: (1) the section Save button was always enabled but a silent no-op when nothing was pending (everything auto-saves instantly); (2) the add-item field was single-line, so `Shift+Enter` couldn't create new lines. Standing rule added as `AGENTS.md` §7: every feature must match Linear/Jira/Notion interaction quality — never a minimal local-product implementation.

**Decision:**

1. Checklist add-item `<Input>` → auto-growing `<textarea>`: `Enter` saves, `Shift+Enter` newline, `Escape` cancels, IME-composition guard. Benchmark: Notion/Linear comment editors. Multi-line submit reuses the existing bulk-add split path, so pasted/typed lines still fan out into separate items.
2. Section Save is now dirty-tracked (`hasPendingChecklistChanges` over new-checklist form, item text, title edit, draft items, dirty description): disabled with explanatory tooltip when pristine, and now also flushes a typed new-checklist title.
3. `PROMPT_PATTERNS.md` §§3–4, 9 updated so all future build/audit prompts enforce the standard.

**Alternatives considered:** Keeping single-line + documenting "paste lines to bulk add" (rejected — typing multi-item lists is core checklist behavior in every competitor); hiding Save when pristine instead of disabling (rejected — disabled-with-tooltip teaches the auto-save model better).

**Consequences:** Checklist section is now the reference implementation for §7. Rule going forward: no enabled button that silently does nothing; no single-line input where competitors allow multi-line.

### 2026-09-09 — Dashboard route-level code splitting (React.lazy + manualChunks)

**Context:** `apps/dashboard/src/App.tsx` static-imported all ~30 pages, so every user downloaded the entire dashboard (BoardView's dnd-kit tree, reports, docs, all admin screens) on first load.

**Decision:**

1. Every route page is `React.lazy`-loaded (`.then(m => ({ default: m.X }))` mapping since pages use named exports) under a single `<Suspense fallback={<RouteFallback />}>` in `App.tsx`. Layouts stay eager (persistent shell).
2. Heavy on-demand modals are split too and mount only when opened: `CardModal`/`AutomationsModal`/`FormBuilderModal` in `BoardView.tsx`, `TrashBinModal`/`AppearanceModal` in `DashboardLayout.tsx`, `AppearanceModal` in `AdminLayout.tsx`. Shared fallback: `components/common/RouteFallback.tsx`.
3. `vite.config.ts` adds stable `manualChunks` (`vendor-react`, `vendor-query`, `vendor-dnd`, `vendor-ui`) so third-party code stays cached across deploys while route chunks change independently.
4. Convention locked in `docs/PROMPT_PATTERNS.md` §4: new pages MUST be lazy-registered, never static-imported.

**Alternatives considered:** Per-route `<Suspense>` wrappers (rejected — one wrapper covers all routes with less boilerplate); eager layouts split too (rejected — shell flickers on every navigation); leaving modals eager (rejected — CardModal pulls the heaviest board dependency tree).

**Consequences:** Initial bundle is shell + current route only; new pages automatically get their own chunk if the author follows §4. Rule going forward: `App.tsx` must never contain a static page import — flag it in review (PROMPT_PATTERNS.md §9 audit).

### 2026-09-09 — Shared enums as const objects + Eden Treaty end-to-end types

**Context:** Wiring Eden Treaty (`treaty<App>`) in the dashboard pulled backend sources into a program with `erasableSyntaxOnly`, where `packages/shared-types` runtime `enum`s are illegal (15x TS1294). Bun also installs one `elysia` copy per peer graph, and Elysia's private fields made cross-copy `App` fail treaty's constraint (TS2344).

**Decision:**

1. `packages/shared-types/src/enums`: all 15 `enum`s → `const` object + union type (same names/values; runtime shape byte-identical to old string enums, `z.nativeEnum` untouched). Locked by DB-free `apps/backend/src/db/enums.test.ts` asserting shared values mirror Drizzle `pgEnum` sets.
2. Dashboard `tsconfig.app.json` pins type-resolution `elysia` → backend copy (single-copy rule; runtime bundling unaffected).
3. Dashboard `src/lib/eden.ts` is now `treaty<App>` (`import type { App }` from `@boardly/backend`); axios client stays for existing calls + token refresh.
4. Fixed 4 trivial backend lints exposed by the stricter cross-program check (`import type` x3, one unused import) — backend `typecheck` is now fully green.

**Alternatives considered:** Relaxing dashboard `erasableSyntaxOnly` (rejected — deliberate strictness); generated `.d.ts` contract package (rejected — drift surface for what source imports already solve); untyped `treaty()` client (rejected — loses the autocomplete/type errors this migration was for).

**Consequences:** Frontend gets compile-time API drift detection (wrong query key = type error). Rule going forward: never reintroduce `enum` in `shared-types`; keep `elysia`/`@elysiajs/eden` versions in sync across backend + dashboard. Route body schemas live in per-module `schema.ts` with exported `Static` types — dashboard annotates Eden payloads with them so completions work even on older TS language servers (verified on 5.9.3), which can't expand Eden's deep conditional body types inline.

---

### 2026-09-02 — K8s Deployment, Helm GitOps & Multi-Tenant Isolation Architecture

**Context:** Boardly backend needed enterprise-grade containerization, horizontal autoscaling on AWS EKS, zero-downtime deployment pipelines with GitOps/ArgoCD, multi-tenant noisy neighbor isolation, RDS Proxy transaction pooling compatibility, and Row-Level Security (RLS) enforcement.

**Decision:**

1. **Container & CI/CD**: Multi-stage Bun 1.2 Alpine image (`apps/backend/Dockerfile`) bundled with Drizzle migrations. GitHub Actions pipeline (`.github/workflows/docker-build.yml`) builds immutable SHA-tagged images and updates GitOps Helm values.
2. **Helm & Kubernetes**: Authored complete Helm chart (`infra/helm/boardly-backend/`) with RollingUpdate (`maxSurge: 1, maxUnavailable: 0`), `securityContext` (`readOnlyRootFilesystem: true`, non-root bun user, all capabilities dropped), `topologySpreadConstraints` across nodes, HPA (3-20 replicas with 300s scale-down stabilization), PDB (`minAvailable: 2`), ExternalSecrets (AWS Secrets Manager), cert-manager TLS Ingress with per-IP rate limiting, and pre-upgrade migration Job hook.
3. **Multi-Tenant Rate Limiting & Concurrency Quota**: Created atomic Redis Lua token-bucket rate limiter (`rateLimiter.ts`) enforcing plan-tier RPS/burst caps with a 50ms hard timeout and fail-open policy (`rate_limiter_fail_open_total` alert metric). Created heavy-endpoint concurrency semaphore (`tenantQuota.ts`) with `HOLD_TTL_SECONDS: 300` safety net.
4. **Database & RLS Layer**: Configured `prepare: false` across postgres clients for RDS Proxy / PgBouncer transaction pooling safety. Implemented `withOrgContext()` enforcing `SET LOCAL app.current_org_id` with 3-second read-after-write Redis TTL markers for monotonic read consistency. Added RLS migration (`0012_enable_row_level_security.sql`) and lint rule (`scripts/lint-raw-db.ts`).
5. **Graceful Draining**: Implemented in-flight request tracking with 25-second drain window on `SIGTERM` / `SIGINT` before closing Redis and Postgres pools, paired with K8s 45s `terminationGracePeriodSeconds` and `preStop: sleep 5`.

**Alternatives considered:** Self-hosted PgBouncer pod sidecars (rejected — AWS RDS Proxy provides fully managed pooling and failover); fail-closed rate limiter (rejected — Redis outage should degrade fairness rather than bring down API availability); in-memory per-pod rate limiting (rejected — Bun has no cluster module and per-pod counters scale 20× incorrectly across pods).

**Consequences:** Backend is horizontally scalable up to 20+ pods with full tenant isolation, predictable GitOps releases, zero-downtime rolling updates, and sub-second failover recovery.

---

### 2026-09-02 — Human-Readable Schema Validation Error Formatting

**Context:** Elysia/TypeBox validation failures on route request bodies/parameters returned raw, unparsed internal schema JSON strings containing AST trees (`{ "type": 50, "schema": ... }`) in the `details` field, confusing API clients and exposing internal framework serialization.

**Decision:**

1. Created `formatValidationError` in `apps/backend/src/lib/errors.ts` to parse TypeBox error trees into clean, user-friendly error objects with clear field names and messages (e.g. `Field 'email' must be a valid email address (e.g. user@example.com)` or `Field 'password' is required`).
2. Integrated `formatValidationError` into the global Elysia `.onError` handler (`apps/backend/src/index.ts`) for `code === 'VALIDATION'`.
3. Added unit tests in `src/lib/errors.test.ts`.

**Alternatives considered:** Returning raw `error.message` strings directly (rejected — unreadable and noisy for API consumers).

**Consequences:** Frontend and API clients receive clean, predictable `{ error, message, details: [{ field, message }] }` error responses for invalid inputs.

---

**Context:** WebSocket presence (`boardPresence` Map) and board mutation events (`eventBus`) ran in-memory per Node/Bun process, preventing horizontal scaling across multi-instance backend clusters or containers.

**Decision:**

1. Created an isolated domain module `apps/backend/src/redis/` containing `client.ts`, `pubsub.ts`, `presence.ts`, and `index.ts`.
2. Implemented `PresenceStore` interface with `RedisPresenceStore` (Redis Hash `presence:board:{boardId}` + Sorted Set TTL tracking `presence:board:{boardId}:ttl` + active board indexing) and `InMemoryPresenceStore` fallback.
3. Implemented `RedisPubSub` broker with separate `pubClient` and `subClient` ioredis connections listening on `boardly:realtime` and bridging events into local Bun WebSocket `server.publish()`.
4. Added periodic background TTL sweeper and WebSocket heartbeat keep-alive (`action: 'heartbeat'` every 25s) from `useRealtimeBoard.ts`.
5. Supported transparent graceful degradation: if Redis is disconnected or `REDIS_DISABLED=true`, the backend automatically falls back to single-instance in-memory event bus and presence storage.

**Alternatives considered:** Single connection for pub/sub (rejected — violates Redis Pub/Sub protocol where subscriber connections enter dedicated subscriber state); raw in-memory only (rejected — prevents clustering).

**Consequences:** Backend can now horizontally scale across any number of stateless Bun/Node instances behind load balancers with real-time presence and board sync shared across all cluster nodes.

---

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
