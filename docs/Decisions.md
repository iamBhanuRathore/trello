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

### 2026-10-04 — Review-before-clone submits to POST /cards/:id/clone with per-field overrides

**Context:** "Clone Task" and "Clone & Create Subtask" cloned on click from the overflow menu — the title was templated in the handler and persisted immediately, so the caller never got a moment to correct a title, list, assignee or due date. The fix opens a prefilled draft dialog and only persists on submit. The question is which endpoint the dialog submits to, and how unspecified fields behave.

**Decision:** the dialog submits to `POST /cards/:id/clone` (not `POST /cards`), so checklists, cover image and list-position handling keep their clone semantics — the review step must not quietly downgrade a clone into a fresh card. `CloneCardInput` gains optional overrides (description, dueDate, stageId, priorityId, storyPoints, estimateMinutes, assigneeId, labelIds) resolved by an `override(supplied, fallback)` helper: `undefined` falls back to the original, `null` deliberately clears. `labelIds` replaces the copied set (empty array means "no labels"); a single `assigneeId` replaces the copied assignees (`null` clears). Checklists stay read-only by design — a summary line ("N lists, M items, reset to not done"), never an editable payload. The `actor` that `getCard` needs for its private-task gate is now wired through the clone route; omitting it silently drops the gate, which is how the same trap leaked in the git helpers.

**Alternatives considered:** submitting a fresh `POST /cards` with copied fields (rejected — loses checklists/cover/position, a silent downgrade of what "Clone" means); revert-to-original diffing where only touched fields are sent (rejected — the per-field `undefined`/`null` fallback already gives that, with no dirty-tracking to maintain); making checklists editable in the dialog (rejected — checklist editing belongs to the task view, and partial checklist copies invite data loss).

**Consequences:** any new cloneable card field needs three coordinated touches — `CloneCardInput` + route schema, the dialog's seed state, and the submit payload — pinned by `cloneReview.contract.test.ts` (endpoint + wiring) and `cloneDialog.prefill.contract.test.ts` (seed/submit parity). Benchmark: Jira's "Clone issue" opens a prefilled create screen with the same nothing-saved-until-confirm contract, stated explicitly in the dialog subtitle.

### 2026-10-03 — File Size Discipline: small modules by default

**Context:** Feature work repeatedly landed in the largest existing component instead of a new sibling module — `TaskDetailView.tsx` (1324), `ChatMessageCard.tsx` (1119), `Billing.tsx` (1040) keep growing. Symptom is visible in the knowledge graph: those files form thin, weakly-connected communities, so the graph stops being a useful navigation index exactly where the code is most complex. Large files also inflate diff/review cost and make regressions hard to isolate.

**Decision:** Adopt an explicit size budget as a hard project rule (now AGENTS.md §10). A new file over 400 lines needs a stated reason; over 600 lines must be split before the change is considered done. Splitting is by concern — hooks, sub-components, column/config tables, service helpers into sibling modules — not by arbitrary line count. The backend already demonstrates the pattern: `organizations/service.ts` is a 9-line re-export facade over `org-common` / `org-manage` / `org-members` / `org-invitations`.

**Alternatives considered:** A hard line limit with no escape hatch (rejected — generated registries like `db/schema/index.ts` and `seedOrganization.ts` legitimately exceed it); leaving it as advisory style advice (rejected — this session's bug, an unguarded one-click delete in a 464-line page, was exactly the class of omission that survives in files nobody re-reads).

**Consequences:** New work splits by default instead of appending. Existing files over budget are not retroactively rewritten — refactoring `TaskDetailView` or `db/schema` is its own task, not a side effect of an unrelated feature.

### 2026-10-03 — Task-list importer now honors per-task labels

**Context:** Follow-up to the "missing tags" report: boards built through the structured-tasks importer always landed 100% tag-less — the schema had no labels field (`labelsCount: 0` hardcoded) while the Trello importer carried labels. Import parity gap, not a renderer bug.

**Decision:** `ImportTasksBody` accepts optional `labels: string[]` per task; the service creates each distinct name once on the new board (palette-cycled colors) and attaches them. Frontend forwards user JSON untouched, so no UI change was needed. Covered by a new importer test (2 labels created, Alpha linked ×2).

**Consequences:** Task imports can now carry tags; Trello path unchanged.

### 2026-10-03 — Board tags "missing" was missing data; fixed label cross-board hole

**Context:** Board showed most cards without tags. Verified renderer (`KanbanCardView`), `getBoardFull` labels join, cache bumps (`bumpForCard` → card+board) all correct; DB truth was 11/14 cards with zero `card_labels` rows while the board's 8 labels were intact — the `[Cloud]` cards were created through a path that assigns no labels, so there was nothing to render. No rendering fix was needed.

**Decision:** Fixed the adjacent real bug — `attachLabelToCard` verified the card but never the label, so a label from another board/org could be attached and render as a stray tag. It now enforces same-board via `verifyLabelAccess` + `getBoardIdForCard` (400 otherwise). Generic task import still creates label-less cards by design (`labelsCount: 0`) — bulk-labeling imports is parked, not built.

**Consequences:** Cross-board label leaks are rejected at the API; existing valid attachments unaffected.

### 2026-10-03 — Permission-gated UI (global flat list, hide destructive / disable reversible)

**Context:** Users without `board.update` saw Rename Board, submitted it, and got a 403 toast (screenshot). Frontend had no permission store — only ad-hoc `isAdmin` role checks; backend `requirePermission()` was the sole gate.

**Decision:**

1. Permissions are global (org-role only, verified: no board/project membership checks in any guard), served as a server-expanded flat `permissions[]` on `GET /auth/me`. One resolver (`lib/permissions-resolver.ts`) feeds the middleware, `/me`, and `/auth/permissions` — client holds zero role logic (`usePermissions` is `Set.has`, fail-closed).
2. `can(...keys)` is any-of (mirrors backend aliases `card.move∨card.update` etc.), `canAll(...)` is all-of. Gating lives at handler level; button/menu state derives from it.
3. Destructive actions (`*.delete/archive`, `member.remove`) hide entirely (dialogs unmounted, empty menu groups + separators dropped); reversible mutates render disabled with `title` + `aria-describedby` reason (tooltips die on disabled controls and touch).
4. Staleness accepted: role change can leave UI stale until window focus, next permission-403 refetch, or 60s TTL. 403 interceptor refetches `/me` quietly (no extra toast — caller's toast is the single message) and only for `PERMISSION_DENIED` codes.
5. `POST /cards` inline assignee/labels stay `card.create`-only (backend behavior) — never gate stricter than the backend. Phases/sprints had zero guards (real gap): now `project.read` reads + `sprint.*`/`phase.*` writes; their UI gates ship with the guard.
6. Permits cache uses a version epoch (`permver:`) for O(1) atomic invalidation; `/me` cache key bumped to `u:v2:` so pre-deploy entries are never served.

**Alternatives considered:** Per-resource `can` map on board/card responses (rejected — no scoped checks exist); client role short-circuit for owner/admin (rejected — rule would live in two places); separate `/permissions` query per render (rejected — extra waterfall); SCAN+DEL invalidation (rejected — O(N), non-atomic).

**Consequences:** No 403 roundtrips for gated controls; role/custom-role edits propagate via `bumpUserCache` + epoch bump. Private-task layering (`requireCardAccess` after `card.read`) stays backend-decided. Follow-ups: Playwright zero-403 spec, per-field disabled states in task subcomponents, remaining `isAdmin` replacements.

### 2026-10-03 — Workspaces Page God-Component Decomposition (Component Library Pattern)

**Context:** `apps/dashboard/src/pages/Workspaces.tsx` grew into a 1,121-line monolithic component containing tree query orchestration, KPI metrics calculations, inline project list & board grid rendering, and 6 uncoordinated modal dialogs (create/rename/delete workspace, create/rename/delete project, create/rename/delete board). Additionally, several dialogs did not adhere to the Rule 10 `useDialogClose` contract.

**Decision:**

1. Modularized into domain components under `apps/dashboard/src/components/workspaces/`:
   - `types.ts`: Color palette gradients (`BOARD_GRADIENTS`) and sanitized gradient resolution logic (`resolveBoardGradient`).
   - `WorkspacesOverview.tsx`: Top KPI summary overview tiles (workspaces, active projects, boards, My Tasks direct navigation).
   - `CreateWorkspaceDialog.tsx`: Workspace creation modal strictly adhering to Rule 10 `useDialogClose`.
   - `CreateProjectDialog.tsx`: Project creation modal adhering to Rule 10 `useDialogClose`.
   - `CreateBoardDialog.tsx`: Board creation modal with visual theme selection and Rule 10 `useDialogClose`.
   - `BoardsList.tsx`: Grid display of boards, hover menus, theme rename modal, and board delete confirmation modal with Rule 10 `useDialogClose`.
   - `ProjectsList.tsx`: Project container cards, action links (Docs, Reports, Phases, Sprints, Automation, Import), project rename/delete modals with Rule 10 `useDialogClose`, and embedded `BoardsList`.
   - `index.ts`: Barrel export.
2. Refactored `apps/dashboard/src/pages/Workspaces.tsx` into a lean coordinator (254 lines) managing tree queries, search param URL routing (`?createWorkspace=1`), workspace actions, and Rule 10 dialog closures.

**Alternatives considered:** Keeping dialogs inline — rejected to eliminate monolithic file bloat and ensure centralized, idempotent dialog lifecycle management.

**Consequences:** Clear modularity, cleaner re-render boundaries, 100% adherence to Rule 10 dialog close contract, and zero visual or functional regressions.

### 2026-10-03 — Backend Organizations Service Modularization (Domain Submodules Pattern)

**Context:** `apps/backend/src/modules/organizations/service.ts` grew to 1,138 lines containing organization metadata updates, member query filtering & count caching, member lifecycle (roles, deactivation/reactivation, session invalidation), and the complete invitation subsystem (token hashing, email dispatch, seat reservation check, acceptance).

**Decision:**

1. Decomposed into cohesive domain submodules under `apps/backend/src/modules/organizations/`:
   - `org-common.ts`: Central re-export of `httpError` (used monorepo-wide), role enums (`ALLOWED_ORG_ROLES`, `AllowedOrgRole`), and invitation token hashing (`hashInviteToken`).
   - `org-manage.ts`: Organization query with plan resolution (`getOrg`, `loadOrg`), cached updates with explicit column picking (`updateOrg`).
   - `org-members.ts`: Filtered member listing with compound cache keys (`listMembers`, `countMembers`), role modifications (`updateMemberRole`), soft-delete deactivation and reactivation with transactional session revocation & automated emails (`deactivateMember`, `reactivateMember`), force logout (`forceLogoutUser`), member activity metrics aggregation (`getMemberActivitySummary`), and removal (`removeMember`).
   - `org-invitations.ts`: Single and bulk member invitations with seat quota verification (`inviteMember`, `bulkInviteMembers`), pending invitation management (`listPendingInvitations`, `resendInvitation`, `revokeInvitation`), token preview (`previewInvitation`), and invitation acceptance (`acceptInvitation`).
2. Retained `service.ts` as a 100% backward-compatible facade re-exporting all submodules.

**Alternatives considered:** Keeping all organization code in a single file — rejected due to sprawl and risk of regressions across widespread callers of `httpError` and member queries.

**Consequences:** Clean separation of concerns, zero breaking changes to existing routes or tests, submodules cleanly sized (<450 lines), and 100% passing test suites.

### 2026-10-03 — Backend Auth Service Modularization (Domain Submodules Pattern)

**Context:** `apps/backend/src/modules/auth/service.ts` reached 1,198 lines containing token pair generation, sliding refresh token families, grace window reuse handling, family burning, user signup/signin workflows, profile updates, password hashing, RBAC permissions categorization, and invitation acceptance.

**Decision:**

1. Decomposed into cohesive domain submodules under `apps/backend/src/modules/auth/`:
   - `auth-common.ts`: Common error utility (`httpError`), cryptographic token hashing (`hashToken`, `hashRequestMeta`), duration converters (`durationToMs`), and lifetime configs (`refreshLifetimes`, `refreshReuseWindow`).
   - `auth-tokens.ts`: Token pair issuance (`issueTokenPair`), sliding rotation with concurrency grace handling (`refreshTokens`), family burns (`burnRefreshFamily`), and session revocations (`revokeAllUserSessions`, `signOut`).
   - `auth-lifecycle.ts`: Account registration with default subscription & team role seeding (`signUp`), credential verification & login history tracking (`signIn`).
   - `auth-user.ts`: User self-profile query (`getMe`), profile updates (`updateProfile`), password management with cross-session burn (`changePassword`), and RBAC permission aggregation (`getMyPermissions`).
   - `auth-invitations.ts`: Token validation (`getInvitationInfo`) and invitation acceptance transaction (`acceptInvitation`).
2. Retained `service.ts` as a 100% backward-compatible facade re-exporting all submodules.

**Alternatives considered:** Keeping all auth routines in one file — rejected due to high cognitive load, mixed responsibilities (token crypto vs user profile vs invite flow), and difficulty reviewing changes.

**Consequences:** Clear separation of concerns, zero breaking changes to routes or tests, submodules cleanly sized (<350 lines), and 100% passing test suites.

### 2026-10-03 — Backend Chat Service Modularization (Domain Submodules Pattern)

**Context:** `apps/backend/src/modules/chat/service.ts` expanded to 1,727 lines spanning 6 separate sub-domains: channel management, membership and permissions, message CRUD, reactions, file attachments, and Telegram-parity features (pinning, forward, seen-by).

**Decision:**

1. Decomposed into cohesive domain submodules under `apps/backend/src/modules/chat/`:
   - `chat-common.ts`: Shared error classes (`httpError`), membership assertions (`requireChannelMembership`), and channel admin guards (`requireChannelAdmin`).
   - `chat-channels.ts`: Channel lifecycle, DM deduplication, group channels, user channel listing with batched unread counters, details, mutual channels, and project link/unlink operations.
   - `chat-members.ts`: Member invite, role management, ownership transfers, leaving/kicking, and read receipts.
   - `chat-messages.ts`: Message dispatch, edits, soft deletions, cursor-based streaming with batched enrichments (attachments, reactions, reply counts, quoted previews), thread replies, system messages, and project event fan-out.
   - `chat-reactions.ts`: Reaction toggling and real-time event broadcasting.
   - `chat-attachments.ts`: Attachment creation, S3 presigned URL generation, and file size/type validation.
   - `chat-telegram.ts`: Message pinning, pinned messages query, and cross-channel message forwarding with provenance.
2. Maintained `service.ts` as a 100% backward-compatible facade re-exporting all submodules.

**Alternatives considered:** Keeping all operations in a single file — rejected because of code sprawling, coupled logic, and difficulty maintaining unit/integration test isolation.

**Consequences:** Clear separation of concerns, zero breaking changes to routes or tests, submodules cleanly sized (<450 lines), and 100% passing test suites.

### 2026-10-03 — ChatFeed God-Component Decomposition (Feed Subcomponents Pattern)

**Context:** `apps/dashboard/src/components/chat/ChatFeed.tsx` grew into a 1,297-line monolithic component coordinating channel header and direct message presence, pinned message navigation banner, multi-select action toolbar, live virtualized message scroll management, and composer with rich attachments and mention autocompletion.

**Decision:**

1. Modularized into domain subcomponents under `apps/dashboard/src/components/chat/feed/`:
   - `ChatFeedHeader.tsx`: Channel header with metadata, direct message presence, layout toggle (classic/bubbles), search bar, and details toggle.
   - `PinnedMessageBanner.tsx`: Pinned message notification banner with jump button and unpin action.
   - `SelectModeToolbar.tsx`: Multi-select batch action toolbar (forward, delete, cancel).
   - `ChatFeedComposer.tsx`: Input textarea, mention autocomplete popup, attachment tray, formatting shortcuts, and send trigger.
   - `index.ts`: Barrel export.
2. Refactored `ChatFeed.tsx` into a lean coordinator (442 lines) managing queries, scroll restoration, reactions, pinning, and message deletion modals.
3. Preserved 100% backward compatibility for all props, styles, and handlers.

**Alternatives considered:** Keeping all sub-elements inline — rejected due to readability issues, coupled re-render cycles, and violation of monolithic file size standards.

**Consequences:** Clear separation of concerns, faster Vite builds, maintainable subcomponents each under 400 lines, and zero UI regressions.

### 2026-10-03 — Varchar Status Columns: TS Typing via `.$type`, Not `pgEnum`

**Context:** Eight `varchar` columns (media status/scanStatus ×2 tables, git_links kind/state, card access, automation run status/reason, seat changes, inbound email) carried closed lifecycles as raw string literals — no autocomplete, typos compile and fail silently (fail-open/closed risk in the media scan gate).

**Decision:** Canonical const-object + union + `*_VALUES` tuple in `@boardly/shared-types` (existing erasableSyntaxOnly-safe pattern); Drizzle `.$type<Union>()` on columns; `Enum.Member` access at every site; `t.Enum` on the one true status-bearing input (runs-history query). Inputs strict, responses typed-but-non-throwing (one drifted row can't 500). `skipped` kept in `MediaScanStatus` (backend-written, prod-emittable); inbound union widened to 6 (column stores outcomes by design — split deferred); open-ended `action` fields stay `string`.

**Alternatives considered:** Full `pgEnum` migration (DB-level rejection) — rejected: needs `ALTER TYPE ... USING` + backfill + new migration while value sets were still drifting; typing gives the typo-safety today at zero downtime. Future upgrade path: `CHECK ... NOT VALID` constraints after staging/prod data inventory.

**Consequences:** Typos are compile errors (CI-gated type-tests); dashboard now depends on `@boardly/shared-types` (new edge); runs-history query returns 422 on unknown status instead of ignoring the filter.

### 2026-10-03 — Admin Users God-Component Decomposition (Domain Slice Pattern)

**Context:** `apps/dashboard/src/pages/admin/Users.tsx` grew into a 1,548-line monolithic component containing 5 separate dialogs/drawers (single/bulk invites, role modification, deactivation reason form, removal confirmation, and member intelligence drawer) as well as two table column definitions inline. This led to cascading re-renders across the page on simple keystrokes, and violated Rule 10 by using loose `useEscapeKey` rather than the centralized `useDialogClose` contract.

**Decision:**

1. Modularized the page into a domain slice under `apps/dashboard/src/pages/admin/users/`.
2. Extracted sub-components into `components/` (`InviteMemberDialog`, `ChangeRoleDialog`, `DeactivateMemberDialog`, `RemoveMemberDialog`, `MemberActivityDrawer`).
3. Extracted table columns into `columns/` (`memberColumns.tsx`, `invitationColumns.tsx`).
4. Converted all dialogs and the activity drawer to strictly adhere to the `useDialogClose` contract.
5. Replaced `Users.tsx` with a clean 2-line facade exporting `UsersPage`.

**Alternatives considered:** Keeping the monolithic file with inline memoization (`React.memo`) — rejected because it fails to address code sprawl, maintainability, and testing isolation.

**Consequences:** Render isolation, zero breaking changes to existing routes, all components under 500 lines, and 100% adherence to Rule 10.

### 2026-10-03 — EnterpriseDataGrid Migration to Modern TanStack Table v9 API

**Context:** The previous `@boardly/ui` `EnterpriseDataGrid` component relied on hand-rolled sorting, manual pagination, and custom filtering logic. This was bug-prone across corner cases (multi-column sorting, facet calculations, column visibility toggle) and incurred maintenance overhead. An initial migration to TanStack Table imported deprecated functions (`useLegacyTable`, `get*RowModel`) from `@tanstack/react-table/legacy`, which triggered deprecation warnings and added unnecessary legacy bridge weight.

**Decision:**

1. Migrate `packages/ui/src/components/enterprise-data-grid.tsx` completely to native TanStack Table v9: `useTable` and modular `tableFeatures` (`columnFilteringFeature`, `rowSortingFeature`, `rowPaginationFeature`, `columnVisibilityFeature`, `columnFacetingFeature`, `globalFilteringFeature`).
2. Pair features with tree-shakeable row model factories (`createFilteredRowModel`, `createSortedRowModel`, `createPaginatedRowModel`, `createFacetedRowModel`, `createFacetedUniqueValues`). Zero deprecated imports from `@tanstack/react-table/legacy`.
3. Preserve 100% backwards-compatibility for existing consumer call-sites (`Tenants.tsx`, `PlatformUsers.tsx`, `Users.tsx`, `AuditLogs.tsx`, `Timesheets.tsx`) with zero breaking changes to prop interfaces or column definitions.
4. Support column visibility toggle menus (`DropdownMenuCheckboxItem`), Shift-click multi-sorting, debounced global filtering, faceted unique values for column filter popovers, and client/server-mode toggles.

**Alternatives considered:** Keeping hand-rolled table logic (rejected due to bug surface and missing enterprise capabilities); using `@tanstack/react-table/legacy` `useLegacyTable` (rejected due to deprecation warnings and future-proofing requirements).

**Consequences:** Zero deprecation warnings, smaller tree-shaken bundle footprint, enterprise-grade multi-sort and column toggle capabilities out of the box, and full test/typecheck parity across all frontends.

### 2026-10-03 — Backend Entrypoint & Service Architecture Refactor (Singleton Redis & Modular Entrypoint)

**Context:** `apps/backend/src/index.ts` had grown to 420 lines combining inline DDL schema backstops, verbose CORS headers and origin resolution, an unorganized chain of 37 domain routes, loose mutable Redis connection handles, and scattered background worker timers. This made the server entrypoint difficult to navigate, test, and maintain.

**Decision:**

1. **Redis & PubSub Singletons (`src/redis/client.ts`, `src/redis/pubsub.ts`):** Encapsulated Redis connection state (`pubClient`, `subClient`, `dataClient`, `isAvailable`, `isConnecting`) and PubSub broadcast subscriptions in `RedisService` and `PubSubService` classes using `getInstance()`. Backward-compatible functional wrappers (`connectRedis`, `disconnectRedis`, `getDataClient`, etc.) are preserved for callers.
2. **Worker Lifecycle Singleton (`src/lib/workers.ts`):** Created `WorkerService` to orchestrate background housekeeping jobs (audit retention, refresh token cleanup, media scanning, media GC) and event listener setup (`setupNotificationListeners`, `setupWebhookDispatcher`, `setupAutomationEngine`, `setupProjectAutomationEngine`) with unified `start(db)` and `stop()` lifecycle methods.
3. **Database Bootstrap Backstops (`src/db/bootstrap.ts`):** Moved all startup DDL checks, enum migrations, and legacy column backstops out of `index.ts` into `runBootMigrations(db)`.
4. **CORS Middleware (`src/middleware/cors.ts`):** Isolated origin allowlist resolution, W3C credentials validation, and PNA headers in a dedicated middleware module with re-exports from `index.ts` for backward compatibility.
5. **Domain Route Aggregator (`src/routes/v1.ts`):** Modularized and grouped the 37 `/v1` domain routes into cohesive operational domains (Auth/Identity, Workspaces/Projects, Boards/Tasks, Realtime/Communication, Automations/Webhooks, Platform/System).
6. **Streamlined `index.ts`:** Reduced `index.ts` from 420 lines to ~130 lines focused purely on server startup, middleware binding, and graceful draining/teardown.

**Alternatives considered:** Heavy Dependency Injection (DI) framework (e.g. Inversify or TypeDI) — rejected as excessive complexity and runtime overhead for a Bun + Elysia codebase; module-level loose exports — rejected due to lack of encapsulation and state coordination.

**Consequences:** Clear separation of concerns, encapsulated state, simplified testing and boot diagnostics, and zero breaking changes to external contracts or `@boardly/backend` Eden types.

### 2026-09-29 — Project Automation Engine (project-scoped WHEN/IF/THEN)

**Context:** Per-project autonomous routing was needed (front-end label → frontend dev, entry into Testing → round-robin tester subtask). Board Butler-style rules are board-scoped with fixed assignees; static `assignment_rules` only fire on creation. Benchmark: Jira Automation (project scope, WHEN/IF/THEN, audit log) for architecture, Trello Butler for configuration ease.

**Decision:** Project scope, event-driven (`card.moved/created/labeled` → hydrate → enabled-rules lookup → trigger on event+list-name → label-name conditions → ordered actions). Hardening: (1) bounce guard as a partial unique index `(parent, rule, action) WHERE open` — DB-enforced so same-millisecond duplicates are impossible (loser gets 23505 → OPEN_SUBTASK skip); (2) RR cursor per (rule, action), locked via `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE`, pool re-resolved from live membership each fire; (3) loop protection in two layers — `AsyncLocalStorage` depth (abort past 3) + chain for A→B→A, plus `automation:{ruleId}` system actors whose events never retrigger; (4) every execution incl. skips logged to `automation_rule_runs` with reason codes (CONDITION_UNMET, OPEN_SUBTASK, LOOP_GUARD, EMPTY_POOL, ALREADY_ASSIGNED, DUPLICATE_EVENT); (5) `needs_attention` flag set when a referenced role/user is deleted (wired into role-delete + member-deactivate); (6) assignment is fill-if-unassigned unless `overrideExisting`; automation writes use the system actor (FK columns coerced to NULL) with `🤖 Rule 'X'` history lines under the rule creator. Legacy board `automations` kept; its routes were auth-only and now require `automation.manage`. Caps: 50 rules/project, 10 actions/rule, shared Zod unions backend+builder.

**Alternatives considered:** App-level check-then-insert for the bounce guard (rejected — races); in-memory locks (rejected — don't survive multi-instance); single cursor per rule (rejected — two pool actions would steal turns); label IDs in conditions (rejected — labels are board-scoped rows, name is the only cross-board identity).

**Consequences:** Builder UI (Phase 3: WHEN/IF/THEN page, templates, dry-run preview, coverage auto-fix) reads CRUD/toggle/runs/test/context APIs. Parked post-v1: least-loaded assignment, SLA/escalation, webhook actions, import/export.

### 2026-09-28 — Monotonic Change Cursor, Hot-Path Indexes, Log Retention (5.3)

**Context:** (1) The reconnect feed paged on `updated_at`, but a batched rewrite (position rebalance) stamps every row with the same millisecond — `updated_at > cursor` silently dropped the tail of the batch. (2) `audit_log`/`activity_log` were primary-key-only, so each audit page seq-scanned twice (rows + `count(*)`). (3) Chat message enrichment was per-row (~150 queries for a 50-message page). (4) Several list endpoints returned unbounded row sets; append-only logs grew forever.

**Decision:**

1. **Single global `change_seq`** — one `BIGSERIAL` sequence + `BEFORE UPDATE` trigger on both `cards` and `lists` (0029). One monotonic ordering across both tables means the feed cursor is a single integer, `nextCursor` is exact, `hasMore` can't lie, and ties are impossible. `/boards/:id/full` now returns `changeCursor` so the client seeds its position for free. Non-numeric cursors 400 instead of silently returning the whole board.
2. **Batched chat enrichment** — attachments, reactions, reply counts, and quoted replies are four set-based queries per page (measured 153 → 6 queries for a 50-message page; guarded by a query-count test). Thread replies got the same treatment.
3. **Hot-path index sweep** (0031, mirrored in the Drizzle schema): `(channel_id, created_at DESC)` message feed, `(parent_message_id, created_at)` threads, partial `cards(list_id, position) WHERE active`, audit/activity org+paging+filters, `notifications(user_id, created_at DESC) WHERE is_read = false` and `WHERE is_dispatched = false`.
4. **Shared `clampLimit`** (`src/lib/pagination.ts`) — every list endpoint clamps its own page (default 50, hard max 200; `listCards`/`listSprintCards` get a 500 safety valve); `?limit` is now accepted on cards/comments/attachments/subtasks/thread-replies/pinned.
5. **Retention over partitioning** — `modules/audit/retention.ts` prunes audit (730d), activity (365d), and read notifications (180d) in batched `DELETE … WHERE id IN (SELECT … LIMIT n)` statements, wired into boot + 6h interval and cleared on shutdown. Unread notifications are never pruned. Declared range partitioning was rejected: it complicates every FK and the pooled-connection path, and a batched delete handles a table this size. Revisit when audit rows exceed ~50M.

**Alternatives considered:** composite `(updated_at, id)` cursor per table (two cursors, still lossy on the `cards`+`lists` union); client-side "refetch everything on reconnect" (simple, but O(board) per flap).

### 2026-09-28 — OCC Ordering + Reconnect Gap-Fill (Phase 2)

**Context:** Simultaneous card moves overwrote each other (last-write-wins blind update); repeated midpoint inserts risk float-precision exhaustion with no compaction; WS drops forced full board refetches with no retry loop.

**Decision:**

1. `version INT DEFAULT 1` on cards+lists (`0027`); `moveCard`/`updateList` accept optional `expectedVersion` — conditional `UPDATE ... WHERE version=` +1, stale writers get 409 + current server truth (`VERSION_CONFLICT`). Legacy callers omitting the version keep last-write-wins (backward compatible).
2. Precision safety: one `MIN(gap)` window aggregate per move; rewrite at `i*65536` in a single transaction (versions bumped so interleavers 409) when min gap < 0.001.
3. `GET /boards/:id/changes?since=` (capped 500, indexed `(list_id,updated_at)`/`(board_id,updated_at)` via `0028`) feeds reconnect gap-fill; WS hook reconnects with capped exponential backoff, merges deltas into the `['board','full']` cache (unknown ids or cap-hit fall back to full invalidate), and stamps `expectedVersion` on moves with a 409-specific info toast (optimistic hook's `onErrorExtra` can now suppress the default toast by returning true).
4. Live WS frames also patch the cache in place instead of invalidating; fixed the dead `['lists',boardId]` invalidate key and the `https://→wsps://` URL bug, and stabilized the effect dep on `userId`.

**Alternatives considered:** Server-side position assignment (rejected — client midpoint keeps drag math local, version guards the race); CRDT/Lexorank keys (rejected for now — fractional + OCC + rebalance covers company-scale; revisit past ~10k cards/list).

**Consequences:** All mutation broadcasts now carry `version`; dashboard must render from it (added to Kanban types).

### 2026-09-28 — Team Roles & Static Assignment Rules (Phase 1b backend)

**Context:** No per-company role model (Lead/Developer/Tester) and no default-assignee policy existed — only a single static `intakeForms.defaultAssigneeId`. Needed company-admin configurability with static (non-smart) resolution.

**Decision:**

1. Additive schema (`0026_team_roles_assignment`): `organization_role_members` (multi-role per member, legacy enum tier untouched), board-scoped `components` (+`card_components`), `assignment_rules` (one row per scope level), org policy columns (`allowUnassigned`, `defaultAssigneeStrategy`, `defaultAssigneeId`), role `description`/`isDefault`.
2. Lead/Developer/Tester seeded per org (signup hook best-effort + `listRoles` self-healing backfill for pre-existing orgs); permission sets derive from `@boardly/shared-types` (Lead = member baseline + board.update/card.delete/sprint.assign; Tester = verify-only subset).
3. Resolution precedence in `resolveDefaultAssignee`: explicit > component rule > component lead > board rule > project rule > org rule > org default user > unassigned (422 when `allowUnassigned=false`). Role targets resolve to earliest-assigned active holder; stale user targets fall through. `createCard` links board-scoped components and auto-assigns; explicit assignee still validated as org member (also fixes `assignedBy` actor bug).
4. Migration hygiene: drizzle's migrator only applies journal entries with `when` newer than the last applied — backdated entries are silently skipped (hit during dev). Keep `when` monotonic; hand-write additive migrations in the `0025` style to avoid snapshot-drift diffs.

**Alternatives considered:** Global role catalog (rejected — per user decision, org-scoped); round-robin/smart routing (rejected — static only); RLS-backed enforcement (deferred, app predicates canonical).

**Consequences:** New `/v1/components/*` + `/v1/roles/members/*` APIs; frontend admin UI for roles/rules still to do; `requirePermission` union over team-role rows still to do (coarse enum tier still gates).

### 2026-09-28 — Tenant Enforcement: App-Layer Org Predicates + 404 Fail-Closed + Org-Prefixed Cache Keys

**Context:** Audit found card sub-resource routes (comments, attachments, participants, watchers, checklists, labels) and most chat ops taking bare IDs with no `organizationId` check — any authenticated user with a UUID could read/write cross-org (IDOR). Cache hits could also serve one org's board/card payload to another (`rest` had no org). `toggleReaction` had no membership check at all.

**Decision:**

1. Every tenant-scoped service function takes `organizationId` and verifies it first (`verifyCardAccess`, `verifyChecklistAccess`, `verifyLabelAccess`, `requireChannelMembership` with org match); cross-org fails with 404 (not 403) to avoid an existence oracle.
2. Added-user invariant: assignees/participants/channel invitees must be org members; group creation silently drops cross-org invitees; mentions only notify org members.
3. Coarse RBAC on all card sub-routes (`card.read` GETs, `card.update` mutations, `card.assign` for assignees); message list capped at 50, my-tasks at 100; card uploads capped at 25 MB matching chat; local-upload/file endpoints 404 outside dev/test.
4. Cache `rest` must start with `{orgId}:` (documented in `lib/cache.ts`); version keys stay bare IDs.

**Alternatives considered:** Postgres RLS as the fix (rejected as sole fix — `withOrgContext` is currently dead code; app-layer predicates stay canonical, RLS later as defense-in-depth); 403 on cross-org (rejected — confirms resource existence).

**Consequences:** ~30 service signatures changed; routes/gateway/tests updated; new IDOR regression tests in `card.test.ts` + `chat.test.ts`. Next: same treatment verified for remaining modules, then roles/assignment-rules (Phase 1b) and OCC ordering (Phase 2).

### 2026-09-25 — Calendar Write UX: Popovers over Modals, Scoped Google Writes

**Context:** The calendar needed detail views, quick-create, and rescheduling of Google meetings. Two choices: full modals vs anchored popovers, and how far Google-write permissions should reach.

**Decision:**

1. **Popovers, not modals:** event details and quick-create render in viewport-clamped portal popovers (Escape/outside-click dismissal, same convention as card hover previews). A modal would steal context on a dense grid; the popover keeps the time slot visible while acting.
2. **Google writes stay user-scoped:** create/patch/delete act only on the connector's own calendar via stored refresh tokens — never service-wide. Pushed task links store `html_url` so tasks can deep-link back to Google.
3. **Press-then-drag:** click selects (popover), 5px movement promotes to drag. Distinguishes inspection from rearrangement without modifier keys, matching Google Calendar.

**Alternatives considered:** Full CardModal-style dialogs for event details (rejected — overkill, loses grid context); Google push webhook channels for instant inbound sync (rejected — needs public HTTPS; polling + instant push covers v1, same call as before).

**Consequences:** All calendar interactions complete without leaving the grid. Outlook later copies the same three endpoints.

### 2026-09-25 — GitHub Automations via Webhooks (No API Dependency)

**Context:** 4.3 wanted repo sync, ticket auto-linking, PR-driven card movement, and review badges. A full GitHub App (private keys, JWT, installation tokens, Octokit) is heavy ops for v1; polling the REST API is rate-limited and latent.

**Decision:** pure webhook ingestion. GitHub POSTs push/PR/review payloads (already containing commits, titles, branch refs, states) to a public HMAC-verified endpoint; everything derives from payload data. Ticket keys parsed from branch/commit/PR text; stage moves resolve the org's first `in_progress`/`done` category stage; comments authored by a dedicated no-login bot user; per-repo secrets AES-GCM sealed. Same-repo-multi-org fan-out with any-secret-verifies routing.

**Alternatives considered:** GitHub App + Octokit (rejected for v1 — webhook payloads already carry every field the features need; add when check-runs or file contents are required); polling cron (rejected — latent, rate-limited).

**Consequences:** Zero GitHub API surface, near-instant automation, works on any plan tier. GitLab follows the same shape (different HMAC header + payload mapping). Webhook secrets must be saved at connect time (shown once).

### 2026-09-24 — Google Calendar Sync + Time-Blocking (Direct API, Motion/Cron Parity)

**Context:** Roadmap 4.1 demanded calendar views, drag time-blocking, 2-way provider sync, and sprint/milestone overlays. The build-vs-integrate choice: full custom sync engine vs Google Calendar API directly.

**Decision:**

1. **Google API for sync, owned UI for views:** `googleapis` on the backend (`modules/calendar/`: `google.ts` OAuth + AES-GCM token crypto, `service.ts` sync/feed, `routes.ts`); hand-rolled Month/Week/Day grids on the frontend (zero date libs beyond `date-fns`, matching the hand-rolled SVG chart convention). No FullCalendar — bundle + theming cost for what pointer math covers.
2. **Per-user connections, not org integrations:** OAuth consent is personal, so `calendar_connections` is user-scoped with unique `(user_id, provider)`; refresh tokens AES-GCM encrypted (`CALENDAR_TOKEN_KEY`). The existing org `integrations` mock catalog was left untouched.
3. **Scheduling lives on cards:** `scheduled_start`/`scheduled_end` columns + `PATCH /calendar/cards/:id/schedule` (validates, reuses `updateCard`, best-effort push to actor's Google). Event links tracked in `calendar_event_links` for upsert/delete.
4. **Incremental pull, on-demand push:** syncToken-based incremental pull when un-ranged (410 → one full re-pull); push on schedule + manual "Sync now". Google push webhooks deferred (needs public HTTPS channel setup — polling + instant push covers v1).
5. **Outlook deferred:** same connection/sync pattern will apply; Roadmap bullet split to track it separately.

**Alternatives considered:** FullCalendar (rejected — bundle/theming); WorkOS-proxied Google tokens (rejected — direct OAuth gives proper `calendar.events` scope + refresh tokens); syncing via org-level service account (rejected — per-user consent matches Google's model and avoids domain-wide delegation setup).

**Consequences:** 4.1 done except Outlook. Any new provider copies `google.ts` + connection row. Server is "configured" only when `GOOGLE_CLIENT_ID/SECRET` + `CALENDAR_TOKEN_KEY` are set; UI degrades to local-only scheduling otherwise.

### 2026-09-24 — Channel→Project Activity Feed & Chat File Uploads (Slack Parity)

**Context:** Roadmap 4.2 had one open bullet (channel-to-project linking with automated activity feed), and chat attachments were half-wired: `sendMessage` accepted `attachmentIds` but nothing created `chat_attachments` rows and the composer had no attach button. Two latent gaps surfaced along the way: migration `0017_chat_reply_to.sql` shipped without a journal entry (fresh DBs via `db:migrate` silently skip it), and bare `bun run db:migrate` migrates whatever `DATABASE_URL` resolves to rather than the documented dev DB.

**Decision:**

1. **Linking:** `chat_channels.project_id` FK (`ON DELETE SET NULL`, migration `0018`), link/unlink endpoints restricted to channel Owner/Admin with same-org project verification; DMs rejected with 400 (checked before the admin gate so the guard is reachable — DM members are never admins). `getChannelDetails` embeds `{id, name, key}`.
2. **Activity feed as system messages:** `chat_messages.is_system` flag rendered as centered pills (hover actions hidden). `postSystemMessage` bypasses announcement-only mode so automation feedback always lands; `notifyProjectChannels` fans card created/moved/archived events to linked channels. Cards-service hooks are fire-and-forget (`.catch(() => {})`) — feed must never break mutations.
3. **Uploads:** `chat_attachments.message_id` nullable + `channel_id`/`uploaded_by` (backfilled from messages); `POST /channels/:id/attachments` returns presigned URL + staged row, composer uploads then sends ids. `sendMessage` link scoped to same channel (previously any attachment id could be hijacked cross-channel). `generatePresignedUploadUrl` gained an optional key-scope param (`chat/<channelId>` vs default `cards/<cardId>`); local-dev fallback endpoints are key-agnostic.
4. **Migrations:** retro-journaled 0017 (idempotent, safe) and journaled 0018, so `db:migrate` covers fresh environments.

**Alternatives considered:** Separate activity table (rejected — feed already renders the message stream; new table = new API + migration for identical UX); blocking/transactional feed writes (rejected — chat outage must not break card mutations).

**Consequences:** 4.2 fully complete. Rule: every new `chat_*` migration must carry a journal entry; verify target DB after `db:migrate` when `DATABASE_URL` is implicit.

### 2026-09-15 — Universal LIFO Escape Stack & Cross-Platform Keyboard Shortcuts

**Context:** Users required full keyboard accessibility matching Slack, Linear, and Microsoft Teams: pressing Escape should predictably dismiss active modals and drawers without closing underlying surfaces, and common productivity keybindings (command palette, shortcuts cheatsheet, channel navigation, and Up-arrow editing) were needed for daily operations.

**Decision:**

1. Implemented a capture-phase Last-In-First-Out (LIFO) stack in `packages/ui/src/components/dialog.tsx` and `apps/dashboard/src/hooks/useEscapeKey.ts`. When Escape is pressed, only the topmost active modal/drawer pops, preventing multi-modal cascade closures.
2. Built a searchable `KeyboardShortcutsModal.tsx` accessible via `?` (Shift+/) or `⌘/` / `Ctrl+/`.
3. Created `useGlobalShortcuts.ts` to manage non-input chords (`G` then `C` for Chat, `G` then `B` for Boards, `G` then `T` for Tasks), channel cycling (`Alt+↑`/`Alt+↓`), and quick creation hotkeys.
4. Implemented Up-arrow message editing in `ChatFeed.tsx` and `ChatMessageCard.tsx` when the composer is empty.

**Alternatives considered:** Native bubbling listeners (rejected — form inputs and nested dialogs often stopped bubbling or closed simultaneously); third-party hotkey libraries (rejected — lightweight custom hooks avoid bundle bloat and integrate natively with React 19).

**Consequences:** Rock-solid modal dismissal order across stacked dialogs and drawers; zero mouse dependency for common day-to-day collaboration tasks.

### 2026-09-14 — Board page aggregate + loading states (kills board N+1)

**Context:** Board page (`/b/:id`) fired 1× board + 1× lists + N× `cards?listId` (each with 6 enrichment queries) via `useEffect`, with no `isLoading`/skeleton/error/empty states — blank UI while fetching.

**Decision:** `GET /v1/boards/:id/full` returns `{board, lists:[{...list, cards:[enriched]}]}` in ~8 Neon queries, cached as one payload under existing `bv:{board}` (`boardfull` scope) so all current bumps invalidate it. `BoardView.tsx` uses single `['board','full',id]` query (`staleTime 30s`) with skeleton columns, error+retry, and empty-list states; mutations invalidate the full key.

**Alternatives considered:** Per-list `listCards` cache only (kept — still serves other surfaces, but first board load still paid N× Neon misses).

**Consequences:** Board loads skip Neon on hit (1 Upstash RTT); miss cost unchanged (~8 queries once per 60s).

### 2026-09-14 — Aggressive breadth caching + workspaces tree (free-tier latency)

**Context:** Workspaces page fired 18 requests (2× `/me` ~1s, 5× `projects?ws` up to 1.42s, 8× `boards?project` up to 1.03s) against Neon free + Upstash free. Per-request Neon RTT dominated.

**Decision:** Cache breadth, not TTL length: `ov/wv/pv` versions (`cachedOrgRead/WorkspaceRead/ProjectRead`, 60-120s) for workspaces/projects/boards/getBoard/labels; TTL-only (`cachedTTL`) for `getMe` 60s, notifications 20s, prefs/push/saved 60s, search 30s, members 30s, org 60s. New `GET /v1/workspaces/tree` returns workspaces→projects→boards in 3 queries cached as one payload (60s); dashboard `Workspaces.tsx`/`AppSidebar.tsx` use it with `staleTime 30s`, eliminating N+1. Fixed stale gaps first: board/label/list-rename/list-delete/subtask-parent/trash bumps.

**Alternatives considered:** Longer TTLs (rejected — stale-board risk); per-endpoint caching only without tree (kept as fallback, but 13 Upstash RTTs still cost vs 1).

**Consequences:** Repeat loads skip Neon (1 Upstash RTT ~50-100ms); mutations pay version bumps; 20-60s stale windows on inbox/search/members (documented); free Upstash stays <256MB via short TTLs, no SCAN.

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

---

### 2026-09-15 — Enterprise Chat & Cross-Timezone Collaboration Architecture (Teams Parity)

**Context:** The platform required an enterprise-grade messaging and collaboration experience on par with Microsoft Teams, Slack, and Linear. Requirements included 1-on-1 Direct Messages, public/private group channels, 3-tier admin governance (Owner, Admin, Member), mutual shared groups inspection between teammates, timezone and working hours presence tracking (`available`, `busy`, `away`, `leave`, `offline`), bidirectional task card discussions and mentions, and a unified experience accessible both as a full workspace (`/chat`) and as a floating messenger dock across all board views.

**Decision:**

1. **Modular Socket Gateways inside Backend**: Instead of introducing operational complexity, duplicated authentication, and network latency with a standalone socket microservice, real-time WebSockets were implemented directly in `apps/backend` via modular gateway handlers (`chat.gateway.ts`, `presence.gateway.ts`) multiplexed through Bun uWebSockets and Redis Pub/Sub (`initializeRedisPubSub`).
2. **Deterministic Timezone & Working Hours Presence Engine**: Implemented `presenceService.ts` to compute localized user schedules using `Intl.DateTimeFormat`. User presence transitions automatically between `available` and `away` (off-hours) based on weekly work windows, with support for manual status overrides with expiration.
3. **Off-Hours Composer Banner with Silent Delivery**: When messaging teammates outside their localized working hours, the UI displays an off-hours banner with a one-click silent send toggle, preventing intrusive after-hours push notifications.
4. **Mutual Shared Groups Discovery**: Implemented a dedicated grouped SQL query (`getSharedChannels`) allowing users to inspect mutual group memberships directly from any teammate's profile in the details drawer.
5. **Dual-Mode UI (Full Workspace + Global Floating Dock)**: Delivered a full-screen Teams-style workspace on `/chat` with collapsible rails, thread drawers, and channel details, paired with a persistent floating bottom-right dock (`<GlobalChatDock />`) across all boards and docs with live unread badge syncing.

**Alternatives considered:**

- Standalone Socket Microservice (rejected — would add significant deployment overhead, port multiplexing, and redundant JWT auth logic with zero performance gain under Bun's uWebSockets engine).
- Polling-only REST chat (rejected — fails the enterprise real-time requirement for typing indicators, instant message delivery, and live presence).

**Consequences:** Seamless, low-latency collaboration across timezones with zero extra infrastructure overhead, robust 3-tier group governance, and bidirectional task integration.

---

### 2026-09-15 — Chat Details Drawer Ergonomics, Laptop Responsiveness, and Safe Membership Actions (Slack/Discord Parity)

**Context:** User reported three critical UX defects on `/chat`:

1. Channel details and the member list were permanently open by default on every channel, consuming ~350px of horizontal width and forcing the central chat message stream into a cramped column on 13"/14" laptop viewports.
2. An exposed, full-width red button labeled `[-> Leave Channel]` with a `LogOut` icon was positioned directly below the member list, causing users to mistake it for logging out of their Boardly user account and risking accidental channel departure.
3. On laptop displays (`< 2xl`), having side panels statically docked inside the flex flow shrunk message cards, previews, and composers below acceptable usability widths.

**Decision:**

1. **Closed-by-Default Architecture**: Initialized `isDetailsPaneOpen: false` in `chatStore.ts` and ensure channel transitions reset `isDetailsPaneOpen` to `false`. Added an intuitive click action to the header's member count (`{channel.memberCount} members`) alongside the `PanelRight` toggle button.
2. **Safe Membership Footer & Confirmation**:
   - Eliminated the prominent red button and replaced the misleading `LogOut` icon with `UserMinus`.
   - Moved the leave action into a subtle bottom `Membership` section.
   - Guarded channel owners from leaving channels they created without transferring ownership.
   - Enforced an explicit `ConfirmDialog` modal explaining rejoin prerequisites prior to removing membership.
3. **Adaptive Laptop Slide-Over Drawer (`< 2xl`)**:
   - Configured `ChatDetailsPane` and `ChatThreadPane` to render as floating slide-over overlay panels with an ambient backdrop (`bg-black/40 backdrop-blur-2xs z-30`) on laptop/tablet viewports (`< 2xl`), while preserving the dual-column static layout on large monitors (`2xl:static`).

**Alternatives considered:**

- Removing member lists entirely (rejected — users still need to inspect teammate roles and presence when coordinating).
- Keeping static 3-column layout on laptops with narrower column widths (rejected — reduces composer usability and clips code blocks/task cards).

**Consequences:** Full-width, distortion-free messaging experience on laptops matching Slack and Discord; completely eliminates accidental channel departures and logout confusion.

---

### 2026-09-15 — Chat Quote Replies, Delivery Status Ticks, and Offline Outbox Queue (WhatsApp/Telegram/Slack Parity)

**Context:** The platform chat needed market-standard messaging feedback and offline resilience matching WhatsApp, Telegram, and Slack:

1. Users expected to quote-reply directly to existing messages in the central chat stream with visual context previews.
2. Users needed explicit delivery status tracking: Sending/Queued (Clock), Sent to server (One tick), Delivered to recipient client (Double grey tick), and Read/seen (Blue double tick).
3. The composer Send button was disabled during in-flight mutations and offline mode, preventing users from typing and sending rapid multiple messages or working while disconnected.

**Decision:**

1. **Schema & Backend Reply Architecture**:
   - Added `reply_to_message_id` nullable FK column and index to `chat_messages` (migration `0017_chat_reply_to.sql`).
   - Extended `sendMessage`, `listMessages`, and `listThreadReplies` to resolve and return `replyTo: { id, body, authorName }`.
2. **Delivery Status Progression Engine**:
   - Status transitions deterministically from:
     - `sending` / `queued`: Local client generation (`temp-${Date.now()}`) or offline state $\rightarrow$ renders animated Clock icon.
     - `sent`: Successfully saved on PostgreSQL $\rightarrow$ single grey checkmark.
     - `delivered`: Direct message recipient is online (presence active/idle) or has active socket connection $\rightarrow$ double grey checkmark.
     - `read`: Recipient has `lastReadAt >= message.createdAt` $\rightarrow$ double blue checkmark (color: `#3b82f6`).
   - Real-time updates push via `chat:read_receipt` broadcast and update the client-side `readReceipts` map.
3. **Non-Blocking Compose & Offline Outbox Architecture**:
   - The Send button is never disabled when messages are sending or when offline; it is strictly disabled only when the input field is empty.
   - Built a client-side outbox queue in `chatStore.ts` backed by `localStorage` (`boardly_chat_outbox`).
   - Typing and sending immediately generates an optimistic message, appends to the UI, clears the text area, and enqueues to the outbox.
   - The outbox automatically drains sequentially (FIFO) via `window.addEventListener('online')` and WebSocket reconnection.

**Alternatives considered:**

- Blocking multi-message sending until server confirmation (rejected — breaks fluid conversational flow and causes perceived lag).
- Thread replies only without inline quote replies (rejected — quote replies are essential for quick conversational context in main channels).

**Consequences:** Zero-friction, resilient messaging experience on par with WhatsApp and Slack, with persistent offline support and clear delivery transparency.

## 2026-09-26 — Test-Log Fixes: Seed Platform Admin, Webhook Batching, Lint Gates

**Context:** Five defects from the full-project test pass (FIND-03..07) fixed in one session.

1. **Alex Vance carries `isPlatformAdmin` (FIND-03).** The OPS login page labels Alex "CEO / Platform Admin Demo Account" and the e2e spec logs in as him, but no seed granted the flag — app, spec, and UI contradicted each other. Alternatives: separate `admin@platform.com` account (rejected — more moving parts across seed/spec/login UI for a demo env) vs relaxing the gate (rejected — weakens the platform boundary). Chose to make the seed match the product's stated demo model. Org-level RBAC unaffected (flag only gates the OPS console + global visibility already implied by org_owner in tests).

2. **Webhook correctness via batching, not backgrounding (FIND-04).** The hang was serial per-card awaits × duplicate ticket keys, not just slow Redis. Alternatives: background the post-processing and return 200 immediately (rejected — delivery receipt would lie about link creation; GitHub retries on 5xx/timeout, so a fast-but-dishonest 200 is worse than a fast-and-complete one) vs parallel `Promise.all` per card (rejected — pool of 5–10 still serializes 30 cards into waves). Chose single-statement bulk writes (`ON CONFLICT DO UPDATE` with `excluded.*`, bulk comment insert, one board lookup): constant ~5 statements regardless of fan-out. Timeouts (`commandTimeout`, publish races) stay as backstops, which also partially mitigates BUG-11.

3. **`no-console: error` with narrow exceptions (FIND-07).** Gated in all three apps; backend exempts `db/*` CLI scripts, `lib/logger.ts` (the implementation), and `lib/env.ts` (boot validation; can't import logger — circular dep via `logger → env`). Dashboard/super-admin gate is blanket; the gate immediately caught 8 more live `console.*` sites (incl. 3 silent-failure catches converted to toasts). Residual `any` at external-SDK/test/drizzle-builder boundaries left as tracked debt rather than cosmetic-cast.

**Consequences:** Elysia `parse` (not `type`) is now the documented pattern for raw-body routes; bulk-write is the pattern for webhook fan-out; `errorMessage/errorStatus/errorCode/errorResponseStatus` are the standard `unknown`-catch narrowers.

## 2026-09-27 — Bare-Letter Chat Shortcuts Kept; Focus Restoration Instead

**Context:** The New DM dialog appeared to open "by itself" after every close. Investigation found no auto-open path (local state, no persistence, no effects): the documented bare-`C` shortcut fires on any keypress outside text fields, and modal close stranded focus on `<body>`, so continued typing re-triggered it.

**Alternatives considered:** removing/gating the shortcut on interactive focus (rejected — deviates from Linear/Gmail vim-style standard and the in-app cheatsheet documents `C`); background-only fix (insufficient — any focus loss re-arms the loop).

**Decision:** keep bare-letter shortcuts; add `useFocusReturn` (module-level focusin tracker that ignores in-dialog focus so autoFocus can't overwrite the invoker record, layout-effect restore with freshness/containment guards) to DM + channel modals. Same hook pattern to reuse for future dialogs.

## 2026-09-27 — Telegram-Parity Chat Menu: Benchmark and Scope Choices

**Context:** User asked for the Telegram message menu (Reply/Translate/Copy/Pin/Forward/Select/Seen/Delete + reactions) in group channels. Benchmarked Telegram (message menu gold standard) vs Slack (threads/emoji-first, no translate/forward) vs Discord (copy-ID developer slant): matched Telegram's item order and Seen-viewer pattern, kept our Slack-style thread + task-from-message hover actions untouched.

**Alternatives considered:** per-item backend tables for forwards (rejected — clone-with-`forwarded_from_id` preserves audit without join cost); translation via paid API/LLM (rejected — MyMemory free tier needs no key and matches Telegram's inline-translate UX); seen state via per-message receipts table (rejected — `lastReadAt` watermark already gives N-Seen at zero write cost on send).

**Consequences:** pin/forward/seen are group + DM capable; thread replies excluded from pin (Telegram parity); bulk forward reuses the single-forward path sequentially.

## 2026-09-27 — Chat: Route-Owned Selection, WS-Primary Freshness

**Context:** Two coupled symptoms — channel selection bouncing (URL flipping) and a `channels`/`read` request storm. Polling + per-event invalidation overlapped slow (5s+) responses; a store↔URL mirror made selection fightable from any writer.

**Alternatives considered:** longer poll intervals alone (rejected — treats volume, not the per-event invalidation loop, and keeps redundant traffic while live); full socket-driven with no HTTP fallback (rejected — socket drops must not freeze the list; fallback polls stay).

**Decision:** route param owns selection (one-way sync into the store); socket is the primary freshness source with an 8s-coalesced channels refresh and in-place patching for the open channel; HTTP polling is disconnected-fallback only. Read receipts/reactions patch or scope instead of invalidating broad keys.

## 2026-09-27 — WhatsApp-Style Chat Bubbles: Benchmark and Scope Choices

**Context:** Chat rendered Slack-style (all messages left-aligned, ticks only in the author header). User asked for WhatsApp-style left/right bubbles with single/double/blue ticks, user-configurable with left/right as default.

**Alternatives considered:** solid-color outgoing bubbles like real WhatsApp (#005c4b) (rejected — `MarkdownRenderer` emits theme-colored spans like `text-primary` that break on saturated backgrounds, and `bg-primary` shifts across 6 accent themes); per-message read-receipt table (rejected — `lastReadAt` watermark + live `chat:read_receipt` already drive sent/delivered/read at zero write cost); backend-persisted layout preference (rejected — pure view preference, no cross-device need; localStorage via chatStore is enough).

**Decision:** tinted outgoing bubbles (`bg-primary/15`, right) + muted incoming (`bg-muted/50`, left) so all theme/markdown colors stay readable; shared tick component (Clock sending / single-grey sent / double-grey delivered / double-blue read / red failed) moved into the bubble footer in bubbles mode, unchanged in classic header; `messageLayout` in chatStore persisted as `boardly_chat_layout` (default `bubbles`), toggled from the ChatFeed header. Benchmark: WhatsApp (bubbles + ticks gold standard) over Slack (left-aligned) and Teams (tinted own-messages).

## 2026-09-27 — Chat Gestures: WhatsApp Mapping, Menu Kept on Right-Click

**Context:** User asked for WhatsApp gestures (swipe reply/forward, long-press select) on top of the Telegram-style context menu added earlier. The two conflict on long-press: Telegram opens a menu, WhatsApp enters selection.

**Alternatives considered:** long-press opens menu with Select inside (rejected — user explicitly asked long-press to select, and swipe already covers mobile reply/forward); mouse-drag swipe on desktop (rejected — breaks text selection; double-click + hover buttons cover desktop); per-message receipts for bulk ops (rejected — same watermark logic, `allSettled` per batch).

**Decision:** touch long-press enters select mode (WhatsApp benchmark); right-click keeps the full Telegram menu on desktop. Esc hierarchy: selection first, then dialogs. Optimistic `temp-*` rows are unselectable — the server 404s on forward/delete for unsynced ids, which caused the user-reported "status code 404" toast during multi-forward.

## 2026-09-28 — WS Auth via Query Token: Public-Prefix Exemption

**Context:** Global `authPlugin` derive rejected the realtime upgrade (no Bearer header on WS handshakes), killing all sockets with 401 and freezing presence offline.

**Alternatives considered:** custom `Sec-WebSocket-Protocol` token header (rejected — needs frontend + backend changes and non-standard client handling); per-message auth only (rejected — open() already validates `?token=` and closes on failure, so exemption loses nothing).

**Decision:** `/v1/realtime/ws` joins `PUBLIC_PATH_PREFIXES`; handshake auth stays in `open()`. Frontend adds reconnect-with-backoff so backend restarts don't silently end realtime. Any future WS route must follow the same validate-in-`open()` pattern.

## 2026-09-28 — Priorities as Org-Scoped Config Table (not enum/labels)

**Context:** Priority existed only as an ad-hoc DB column plus hardcoded frontend strings; the My Tasks priority filter was dead (param accepted, ignored).

**Alternatives considered:** Postgres enum (rejected — adding a level needs a migration, no per-org variance, no colors); reusing board labels (rejected — board-scoped, multi-assign, wrong semantics); free-text column (rejected — no color mapping, typo-prone filtering).

**Decision:** `priorities` table per org (unique name, hex color validated `^#[0-9a-fA-F]{3,6}$`, rank order, single default), lazy-seeded Urgent/High/Medium(default)/Low; `cards.priority_id` set-null; delete reassigns to default (never orphans, last level protected); `org.update` gates mutations. Frontend renders colors exclusively from the API. Benchmark: Jira (org-level priority schemes with icons/colors) over Trello (fixed labels).

## 2026-09-28 — Dialog Close Contract: One Hook for Every Dialog

**Context:** "Close twice" bugs recurred per dialog (task modal reopen races, focus-strand shortcut refires, duplicate Esc listeners). Each dialog hand-rolled X/backdrop/Esc/focus-return wiring.

**Alternatives considered:** fixing each dialog in place (rejected — the class keeps recurring); a wrapper component forcing markup changes on 20+ dialogs (rejected — too invasive; Radix and portal dialogs differ structurally).

**Decision:** `useDialogClose({ isOpen, onClose, isDirty?, onDirtyRequest? })` is the single close path — X, backdrop (target-guarded), and Esc (capture-phase, wins over inner handlers) all funnel through an idempotent `requestClose` (one close per open session); invoker focus restores via the existing tracker. Dirty editors keep their prompt via `onDirtyRequest`. Migrated: CardModal/TaskDetailView (dirty lifts via `onDirtyChange`), New DM/channel, Working Hours, task-mention picker, translate/forward/seen. Radix-direct `setState` dialogs are already single-close; new dialogs MUST use the hook (AGENTS.md §9-adjacent rule).

## 2026-09-28 — Board Column Virtualization Around dnd-kit

**Context:** 500-card columns mount hundreds of card tiles and re-render all of them on every realtime frame. dnd-kit, however, needs a complete, measurable sibling list to compute drop positions, and its `SortableContext` children must re-render freely to propagate indexes/rects into an active drag.

**Alternatives considered:** virtualizing through a single stable tree with `rangeExtractor` (rejected — the still-mounted virtualizer's measurement state updates interleave with dnd-kit's measure→setState cycle and the board white-screens mid-drag); `memo` on `ListColumn`/`SortableCard` (rejected — empirically produces the same "Maximum update depth exceeded" freeze); windowing the active drag column (rejected — collision math needs unmounted rows).

**Decision:** JSX-branch on `isVirtualized` (`!isDraggingActive && cards > 20`): long idle columns window via `@tanstack/react-virtual` (estimate 104px, overscan 8, `measureElement`, card-id keys); any active drag or short column renders plain static rows. Only the leaf `KanbanCardView` is memoized, enabled by a clone-on-write feed merge that returns the original cache object when a change page alters nothing (preserves TanStack Query structural sharing). The "Drop tasks here" empty state MUST stay inside the cards container — as a direct `SortableContext` child it perturbs the over-column's measured geometry into the same update loop (found by elimination bisect, guarded by a mid-drag e2e page-error assertion). Benchmark: Trello/Linear window long lists and render drags in full; matched.

## 2026-09-28 — Security Fix Trade-offs (Audit Remediation)

**Context:** 30-finding audit (auth bypass, SSRF, stored XSS, token storage, tenant isolation) needed remediation without breaking dev/E2E flows that depend on demo credentials and mock auth.

**Decision:**

- SSO `/callback` now takes a WorkOS `code` (verified server-side) instead of self-asserted identity; test `mock_test_` codes only under `NODE_ENV=test` (bun sets it). Old `{domain,email,name}` shape rejected — breaking change, frontend updated.
- Invite/SCIM bearer tokens stored as sha256 with show-once UX (resend/regenerate to rotate); legacy rows fail closed (invites self-heal in ≤7d via expiry).
- JWTs gain `iss`/`aud` — pre-existing tokens rejected, all sessions re-login once.
- `FORCE RLS` NOT enabled: app connects as table owner and never sets `app.current_org_id`, so enforcement would return zero rows outage-wide. Tenant isolation stays app-layer (explicit org filters + membership checks) until traffic moves through `withOrgContext`.
- Demo seed keeps shared `Password123!` (E2E/dev-login depend on it) but hard-refuses production without `BOARDLY_SEED_PRODUCTION=1`.
- Benchmark: matches Linear/Jira posture — short-lived access + rotating refresh with reuse detection, allowlisted redirects/uploads, hashed invite-style tokens.

## 2026-09-29 — Project Defaults Tab Lives in the Automations Modal (Jira + Butler parity)

**Context:** Proprietary-tool request: "if the project is this, assign this". Backend already had both halves with no UI: board-scoped Butler-style event rules (`automations`, on `card.moved`) and Jira-style static default assignees (`assignment_rules` project scope, resolved in `createCard`).

**Alternatives considered:** separate Project Settings page (rejected — the ask was for config "in here", next to the board rules where the screenshot was taken); new backend table/endpoints (rejected — `assignment-rules` + `resolveDefaultAssignee` already cover user + role targets).

**Decision:** two tabs in the existing modal — Board Rules (event-driven, on move) and Project Defaults (static, on creation), matching Jira (project default assignee + automation side by side) over Trello (Butler board-only). Same pass fixes the two screenshot bugs by reusing proven pickers instead of adding new ones.

## 2026-09-30 — Sliding Refresh Families (7d idle / 30d absolute / 10s reuse grace)

**Context:** every rotation minted `now+30d`, so active sessions rolled forever with no forced re-login; reuse of a revoked token burned ALL of the user's sessions; no grace window, so a 2-tab/StrictMode race logged the user out; no family tracking.

**Alternatives considered:** non-rotating long-lived refresh with bumped expiry (rejected — larger replay window, no theft signal); strict burn without grace (rejected — races become logouts); `__Host-` cookie prefix (rejected — requires Secure, breaks `http://localhost` dev).

**Decision:** `refresh_tokens` gains `family_id` (login = new family), `absolute_expires_at` (set once, never extended; idle clamps via `LEAST`), `parent_hash`/`replaced_by_hash`, `grace_uses`, `ua_hash`/`ip_hash` (migration `0033`, backfill `absolute=expires`). `POST /refresh` fast-path is one atomic `UPDATE…RETURNING`; re-presenting a just-rotated parent inside 10s / 2 uses / UA-match mints a sibling child (hashes only — head plaintext never re-returned). Real reuse burns only that family; burns poison `grace_uses` so post-burn reuse can't mint. JWTs carry `sid` (family); sensitive routes (`change-password`, `sso`, `billing`, `developer`, `orgs`, `superadmin`) reject burned families via Redis marker, elsewhere the 15m access expiry bounds. Refresh mirrored to httpOnly `SameSite=Lax` cookie (`Path=/v1/auth`, Secure in prod) with Origin check on cookie-presented refresh — dual-read phase 1, body tokens still accepted. Password change revokes all other families (current kept via `sid`); logout burns its family. Super-admin caps (`30m/24h`) optional via env. Frontend: single-flight refresh (`navigator.locks` cross-tab + re-check) in both SPAs; super-admin now stores/uses refresh tokens. Benchmark: Linear rolling + absolute cap, Auth0 reuse leeway, Vercel rotation — matched.

## 2026-10-01 — URL-Synced Dialogs: Single Source of Truth (task modal double-close)

**Context:** the task modal needed two closes: X/Escape/backdrop cleared `?card=` from the URL yet the dialog stayed open. Instrumented repro showed the torn pair — React state committed `null` a tick before the router navigation landed, and the state↔URL sync effect reopened from the stale `?card=`.

**Alternatives considered:** arming the existing 500ms pass-through-click guard around the sync effect (rejected — patches one interleaving, the dual-source race class remains); debouncing the sync effect (rejected — same class, plus delayed deep-link opens).

**Decision:** `selectedCardId` derives directly from `searchParams.get('card')` — no local state, no sync effect. Open = set param, close = delete param (atomic by construction). The 500ms tile-click guard stays (still needed for genuine mid-gesture pass-through). Companion fixes in `CardModal`: `useDialogClose` moved above the `if (!cardId) return null` early return (Rules-of-Hooks violation, live in MyTasks/Calendar where the modal stays mounted with null id), and the unsaved-prompt Discard/Save actions deliberately keep the RAW closer — routing them through `requestClose` re-reads the not-yet-flushed dirty flag and re-shows the prompt in a loop. Benchmark: Linear/Notion drive modal state from the route; matched.

## 2026-10-01 — Sidebar Count Badges: My Tasks Joins Chat (Slack Convention)

**Context:** only Chat had a sidebar count pill. Request: badges "on the others" per industrial standard.

**Alternatives considered:** a pill on every nav row (rejected — badges without an actionable signal are noise; Linear/Jira/Slack badge only attention queues, never navigation chrome); deriving My Tasks from the full list fetch (rejected — heavy for a badge); reusing `totalAssigned` (rejected — includes done-stage cards, a wrong number users would catch).

**Decision:** `GET /v1/cards/my-tasks` summary gains `openAssignedCount` (assigned, not archived/deleted, stage not `done`; zero-query when unassigned). Sidebar shows one pill per row max: My Tasks = open count, Chat = unread (existing). Shared `NavCountBadge`/`NavCountDot` (hidden at zero, 99+ cap, `role=status` + tooltip/label incl. overdue detail, collapsed rail keeps the dot pattern). No badges on Timesheets/Calendar/Power-Ups/Workspaces — no well-defined actionable signal exists there; adding one would invent semantics. The badge reuses the page's `['my-tasks','summary']` key (shared cache, same invalidations, `placeholderData` against flashes).

## 2026-10-01 — Notification Center: Server-Computed Importance, Archive-as-Dismiss, Text-Blob Search

**Context:** the bell dropdown was All/Unread over a capped-50 unfiltered list — no search, no triage, no way to surface what needs action. Target: Bitrix-style rich rows + Linear/Jira triage (star, archive, bulk, shortcuts, needs-action strip).

**Alternatives considered:** client-derived importance (rejected — the strip must span all pages, a client selector only sees loaded rows); `is_archived bool` + `archived_at` (rejected — the timestamp alone carries both facts); JSONB `ILIKE` search over `payload` (rejected — sequential scan per user; instead a `search_text` blob written at insert + backfilled, with `pg_trgm` GIN); `CONCURRENTLY` index builds in the migration (rejected — the Drizzle migrator runs in a transaction where `CONCURRENTLY` fails; plain `IF NOT EXISTS` indexes, table is small); second WS connection avoided? (kept — own lightweight socket on the existing `/v1/realtime/ws` `user:inbox` topic with backoff; success toasts kept silent except archive, which gets the single 5s Undo snackbar per the toast-etiquette exception).

**Decision:** migration `0034` adds `is_starred`, `archived_at` (NULL = visible), `search_text` + three indexes (keyset inbox, unread partial, trigram GIN). List API is keyset `(created_at, id)` with opaque base64url cursors, `types[]` enum-validated, `q` (2–100 chars, LIKE-escaped) over `search_text`, `archived=exclude|only|include`, and per-row server-computed `isImportant`; `GET /needs-action` (5 + total) feeds the strip. Mutations (`read/unread/star`, `read-many/archive-many/unarchive-many` capped at 100, org-scoped `read-all`) are idempotent; archiving marks read so the badge (which excludes archived) never counts invisible rows; retention exempts unread AND starred. Frontend: `/notifications` page (URL-param filters, local-timezone date groups, IntersectionObserver paging, `j/k/Enter/s/e/u/x//` shortcuts disabled in inputs, roving focus, aria-live, shift-click range select, touch long-press select, safe-area bulk bar) + sidebar entry with shared `['notifications','unread-count']` badge + dropdown rebuilt on the same engine (fetch-on-open, `useDialogClose` single close path). Benchmark: Bitrix rich rows, Linear triage/optimistic/undo, Jira date groups; matched.

**Migration-journal gotcha (recorded so nobody re-learns it):** the Drizzle postgres-js migrator skips entries by comparing journal `when` timestamps (`lastDb.created_at < entry.when`), NOT hashes. A hand-written journal entry must carry a `when` greater than every existing entry or it is silently "applied" (recorded) without executing. `drizzle-kit generate` also re-emits drift from hand-maintained migrations (0032/0033 have no snapshots), so center-scale changes ship as hand-written focused migrations, not generated ones.

## 2026-10-02 — Media Upload Gate: Fail-Closed Virus Scan, Server-Side Copy Quarantine, Legacy Exception

**Context:** attachments were minted straight to a public-read bucket URL with no lifecycle, no size/MIME verification after the PUT, and no malware gate. Target: Linear/Notion-grade upload flow where a file is invisible until it is proven safe.

**Alternatives considered:** scan client-side before upload (rejected — trivially bypassed, and it would let an untrusted client claim "scanned"); trust the declared MIME and size (rejected — clients lie and signed URLs are replayable); block reads while `scanning` with an implicit serve (rejected — an implicit exception is exactly how gates leak); delete infected bytes immediately (rejected — no forensic record); `unlink` local / copy-then-delete S3 (chosen — S3 has no atomic move, so `CopyObject` into `quarantine/` first, then delete; a failed copy falls back to a hard delete so an infected object is never left reachable).

**Decision:** one `requestUpload → PUT (5 min presigned) → confirmUpload` flow over both legacy tables (`POST /v1/media/*`, legacy card/chat mint endpoints kept as thin wrappers so old clients keep working). `confirmUpload` HEADs the object and rejects missing bytes, >25 MB, declared-vs-uploaded size mismatch, and MIME mismatch before anything is servable. Status machine `staged → scanning → ready|blocked|failed`; `presignedGet` serves only `ready + clean` (or dev-only `skipped`) — 202 while scanning, 409 staged, 410 blocked, 404 missing/cross-org. `SCAN_MODE=disabled` is refused outright in production (`assertScanModeValid` at boot and at confirm/read), so "no scanner" can never mean "serve unscanned". The worker streams S3 → `clamd` INSTREAM directly (`clamavScanStream`, per-chunk backpressure, checksum hashed on the fly) instead of buffering 25 MB per file; retries are poller-driven with exponential backoff (`poll × 2^attempts`, capped 5 min) rather than an immediate re-enqueue, so a dead sidecar cannot hot-loop the queue. Infected → copy to `quarantine/<key>`; `GET /v1/media/scan-metrics` (`integration.manage`) exposes queue depth/age, 5-minute error rate, and a live sidecar PING. Documented exception: pre-gate rows were backfilled `ready/pending` (0035) and are recovered to a servable `storage_key` from their stored URL (0039), so they stay downloadable — and only that pair can be `ready/pending`, because new uploads can only reach `ready/clean`. A throttled `LEGACY_RESCAN_MS` batch re-queues them so the exception drains instead of becoming permanent. Benchmark: Gmail/Drive attachment gating (invisible until clean, explicit "scanning" state); matched.

## 2026-10-02 — Federated Inbox v1: Federation-Time Merge + `inbox_item_state` Instead of Materialization

**Context:** 4.6a wants one triage queue across mentions, review requests, comments, and DMs. 4.6b makes email a second ingestion path, so items can arrive out of order and arrive twice.

**Alternatives considered:** materialising every source row into a real `inbox_items` table (rejected — a write amplification and fan-out-failure surface for 4 sources, and every source then needs a backfill/rebuild story; the notification centre already proved the keyset-read pattern); offset pagination (rejected — sources are merged by time across four clocks, offsets both duplicate and skip); fan-out materialisation with an outbox (deferred — the honest complexity, but not needed until the merge is measurably slow); cursor per source (rejected — callers would have to thread four cursors).

**Decision:** `GET /v1/inbox` merges at read time from four capped sources (notifications/mentions, direct-message conversations grouped per channel with unread counts, my tasks, open/changes-requested review links) sorted by creation time with a **composite base64url cursor** carrying each source's last-seen `(ts, id)`, so a merged page is resumable without dupes or gaps; per-source caps (`PER_SOURCE_CAP`) bound a hot source, and any source that emits nothing still advances its cursor or reports exhaustion so a page can never stall. Snooze/archive/star live in a per-user `inbox_item_state` table keyed by `source:refId` (delegated to the notification service for notification items, `markChannelRead` for DM threads) — the source row stays the single source of truth and nothing is duplicated. `event_ts` is creation time, so edits never make an old item jump back to the top; a genuine link-state change is what resurfaces a dismissed item. Scope is per user: DM items come from `type = 'direct'` channels only (group/public/task-thread traffic belongs to Chat), and review items only from cards the reader is assigned to or watching. Benchmarks: Gmail's merged label view and Linear's My Issues; matched. **Materialisation trigger (documented deviation):** reintroduce a materialised `inbox_items` table once the merge's p95 read latency breaches 300 ms for a 10-item page, or the per-source cap starts hiding items inside a single page (both are observable via `inbox` query timing and the per-source exhaustion counters).

## 2026-10-02 — Inbound Email: `postal-mime`, Capability Tokens, and Terminal Receive States

**Context:** 4.6b needs email to create cards (forward) and comments (reply) without exposing an unauthenticated write API.

**Alternatives considered:** accepting arbitrary unauthenticated JSON (rejected — an open card-creation hole); per-user API keys (rejected — leaks user-scoped write authority; a shared board address must grant _creation_, never reply-as-someone-else); trusting `From:` alone for attribution (rejected — trivially forgeable; SPF+DKIM PASS is required to bind a member, otherwise the token owner is the author); hand-rolled MIME parsing (rejected — replaced by `postal-mime`, the maintained parser, so nested multipart/RFC 2047/quoted-printable are not our bug surface); deleting receive rows after success (rejected — needed for audit and replay).

**Decision:** `POST /v1/inbound/email` accepts two sender shapes, both outside auth (`PUBLIC_PATH_PREFIXES`) and rate-limit exempt (abuse is bounded by the token capability + Message-ID dedupe): a generic forwarder webhook verified with HMAC-SHA256 over the exact raw bytes, or SES → SNS verified by signature with a `SigningCertURL` host check and inline `SubscriptionConfirmation`. The recipient address carries a capability token (`board+<token>@…`); only its SHA-256 hash is stored, targets are validated against the caller's org, and authenticated `POST/GET/DELETE /v1/inbound/tokens` mint/list/revoke them with the plaintext shown exactly once. Routing: `In-Reply-To`/`References` matching our per-card `Message-ID` (`card-<uuid>@domain`, used as outbound `Reply-To`) becomes a comment on that card with `@mention` fan-out; otherwise the message becomes a card in the token's list. Trust is fail-closed: SPF+DKIM PASS from a non-member 404s, otherwise the author is the token owner. Attachments go through the same `ingestBytes` media gate and stay invisible until clean. Idempotency is `(organization_id, message_id)`; a row left in the non-terminal `received` state by a crash, or a `failed` row, is **resumed** by the next delivery instead of being mistaken for a completed send, and every throw is stamped `failed` + `failed_at` so the receive log never sticks mid-flight. Raw RFC822 is retained (capped, `raw_truncated` flagged) for audit and re-parse after a parser fix. Loop guard: `Auto-Submitted`/`Precedence: bulk|list|junk`/no-reply senders and SES bounce/complaint notifications are logged and dropped without creating content. Outbound side: `SendEmailOptions` gained optional threading headers (`Reply-To`, `Message-ID`, `References`) applied across Resend/SES/SMTP, and `modules/inbound/threading.ts` sends comment/mention mail through the card's own capability. The reply address is **derived**, not stored: `HMAC(INBOUND_TOKEN_SECRET, card:<org>:<card>:<version>)`, where `version` is the number of existing token rows for that card. That keeps one stable address per card (repeat replies thread together) with no plaintext at rest, and revoking a token (which keeps the row) rotates the address on the next send. Alternatives rejected: storing the plaintext to reuse it (reintroduces the leak the hash was avoiding); one random token row per email (unbounded row growth and a broken thread every send); a single org-wide reply address (loses per-card revocation). With no `INBOUND_TOKEN_SECRET` configured, inbound still works and notification mail simply sends unthreaded — email is best-effort, the receive path is the fail-closed side.

---

### 2026-10-03 — System Bot Protection & Non-Interactive Service Account Governance

**Context:** The Super Admin platform user table (`apps/super-admin/src/pages/PlatformUsers.tsx`) presented system automation accounts (such as `GitHub Bot` / `github-bot@boardly.internal`) identically to regular human accounts. Next to the "Inspect" button sat a standalone red `<LogOut />` action button. This caused administrative confusion:

1. A lone red button in data tables visually communicates "Delete user" / "Remove account".
2. If hard deletion were triggered or supported, deleting `GitHub Bot` would violently fail with Postgres foreign key constraint violation `23503` because 661+ rows in `comments`, `audit_logs`, and activity records reference `users.id`.
3. The button actually triggered session revocation (`POST /superadmin/users/:id/force-logout`), but system bots have no interactive credentials or refresh tokens, rendering the action misleading and dead (violating Rule 7).

**Alternatives considered:**

- Adding cascading DB delete on `users.id` (rejected — destroys historical audit logs, comments, and task attribution; violates enterprise compliance standards).
- Hiding bot accounts completely from Super Admin (rejected — platform super admins need visibility into all platform entities and automated comment actors across the multi-tenant database).
- Keeping the active session revoke button for bots (rejected — dead UI that triggers an empty refresh token deletion and confuses admins).

**Decision:**

1. **Never Hard Delete Users**: Maintain strict referential integrity. Relational rows tied to comments, task history, and audit trails must remain intact.
2. **Explicit System Account Visual Distinction**: Detect automated bot accounts via `isSystemBot()` (`@boardly.internal` domain or `bot` identity). Render a distinct `[System Bot]` badge and bot avatar.
3. **Disabled Session Actions with Explanatory Tooltips**: System bot accounts disable session termination controls (`disabled={isBot}`, `opacity-30 cursor-not-allowed`) across the data grid and inspection dialog, with explicit tooltips explaining that automated service accounts have no interactive sessions.
4. **Informational Banner in Modal**: The detail inspection dialog displays an enterprise advisory banner clarifying the service account's purpose (Git/webhook automation) and explaining that its records are preserved for database referential integrity. Benchmark: GitHub, Jira, and Slack system integrations; matched.

---

### 2026-10-03 — TanStack Table Engine for EnterpriseDataGrid

**Context:** The previous `EnterpriseDataGrid` (`packages/ui/src/components/enterprise-data-grid.tsx`) relied on hand-rolled sorting (Schwartzian transform), manual pagination slicing, and custom O(rows) nested filter loops. This limited functionality (no multi-sort, no column visibility control) and introduced potential edge-case bugs with complex datasets.

**Decision:** Migrated `EnterpriseDataGrid` to be powered by TanStack Table (`@tanstack/react-table`):

1. **100% Backward-Compatible Props:** Preserved `ColumnDef<T>`, `EnterpriseDataGridProps<T>`, custom cell renderers, and server-side modes (`manualPagination`, `manualSorting`, `manualFiltering`).
2. **TanStack Table Row Models:** Configured `getCoreRowModel`, `getFilteredRowModel`, `getSortedRowModel`, `getPaginationRowModel`, `getFacetedRowModel`, and `getFacetedUniqueValues`.
3. **Faceted Filtering & Distinct Values:** Column popovers now leverage TanStack's faceted unique values computation instead of linear array scans.
4. **Column Visibility Governance:** Added an interactive "Columns" dropdown (`enableColumnVisibility`) allowing users to show/hide individual columns with immediate UI persistence.
5. **Multi-Sort & Alphanumeric Sorting:** Supports shift-click multi-column sorting and native type-aware comparators.
6. **Blob-Based UTF-8 CSV Export:** Exports all filtered rows (`getFilteredRowModel().rows`) directly via browser Blob memory streams.

**Alternatives considered:**

- Replacing `EnterpriseDataGrid` call sites individually with bare TanStack hooks (rejected — breaks existing abstractions and duplicates table boilerplate across 5 admin pages).
- Staying on custom hand-rolled grid (rejected — lacks multi-sort, column visibility, and battle-tested edge-case handling).

**Consequences:** Sub-300ms production builds across dashboard and super-admin, zero breaking changes to existing admin grids, improved memory and render performance, and enterprise-grade table features.

---

### 2026-10-03 — Decomposition of Monolithic TaskDetailView Component

**Context:** `apps/dashboard/src/components/board/TaskDetailView.tsx` had ballooned into the largest frontend component in the codebase (3,319 lines). It combined header rendering, markdown requirements editor, extensive agile/metadata form grids, custom fields, time-tracking worklogs, checklist management with keyboard navigation, attachment drag-and-drop, floating quick-actions ribbon, chat pane coordination, Bitrix24-style sticky bottom action bar, and rating modals into a single massive file. This hindered maintainability and slowed editor language server feedback.

**Alternatives considered:**

- Keeping the component monolithic (rejected — 3.3k lines creates friction and high cognitive overhead for small UI adjustments).
- Splitting into generic unstructured sub-files (rejected — grouping domain concepts into dedicated components preserves strict typing and reusable boundaries).

**Decision:**
Decomposed `TaskDetailView.tsx` into a lightweight coordinator (~1,200 lines) orchestrating 10 domain subcomponents located in `apps/dashboard/src/components/board/task-detail/`:

1. `TaskDetailHeader.tsx`: Title, status badges, breadcrumbs, copy actions, and mobile tab switchers.
2. `TaskDescriptionCard.tsx`: Collapsible markdown requirements editor, dirty tracking, preview tabs, and character counts.
3. `TaskMetadataGrid.tsx`: Priority, stage templates, sprints, phases, assignees, participants, watchers, and labels.
4. `TaskSubtasksCard.tsx`: Subtask list, status toggling, quick creation input, and parent card linking.
5. `TaskCustomFieldsCard.tsx`: Dynamic tenant custom field inputs and renderers.
6. `TaskTimeTrackingCard.tsx`: Live session timer, logged time progress, worklog submission form, and history list.
7. `TaskChecklistsCard.tsx`: Checklists, progress bars, drag reordering, bulk item entry, and completion stats.
8. `TaskAttachmentsCard.tsx`: File upload dropzone, media previews, and attachment management.
9. `TaskDetailBottomBar.tsx`: Sticky Bitrix24-style enterprise bottom action bar with task timer, start/pause/complete actions, more-options dropdown, and rating launcher.
10. `TaskRateModal.tsx`: Quality scoring popover adhering to the Rule 10 `useDialogClose` contract.

**Consequences:**
Retains 100% feature parity, API contracts, keyboard interactions, and responsive layouts. Dramatically improves testability and readability while keeping dashboard Vite builds fast (329ms) and typechecks clean.

---

### 2026-10-03 — Backend Cards Service Domain Submodule Decomposition

**Context:** `apps/backend/src/modules/cards/service.ts` was the largest backend service file in the repository (2,942 lines). It encapsulated core card CRUD, subtask hierarchies, board-level and card-level labels, single-assignee and multi-collaborator membership models, watchers, card view counters, comments and markdown mention cascades, attachments, complex checklist item manipulation, optimistic concurrency column moves, list rebalancing algorithms, My Tasks multi-axis aggregation, and deep card cloning. Modifying any card aspect required traversing a massive monolithic file.

**Alternatives considered:**

- Keeping the service file monolithic (rejected — 3k lines in a backend service increases risk of unintentional side-effects and hampers IDE navigation).
- Breaking route-level and service-level API contracts (rejected — 24+ external test suites and route controllers depend on `import { ... } from '../cards/service'`).

**Decision:**
Decomposed `service.ts` into 9 focused domain submodules under `apps/backend/src/modules/cards/`, turning `service.ts` into a lightweight 24-line master facade re-exporting all submodules:

1. `card-helpers.ts` (200 lines): Shared tenancy verifications (`verifyListAccess`, `verifyCardAccess`, `requireOrgMember`), UUID validation, cache-bumping (`bumpForCard`, `bumpForChecklist`), and activity history logger.
2. `card-labels.ts` (173 lines): Board label CRUD and card label associations.
3. `card-members.ts` (325 lines): Card assignment, collaborator participation, watcher subscriptions, and real-time presence viewers.
4. `card-activity.ts` (362 lines): Comment CRUD, markdown `@mention` parsing, notification dispatch, and attachment records.
5. `card-checklists.ts` (392 lines): Checklist management, bulk item creation, progress tracking, and status toggles.
6. `card-movement.ts` (204 lines): List transitions, optimistic concurrency versions (`409 VERSION_CONFLICT`), and fractional position rebalancing.
7. `card-mytasks.ts` (347 lines): Personal cross-workspace task aggregation, filtering, search, and open task count calculation.
8. `card-clone.ts` (183 lines): Deep copying cards with full checklist trees, labels, assignees, and subtasks.
9. `card-crud.ts` (882 lines): Primary card queries, list card caching, subtask retrieval, creation, deletion, and patch mutations.

**Consequences:**
Maintains 100% backwards compatibility with zero changes required in any route or test caller. All 31 backend integration tests across cards, boards, priorities, timetracking, and git pass with 0 errors. Backend typecheck passes with 0 warnings.

---

### 2026-10-03 — Kanban BoardView Component Decomposition (1,968 → 390 lines)

**Context:** `apps/dashboard/src/pages/BoardView.tsx` had grown to nearly 2,000 lines (1,968 lines). It housed top-level board routing, aggregate data queries, drag-and-drop collision detection, optimistic list rebalancing, board rename and delete dialogs, list columns, `@tanstack/react-virtual` list virtualizer, inline add list form, card quick creation forms, sortable card wrappers, card view tiles with agile badges and assignees, and hover preview portal overlays all within a single file.

**Alternatives considered:**

- Keeping the file monolithic (rejected — high cognitive load, difficult to optimize re-renders during drag gestures).
- Unstructured slicing (rejected — clean division into Kanban-specific subcomponents under `components/board/kanban/` keeps responsibilities clear).

**Decision:**
Decomposed `BoardView.tsx` into a lean coordinator (~390 lines) orchestrating specialized subcomponents in `apps/dashboard/src/components/board/kanban/`:

1. `types.ts`: KanbanCard, KanbanList interfaces, constants (`CARD_ESTIMATED_HEIGHT`, `VIRTUALIZE_THRESHOLD`, `dropAnimation`).
2. `CardHoverPreviewPortal.tsx`: Floating hover preview portal with agile task details.
3. `KanbanCardView.tsx`: Memoized card tile rendering priority, story points, stage badges, due dates, assignees, subtasks, checklists, and comments.
4. `SortableCard.tsx`: `@dnd-kit/sortable` wrapper handling CSS transitions and click forwarding.
5. `AddListForm.tsx`: Dedicated list creator with dirty state and keyboard shortcuts (`Enter`/`Escape`).
6. `ListColumn.tsx`: Memoized virtualized column (`@tanstack/react-virtual`) with dynamic height measurement, quick card composer, full task creator trigger, and rename/delete list dialogs (adhering to Rule 10 `useDialogClose`).
7. `BoardHeader.tsx`: Title display, presence avatars, quick action triggers, and board rename/delete dialogs (adhering to Rule 10 `useDialogClose`).
8. `index.ts`: Public barrel exports.

**Consequences:**
BoardView coordinator is reduced by ~80% (1,968 → 390 lines). Preserves 100% feature parity, URL search param synchronization (`?card=`), drag-and-drop animations, and dialog close contracts. Typecheck clean and dashboard Vite build passes in <600ms.

---

### 2026-10-03 — Calendar Component Decomposition (1,605 → 442 lines)

**Context:** `apps/dashboard/src/pages/Calendar.tsx` had expanded to 1,605 lines, combining view state navigation, Google sync buttons, month calendar cells, time-blocking interactive grid calculations, union-find column packing algorithms, dragging/resizing state machines, now-indicator auto-scroll logic, external meeting blocks, task blocks, drag ghosts, and unscheduled tray panels into a single file.

**Alternatives considered:**

- Keeping the file monolithic (rejected — over 1.6k lines impedes readability and component maintainability).
- Placing subcomponents in unrelated folders (rejected — `apps/dashboard/src/components/calendar/` already houses `EventPopover` and `QuickCreatePopover`, making it the natural home).

**Decision:**
Decomposed `Calendar.tsx` into a clean coordinator (~442 lines) delegating to modular domain subcomponents in `apps/dashboard/src/components/calendar/`:

1. `types.ts`: `CalendarView`, `DragState`, `PendingPress`, constants (`HOUR_H = 56`, `SNAP_MIN = 15`).
2. `calendar-utils.ts`: Snap arithmetic (`snapMinutes`, `atTime`, `toISO`), time formatting (`formatTimeRange`), CSS positioning (`blockStyle`, `columnStyle`), and greedy interval union-find column partitioning (`layoutDayColumns`).
3. `GoogleSyncBadge.tsx`: Dedicated Google sync status badge and connect/disconnect/sync triggers.
4. `UnscheduledTray.tsx`: Side panel displaying unblocked tasks with click-to-place toggle and empty states.
5. `CalendarHeader.tsx`: Top bar navigation, Today button, timezone pill, view toggle buttons, sprint and milestone overlays.
6. `MonthGrid.tsx`: Month calendar grid with date buttons, task blocks, due date badges, and external event badges.
7. `TimeGrid.tsx`: Interactive week and day time-blocking grid with pointer capture and drag handling.
8. `NowLine.tsx`: Live current-time indicator line with auto-scroll on entry.
9. `BlockChip.tsx`: Draggable and resizable internal task time block.
10. `ExternalBlockChip.tsx`: Draggable and resizable Google Calendar meeting block.
11. `DragGhost.tsx`: Dashed drag preview bounding box.
12. `index.ts`: Barrel export for the calendar component library.

**Consequences:**
Preserves 100% feature parity, keyboard shortcuts (`t`, `m`, `w`, `d`, arrows), Google 2-way sync, time-blocking interactions, and popovers. Vite production build passes in ~600ms with 0 type errors.

---

### 2026-10-03 — TaskChatPane Component Decomposition (1,486 → 442 lines)

**Context:** `apps/dashboard/src/components/board/TaskChatPane.tsx` had grown to 1,486 lines. It combined chat headers, Google Meet launcher, participants popover (`MemberPicker`), timeline search filtering, message quote parsing, system activity log formatting, message bubbles, DM launchers, inline editing textareas, hover quick actions, bubble context dropdown menus, paste/screenshot upload trays, drag-and-drop overlays, autocomplete mention dropdowns, emoji popups, and delete confirmations into a single file.

**Alternatives considered:**

- Keeping the file monolithic (rejected — over 1.4k lines makes it hard to maintain chat and task collaboration features).
- Flattening subcomponents into `components/board/` (rejected — subfolder `task-chat/` mirrors `task-detail/` and `kanban/`).

**Decision:**
Decomposed `TaskChatPane.tsx` into an isolated domain folder `apps/dashboard/src/components/board/task-chat/` with a clean coordinator (~442 lines):

1. `types.ts`: `ChatMessage`, `PendingAttachment`, `TaskChatPaneProps`.
2. `chat-helpers.ts`: Regex markdown quote parser (`parseQuotedMessage`), system activity detector (`isActivityComment`), and activity pill formatter (`formatActivityText`).
3. `TaskChatHeader.tsx`: Title display, member count, Google Meet launcher, chat launcher, `MemberPicker` popover, and search bar.
4. `ChatMessageItem.tsx`: Individual chat message bubble, author DM launcher, inline message editor, markdown body, file attachments, timestamp, read receipts, hover action ribbon, and contextual action dropdown.
5. `TaskChatComposer.tsx`: Sticky enterprise composer, mention autocomplete dropdown, emoji picker, active replying-to banner, drag-and-drop upload zone, pending file tray, and circular send trigger.
6. `index.ts`: Barrel export.
7. `TaskChatPane.tsx`: Coordinator managing timeline aggregation, search filtering, delete confirmation dialog, and task creation from messages.

**Consequences:**
Retains 100% backward compatibility for all props, types, and callbacks. Monorepo typechecks clean (`tsc -b --noEmit`) and Vite build completes in ~900ms.

---

### 2026-10-03 — Cross-Tenant Hardening: Per-Query Org Filters Are the Isolation Mechanism

**Context:** A Phase 0 org-scope sweep across `apps/backend/src` found destructive paths keyed by primary key alone. The clearest was `trash/service.ts` `hardDeleteItem('card')`, which called `deleteCardCascade([itemId])` with no `organizationId` filter at all — board, project and workspace cascades all scoped their terminal delete, the card path did not. A second class was parent-card lookups in `card-crud.ts` (`createCard`) and `card-clone.ts` (`cloneCard`) that resolved `parentCardId` by PK, permitting a cross-org subtask link and corrupting the foreign parent's `subtasksTotal`.

Separately, `db/index.ts` exposed `withOrgContext()` (Postgres RLS `SET LOCAL app.current_org_id`, read-replica routing, recent-write marker) that no service called — every service uses `db = rawWriteDb`. Its presence implied an isolation guarantee that did not exist.

**Alternatives considered:**

- Adopt `withOrgContext` + `FORCE RLS` now (rejected — that is a new isolation mechanism, i.e. a feature, and it requires a least-privilege DB role plus a migration; out of scope for a fix-only pass).
- Leave the dead helper in place (rejected — it documents a security property the system does not have, which is worse than not having it).
- Trust the guard-then-write services (rejected — several write PK-only after a scoped existence check; that is a TOCTOU pattern, and `card-crud.ts:76-87` trusted `boardInfo` without re-checking org at all).

**Decision:**

1. `deleteCardCascade` now takes a mandatory `organizationId` and re-derives the deletable id set through `cards → lists → boards` scoped to that org before any child-row delete. `deleteBoardCascade`, `deleteProjectCascade` and `deleteWorkspaceCascade` each assert ownership up front and 404 rather than cascade blindly. `hardDeleteItem('card')` pre-checks ownership and 404s.
2. `restoreItem` parent-reactivation writes are now org-scoped and only fire when the parent is actually soft-deleted (`isNotNull(deletedAt)`) — previously they restored parents unconditionally by PK, over-restoring and crossing tenants.
3. `createCard` and `cloneCard` resolve `parentCardId` with `organizationId` in the same predicate, so a foreign parent 404s and a parent that is itself a subtask still 400s.
4. Isolation is enforced by **per-query org filters**, audited by the Phase 0 sweep and guarded by the committed two-tenant regression suite `apps/backend/src/modules/trash/trash-tenancy.test.ts`. Postgres RLS remains an available defense-in-depth option for a future pass.

**Consequences:** Nine negative tests (orgA reaching for orgB ids) fail against the pre-fix code and pass after — verified by stashing the fix and re-running. The property being relied on is now explicit and regression-tested rather than assumed.

On `withOrgContext`: it is referenced only by `db/db.test.ts` — no migration or ops script depends on its replica routing or recent-write marker, so it is removed as dead code rather than relocated. Note that migration `0012_enable_row_level_security.sql` already created `USING (organization_id = current_setting('app.current_org_id', true)::uuid)` policies on `workspaces`, `boards` and `cards`, but those policies are **inert**: the app connects as the table owner, and RLS does not apply to the owner unless `FORCE ROW LEVEL SECURITY` is set. Enabling it without a least-privilege application role and a `withOrgContext` call on every tenant query would deny all traffic. That remains a future defense-in-depth option; `scripts/lint-raw-db.ts` already prevents new services from reaching for the raw clients directly.

---

### 2026-10-03 — Auth Failure Statuses Are Distinct; Empty-Org Fallback Stays Log-Only

**Context:** The `authPlugin` derive in `apps/backend/src/middleware/auth.ts` wrapped token verification, the active-membership check, the burned-refresh-family check and plan-tier resolution in a single `catch { set.status = 401 }`. Three distinct outcomes therefore reported as "Unauthorized — invalid or expired token": a token whose membership was revoked (must not be fixed by re-login), a burned session (correctly 401), and a database or Redis failure during membership resolution (an outage, not an auth problem). The 403 branch inside the try block was unreachable because its own `catch` rewrote it.

Separately, `requirePermission` resolved an empty `user.organizationId` by taking "the first active membership" with no ordering — for a multi-org user that grants whichever org the database returns first. Flipping that to a 400 was proposed as a fix.

**Alternatives considered:**

- Flip the empty-org fallback to a 400 in the same change (rejected — the caller check showed the degenerate state is reachable by a legitimately authenticated user, so this would have been a lockout, not a fix).
- Delete the fallback outright (rejected — same lockout risk, with no signal about who is affected).
- Keep the broad catch (rejected — it is the bug).

**Decision:**

1. Only a failed `verifyAccessToken` returns 401. A thrown error carrying a deliberate 401 or 403 propagates unchanged; anything else is logged with `path`/`user_id`/`organization_id` and returned as 503.
2. The empty-organization fallback is **instrumented, not removed** (step 1 of two). `requirePermission` logs a warning with the resolved org id whenever the fallback fires, and `auth-lifecycle` login logs when it mints an empty-org token. Step 2 — returning 400 — is deferred until the logs are quiet.

**Caller check behind deferring step 2:**

- `auth-lifecycle.ts` login and `auth-tokens.ts` `assertRefreshGate` both produce `organizationId: ''` for a user with no active membership, so an empty-org token is reachable through normal login and refresh, not only through an unpatched client.
- The dashboard and mobile app read the org from the token and have no org-selection UI, so there is no self-service path to pick a different org.
- `developer/service.ts` `generateApiKey` would have written an `api_keys` row scoped to no tenant and now rejects an empty org. `verifyApiKey` has no route consumer yet, so this was latent.
- Webhook and git-integration callers are HMAC-authed and never reach the JWT path.

**Consequences:** `auth-status.test.ts` covers each failure mode separately; two cases fail against the pre-fix code with 401 where 403 is correct. Clients can now distinguish "your session ended" from "you were removed" from "we are having an outage". A known 60s window remains on membership revocation: `assertActiveOrgMembership` caches under `auth:membership:{orgId}:{userId}`, and `bumpUserCache` targets a different key, so nothing invalidates it early — deliberate, and bounded by the 60s TTL.

---

### 2026-10-03 — Stripe Webhook Idempotency Uses a Claimed Processing State

**Context:** `POST /v1/billing/webhook` had one `catch` covering both signature verification and handler execution, returning `400` with `Webhook Error: ${errorMessage(err)}` in both cases. Stripe does not retry a 400, so any transient failure while processing a validly signed event — a database blip, a Stripe API timeout — discarded that billing event permanently, while the response body echoed internal error text to an unauthenticated caller.

Idempotency was also weaker than it looked. `billing_events.stripe_event_id` is UNIQUE, but the handler inserted its row only _after_ applying side effects, so:

- a crash between the side effects and the insert left no row, and Stripe's retry re-ran the whole handler, applying the change **twice**;
- the failure path inserted a row carrying `error`, which the next delivery matched as "already processed" and skipped — so the error row actively **poisoned** the retry;
- two concurrent deliveries both passed the `findFirst` pre-check and both executed the side effects.

**Alternatives considered:**

- Rely on Stripe's own retry semantics with no claim (rejected — that is precisely the double-apply path).
- Record the id before processing and treat any existing row as done (rejected — a crash mid-handler would then mark the event done and Stripe's retry would be skipped, losing the update).
- Wrap each handler body in a transaction (rejected as the primary mechanism — it cannot cover the external Stripe API calls or email sends, which are not transactional).

**Decision:**

1. `billing_events` gains `status` (`processing` | `done` | `failed`, defaulting to `done`) and `claimed_at`, via migration `0040_billing_event_status.sql` with an explicit down path. Existing rows backfill to `done`, matching prior behaviour.
2. The claim is taken **before** any side effect via an `INSERT … ON CONFLICT DO NOTHING`, then reconciled:
   - row inserted → we own it, proceed;
   - `done` → skip (already applied exactly once);
   - `processing` and fresh → another worker is live, skip;
   - `processing` and older than a 5-minute takeover window → a crashed handler, take over;
   - `failed` → retry, since side effects never completed.
3. Success marks `done`; failure marks `failed` and rethrows, so Stripe's retry is allowed through.
4. Route status codes split: missing/invalid signature → `400` (Stripe will not retry, correctly); processing failure → `500` with the generic body `{"error":"Webhook processing failed"}`, so Stripe retries and the claim state makes the retry safe. Internal error text goes to the log, never to the response.

**Consequences:** a crash between side effects and completion is now recoverable instead of duplicating, and a failed event is retried instead of being silently skipped. `webhook-idempotency.test.ts` covers the claim lifecycle including the crash-between and stale-takeover cases; `webhook-status-signed.test.ts` stubs `lib/stripe` so the 500 path is exercised offline with no credentials and no network. Two of these fail against the pre-fix code with 400 where 500 is correct.

**Migration note:** `db:migrate` reads `process.env.DATABASE_URL` and ignores `DATABASE_TEST_URL`, so it targets the configured development database unless the URL is passed explicitly (`DATABASE_URL=… bun run db:migrate`). `0040` is additive and idempotent (`IF NOT EXISTS` throughout, plus a backfill), so applying it to a database that already has it is a no-op.

---

### 2026-10-03 — Degraded Modes Enforce Locally; SSO State Moves to the Database

**Context:** Three subsystems shared a "if the backing store is unavailable, do nothing" shape, each of which removed a protection precisely when an attacker could least afford its absence.

1. **Rate limiter.** All three failure paths (Redis absent, >400ms timeout, Redis exception) returned `undefined`, i.e. fail-open. The pre-auth bucket (`2 rps / 30 burst`, keyed by client IP) protected sign-in, sign-up, refresh, SSO and invites — so a Redis outage converted them into an unthrottled credential-stuffing target.
2. **SSO `state`.** The callback read state from Redis inside `if (redis && isRedisAvailable())`, with the comment "Without Redis the WorkOS code exchange below is still required auth." When Redis was down the CSRF and replay check was skipped entirely.
3. **Presence store.** `HybridPresenceStore.activeStore` was re-evaluated per call, so a flapping connection split state mid-flight: a heartbeat written to Redis followed by a read from the empty in-memory map, producing flickering avatars and ghost users. Its sweeper also ran against both stores with one callback, so a single eviction could broadcast `presence:update` twice.

Separately, `createClientOptions.retryStrategy` returned `null` after 10 attempts, which stops ioredis permanently: after a long outage the process stayed degraded until a pod restart.

**Alternatives considered:**

- Fail closed on the rate limiter (rejected — turns a Redis outage into a total application outage, trading a security control for availability with no middle ground).
- Leave the limiter fail-open and rely on other layers (rejected — there is no other throttle on the pre-auth endpoints).
- Keep SSO state in Redis and reject when it is unreachable (rejected — that denies SSO login whenever Redis is down, which is its own outage).
- Re-evaluate the presence store per call (rejected — that is the bug).
- Per-pod Redis standby via a second URL (rejected — new infrastructure, i.e. a feature).

**Decision:**

1. **Rate limiter enforces from an in-process bucket** (`lib/memory-token-bucket.ts`) on every degraded path. It mirrors `TOKEN_BUCKET_LUA` exactly — lazy refill, `Math.floor` on remaining, `reset = ceil((capacity - tokens)/rate)`, and the same `EXPIRE` window via `bucketTtlSeconds` — so a Redis outage does not silently change anyone's effective limit. The accepted tradeoff is per-pod rather than cluster-wide limits: an attacker gets N× budget for N instances instead of unlimited. A new `rateLimiterMemoryFallbackTotal` metric distinguishes degradation from the historical fail-open counter, and the store is LRU-bounded at 10k buckets because pre-auth keys come from `x-forwarded-for`, which is attacker-controlled and would otherwise grow the map without limit.
2. **SSO state is stored in the database** (new `sso_login_states` table, migration `0041_sso_login_states.sql`). `expires_at` replaces the Redis TTL, `consumed_at` makes it single-use, and the claim is a conditional `UPDATE … WHERE consumed_at IS NULL` so two concurrent callbacks cannot both win. There is deliberately no "skip if the store is unavailable" branch: if the lookup cannot be completed, the callback is not authenticated. The service no longer imports the Redis client at all, which a test asserts structurally so the branch cannot return. If the database is also unavailable the request fails — the alternative (denying all SSO) is the same outage, just moved.
3. **Presence store is pinned once per instance** via `pinStore()`, and the sweeper starts on the pinned store only. `destroy()` clears the pin so a rebuilt store re-pins.
4. **Redis retries forever** with capped exponential backoff plus jitter, warning every 25 attempts.

**Consequences:** a Redis outage now degrades enforcement instead of removing it, SSO keeps CSRF/replay protection without Redis, and presence cannot split-brain within an instance's lifetime. `memory-token-bucket.test.ts` pins the bucket's parity with the Lua script (including a spoofed-header flood bounded to the burst, which the old fail-open path allowed to run to 500); `presence-pinning.test.ts` covers the flip-resistance and single-sweeper behaviour; `sso-state.test.ts` covers durability, expiry, single-use claim and the absence of Redis. Four of the SSO tests fail against the pre-fix code.

**Operational note:** Redis `commandTimeout` is 2000ms while the limiter's own race gives up at 400ms, so a slow Redis degrades to the local bucket rather than adding latency.

---

### 2026-10-03 — Sprint/Phase Permissions: Guards Already Existed; the Gap Was Ungated UI

**Context:** P0-8 in the fix plan assumed `phases/*` and `sprints/*` routes had no `requirePermission` guards and needed wiring. That assumption was wrong — all eight handlers in each file have been guarded. Verifying rather than assuming changed the shape of the work.

The real risk was the opposite one. `POST/PATCH/DELETE /sprints` require `sprint.create|update|delete` and the phase equivalents, but the **seeded system roles only grant those keys to Org Owner and Org Admin** — the `Member` role receives `card.sprint.assign` and nothing at project level. So a member can open a sprint board and see `Start Sprint`, `Complete`, `Create Sprint`, `Add Phase`, `Start Phase`, all of which return 403. Neither `ProjectSprints.tsx` nor `ProjectPhases.tsx` consulted `usePermissions` at all.

**Alternatives considered:**

- Add `sprint.*`/`phase.*` to the seeded Member role (rejected for now — that is a product decision about who may run a sprint, not a bug fix, and it would widen every member's grant without being asked).
- Leave the UI as-is (rejected — dead controls that fail on click, which AGENTS.md §7 treats as a defect).

**Decision:**

1. Gates the dashboard on the keys the routes actually require: `CreateSprintDialog` and `CreatePhaseDialog` return `null` without `sprint.create`/`phase.create` (matching the existing `Create*Dialog` pattern for workspaces, projects and boards), and the status-transition buttons are replaced by a `permissionReason` label when the role lacks `sprint.update`/`phase.update`. Reads are untouched, so members keep full visibility.
2. The permission check sits **after** every hook and treats `permsLoading` as "no permission", because `usePermissions` reads the auth store and permissions arrive asynchronously — an early `return null` before the hooks would change hook order between renders.
3. Added `sprint-phase-permissions.test.ts` to pin the contract: every handler is guarded, reads use `project.read` while mutations use their specific key, Owner/Admin hold all six keys, Viewer reads but cannot mutate, Member reads but cannot mutate, and no role can mutate without being able to read. The Member assertion is deliberately pinned so that granting Member these keys later produces a deliberate signal to revisit the gating rather than a silent UI inconsistency.

**Consequences:** members and viewers get a coherent read-only sprint/phase view with an explicit reason instead of buttons that 403. Custom production roles are covered by the same gate, since it reads the effective permission set rather than a role name. If sprint management is later opened up to members, the pinned Member assertion is the tripwire.

---

### 2026-10-03 — Trash Purge Is Atomic and Batched; the Cascade Is Completed at the Service Layer

**Context:** `emptyTrash` walked the trash with a bare sequential loop and no transaction. Any failure part-way left the org half-purged and still returned `{success: true}`. The cascades were also incomplete: a survey of every `card_id` column in the live schema found 19 tables, of which the cascade covered 12.

Of the seven uncovered tables, five carry a **NO ACTION** foreign key — `calendar_event_links`, `card_events`, `document_cards`, `form_submissions`, `git_links` — so the database actively refuses the card delete and the request fails with `23503` mid-purge. The other two are handled by the database already (`card_views`/`card_components`/`card_access_requests` are CASCADE, `chat_channels.card_id` and `automation_rule_runs` are SET NULL), and there deleting the parent row by hand would be wrong: nulling a chat channel's card link is the intended behaviour.

Separately, `listTrash` used `innerJoin` from projects to workspaces and from boards to projects, so a trashed project whose workspace had been hard-deleted silently disappeared — unrestorable _and_ unpurgeable, since `emptyTrash` drives off that same list.

**Alternatives considered:**

- Add the five FKs with `ON DELETE CASCADE` (rejected — the plan's original approach, and it is a schema migration with no current benefit; orphan counts came back zero on both databases, so there is nothing for a constraint to fix. It would also silently delete audit-shaped rows such as `card_events`.)
- One transaction for the whole purge (rejected — holds locks for the length of a large purge; the plan itself asked for batching to avoid a long lock.)
- Cache bumps inside the transaction (rejected — a rolled-back purge would still have invalidated every cache).

**Decision:**

1. The five NO ACTION tables are deleted explicitly before the card row. A test introspects `information_schema` at run time and asserts that **every** `card_id` table with `delete_rule = 'NO ACTION'` is covered by the cascade, so a future table cannot be added without it.
2. `emptyTrash` deletes inside transactions chunked at 50 items, ordered children-before-parents so a parent's cascade does not 404 on a child it just removed. `purgedCount` reports what was actually removed, so a partial failure surfaces as an error rather than a silent success. The tradeoff — earlier chunks stay purged if a later one fails — is preferable to one long lock, and is now visible instead of hidden.
3. `hardDeleteItem` is split into a cache-free `hardDeleteItemCascade` plus cache bumps, so `emptyTrash` invalidates once after commit.
4. `listTrash` uses `leftJoin` for both parent chains.

**Consequences:** a card with a document link, card event, form submission, calendar link or git link can now be hard-deleted instead of failing with a foreign-key violation half-way through a purge. No migration was needed and none is included — the orphan counts (zero on the test database and on Neon, which holds 3,537 cards) are recorded here as the reason.

**Also in this commit:** `createCard` was found to bump the parent's _cache_ for subtask creation without ever incrementing the parent's `subtasksTotal` _column_ — only `cloneCard` did — so `getCard` reported `subtasksTotal: 0` for any subtask created through the normal API. `createCard` increments; `deleteCard` and `archiveCard` decrement with `GREATEST(0, …)`, since `getCard`'s subtask query excludes archived rows. Related: `card-members` and `card-activity` called `bumpCardAndBoard` directly, skipping the parent invalidation that `bumpForCard` performs, and a cross-board move relied on the cached card→board map to find the source board. All now pass the resolved board id explicitly.

### 2026-10-04 — Dialog Close Precedence Is a Stack, and `useEscapeKey` Must Preempt `useDialogClose`

**Context:** P2 enforced the AGENTS.md §11 single-close-path contract across 33 dashboard files. Two findings were not about _having_ one close path but about _ordering_ between two of them.

**The mention-menu bug.** The mention menu handled Escape in a **bubble**-phase `onKeyDown` on the textarea. The hosting dialog's `useDialogClose` listens on `document` in **capture** phase. The DOM delivers capture on `document` before any bubble listener on the target, so `requestClose` ran first: one Esc closed the whole task dialog _and_ the menu. The `return` at the end of the bubble handler was dead code that had been read as protection.

**Alternatives considered:**

- `stopPropagation()` in the mention menu's handler (rejected — it cannot help. The dialog's listener is on an _ancestor_ in capture phase, which runs before the target's bubble phase. No amount of stopping propagation from the target can un-run a capture listener that already fired.)
- Have the mention menu check "is a dialog open?" and no-op if so (rejected — couples a leaf component to its host's state, and inverts the dependency.)
- Give the mention menu its own capture-phase listener on `document` (rejected — it would still be registered _after_ the dialog's, so the dialog would still win.)
- Reuse `useEscapeKey` (chosen).

**Decisions:**

1. **The mention menus register on the existing `useEscapeKey` LIFO stack.** That hook registers on `window` in capture phase and calls `stopImmediatePropagation`, so it runs before `useDialogClose`'s `document` listener and the event never reaches the dialog. This reuses a primitive the popovers already carry for exactly this precedence problem rather than inventing a third mechanism.
2. **Ordering is now documented, not changed.** `useEscapeKey` registers on `window` in capture; `useDialogClose` registers on `document` in capture. Capture propagates `window` → `document` → … → target, so `window` always wins. That is load-bearing for the four popovers that keep their own `useEscapeKey(fn, true)` and for `TrashBinModal`'s nested confirms, so the contract test asserts the ordering rather than leaving it as folklore.
3. **Nested dialogs stand down explicitly.** `TrashBinModal`'s three confirms and `ListColumn`'s two mount while the parent is open; the parent now yields via `handleEscape` while a child is open, rather than relying on stopImmediatePropagation ordering to save it.
4. **`MentionAutocomplete` was deliberately left on its bubble handler.** Its composer lives in `ChatThreadPane`, which is not inside a `Dialog`, so there is no competing capture listener and the bubble handler is correct. The guard documents that distinction rather than rewriting working code.

**Consequences:** the Escape key now means one thing everywhere — close the topmost thing. The contract test gained a comment-stripping step, because the assertion was masked twice by prose _mentioning_ `useEscapeKey` in a comment: the first version passed against code with the call removed. A source-text assertion that can be satisfied by a comment is worse than no assertion.

**Benchmark:** Linear's command palette and Slack's emoji picker both claim Escape above their host surface via a stack, not a flag. Matching that.

---

### 2026-10-04 — A Disabled Control Must Explain Itself, but "Saving…" Is Not an Explanation

**Context:** AGENTS.md §7 says a visible control must either act or be disabled with an explanatory tooltip. P3 audited every disabled control in the dashboard and super-admin.

**Decisions:**

1. **Permission gates get a real reason, via the existing `permissionReason` helper.** Applied to `AutomationsModal` save (both header and footer), `RuleEditor` save — which distinguishes "no permission" from "no changes yet", two states that look identical otherwise — and `ProjectsList` import.
2. **The ~100 remaining disabled controls were left alone, on purpose.** They are gated on `isPending` or an empty required field, where the button's own label already explains the state. Adding "Saving…" tooltips there is noise, not information; it would also make the genuinely-permission-gated tooltips harder to notice, which defeats the purpose of adding them.
3. **Two audit claims were rejected after inspection.** Priorities' `canCreate` is a _validation_ check, not a permission — its title now says "Enter a name for the new level", which is the actual reason, rather than a permission message that would be wrong. super-admin `PlatformUsers`' two `isBot`/`isSystemBot` buttons already carried titles.

**Consequences:** the rule is now "explain the reason a user cannot act", not "explain disabled". A disabled button whose label already says why needs nothing.

---

### 2026-10-04 — A Dead Affordance Is Removed, Not Faked; Rule Editing Stays a Product Decision

**Context:** P3-5 audited every `cursor-pointer`, pill, badge and hover affordance for controls that look interactive and do nothing.

**Decisions:**

1. **Where a handler was missing but the affordance was correct, the handler was added.** The checklist title was an `<h4>` with `cursor-pointer hover:text-primary` and no handler — the only such pair in the file, so it was the most tappable-looking element in the card and was completely inert, with no cue at all for touch users. It is now a `<button>` driving the _same state the "Rename checklist" menu item already sets_, so the two entry points cannot drift apart.
2. **Where no handler exists anywhere and adding one is a feature, the affordance was removed.** Automation rule tiles had `hover:bg-muted/20 transition-colors` — the universal "this row is clickable" signal — but there is no edit path for a rule in the entire file, only create and delete. Building a rule editor is a feature; this pass is fix-only. The hover tint is gone so the tile stops lying, and **rule editing is recorded as an open product item** rather than quietly shipped or quietly dropped.
3. **`PresenceAvatars` kept its tooltip and lost its `cursor-pointer`.** The tooltip is information; the cursor was a promise.
4. **A static guard replaces the audit as the ongoing mechanism.** `src/dead-ui.contract.test.ts` asserts that no native element carries `cursor-pointer` without a click/key handler.

**Two things the guard had to get right, both learned by it being wrong first:**

- **A regex cannot delimit a JSX tag.** `className` template literals contain nested `${…}` conditionals and JSX blocks, so the first version missed real handlers and reported false positives. The guard walks tags with a brace/backtick counter instead.
- **Base UI / Radix `render={<div/>}` and `asChild` inject handlers at runtime.** Those elements look handler-less in source but are not, and the first version flagged six of them. The guard now skips anything lexically inside an open `render={`. This is also why the audit's `cursor-pointer` grep was mostly false positives — the sub-agent that did the manual pass ruled them out by reading the surrounding code, and that reading is what the guard now encodes.

**Consequences:** the class of bug cannot come back silently, and the two remaining dead controls found by the guard (`PresenceAvatars`, the saved-search row) were ones a human reading the audit list had missed.

**Benchmark:** Asana and Linear both make a list section's title the rename affordance, and both keep a destructive row action visible on touch rather than hover-only.

---

### 2026-10-04 — The Shared Test Database Is a Public Space: Scope Every Delete, and Never Swallow a Teardown Error

**Context:** P4 audited the backend suite's isolation. 59 files share one `boardly_test` database. Three distinct defects, in ascending order of how long they had been hiding.

**1. Thirteen deletes had no `WHERE` at all.** The worst were three bare `db.delete(schema.refreshTokens)`. `refresh_tokens` is shared, so those wiped every live token in the database from a `beforeEach` in two auth suites. An unrelated suite signing in mid-test could fail with a 401 **purely from file execution order**.

**Alternatives considered:**

- Run each suite against its own database (rejected — provisioning 59 databases is new infrastructure, i.e. a feature, and it would not have caught defect 2 below at all).
- Restore the database from a snapshot after each run (rejected — hides the ordering dependency instead of removing it, and a snapshot is a new operational surface).
- Enforce per-suite id scoping (chosen).

**2. Three teardowns could not succeed and hid it.** `search.test.ts` and `superadmin.test.ts` wrapped their chains in `catch {}`; `timetracking.test.ts` put `.catch(() => {})` on the roles delete and again on the organizations delete. None deleted `rolePermissions` or `subscriptions`, so the org delete threw on a restrict FK — and the handler swallowed that error _and every statement after it_. The teardown never ran to completion, on any run, ever, while the suite reported green.

**3. `chat.test.ts` created 21 organizations per run and deleted none.** Measured by counting rows before and after a full run: one `bun test` added **92 organizations, 122 users, 112 memberships**. The scratch database had accumulated **4,702 organizations**.

**Decisions:**

1. **Every delete in a test file is scoped with `.where()`.** Enforced by a static scan in `test-isolation.contract.test.ts`, not by convention — a destructive delete is only ever observable by _what survived_, which is precisely the failure mode that hides.
2. **Never delete a row the suite does not own.** The one case found was the global `Member` system role (`organizationId = null`). Its name must remain `Member` because `resolveRolePool` matches on `systemRoleName(role)`, so the row **cannot** be suite-scoped; the correct terminal state is the canonical seeded row, left in place.
3. **A teardown error must be loud.** `.catch(...)` on a `db.delete(schema.x)` and empty `catch {}` blocks are both now test failures. The guard is scoped to raw schema deletes on purpose: a swallowed reject on a _service_ call such as `deleteCard` on an already-deleted row is legitimate and is not flagged.
4. **`deleteTestOrg` is the single sanctioned teardown, and it was incomplete.** `organizations` has **30 NO ACTION foreign keys** pointing at it — confirmed by querying `information_schema`, not assumed — so every suite that rolled its own chain had to rediscover them one FK error at a time, and the three broken chains above each missed `rolePermissions`. The helper now covers everything a `signUp` produces, including `sso_configurations`, whose absence had forced three suites to hand-roll that single statement.
5. **Suite-specific leaf chains stay explicit.** `chat-test-teardown.ts` exists because chat's `chat_messages` is self-referential, so `parent_message_id`/`reply_to_message_id`/`forwarded_from_id` must be nulled before any message row is deleted. That knowledge belongs beside the suite, not in a general helper — and it lives in a sibling module because `chat.test.ts` is already the largest test file in the repo (§10).
6. **The leak is a number, not an anecdote.** `scripts/db-leak-report.ts` (`bun run db:leaks`) reports totals, and `--slugs` groups by slug prefix so the offending suite is identifiable from the name.

**Consequences:** a run is now reproducible against a dirty database, and a suite that leaks is measurable rather than invisible. Fixing chat took the per-run leak from 92 orgs to 71 and was verified by counting (chat orgs 1234 → 1234, orphan chat users 636 → 636). The remaining 71 orgs/run, the ~18 suites still hand-rolling a chain that now works, and the 4,702 banked rows in the local scratch DB are **recorded as remaining work rather than left for someone to rediscover**.

---

### 2026-10-04 — `scripts/db.sh` Refuses a Remote Database Unless the Opt-In Is Explicit

**Context:** `scripts/db.sh` can drop a schema (`db.sh reset`). It had no idea which database it was about to touch. `db.sh up` starts a local Postgres container and the help text said `migrate` = "Run migrations on dev database" — but `migrate`, `seed`, `reset` and `studio` forwarded `.env`'s `DATABASE_URL` verbatim. **This is how `0040_billing_event_status.sql` was applied to the shared Neon database during what was meant to be local work.** Nothing printed a target and nothing objected. The migration was additive and idempotent and no data was lost; the next one might not be.

**Alternatives considered:**

- Point the default commands at the local container and add `migrate:remote` for deliberate remote work (rejected — it silently changes what every existing muscle-memory command does, including in muscle memory I did not know existed. A guard that announces itself is safer than a redefinition that does not.)
- Prompt for confirmation (rejected — the script is used non-interactively, and a prompt that can be piped through is not a control.)
- Rely on documentation (rejected — the documentation was what was misread.)

**Decisions:**

1. **Every writing command resolves its target, prints it, and refuses a non-local host** with exit 1 and a message naming the local alternative. The refusal is a real `exit 1` before any runner is invoked, so it works in CI and in a pipe.
2. **The opt-in is explicit and singular: `ALLOW_REMOTE_DB=1`.** `CI=true` was briefly accepted as a second opt-in and had to be removed — see below. The `:test` variants are held to the same rule so a remote `DATABASE_TEST_URL` cannot reintroduce the accident through the back door.
   - **`CI=true` is not an opt-in**, because the pipeline runs `bun run --cwd apps/backend db:migrate` directly and never calls this script, and because a flag meaning "this is a machine" cannot double as "yes, I mean to write to the shared remote database". Accepting it broke the guard's own test in CI: with `CI=true` ambient in the runner, the guard waved the remote through and the test invoked the runner against a bogus Neon hostname. A flag whose meaning changes depending on who is reading it is not a control.
3. **The target is printed as `host:port/database` only.** Credentials are never echoed (AGENTS.md §6), and `scripts/db.sh.test.sh` asserts that with a literal password in the fixture URL.
4. **The real environment beats `.env`.** This was a _second_ defect, found only because the guard's own tests could not make it refuse: `.env` was loaded with `set -a; source .env; set +a`, which overwrites variables the caller already exported. So `DATABASE_URL=… ./scripts/db.sh migrate` and `ALLOW_REMOTE_DB=1` were both inert and `.env` always had the last word. Each line is now applied only when its key is not already set.
5. **`run_in_backend` changes directory instead of using `--cwd`.** `bun run --cwd DIR script` works, but `bun --cwd DIR run script` silently prints bun's help and exits 0 **without running anything**. Depending on a flag ordering that quietly does nothing is not acceptable in a script that can reset a database.

**Consequences:** local workflows are unaffected — a local `DATABASE_URL` prints `(local)` and proceeds exactly as before. `scripts/db.sh.test.sh` (25 assertions, also in CI) covers redaction, host classification, `.env` precedence, refusal for all five writing commands, the empty-URL case, that `CI=true` is _not_ an opt-in, and the explicit opt-in path; **16 fail against the pre-fix script.** The opt-in paths call the guard function directly rather than through a subcommand, so allowing the write never leads to a connection attempt against a real provider's domain.

---

### 2026-10-04 — The Frontend Test Script Was Missing, So CI Was Green Without Running The Frontend

**Context:** while trying to run the dashboard suite during P3, `bun test` in `apps/dashboard` reported 17 failures — all of them "Playwright Test did not expect test.describe() to be called here", because with no path argument bun globs the whole package and loaded the 17 Playwright specs in `e2e/`.

Investigating that turned up the more serious problem: `bun run test` fans out to `turbo run test`, and **turbo skips any workspace package without a `test` script**. `apps/dashboard` had `test:e2e`, `test:e2e:smoke` and `test:e2e:full` but no `test`. `turbo run test --dry` reported `dashboard#test -> <NONEXISTENT>`. All 47 dashboard unit tests — the dialog-close contract, the DnD tests, the session/theme contract, the dead-UI guard — had never been executed by CI. They passed locally only because they were being invoked by hand.

**Alternatives considered:**

- Add a `bunfig.toml` only (rejected — fixes the phantom failures but leaves CI not running the tests at all, which is the actual defect).
- Move the e2e specs out of the package (rejected — large, disruptive, and treats the symptom).
- Add the missing `test` script _and_ scope the bare invocation (chosen).

**Decisions:**

1. **`"test": "bun test src"` in `apps/dashboard`**, so `turbo run test` includes it. Verified via `turbo run test --dry=json`.
2. **`apps/dashboard/bunfig.toml` with `[test] root = "src"`**, so a bare `bun test` is _also_ correct rather than only the scripted form. A red test run that means nothing is worse than no test run, because it teaches you to ignore the output.
3. **e2e keeps its own runner and its own scripts** (`test:e2e`, `test:e2e:smoke`, `test:e2e:full`) — it is a different tool answering a different question, not a special case of the unit suite.
4. **Removed `turbo.json`'s `test.outputs: ["coverage/**"]`.** No task writes a coverage directory; the backend runs `bun test --coverage`, which prints a text table to stdout. The key produced three "no output files found" warnings on every run, and a warning you always see is a warning you stop seeing.

**Consequences:** `bun run test` is now 3/3 tasks — backend, dashboard and mobile — with no warnings, and a frontend regression fails CI instead of waiting to be noticed locally.

---

### 2026-10-04 — Performance Pass: Five Fixes, and One Recommendation Deliberately Not Taken

**Context:** the brief was explicit — improve performance by fixing the existing codebase, build nothing new. An audit of `apps/backend` and `apps/dashboard` surfaced roughly 30 defects. Five batches were implemented as five commits. Four choices inside them are worth recording, because each one is a case where the obvious fix was the wrong one.

**1. The permission registry is seeded at boot, not per request.** `resolveUserPermissions` — the function behind `requirePermission`, so it runs on every authenticated route — was issuing a ~60-row `INSERT … ON CONFLICT DO NOTHING` and a full-table `permissions` scan per request. The scan was only ever _used_ in the platform-admin / `org_owner` / `org_admin` branch; for a regular member it was pure waste.

- Alternatives: keep the write per request but make it conditional (rejected — the cost is the round trip, not the conditional); cache the resolved permission `Set` in Redis (rejected — `getCachedAllow` already caches the _decision_; the write was happening before the cache was consulted, so caching downstream would not have removed it).
- Chosen: seed once in `src/index.ts` next to `runBootMigrations`, memoize `ensurePermissionsSeeded` per process (with the memo cleared on failure so a transient error is retried, and `permissionsReset()` exported for tests), and move the registry scan inside the branch that uses it. The auth path is now read-only.

**2. Read-replica routing stays removed; the pool size becomes configuration.** The audit's top structural recommendation was to route `SELECT`s to the already-open 10-connection read pool, since `db = rawWriteDb` funnels all traffic through 5 connections and every N+1 above multiplies against that ceiling. That is exactly the change `docs/Decisions.md` (2026-10-03) **removed** as dead code, and the same entry records why: no migration or ops script depends on it, and enabling it without a least-privilege role plus an org-context transaction would deny all traffic.

- Reintroducing it now would trade a query-count problem for a correctness problem. A card created and immediately listed can miss, because the write landed on the primary and the read on a lagging replica. In a collaboration product where the board reorders and comments stream in, stale reads are a worse failure than a slow query.
- Chosen: **fix the N+1s instead**, since that is what actually consumes the pool, and expose the size as `DATABASE_POOL_MAX` (default `5`, behaviour unchanged) so raising it is an explicit ops decision made against a known RDS Proxy / PgBouncer ceiling — and multiplied by replica count, since the limit is per instance. `readClient`/`rawReadDb` remain unused; `postgres.js` connects lazily, so they cost nothing while idle.

**3. `ChatMessageCard` gets narrow selectors, not `useShallow`.** The store-wide subscription was replaced with per-field selectors plus two _derived_ values — "is any recipient online" and "the newest read receipt among them" — each returning a primitive. This is stronger than `useShallow({ presenceMap, readReceipts, messageLayout })`: with `useShallow` a presence tick for one author still re-renders all 50 cards, because the map identity changed. Deriving in the selector means only the cards whose _rendered tick actually flips_ re-render.

The catch is that `memo` is worthless without stable props, and `ChatFeed` was passing 13 inline arrows. Those became `useCallback`s depending on the `mutate` functions — stable in TanStack Query v5 — and explicitly **not** on the mutation result objects, which are new every render. That same mistake was live in `UsersPage`, where it made the data grid rebuild its row model continuously; both were fixed the same way.

**4. Stripe and bcrypt moved out of open transactions, with re-validation under the lock.** Holding `SELECT … FOR UPDATE` and one of five pooled connections across a network call with a 10s timeout is the failure mode that turns a Stripe hiccup into an org-wide billing outage. Each function now reads, validates and calls Stripe first, then opens a short transaction for the writes.

This is not free: moving the read out of the transaction means the value could change before the write. For `increaseSeats` the transaction **re-validates** the quantity under the row lock and throws a retryable error on mismatch, so a concurrent webhook cannot be silently overwritten. For `scheduleSeatDecrease` the member-count gate needs no row lock and is re-checked before Stripe is called; the residual window (a member added in the milliseconds between the check and the write) is accepted because Stripe's decrease is scheduled for the period boundary and the webhook remains the source of truth — the same single-source-of-truth stance the function already documented. bcrypt is unconditional: hashing is pure CPU and never needed the lock.

**5. `pg_trgm` was already there — the audit was wrong about one column.** The audit reported "no `pg_trgm` index anywhere", but migration `0034` created `notifications_search_trgm_idx` on `notifications.search_text`. Corrected in `Progress.md`. The remaining leading-wildcard `ILIKE` columns genuinely had none, so `0042` adds them. The migration is hand-authored SQL plus a journal entry, matching `0027`–`0041`; drizzle snapshots stop at `0026`, so this continues the established convention rather than introducing one. The btree indexes are _also_ declared in `schema/index.ts` (as `0034` did) so they stay visible to `drizzle-kit`; the trigram ones cannot be expressed in the schema at all, since drizzle has no `gin_trgm_ops`.

**Consequences:** the auth path no longer writes to the database, the chat feed is bounded by what actually changed rather than by what the store holds, the webhook dispatcher is no longer a cross-tenant sequential scan, and money paths no longer hold a row lock across the network. Migration `0042` was verified against `boardly_test` — all 10 indexes present. Raising `DATABASE_POOL_MAX` in production remains an ops decision and is **not** part of this pass.

---

### 2026-10-04 — Two Judgement Calls in the Second Performance Pass

**1. `emptyTrash` had to be rewritten, not just left alone.** `listTrash` is now bounded, which is correct for the HTTP route — a tenant with a very large trash was streaming every trashed row into one response. But `emptyTrash` called `listTrash` once and purged everything it returned, so bounding the listing would have made "Empty Trash" quietly purge only the newest page while reporting success. **A performance fix that silently skips work is worse than the slow version it replaced**, because the slow version was at least honest. It now pages until a pass comes back empty.

While there, cards within a page go through one `deleteCardCascade` call instead of one per card — the same statements in the same order, but not ~17 round trips per card. The fourteen leaf deletes inside that cascade were pipelined only after checking the schema: no foreign key points at any of those fourteen tables, so the sole ordering constraint is `checklistItems → checklists → cards`. Pipelining statements whose FK order is unverified would have turned a slow purge into an intermittently failing one, and `Promise.all` does not respect statement order on a shared connection in the way the cascade requires.

**2. Chat feed virtualization was declined, and that is a decision worth recording rather than an omission.** The audit's recommendation was sound in the abstract — `@tanstack/react-virtual` is already a dependency, already used for the kanban board, and the message list is the largest list in the chat surface. It does not apply to the current code: the feed requests a hard-capped `limit=50` with no pagination and no load-more, so there are at most 50 rows. Windowing 50 rows introduces dynamic height measurement, scroll anchoring and overscan tuning — a well-known source of "message list jumps while scrolling" bugs — in exchange for no measurable gain, because the actual cost at 50 rows was markdown re-parsing and store-wide re-rendering, both of which are already fixed.

Gating it behind a threshold above 50 was rejected as well: it would be unreachable code today, and AGENTS.md §7 forbids dead UI. So the feed is left unvirtualized **on purpose**, with the trigger recorded — virtualize when the page size is raised or infinite scroll lands, not before.

---

### 2026-10-04 — Permission Keys Are Now Compile-Checked, Not Just Registry-Checked

**Context:** a question about why `permissions-resolver.ts` used raw string literals (`'card.move'`, `'card.create'`, `'member'`) when `packages/shared-types/src/permissions.ts` already exports `CARD_PERMISSIONS`, `BOARD_PERMISSIONS`, `PROJECT_PERMISSIONS`, `WORKSPACE_PERMISSIONS` and `OrgMemberRole` — and `roles/service.ts` already imports and uses them. The inconsistency was real and so was the risk, but the shape of the risk was not obvious, so it was measured rather than asserted.

**What was actually protected, and what was not:**

| Site                                              | Before              | A typo was caught?                     |
| ------------------------------------------------- | ------------------- | -------------------------------------- |
| `PERMISSION_ALIASES` values                       | `PermissionKey[]`   | **Yes** — compile error                |
| `PERMISSION_ALIASES` keys                         | `Record<string, …>` | **No** — compiled and passed CI        |
| member/viewer baseline arrays                     | inferred `string[]` | **No** — compiled and passed CI        |
| alias expansion `if (granted.has('card.update'))` | bare strings        | **No**, and duplicated the alias table |

Verified empirically rather than assumed: `'card.typo_here'` in an alias _value_ is a compile error, while `'card.mvoe'` as an alias _key_ and `'card.readd'` in the member baseline both compiled clean and `scripts/check-permissions.ts` reported `ok`. That script only scans `requirePermission('x')` and the dashboard's `can()` family, so none of these four sites were in its net. The failure mode is silent and narrow: a misspelled baseline key grants nothing, so one action 403s for the affected role and nothing else looks wrong. A misspelled alias key costs that permission its fallback path, which is even harder to spot because the primary key still works.

**Decisions:**

1. **The alias map is declared with `satisfies`, not a `Record` annotation.** A `Record<string, PermissionKey[]>` annotation checks the values and leaves the keys as bare strings — precisely the half that was unguarded. `satisfies Partial<Record<PermissionKey, readonly PermissionKey[]>>` validates both sides against the registry union while leaving the inferred type narrow, and the export is widened once at the boundary so `PERMISSION_ALIASES[someString]` in `middleware/auth.ts` keeps working. An explicit `as PermissionKey` still bypasses this, which is the correct trade: the escape hatch is visible in review, whereas a typo is not.
2. **Baseline arrays are typed `PermissionKey[]` built from constants**, grouped into a `ROLE_BASELINE_KEYS` lookup keyed by `OrgMemberRole` instead of an `if (rawRole === 'member') / else if (rawRole === 'viewer')` chain. Adding a role is now a table entry rather than a new branch.
3. **Role comparisons use `OrgMemberRole`**, and the `'Viewer'` / `'Billing Manager'` display strings moved into a named `SYSTEM_ROLE_NAME_BY_ORG_ROLE` map. Those strings are not permission keys — they must match seeded `roles.name` rows — so they are labelled as data instead of being mistaken for keys.
4. **The alias expansion is derived from the alias map** rather than three hand-written `if` lines. Those lines duplicated the table with no compiler link; renaming a constant in one place would have silently broken the other. Deriving it also makes the behaviour symmetric — holding either side of an alias now grants the other.
5. **No change to `scripts/check-permissions.ts` was needed.** Once these sites are typed as `PermissionKey`, the compiler subsumes the script for them: `PermissionKey` is derived from the same `as const` objects that build `ALL_PERMISSION_KEYS`, so a value cannot typecheck without also being a registry key. Adding regex scans for string literals would have re-created the hole the type system now closes.

**Consequences:** both injected typos are compile errors, verified by re-introducing them. A regression test pins the derived expansion's behaviour (fallback-only grants the target; unrelated keys grant nothing). Backend suite is 464 pass / 1 skip / 0 fail.

**Amendment (same day): `satisfies` was the wrong tool for the alias map's _export_.** `satisfies` preserves the literal inferred type, so the map could only be indexed by its three declared keys — `PERMISSION_ALIASES[permissionKey]` in `middleware/auth.ts` (a `PermissionKey`) was `TS7053`. The previous commit worked around that by re-widening the export to `Record<string, …>`, which put the unguarded key type straight back on the boundary. Since every consumer already holds a `PermissionKey`, the wide annotation was removed rather than kept: `Partial<Record<PermissionKey, readonly PermissionKey[]>>` both type-checks the keys (the property is a compile error for an unregistered key — that is the behaviour `satisfies` was chosen for, and an annotation keyed by `PermissionKey` gives the identical check) and permits indexing by any registry key. The same reasoning closed the last two `string`-typed signatures in the file: `satisfiesPermission` and `permissionDenied` now take `PermissionKey`. A misspelling in either used to compile and fail closed — the action 403s for a role that holds the permission, with no build error and nothing in `check-permissions.ts`, which scans `requirePermission()` and the dashboard `can()` family rather than either helper.

**Amendment (same day, second): the seed scripts were the one place the compiler could not reach, so they got the script instead.** Decision 5 above said no change to `scripts/check-permissions.ts` was needed. That holds for `permissions-resolver.ts` and `roles/service.ts`, but the sweep that produced it never covered `apps/backend/src/db/seed.ts` and `db/reset.ts`, which still held 28 raw permission literals across `memberRevoke` and two copies of `adminExclude` (`seed.ts` and `reset.ts` each declare their own — the exclusion set is duplicated verbatim). A typo in `memberRevoke` is worse than a typo elsewhere: the array feeds `inArray(permissions.key, …)` inside a DELETE, so an unregistered key matches no row and the stale over-privileged grant is simply never revoked, silently. Both files are top-level scripts that open a DB connection at import time, so neither a unit test nor the compiler can cover them.

Both arrays are now built from the canonical constants and typed (`readonly PermissionKey[]` / `new Set<PermissionKey>`), which closes the loop for anything written in the constant style, and `check-permissions.ts` gained a rule scoped to exactly these two files for the literal style. The scope is deliberate and was measured, not guessed: a repo-wide dotted-literal scan produces **32 distinct hits, every one a false positive** — audit actions (`card.moved`, `list.created`, `member.invitation.accept`), notification types (`card.assigned`, `card.mentioned`, `card.due_soon`), realtime event names (`card.archived`, `card.labeled`, `card.watched`), plus `chat.png` and the `'card.mvoe'` typo quoted in `permissions-resolver.ts`'s own doc comment. Those are a separate namespace that merely shares the `domain.verb` shape, so the scan is restricted to the seed scripts, which contain zero such strings. The rule was validated by injecting `'card.sprint.asign'`: `tsc` reports `TS2820 … Did you mean "card.sprint.assign"?` and the script exits 1 independently — two independent guards. Equivalence of the converted sets was proven by diffing the resolved key sets against the original literals (`adminExclude` IDENTICAL, `memberRevoke` IDENTICAL, 85 admin keys of 98).

### 2026-10-04 — Three Silent-Zero Defects: One React Query Shape Collision, One Hook-Order Violation, One Swallowed 502

**Context:** three separate reports of "the UI shows nothing / everything is zero / it failed" where the backend response was correct. All three shared one root cause class: **a correct value discarded by the layer in front of it**, with no error and no log. None was a backend data bug. They are recorded together because the pattern — not the individual lines — is the lesson.

**1. My Tasks counters rendered 0 against 32 assigned tasks (`['my-tasks','summary']`).** `pages/MyTasks.tsx` and `components/AppSidebar.tsx` both registered the _same_ query key with their **own `queryFn` and different return shapes**: the page returned `{ summary, total }`, the sidebar returned a bare `summary`. TanStack keeps one cache entry per key and one `queryFn` per entry, so the last observer to mount decided the cached shape for both. The loser read `undefined` off a fully-populated response and every counter hit its `?? 0` fallback — the API's correct `totalAssigned: 32` was never displayed. `placeholderData: prev => prev` on both sides _preserved_ the wrong shape across transitions rather than masking it, and the code comments on both sides asserted the sharing was deliberate.

The fix is not a second `select`. Both call sites now go through a single `hooks/useMyTasksSummary.ts`, so there is exactly one `queryFn` and the shape cannot disagree with itself; the sidebar reads through the envelope (`?.summary?.openAssignedCount`). Demonstrated rather than asserted: `useMyTasksSummary.collision.test.ts` drives real `QueryObserver`s and shows that with two differing `queryFn`s the page's `total` genuinely disappears and `?? 0` genuinely yields `0`. A static guard pins that the key is declared in exactly one file.

**2. "Rendered more hooks than during the previous render" crashed `/my-tasks` to the error boundary.** In `TaskDetailView.tsx`, the four `useDialogClose()` calls sat **after** `if (isCardLoading) return …` and `if (!card) return …`. React requires an identical hook order every render; they were skipped on the loading render and ran on the first render that had a card. Hoisting them above both guards fixes it — they depend only on `useState` values, so the hoist is behaviour-preserving. Note this also silently defeated AGENTS.md §11: a dialog-close handler registered conditionally is not "one close path". The contract test now asserts the last `useDialogClose` precedes every early return, and that guard was verified to **fail** when the buggy ordering is reinstated.

**3. "Google Calendar event creation failed" was undiagnosable by construction.** `createExternalEvent` wrapped the Google call in a bare `catch {}`, so an expired refresh token, a missing scope, an invalid `calendarId` and the 15s timeout all collapsed into one opaque 502 with the cause discarded. `pullExternalEvents` in the same file already did the right thing (persisting `lastError` on the connection). The bare catch now logs and persists `lastError` the same way, and the two deliberate best-effort swallows (`pushCardToGoogle` on schedule, `events.delete` on unlink) now log instead of vanishing. The value was proven immediately: the pre-existing calendar test, which had been silently passing, now prints `Best-effort Google Calendar push failed — Malformed encrypted token`. Nothing about the failure changed; it is simply visible now.

**Consequence:** the shared lesson is that `?? 0`, `catch {}`, and a hand-written `catch` around a hook call are all _discard_ operations wearing the costume of robustness. Each of these three defects was a discard that looked defensive. The guards added are deliberately behavioural where behaviour is testable (real `QueryObserver`s) and static only where the property is syntactic (hook position, key uniqueness).

### 2026-10-04 — `/auth/me` Fired Twice Per Load: Four Triggers, No Single-Flight

**Context:** the Network panel showed two `me` requests on every dashboard load. Not a correctness bug — both succeeded and returned identical data — but it is the same class of defect as the three above (a redundant duplicate hiding a structural problem), and it was masking a real race.

**Why it happened.** `checkAuth` has **four independent triggers** that knew nothing about each other:

| Trigger                           | Location                       |
| --------------------------------- | ------------------------------ |
| App mount effect                  | `App.tsx:143-145`              |
| Window `focus` staleness net      | `App.tsx:150-160`              |
| 403 permission-denied interceptor | `lib/api.ts:736-748`           |
| Profile settings `useQuery`       | `pages/ProfileSettings.tsx:86` |

and the store had **no in-flight guard**, so every concurrent trigger opened its own request. Two things made it fire reliably rather than occasionally:

1. **StrictMode double-invokes effects in development.** `main.tsx:14` wraps the tree in `<StrictMode>`, so the mount effect ran twice on every load. This is why the duplicate looked deterministic — it is a dev-mode artifact of a real production race, not a dev-only curiosity.
2. **The focus throttle was seeded with `last = 0`.** Its intent is "revalidate at most once per 60s", but `now - 0` is always far larger than 60 000, so the _first_ focus event of a session always passed the gate. A window that gains focus right after load (tab switch, DevTools opening, dialog focus restore) therefore revalidated `/me` immediately after the mount effect had just done so.

**Decisions.**

1. **Deduplicate in the store, not by deleting a trigger or removing StrictMode.** `checkAuth` is now single-flight via a module-level in-flight promise. StrictMode stays — removing it to hide a double-effect would have discarded a useful safety net while leaving the production race intact. Deduplicating makes the duplicate structurally impossible for _all four_ callers rather than papering over the one StrictMode provokes.
2. **Key the in-flight promise by access token.** A bare promise would let a `login()` that lands mid-flight be satisfied by a request issued for the _previous_ identity — reintroducing exactly the cross-identity cache leak the store already guards against for query caches. `login`/`logout` also clear it.
3. **Seed the focus throttle with the mount time.** Corrects the intent rather than the symptom: a revalidation that the mount effect just performed should not be repeated.
4. **Deliberately not deduplicating `ProfileSettings`.** It is a separate `useQuery` on a different concern and only mounts on that route; collapsing it would couple two unrelated screens. Flagged rather than changed.

**Consequences:** concurrent triggers collapse to one request, verified against the real store with `api.get` mocked and a call counter (`authStore.dupe.test.ts`): 2 and 4 concurrent triggers each produce exactly one `/auth/me`, every caller receives the same resolved state, a new token is _not_ served by an old in-flight promise, a settled call does not permanently pin the store, and an absent token short-circuits without a request. The two dedup assertions were confirmed to **fail** when the guard is removed, so they are not vacuous.

### 2026-10-04 — "Rendered more hooks than during the previous render" Was Systemic, Not One Component

**Context:** opening a card from My Tasks replaced the whole page with "This page crashed". The console named `TaskDetailView.tsx:954` and `useDialogClose.ts:38`. That line was one of four `useDialogClose()` calls sitting **after** two early returns. Fixed by hoisting them. Then checked whether the rest of the codebase shared the defect — it did, in six more components.

**The bug shape.** React requires an identical hook order on every render. A component that returns early — loading spinner, empty state, error panel — _before_ reaching a `useDialogClose()` call skips that hook on the first render and runs it on the next. React throws and the nearest error boundary replaces the page. Every instance is driven by async data flipping between renders:

| Component                         | Guard                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `TaskDetailView.tsx`              | `isCardLoading`, `!card`                               |
| `Billing.tsx` (5 hooks)           | `isLoading`, `error \|\| !billing`                     |
| `DeveloperSettings.tsx` (2)       | `isLoading`, `isError && keys.length === 0`            |
| `CustomRoles.tsx`                 | `isRolesLoading`, `isRolesError`                       |
| `ProfileSettings.tsx`             | `isProfileError && !profile`                           |
| `ProjectsList.tsx`                | `!projects \|\| projects.length === 0`                 |
| `GlobalCreateWorkspaceDialog.tsx` | `!open` — flipped by the `?create-workspace` URL param |

All six remaining instances were **latent**: they would have crashed the same way the first time the relevant query resolved. This is also why the defect survived the AGENTS.md §11 dialog work — §11 requires `useDialogClose`, and every one of these components _does_ use it, correctly. The contract was satisfied at the call site and broken by the hook's _position_.

**Decisions.**

1. **Hoist, do not restructure.** All eleven hooks depend only on `useState` values, so moving them above the guards is behaviour-preserving. Extracting a wrapper component per guard would have been a far larger diff across seven files for no behavioural gain.
2. **Guard the whole class with an AST check, not a grep.** `hooks/hookOrder.contract.test.ts` walks the TypeScript AST and fails on any `useX()` call that is a _sibling statement after_ a guard-returning `if`. A textual scan cannot distinguish that from a hook legitimately nested inside a conditional, so grep would have been both noisy and unreliable. Two details were load-bearing: `forwardRef`/`memo` components are `FunctionExpression`s, not declarations (an earlier scanner that only matched declarations reported the pre-fix file as clean — it was checked against the known-bad file and found wanting before being trusted); and the suite carries a **self-check on a synthetic fixture** so a silently broken walk fails loudly instead of passing for the wrong reason. Dropping the pre-fix `TaskDetailView` back in made it report all four violations by name.
3. **Deliberately scoped to this one hazard.** This is not a general Rules-of-Hooks linter; `react-hooks/rules-of-hooks` already is. Duplicating it would add a second, weaker source of truth.

### 2026-10-04 — "Create Workspace" Was a Dead Button: A Close-Only Sink Wired To An Open Request

**Context:** the "+ Create Workspace" button on `/workspaces` did nothing. The Network panel stayed empty after clicking — no request, no error, no console output. AGENTS.md §7: "every visible button must either act or be disabled… A control that silently does nothing is a defect, not a limitation."

**Mechanism.** `pages/Workspaces.tsx` rendered a _controlled_ creator:

```
const [createOpen, setCreateOpen] = useState(false);
const { handleOpenChange } = useDialogClose({ isOpen: createOpen, onClose: () => setCreateOpen(false) });
…
<CreateWorkspaceDialog open={createOpen} onOpenChange={handleOpenChange} />
```

`createOpen` was **never set to `true`** — there is no `setCreateOpen(true)` in the file. And it could not have worked anyway, because `useDialogClose`'s `handleOpenChange` is close-only by contract; its entire body is `if (!nextOpen) requestClose()`. The visible button was `CreateWorkspaceDialog`'s internal Radix `DialogTrigger`, so a click produced `onOpenChange(true)`, which the hook deliberately ignored.

`CreateWorkspaceDialog` had already tried to defend itself and its own comment records the confusion — `handleDialogOpenChange` calls `setDialogOpen(true)` on open, because "handleOpenChange alone swallows opens, which left this button dead". That defence works in _uncontrolled_ mode. In _controlled_ mode `setDialogOpen` only forwards to `onOpenChange` (`if (!isControlled) setInternalOpen(v)`), so the fix routes straight back into the no-op. The page was the only controlled consumer.

**Fix.** The page now opens the shell-level `GlobalCreateWorkspaceDialog` through `useOpenCreateWorkspace()` — the same `?createWorkspace=1` path the sidebar "+" already used, and the path the page's own comment at `Workspaces.tsx:31` described as intended. The dead controlled instance, its `createOpen` state and its close-only handler are gone. The button keeps the `workspace.create` permission gate, so a control the user cannot act on still does not render. The shell's `onSuccess` already invalidated `['workspaces']` **and** `['workspaces','tree']`, so the page's tree query still refreshes.

**A general rule was written, measured, and deliberately not shipped.** The tempting invariant is "a controlled dialog handed a close-only `onOpenChange` must be gated on the state that opens it". It is not statically decidable per file. Matching handler names by regex first produced **33 offenders, all false positives**, because `handleDialogOpenChange` — a legitimate open+close wrapper several dialogs build on — matches the same shape. Resolving the close-only names properly from the `useDialogClose` destructuring cut it to a set that is entirely correct code: `AppearanceModal`, `CreateTaskModal`, `TaskDetailView`'s `ConfirmDialog`s and the rest are controlled by their **parent**, so their `open` state is not in the same file and no in-file gate can be required. Shipping a rule that flags working code trains people to ignore the test, so the two assertions that pin the real regression are kept instead — both verified to fail when the dead code is reinstated.

**Scope check.** `CreateWorkspaceDialog` is the only component combining a `DialogTrigger`, a controlled `open` prop and `useDialogClose`, so unlike the hooks-order defect this was an isolated bug, not a systemic one.

### 2026-10-04 — Google Calendar Write Failures Were Opaque AND Unreachable: Two Defects In One Path

**Context:** "Create meeting" on `/calendar` returned `{"error":"Google Calendar event creation failed"}` and the user could not tell what to do about it. The earlier fix in this series made the backend _log_ the cause; that exposed a second defect — **the message never reached the user even when it was good.**

**Defect 1 — one message for four different recoveries.** `createExternalEvent` mapped every Google failure to the same string. They are not equally recoverable:

| Upstream                        | Meaning                                    | What actually fixes it                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_grant` / 401           | refresh token dead                         | reconnect — **Google deactivates refresh tokens for OAuth apps left in "Testing" publishing status after 7 days of inactivity**, so this is the expected failure in any long-lived dev database |
| 403 / `insufficientPermissions` | scopes no longer cover `calendar.events`   | a fresh consent screen                                                                                                                                                                          |
| 404                             | connected `calendarId` deleted or unshared | reconnect and re-pick                                                                                                                                                                           |
| our 15s guard                   | transient                                  | retry is genuinely reasonable                                                                                                                                                                   |

`classifyGoogleFailure` now maps these to a specific instruction plus a machine-readable `details.code` (`GOOGLE_REAUTH_REQUIRED`, `GOOGLE_CALENDAR_NOT_FOUND`, `GOOGLE_TIMEOUT`, `GOOGLE_EVENT_CREATE_FAILED`).

**Defect 2 — the client discarded the server's text.** `describeCalendarError` read `err.response.data.message`. But `lib/errors.ts` `formatErrorResponse` emits `{ error, details? }` and only adds `message` for _validation_ failures. So for every real calendar error the field was `undefined`, the helper fell through to `err.message`, and the user saw axios's `Request failed with status code 502` — which is why the failure looked like a black box no matter how good the backend message became. It now delegates to the existing `getApiErrorMessage`, which already handled both shapes correctly; the duplicated, narrower parser was the bug.

**Status stays 502 deliberately, for all four cases.** `lib/api.ts:701` converts _any_ 401 into a Boardly session token refresh and `api.ts:733` turns _any_ 403 into a permission re-fetch. Echoing Google's status would therefore make a dead **Google** token look like a dead **Boardly** session and log the user out of the app. The discriminator rides in the body instead. This is asserted in the test for all four branches — it is the subtlest part of the change and the easiest to "simplify" back into a bug.

**Also fixed while in there:** `errorMessage(err)` returns `"Unknown error"` for any non-`Error` throw, so the log line lost the upstream OAuth code for exactly the failures worth chasing — it now falls back to the response body via `safeStringify`. Verified in the test output: the log now reads `err:"invalid_grant"` instead of `err:"Unknown error"`.

### 2026-10-04 — A Created Board Was Returned By The API And Never Re-Read By The UI

**Context:** creating a board on `/workspaces` produced a correct `POST /boards` response and a correct `GET /workspaces/tree` that listed **both** boards, while the grid kept showing one. The value was never wrong — it was never read again.

**Mechanism.** `BoardsList` mirrored its `initialBoards` prop into a cache entry of its own:

```tsx
useQuery({
  queryKey: ['boards', projectId],
  queryFn: async () => { if (initialBoards !== undefined) return initialBoards; … },
  initialData: initialBoards,
  staleTime: 30_000,
});
```

Two React Query facts combine badly here. `initialData` is consulted **only when the entry is created**, and React Query **does not observe props** — nothing about a re-render triggers a refetch. So the entry kept serving its seed array.

What made it look like it should have worked is the interesting part. `CreateBoardDialog` invalidated **both** `['boards', projectId]` and `['workspaces', 'tree']`, so a refetch _was_ scheduled. But it is a **race**:

1. `['boards', …]` refetch fires immediately and returns the **old** prop — the tree has not returned yet.
2. That marks the entry fresh for `staleTime: 30_000`, so nothing fetches it again.
3. `['workspaces', 'tree']` refetch completes and delivers both boards as a new prop.
4. Nothing re-reads it. The entry stays at one board until 30s lapses _and_ a focus/remount happens to trigger a fetch.

So the tree was authoritative and correct, and the second copy was permanently a guess. `/boards?projectId=` was never even requested — the `queryFn` short-circuits whenever `initialBoards` is defined, which `ProjectsList` guarantees (`proj.boards ?? []`).

**Decisions.**

1. **Derive from the prop; delete the mirror.** Boards and projects are already embedded in `/workspaces/tree`, and every mutation in these components (create, rename, delete, import) already invalidates that key. One source of truth beats a second copy that cannot refresh itself. The now-unreferenced `['boards', …]` / `['projects', …]` invalidations were left in place — they are harmless no-ops, and removing them across three files would be churn for no behaviour change.
2. **`ProjectsList` had the identical mirror** for `['projects', workspaceId]` and is fixed the same way, so a newly created project would have vanished exactly as the board did. Found by grepping `initialData` rather than by waiting for a second report.
3. **No `keepPreviousData` / `placeholderData` band-aid.** The tempting fix is to force a refetch when the prop length changes. That treats the symptom, keeps two sources of truth, and still leaves the entry unable to observe any other change (a rename, a background edit). Removing the duplicate is smaller and actually correct.

**Correcting an earlier claim:** my first draft of the code comment said the entry "could never observe a prop change". The test disproved that — an explicit `refetch` _does_ pick up a new prop. The accurate statement, now in the comment and the test, is that no refetch is triggered and the one that is, races ahead of the tree. Worth recording because the stronger claim was the intuitive one and it was wrong.

## 2026-10-04 — `useDialogClose({ isOpen })` Must Name the Dialog's Own State

**Context:** commit `134b35d` routed every dialog close through `useDialogClose`, which is idempotent by design: `requestClose` opens with `if (!openRef.current || closedRef.current) return`, and the Escape listener is not even attached unless `isOpen` is true. `BoardView` then passed `isOpen: activeCard !== null`, where `activeCard` is the drag-overlay card and the dialog is driven by the `?card=` URL param. `isOpen` was therefore permanently false while the dialog was open and every close gesture was a no-op. The hook was right; the call site named the wrong state. The existing contract test could not see it, because all of its assertions are about shape (no bare setter, no inline arrow, one hook instance, nested dialogs stand down) and this call site had a perfect shape.

**Alternatives considered:** (a) drop the `isOpen` guard from `requestClose` (rejected — it is what makes one close path idempotent, and without it a backdrop click plus the Esc listener can both fire); (b) have `useDialogClose` derive `isOpen` itself (rejected — a hook cannot know what drives a parent's dialog, and the dirty-editor branch needs the same signal); (c) rename `activeCard` to `dragOverlayCard` only (rejected — it fixes the readability of the trap but not the trap).

**Decision:** `isOpen` is not a formality; it is the gate on the entire close path, so it must reference the state that actually opens the dialog. Contract test now enforces the wiring rather than the shape: every identifier appearing in an `isOpen:` must also drive some `open={…}` prop in the same file. It holds across all 43 call sites and names the offender by file and identifier, verified against an injected regression. Any component that keeps drag/selection state alongside dialog state should name them so the two cannot be confused — `activeCard` (drag) vs `selectedCardId` (dialog) is exactly the pairing that caused this.

## 2026-10-04 — Git Read Helpers Need Card Access, Not `integration.manage`

**Context:** `GET /git/cards/:id/links` and `GET /git/cards/:id/branch` are per-card read helpers rendered in the task detail page, but sat inside the `integration.manage` guard applied to all of `/git`. Non-admins got 403s (doubled by the `retry: 1` default) and lost "Copy Git Branch" / "Clone Task". The tempting fix — drop the guard — was a security hole: `listCardLinks` had no access check, and the branch route called `getCard` without `actor`, and `getCard` only runs `requireCardAccess` when `actor` is passed. The admin permission was the sole gate.

**Alternatives considered:** keep admin-only and hide the panel for non-admins (rejected — hides PR/branch context from every developer who can already see the card); add a dedicated `integration.view` permission (rejected for now — card visibility is the right boundary, and a new permission key is a bigger surface than the problem needs).

**Decision:** the permission follows the resource, not the feature area. Linked-development info is part of seeing a card, so both routes require card access; `integration.manage` stays on `/repos` connect/disconnect, which genuinely is an admin action. Benchmark: Jira and Linear both surface a ticket's linked PRs and branches to anyone who can open the ticket. Critically, the guard move is only safe because the missing `requireCardAccess` calls were added first — `actor` on `getCard` is optional but load-bearing, and omitting it does not fail loudly, it just drops the private-task gate.

## 2026-10-05 — Login Perf: Lazy Layouts + Subpath Import Instead of `sideEffects: false`

**Context:** the login route fetched ~30 modulepreload chunks because `App.tsx` statically imported `DashboardLayout`/`AdminLayout` (the whole authenticated shell) and the `@boardly/ui` barrel (no `sideEffects: false`, so nothing tree-shakes out of the entry graph). Mobile Perf sat at 82 on the prod build.

**Alternatives considered:** (a) `"sideEffects": false` on `@boardly/ui/package.json` (rejected — package-wide flag changes bundling for every consumer including super-admin; the two runtime-adjacent modules checked (`dialog.tsx`, `sidebar.tsx`) are handler-scoped today, but any future module-level side effect would silently break with no per-site signal); (b) leaving layouts eager and accepting 82 (rejected — the layouts are definitionally unreachable on public routes, so shipping them there is pure waste).

**Decision:** narrowest cuts that fix the entry graph. Layouts become `React.lazy` (the Routes-level Suspense already wraps them, so no new fallback behavior). The single barrel import in the entry graph (`TooltipProvider` in `App.tsx`) moves to the existing `@boardly/ui/tooltip` subpath alias — the other 9 barrel imports all live in lazy routes and never touch the login path. Entry 188→92 KiB, preloads 30→11, mobile Perf 82→92. Benchmark: Linear and Jira both serve logged-out marketing/login shells under ~100 KiB of route-critical JS; the authenticated shell loads post-login behind Suspense, which matches that shape.

## 2026-10-05 — Axe Failures Fixed at the Token/Layout Layer, Not Per Instance

**Context:** the new axe suite surfaced failures that looked per-component (badge contrast, avatar alt, menu names) but rooted in shared layers: the ui `SidebarInset` rendering `<main>` while `DashboardLayout` rendered a second `<main>` inside it; light-theme tokens (`primary`, `muted-foreground`, `destructive`) sitting at 3.7–4.5:1 against their own paired surfaces.

**Alternatives considered:** (a) per-instance `aria-label`/color overrides at each flagged node (rejected — the same pairs recur on every page; whack-a-mole); (b) `sideEffects`-style global suppressions or `disableRules` for portal `region` noise (rejected — the dropdown test instead scans the converted trigger closed and asserts keyboard-open functionally, which covers the conversion without blessing library portal architecture).

**Decision:** fix the layer. One `<main>` per authed page (layout div, library main keeps the landmark); token values moved to indigo-600/slate-600/red-600/emerald-700/amber-700 after computing every affected pair ≥4.5 (white-on-primary 6.29, muted-on-muted 6.92, destructive-on-white 4.83). Benchmark: Linear and GitHub both hold body/secondary text at ≥4.5 in light mode and keep status badges at 700-weight hues on tinted backgrounds — the new values match that shape. The `dialog-close` dirty-Escape failure was verified pre-existing via `git stash` on the clean tree and left alone.

## 2026-10-05 — Elysia Plugins Don't Propagate mapResponse (and Loose Generics Poison Eden)

**Context:** the API `nosniff` header needed to ride the existing `mapResponse` hook in `index.ts`. First attempt — a `new Elysia().mapResponse(...)` instance via `.use()` — silently did nothing (verified empirically: header absent). Second attempt — a function-form plugin with an `Elysia<any, …>` parameter — propagated the header but widened the App type, breaking the dashboard's Eden Treaty inference (`api.ts` `edenV1.import…` and `ImportModal` `res.board` errors on files nobody touched).

**Alternatives considered:** (a) keep the function plugin and cast at the call site (rejected — the poisoning happens through the generic chain, casts at use-site don't contain it); (b) assert headers via live-server tests (rejected — couples unit tests to a running backend).

**Decision:** a plain exported function (`applySecurityHeaders(set)`) called inside the existing `mapResponse` — zero type-surface change, unit-tested directly including the header-preserving case. Lesson worth keeping: in Elysia, hook-sharing must go through plain functions called from host-scope hooks, never through plugin instances or loosely-typed plugin functions, when the App type feeds Eden. Any future `.use()` addition to `index.ts` must re-run the dashboard `tsc -b --force` (incremental cache hides exactly this failure class).

## 2026-10-05 — CSP Report-Only With the Console as Sink, No report-uri Endpoint

**Context:** Report-Only without an observable sink teaches nothing. Options were a backend `/csp-reports` mailbox (new writes surface, retention, tests) or the browser console (report-only violations already log there) asserted by a Playwright flow spec.

**Decision:** console + `csp-flow.spec.ts` (login → calendar → chat → billing, zero CSP errors). No new backend surface for a mailbox. The spec is meaningful now (validates the harness against the real authed routes, fails loudly on any CSP console text) and becomes the enforcement flip gate on the deployed URL. Benchmark: Solito/Expo-web and Cal.com both run report-only-to-console during rollout before promoting; a dedicated collector only pays off with multi-origin production traffic, which this SPA doesn't have yet.

## 2026-10-07 — e2e Gets Its Own tsconfig Project Referenced by the Root

**Context:** `e2e/` and `playwright.config.ts` matched no tsconfig, so the dashboard's `tsc -b` type-checked `src/` and nothing else. Specs drifted silently: `process.env` had no ambient Node types, and a `test(title, { timeout })` call was accepted at runtime while doing nothing (Playwright 1.63 removed `timeout` from `TestDetails`; it is now `{ tag?, annotation?, lock? }`). The second one is the dangerous shape — a spec that _looks_ like it has a 180s budget and actually has 30s.

**Alternatives considered:** (a) fold `e2e/` into `tsconfig.app.json` (rejected — pulls `types: ["node"]` into the browser bundle's type surface, so a Node-only global could slip into `src/` without any error; the plugin config and app config have genuinely different type environments); (b) drop `process.env` from the specs (rejected — the env indirection is what lets CI point the suite at a deployed stack).

**Decision:** separate `tsconfig.e2e.json` project, referenced from the root tsconfig so `tsc -b` (and therefore `bun run typecheck` and turbo's `typecheck` task) covers it, with `types: ["node"]` scoped to that project only. Per-test timeouts use `test.setTimeout()`. A contract test asserts the reference, the `types`/`include` scope, a clean `tsc -p tsconfig.e2e.json` subprocess, and an AST-level ban on `test(title, { timeout })` — the last because TypeScript catches it only while the e2e project stays wired in, and the failure mode when it doesn't is a green typecheck.
