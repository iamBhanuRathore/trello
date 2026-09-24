# ROADMAP.md — Boardly Task List

Checkable version of the Build Order from `trello-clone-architecture.md` §12. An agent should pick the **first unchecked item, in order**, unless `PROGRESS.md` notes a reason to deviate (e.g. a blocker). Check items off only when they meet the Definition of Done below — not just "code written."

## Definition of Done (applies to every item)

- [x] Tests written test-first per `project-tech-stack.md` §8 (unit + integration/E2E as appropriate)
- [x] Passes lint/typecheck (`Agents.md` §3)
- [x] Permission checks in place if the feature touches tenant data (`Agents.md` §5, §7)
- [x] `PROGRESS.md` updated with what was done
- [x] `DECISIONS.md` updated if a non-trivial technical choice was made along the way

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

- [ ] Unified Triage Inbox across task mentions, review requests, comments, and DMs
- [ ] Inbound email processor (create cards via email forwarding, reply to comment via email)
- [ ] Quick triage action keys (`E` to archive, `S` to snooze, `I` to create subtask)

---

## Backlog (not yet phased — park ideas here instead of losing them)

- [ ] AI Copilot assistant for task summarization, sprint velocity forecasting, and PR description generation
- [ ] Virtual Office 2D interactive floor plan with avatar desk presence
- [ ] Native Desktop App packaging with Electron / Tauri (global hotkeys, tray menu)
