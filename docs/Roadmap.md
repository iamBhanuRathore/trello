# ROADMAP.md — Boardly Task List

Checkable version of the Build Order from `docs/project-tech-stack.md` §5 + `docs/project.md` §12. An agent should pick the **first unchecked item, in order**, unless `docs/Progress.md` notes a reason to deviate (e.g. a blocker). Check items off only when they meet the Definition of Done below — not just "code written."

## Definition of Done (applies to every item)

- [x] Tests written test-first per `project-tech-stack.md` §8 (unit + integration/E2E as appropriate)
- [x] Passes lint/typecheck (oxlint + `tsc --noEmit` per app, `bun run typecheck`)
- [x] Permission checks in place if the feature touches tenant data (see `docs/PERMISSIONS_MATRIX.md`)
- [x] `docs/Progress.md` updated with what was done
- [x] `docs/Decisions.md` updated if a non-trivial technical choice was made along the way

---

## Phase 0 — Project Scaffold (not in original build order, needed first)

- [x] Initialize monorepo (Turborepo) with `/apps` and `/packages` structure
- [x] Set up `packages/config` (shared ESLint, TSConfig, Tailwind preset)
- [x] Set up `packages/shared-types` (empty, ready for first Zod/TypeBox schemas)
- [x] Scaffold `apps/backend` (Bun + Elysia, hello-world route + health check)
- [x] Scaffold `apps/dashboard` (Vite + React + TS, blank shell)
- [x] Set up PostgreSQL locally (Docker Compose) + Drizzle config
- [x] Set up CI (GitHub Actions): lint + typecheck + unit test on every PR
- [x] Create `.env.example` and wire up secrets management approach (`project-tech-stack.md` §9.2)

## Phase 1 — MVP (core loop)

- [x] Auth: sign up, log in, JWT + refresh tokens
- [x] Organizations: create org, org membership
- [x] Basic RBAC: Owner/Admin/Member roles + `requirePermission()` guard pattern
- [x] Workspaces → Projects → Boards → Lists → Cards (CRUD + drag-drop reordering)
- [x] Comments, attachments, labels/tags, due dates, checklists
- [x] Subtasks (`parent_card_id`, 2-level nesting limit)
- [x] Real-time board sync (basic WebSocket updates, no presence/CRDT yet)
- [x] Notifications v1 (in-app + email, simple on/off)
- [x] Company Admin Panel: user management, basic billing view, branding
- [x] Super Admin Panel: tenant list, plan management, feature flags

## Phase 2 — Growth

- [x] Custom Stage/Status templates (`stage_templates`, `stages`, Stage Manager UI)
- [x] Sprints (`sprints` table, Sprint Planner view, starting/stopping sprints)
- [x] Phases (project lifecycle, template-able)
- [x] Global search + saved searches (PostgreSQL Full-Text Search)
- [x] Notifications engine maturity: granular preferences, digest bundling, DND
- [x] Automations engine + webhook dispatch
- [x] Core integrations: Slack, GitHub, Google Drive
- [x] Reporting v1: burndown/velocity charts, basic dashboards
- [x] Time tracking: `time_logs`, estimate vs. actual, timesheets
- [x] Import tools: Jira/Trello/Asana migration

## Phase 3 — Enterprise & Competitive Parity

- [x] SSO/SCIM via WorkOS / Enterprise SAML
- [x] Custom roles + permission overrides
- [x] Audit log with export
- [x] Dedicated-instance tier (DB-per-tenant option)
- [x] Advanced reporting: cumulative flow diagram, cycle/lead time, custom report builder, portfolio dashboards
- [x] Real-time polish: presence, live cursors, typing indicators
- [x] Forms/intake module + SLA policies
- [x] Docs/Wiki module with card-linking
- [x] Native mobile app — Phase 1 (read/comment/push)
- [x] Native mobile app — Phase 2 (full editing/offline)
- [x] Plugin/App marketplace + public developer API

---

## Phase 4 — Workspace Collaboration & All-in-One Expansion (Huly Parity)

### 4.1 Interactive Calendar & Time-Blocking (Motion / Cron Parity)

- [x] Interactive Calendar View (Month, Week, Day grid) with task scheduling
- [x] Drag-and-drop task time-blocking and duration resizing
- [x] 2-way Google Calendar synchronization (direct Calendar API, per-user OAuth)
- [ ] 2-way Microsoft Outlook synchronization (deferred — same connection/sync pattern as Google)
- [x] Milestone & Sprint schedule overlay on calendar

### 4.2 Team Chat & Real-Time Messaging (Slack / Discord Parity)

- [x] Real-time 1-on-1 Direct Messages (DMs) & Team Channels (public/private)
- [x] Message threads, reactions, file attachments, and rich markdown formatting
- [x] Channel-to-Project linking with automated activity feed
- [x] Real-time typing indicators and online presence across channels
- [x] Telegram-parity group message menu (Reply/Translate/Copy/Copy Media/Save/Pin/Forward/Select/Seen + expandable reactions)

### 4.3 Bi-Directional Git & Developer Automations (Linear / GitHub Engine)

- [x] Native GitHub integration with automatic repo syncing (webhook-driven, no API dependency)
- [x] Auto-link branches, commits, and Pull Requests to ticket keys (e.g. `BCW-12`)
- [x] Automated card movement on PR events (Opened → In Review, Merged → Done)
- [x] Card PR review status badges and branch creation CLI/copy helper
- [ ] GitLab support (same webhook pattern — provider extension point ready)

### 4.4 Real-Time Collaborative Multi-Cursor Docs (Notion / CRDT Parity)

- [ ] Upgrade Project Docs with CRDT-based real-time simultaneous co-authoring (Yjs / Tiptap)
- [ ] Live multi-user cursors, selection highlights, and presence halos in documents
- [ ] Dynamic embeddable blocks: live interactive cards, boards, diagrams, and code runners

### 4.5 Live Audio/Video Huddles & Virtual Rooms (WebRTC)

- [ ] Lightweight WebRTC voice & video huddle rooms per project and channel
- [ ] Screen sharing for agile standups, sprint reviews, and card triage
- [ ] Floating mini-huddle overlay while navigating boards and docs

### 4.6 Universal Triage Inbox & Inbound Email Integration

- [x] Unified Triage Inbox across task mentions, review requests, comments, and DMs
- [x] Inbound email processor (create cards via email forwarding, reply to comment via email)
- [x] Quick triage action keys (`E` to archive, `S` to snooze, `I` to create subtask)

---

## Backlog (not yet phased — park ideas here instead of losing them)

## Phase 5 — Hardening & Scale (security-first, in progress)

- [x] 5.0 Tenant isolation: org predicates on all card/chat sub-resources, `card.assign` enforcement, org-member invite invariant, 404 fail-closed, org-namespaced cache keys, upload caps, IDOR regression tests
- [x] 5.1 Company-configurable roles (Lead/Developer/Tester) + static assignment_rules + components with lead fallback (backend + APIs; admin UI pending)
- [x] 5.2 OCC ordering (version-guarded moves, rebalance job) + WS reconnect with `changes?since=` gap-fill
- [x] 5.3 DB perf: hot-path composite indexes, batched chat enrichment (153→6 queries/page), `clampLimit` pagination caps, audit/activity/notification retention (partitioning deferred — see Decisions)
- [x] 5.4 Frontend: column virtualization (>20 cards, @tanstack/react-virtual), immutable feed merge, leaf-memo cards, stable column callbacks, auth-store selectors; drag path renders in full + e2e-verified (windowing/scroll/drag/empty-state/short-column)
- [x] 5.5 Media: unified request-upload/confirm flow, presigned-GET reads, virus-scan gate
- [x] 5.6 Project Automation Engine: project-scoped WHEN/IF/THEN rules (label router, Testing-handoff RR subtask), locked round-robin, loop guard, skip audit log, CRUD/toggle/runs/dry-run/context APIs, dashboard builder page (Project → Automation) with templates, coverage auto-fix, run-history drawer
- [ ] 5.7 Automation rule **editing**. Rules can be created and deleted but not modified — the rule tiles in the Automations modal had a clickable hover state and no handler, because there was no edit path to wire it to. Found during the P3-5 dead-control audit (2026-10-04); the misleading hover state was removed rather than shipping a half-built editor during a fix-only pass. Linear/Jira both make the rule row the edit entry point.

- [ ] AI Copilot assistant for task summarization, sprint velocity forecasting, and PR description generation
- [ ] Virtual Office 2D interactive floor plan with avatar desk presence
- [ ] Native Desktop App packaging with Electron / Tauri (global hotkeys, tray menu)

### Open items from the 2026-10-04 fix-only pass (P0–P4)

Tracked here so they are not rediscovered. None are regressions; all predate the pass.

- [ ] **P0-5 step 2** — empty-`organizationId` fallback currently warns and mints a token; flipping it to 400 is deliberately deferred until the logs are quiet. The dashboard has no org-selection recovery path, so a 400 would strand those accounts.
- [ ] **Sprint/phase grants for `Member`** — product decision, not a bug. Only Owner and Admin are granted `sprint.*`/`phase.*` by the seed. The UI is gated correctly; the pinned `Member` assertion in `sprint-phase-permissions.test.ts` is the tripwire if this is ever changed.
- [ ] **Historical cross-org exploitation audit** — blocked. Access logs do not record organization and entity ids together, so the logs cannot answer it. Adding that logging is the prerequisite.
- [ ] **Backend suite isolation, remainder** — 71 orgs/run still leak (components 8, card 9, my-tasks 7, git 5, priorities 5, calendar 6, ~12 smaller); ~18 suites still hand-roll an org teardown chain that works but should call `deleteTestOrg`; and the local scratch DB has ~4,700 banked orgs to clear in a separate, manually reviewed commit. Measure with `bun run db:leaks`. See Progress.md 2026-10-04 P4.
