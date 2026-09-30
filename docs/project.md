# Enterprise Trello-Like App — Full Architecture

> **Design-era snapshot — partially superseded.** This doc drafted the system before it was built. Where it conflicts with the tree, the tree + `docs/project-tech-stack.md` + `docs/Decisions.md` win. Known stale spots: §7 stack table (NestJS/ES/BullMQ never adopted — actual: Bun + Elysia, Postgres FTS, inline dispatch), §11.7 wiki tables (actual: `documents` + `document_cards`), RLS presented as active (deliberately unenforced — accepted risk, see `docs/Decisions.md` 2026-09-28 Security entry). Aspirational-only (no tables/code): Epics, Scrum-team entity, Custom Fields.

A multi-tenant, board/list/card project management platform ("Boardly") with three panel types: **Super Admin (platform owner)**, **Company Admin (client org)**, and **User (end-user workspace)**.

---

## 1. High-Level Concept

- **Multi-tenant SaaS**: one platform, many companies ("Organizations"), each with its own users, workspaces, boards, billing, and branding.
- **Three tiers of control**:
  1. **Super Admin Panel** — you, the platform owner. Manages all companies, billing, feature flags, global settings.
  2. **Company Admin Panel** — a client's admin. Manages their own users, workspaces, billing plan, integrations, security policy.
  3. **User Panel** — the actual Trello-like app: boards, lists, cards, workspaces.

---

## 2. User Types & Role Hierarchy

### 2.1 Platform-level (Super Admin side)

| Role                 | Scope                     | Typical permissions                                                                    |
| -------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| **Super Admin**      | Entire platform           | Full access to all tenants, billing, infra config, impersonate any user, feature flags |
| **Platform Support** | Entire platform (limited) | View/impersonate for support tickets, no billing/infra access                          |
| **Platform Analyst** | Read-only                 | Dashboards, usage metrics, no write access                                             |

### 2.2 Organization/Company-level (per tenant)

| Role                | Scope                      | Typical permissions                                                          |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| **Org Owner**       | One Organization           | Full control of that org: billing, delete org, transfer ownership            |
| **Org Admin**       | One Organization           | Manage users/workspaces/security policy, cannot delete org or change billing |
| **Billing Manager** | One Organization           | Billing/invoices only                                                        |
| **Workspace Admin** | One Workspace (inside org) | Manage boards/members within that workspace                                  |

### 2.3 Workspace/Board-level (end users)

| Role                  | Scope     | Typical permissions                                        |
| --------------------- | --------- | ---------------------------------------------------------- |
| **Board Admin/Owner** | One Board | Full board control: settings, delete board, manage members |
| **Member**            | One Board | Create/edit/move cards, comment, assign                    |
| **Commenter**         | One Board | Comment only, no edit                                      |
| **Viewer/Guest**      | One Board | Read-only, often external collaborators                    |

This mirrors Trello/Jira/Asana style nested RBAC: **Platform → Organization → Workspace → Board → Card**, with roles inheriting downward unless overridden.

---

## 3. Multi-Tenancy Strategy

Pick based on scale/isolation needs:

| Approach                                        | Description                                                                          | Best for                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Shared DB, shared schema (tenant_id column)** | Single DB, every table has `organization_id`. Row-level security enforced in app/DB. | Most SaaS, cheaper, easier to scale horizontally. **Recommended default.**                                           |
| **Shared DB, schema-per-tenant**                | One Postgres schema per company.                                                     | Mid-size enterprise, easier per-tenant backup                                                                        |
| **DB-per-tenant**                               | Fully isolated database per company                                                  | Large enterprise clients with strict compliance (finance, healthcare) — offer as a premium "dedicated instance" tier |

Recommendation: start with **shared DB + `organization_id` on every row** so a bug can never leak data across tenants at the DB layer. (This doc once recommended Postgres RLS as the second layer; RLS is deliberately unenforced — accepted risk, app-layer scoping is the enforcement. See `docs/Decisions.md` 2026-09-28.) Offer dedicated-instance as an enterprise upsell later.

---

## 4. Core Domain Data Model

```
Organization (Company)
 ├── OrganizationSettings (branding, SSO config, security policy)
 ├── Subscription/Plan (Free/Pro/Business/Enterprise)
 ├── Users (belong to org via OrganizationMember)
 ├── Workspaces                              (department/team level, e.g. "Marketing")
 │    ├── WorkspaceMembers (role)
 │    └── Projects                            ← a company can have MANY projects
 │         ├── ProjectMembers (role)
 │         ├── Boards (a project can have 1 or more boards: e.g. "Sprint Board", "Bugs")
 │         │    ├── BoardMembers (role)
 │         │    ├── Lists (columns)
 │         │    │    └── Cards (Tasks)
 │         │    │         ├── Checklists / ChecklistItems
 │         │    │         ├── Comments
 │         │    │         ├── Attachments
 │         │    │         ├── Labels/Tags (many-to-many)
 │         │    │         ├── Assignees (owner(s) doing the work)
 │         │    │         ├── Participants (anyone actively involved)
 │         │    │         ├── Watchers/Observers (notify-only, passive)
 │         │    │         ├── DueDate/Reminders
 │         │    │         ├── CustomFields (per board-defined)
 │         │    │         └── ActivityLog
 │         │    └── Labels/Tags (board-scoped)
 │         └── Automations/Rules (Butler-style)
 ├── Roles & Permissions (RBAC tables)
 ├── Invitations
 ├── AuditLog
 ├── Webhooks / Integrations
 └── Billing/Invoices
```

**Why "Project" as its own layer:** In the first draft, "Board = Project" was implicit. That works for simple Kanban use, but real companies usually want a Project (e.g. "Website Redesign Q3") to contain _several_ boards (a planning board, a bug-tracking board, a content board) plus its own members, deadline, and status — closer to Jira/Asana. Adding `Project` between `Workspace` and `Board` gives you that without losing anything; if a client only ever needs one board per project, you just don't create extra boards under it.

### Key tables (relational, e.g. PostgreSQL)

- `organizations(id, name, slug, plan_id, sso_enabled, created_at, ...)`
- `users(id, email, password_hash, name, avatar_url, is_platform_admin, ...)`
- `organization_members(id, org_id, user_id, role, status, invited_by)`
- `workspaces(id, org_id, name, visibility)`
- `workspace_members(id, workspace_id, user_id, role)`
- `projects(id, workspace_id, name, description, status, start_date, end_date, is_archived)`
- `project_members(id, project_id, user_id, role)`
- `boards(id, project_id, name, background, is_archived, is_template)`
- `board_members(id, board_id, user_id, role)`
- `lists(id, board_id, name, position, is_archived)`
- `cards(id, list_id, title, description, position, due_date, is_archived, cover_image)`
- `card_assignees(card_id, user_id)` — **owner(s) responsible for the work**
- `card_participants(card_id, user_id, added_by, added_at)` — **anyone actively involved** (auto-added when someone comments/attaches/is @mentioned, or manually added)
- `card_watchers(card_id, user_id, subscribed_at)` — **observers**: notification-only, no assumed responsibility; any board member can self-watch a card, or be added by others
- `labels(id, board_id, name, color)` — a.k.a. "tags"
- `card_labels(card_id, label_id)`
- `checklists(id, card_id, title)` / `checklist_items(id, checklist_id, text, is_done, position)`
- `comments(id, card_id, user_id, body, created_at)`
- `attachments(id, card_id, url, uploaded_by, file_type, size)`
- `activity_log(id, org_id, entity_type, entity_id, actor_id, action, metadata, created_at)`
- `roles(id, org_id nullable, name, is_system_role)`
- `permissions(id, key, description)` — e.g. `board.create`, `card.delete`, `member.invite`
- `role_permissions(role_id, permission_id)`
- `invitations(id, org_id, email, role, token, expires_at)`
- `automations(id, board_id, trigger_json, action_json, is_enabled)`
- `webhooks(id, org_id, url, events[], secret)`
- `audit_log(id, org_id, actor_id, action, target, ip, created_at)`

Use **UUIDs** for all primary keys (safer for multi-tenant exposure), **soft deletes** (`deleted_at`) everywhere for recovery/compliance.

---

## 4a. Task People Model — Assignees, Participants, Watchers/Observers

Three distinct, overlapping relationships per card, each driving different behavior:

| Role on a card         | Who                                                                                        | How they're added                                                                     | Notified on                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Assignee**           | Person(s) doing the work                                                                   | Manually assigned; support multiple assignees for shared tasks                        | Everything: comments, due-date reminders, status changes                              |
| **Participant**        | Anyone actively involved (commented, attached a file, was @mentioned, moved the card)      | Usually **auto-added** by the system on first interaction; can also be added manually | Comments and major status changes, not every minor edit                               |
| **Watcher / Observer** | Stakeholders who want visibility but aren't doing the work (e.g. a manager, client, or QA) | Self-subscribe ("Watch" button) or added by an Admin/Assignee                         | Configurable — often just comments + status changes, digest-style rather than instant |

Implementation notes:

- A user can hold more than one of these roles on the same card simultaneously (e.g. an Assignee is automatically also a Participant).
- Notification preferences (instant / daily digest / off) should be per-user, per-role-type, overridable in the User Panel settings — not hardcoded.
- `card.participants` and `card.watchers` should be exposed in the API and UI as separate avatar groups on the card detail view, same as Trello's "Members" + Jira's "Watchers."
- For permissions: Watchers should default to **read + comment only**, not edit — enforce via the RBAC layer in §5, not just UI convention.

---

## 4b. Subtasks, Sprints, and Phases

### Subtasks

Two common approaches — recommend the **self-referencing card** model since it gives subtasks full card power (assignee, due date, checklist) rather than a stripped-down checklist item:

- `cards.parent_card_id` — nullable self-reference (FK to `cards.id`)
- A subtask is a normal card with `parent_card_id` set; it still lives in a list, still has assignees/labels/due dates.
- Limit nesting to **2 levels** (Task → Subtask) in the UI/validation to avoid infinite trees — enforce in the API layer even if the DB technically allows deeper nesting.
- Parent card shows subtask progress as a roll-up: `3/5 subtasks complete`, and can optionally auto-complete when all subtasks are done (configurable automation rule, not hardcoded).
- `card_subtask_progress` can be a computed/cached column (`subtasks_total`, `subtasks_done`) updated via trigger or app-layer event, so the board view doesn't need to aggregate on every render.

### Sprints (weekly/monthly/custom iterations)

- `sprints(id, project_id, name, type ENUM('weekly','biweekly','monthly','custom'), start_date, end_date, goal, status ENUM('planned','active','completed'))`
- `card_sprints(card_id, sprint_id)` — a card can belong to one active sprint at a time (enforce "one active sprint per card" in app logic), but keep history of past sprints it moved through for burndown/velocity reporting.
- Sprint cadence is **configurable per project**, not global — one project might run weekly sprints, another monthly, another none at all (Kanban-only, no sprints).
- Auto-generate the next sprint on a schedule (a worker job) based on the project's configured cadence, carrying over unfinished cards into the new sprint automatically (optional setting).
- Sprint view in the User Panel: a dedicated "Sprint Board" (filtered board view scoped to `sprint_id`), plus a **Burndown/Velocity chart** (remaining work vs. time) and a **Sprint Report** at close-out (completed vs. carried-over cards).
- Company Admin Panel: sprint cadence defaults, whether sprints are mandatory or optional per project template.

### Phases (task/project lifecycle stages)

Phases are broader than a board's Lists (which are usually workflow columns like "To Do/Doing/Done"). Phases represent the **overall project lifecycle** and can span multiple sprints/boards — e.g. `Discovery → Design → Development → Testing → Launch → Post-Launch`.

- `phases(id, project_id, name, position, status ENUM('not_started','active','completed','blocked'), start_date, end_date)`
- `card_phase(card_id, phase_id)` — optional, for cards that need phase-tagging independent of which list/sprint they're in (e.g. a card can be in the "Development" phase while moving through several sprints).
- Phases are **template-able**: Company Admin defines a standard phase template (e.g. a fixed SDLC or a marketing-campaign lifecycle) that auto-populates on new projects, but individual Project owners can customize per project.
- Gate rules (enterprise feature): require phase sign-off (an Admin/Owner approval) before a project can move to the next phase — useful for regulated workflows (e.g. can't move to "Launch" until "Testing" phase is marked complete by a QA Lead).

### How these three relate

```
Project
 ├── Phases (lifecycle: Discovery → Design → Dev → Test → Launch)
 │     └── each phase spans a date range, can gate progress
 ├── Sprints (time-boxed iterations: weekly/monthly, cut across phases)
 │     └── cards get pulled into a sprint from the backlog
 └── Boards → Lists → Cards
       └── Cards optionally tagged with a phase + a sprint
             └── Cards can have Subtasks (child cards)
```

A card can simultaneously know: which **List** it's in (workflow state), which **Sprint** it's in (time-box), and which **Phase** it belongs to (lifecycle stage) — three independent, optional dimensions, each filterable in the board/table view.

---

## 4c. Custom Stage/Status Templates (company-defined, like Bitrix24)

Beyond Lists (Kanban columns) and Phases (project lifecycle), most enterprise tools (Bitrix24, Jira, ClickUp) also let each task carry a **detailed custom status field** — a color-coded dropdown that's fully defined per company, e.g.:

`Assigned to Dev → Under Testing → Discussion Required → On Hold → Pending Confirmation → Not Feasible → Ready to Release → Finished Points`

This is different from a List column because it's not about _physical position on the board_ — it's a status label that carries meaning across reporting, notifications, and automation, and every company wants their own wording/colors/order for it.

**Design: make it a reusable, admin-configurable template, not hardcoded.**

- `stage_templates(id, org_id, project_id NULLABLE, name, is_default)` — `project_id` null = an org-wide default template; set = a project-specific override. Lets a Company Admin build one standard template for the whole org, while specific project owners customize their own if needed.
- `stages(id, template_id, name, color, position, category ENUM('not_started','in_progress','blocked','done'))` — the individual custom stage options (name + color + order), each tagged with a **category** so reporting/automation/burndown charts can still roll up meaningfully even though the literal labels are arbitrary text (e.g. "Not Feasible" and "On Hold" both map to `blocked` category for dashboards, without the company having to standardize the label itself).
- `cards.stage_id` — FK to `stages.id`, nullable. This sits **alongside** `list_id` (board column) — a card can be in the "In Progress" list _and_ have stage = "Under Testing", tracked independently.
- Changing a card's stage fires an event (`card.stage_changed`) on the same event bus as everything else — feeds the task chat/activity feed (exactly like "KAIFY AZMI changed stage to 'Ready to release'" in the screenshot), triggers notifications to Assignees/Participants/Watchers, and can trigger automations (e.g. auto-notify Observers when stage = "Ready to Release").

**Admin UX for building this (Company Admin Panel → "Stage Manager"):**

1. Create/rename a stage template
2. Add stages as chips: type a name, pick a color, drag to reorder
3. Tag each stage with a category (for reporting rollups) — optional but recommended
4. Set as org default, or attach it to specific project types (e.g. a "Dev Workflow" template for engineering projects, a "Content Workflow" template for marketing)
5. New projects auto-inherit the org default template but can swap to a different one or clone-and-edit their own

This is the same "config-driven, not hardcoded" principle used for Custom Fields in §10 — the schema stays fixed (`stage_templates` + `stages` + `stages.category`), but the actual labels/colors/count are 100% company-defined data, so you never need a code change to support a new company's workflow vocabulary.

**Optional agile extras seen in the screenshot** (Scrum team, Epic, Story Points) — these map cleanly onto what's already in the model:

- `Scrum team` → really just a **Project** or a sub-team grouping; can reuse `project_members` or add a lightweight `teams` table if you want cross-project team groupings.
- `Epic` → a parent grouping above Sprints, one level up from a card; add `epics(id, project_id, name, color)` and `cards.epic_id` if you want full Scrum/Jira-style hierarchy (Epic → Sprint → Card → Subtask). Optional — only needed if targeting engineering teams specifically.
- `Story Points` → just `cards.story_points INTEGER`, used for sprint velocity calculations.

---

## 5. Permission Model (RBAC + optional ABAC)

- Store permissions as fine-grained keys: `board.create`, `board.delete`, `card.move`, `card.delete`, `member.invite`, `member.remove`, `billing.manage`, `org.delete`, `automation.manage`, `webhook.manage`, `sso.configure`, etc.
- Build a **permission matrix** per role (seed data), but let **Org Admins define custom roles** at the company level for enterprise flexibility (e.g., "Client-Facing Editor" role with only comment + attach permissions).
- Enforce checks at **three layers**:
  1. **API/middleware layer** — every request checks `can(user, permission, resource)`.
  2. **Database layer** — Postgres RLS policies keyed on `organization_id` as a last line of defense. (NOT adopted — deliberately unenforced, accepted risk; app-layer scoping enforces. See `docs/Decisions.md` 2026-09-28.)
  3. **UI layer** — hide/disable actions the user can't perform (UX only, never trust this alone).
- For enterprise: support **custom roles**, **permission overrides at board level** (e.g., a normally read-only guest given edit on one specific board), and **group-based permissions** (assign a role to an AD/SSO group, not just individual users).

---

## 6. The Three Panels — Feature Breakdown

### A. Super Admin Panel (you)

- Organizations list (search, filter by plan/status), impersonate org for support
- Global user search across all tenants
- Plan & billing management (Stripe/Chargebee integration), usage-based overage tracking
- Feature flag management (enable beta features per org)
- System health dashboards (API latency, queue depth, storage usage)
- Global audit log viewer
- Announcement/broadcast system (in-app banners to all tenants)
- Rate-limit & abuse controls
- Data export/deletion tools (GDPR "right to be forgotten" per org)

### B. Company (Client) Admin Panel

- User management: invite/remove, bulk CSV invite, deactivate, role assignment
- Workspace & **Project** management: create/archive workspaces and projects, set default templates, view project-level status/timeline across the whole company
- Security: enforce SSO/SAML, enforce 2FA, session timeout policy, IP allowlisting
- Billing: view invoices, upgrade/downgrade plan, seat management
- Branding: logo, color theme, custom subdomain (`acme.boardly.com`)
- Integrations: Slack, Google Drive, Jira, Zapier/Make, custom webhooks
- Org-level audit log (who did what)
- Custom fields & templates library for boards
- **Stage Manager**: build/edit custom stage templates (name, color, order, category) per org or per project type — see §4c
- Data retention & export settings

### C. User Panel (the actual product)

- Boards (Kanban view), Lists, Cards (drag-and-drop reordering)
- Card detail: description (rich text), checklist, due dates, labels/tags, attachments, comments, activity feed
- Card people: **Assignees** (owners), **Participants** (auto-tracked involvement), **Watchers/Observers** (opt-in notifications) — see §4a
- **Project view**: cross-board rollup per Project (all boards under it, overall status/progress, deadline)
- Multiple views: Board, Table/Spreadsheet, Calendar, Timeline/Gantt, **Sprint Board**, Dashboard/Reports
- **Subtasks** on any card, with roll-up progress on the parent
- **Sprints**: weekly/monthly/custom iterations with burndown/velocity charts and sprint reports
- **Phases**: lifecycle stages spanning multiple sprints/boards, with optional gate/sign-off approval
- Automations ("Butler"-style rules: "when card moved to Done, assign to X")
- Templates (board templates, card templates)
- Notifications (in-app, email, push) with per-user preferences
- Personal "My Tasks" cross-board view
- Search (global, filters by label/assignee/due date)
- Comments with @mentions, reactions
- Power-ups/plugins marketplace (extensibility)

---

## 7. Suggested Tech Stack

| Layer         | Recommendation                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Frontend      | React + TypeScript, state via Redux Toolkit/Zustand, drag-and-drop via `dnd-kit`, Tailwind CSS       |
| Backend       | Bun + Elysia (this doc once suggested NestJS/Django — not adopted)                                   |
| API           | REST + GraphQL (GraphQL is nice for card/board nested fetching)                                      |
| Real-time     | WebSockets (Socket.IO) or GraphQL Subscriptions for live board updates                               |
| Database      | PostgreSQL (primary), Redis (cache, sessions, rate limiting), Elasticsearch/OpenSearch (search)      |
| File storage  | S3-compatible object storage (attachments, avatars)                                                  |
| Queue/Jobs    | BullMQ / RabbitMQ / SQS for async: emails, automations, webhooks, exports                            |
| Auth          | JWT + refresh tokens; SSO via SAML2/OIDC (WorkOS or Auth0 for enterprise SSO out-of-box); 2FA (TOTP) |
| Infra         | Docker + Kubernetes, multi-AZ; separate services: `api`, `realtime`, `worker`, `admin-api`           |
| Observability | OpenTelemetry, Grafana/Prometheus, Sentry for errors                                                 |
| Billing       | Stripe Billing (subscriptions, metered seats)                                                        |

---

## 8. Architecture Diagram (logical)

```
                     ┌─────────────────────┐
                     │   CDN / Edge (WAF)   │
                     └──────────┬───────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼───────┐
        │ Super Admin   │ │ Company     │ │ User Web App │
        │ Web (React)   │ │ Admin Web   │ │ (React)      │
        └───────┬───────┘ └──────┬──────┘ └──────┬───────┘
                │                │                │
                └────────┬───────┴────────┬───────┘
                          │                │
                 ┌────────▼────────┐ ┌─────▼──────┐
                 │   API Gateway    │ │ WebSocket  │
                 │ (auth, rate-lim, │ │  Server    │
                 │  RBAC middleware)│ │ (realtime) │
                 └────────┬─────────┘ └─────┬──────┘
                          │                  │
        ┌─────────────────┼──────────────────┘
        │                 │
┌───────▼──────┐  ┌───────▼───────┐  ┌───────────────┐
│ Core Service  │  │ Admin Service │  │ Billing Service│
│ (boards/cards)│  │ (org/user mgmt│  │ (Stripe sync)  │
└───────┬───────┘  └───────┬───────┘  └───────┬────────┘
        │                  │                  │
        └────────┬─────────┴─────────┬────────┘
                  │                   │
          ┌───────▼───────┐   ┌───────▼────────┐
          │  PostgreSQL    │   │  Redis / Queue │
          │ (RLS per org)  │   │ (cache/jobs)   │
          └────────────────┘   └───────┬────────┘
                                        │
                              ┌─────────▼─────────┐
                              │ Worker (emails,    │
                              │ automations,       │
                              │ webhooks, exports)│
                              └────────────────────┘
```

You can start as a **modular monolith** (all "services" above as modules in one NestJS app) and split into real microservices only once scale demands it — much easier to build, deploy, and customize early on.

---

## 9. Enterprise-Grade Features Checklist

- [ ] SSO (SAML 2.0 / OIDC) + SCIM for auto user provisioning/deprovisioning
- [ ] Enforced 2FA / passkeys at org level
- [ ] Custom roles & granular permission overrides
- [ ] Full audit log with export (SOC2 requirement)
- [ ] Data residency options (EU/US region selection)
- [ ] IP allowlisting, session policies, device management
- [ ] Org-level data export & "right to be forgotten"
- [ ] SLA-backed uptime + status page
- [ ] Dedicated-instance tier (DB-per-tenant) for top-tier clients
- [ ] Granular API rate limits per plan tier
- [ ] White-labeling (custom domain, branding) for agencies reselling to their own clients
- [ ] Advanced reporting suite (cumulative flow, cycle/lead time, custom report builder) — §11.1
- [ ] JQL-style advanced search + saved filters — §11.2
- [ ] Time tracking & timesheets — §11.3
- [ ] Public intake forms + SLA policies (service-desk parity) — §11.4
- [ ] Docs/Wiki module with card-linking — §11.7
- [ ] Native mobile apps with push notifications — §11.8

---

## 10. Making It Easy to Customize

To keep this genuinely easy to extend later:

1. **Permission-driven UI**: every button/menu checks a permission key from the `GET /roles/permissions` payload — new roles never require UI code changes. (This doc once named a `usePermission` hook; none exists.)
2. **Config-driven custom fields**: let Org Admins define custom fields (text/number/dropdown/date) per board via JSON schema, rendered dynamically — no schema migration needed per client.
3. **Plugin/Power-up architecture**: define a manifest format (name, iframe URL, permissions requested) so third-party or internal mini-apps can attach to a card/board without touching core code.
4. **Feature flags** (e.g., LaunchDarkly or a simple `feature_flags` table) so Super Admin can turn features on per org without deploys.
5. **Theming via CSS variables / design tokens** so Company Admin branding is just a JSON config, not a rebuild.
6. **Webhook + event bus**: every domain action (`card.created`, `card.moved`, `member.added`) emits an event; both automations and external webhooks subscribe to the same event bus — new integrations don't touch core logic.

---

## 11. Advanced Competitive Modules (to go head-to-head with Jira/Trello)

These are the features that separate a Trello clone from a true Jira/Trello competitor. Each needs its own data model and, in most cases, its own service.

### 11.1 Reporting & Dashboards

- **Event-sourced foundation**: don't compute reports by querying live `cards` state alone — log every state transition into an append-only `card_events(id, card_id, event_type, from_value, to_value, actor_id, occurred_at)` table (list moves, stage changes, sprint adds, assignments). This is what makes cycle time, lead time, and cumulative flow diagrams possible after the fact, not just going forward.
- `cycle_time` = time between "work started" event and "done" event per card. `lead_time` = time between card creation and "done."
- **Cumulative Flow Diagram**: daily snapshot job (`board_snapshots(board_id, list_id, card_count, snapshot_date)`) aggregated from `card_events`, powering a stacked-area chart of cards-per-list over time.
- **Custom report builder**: let users pick a metric (count/sum/avg), a grouping dimension (assignee/label/sprint/stage), and filters — store as `report_definitions(id, org_id, config_json)` and render via a generic query engine, not one-off endpoints per report.
- **Portfolio dashboards**: roll up across multiple Projects/Boards within a Workspace or Org — needs a read-optimized aggregation layer (materialized views or a separate OLAP-style store like ClickHouse once volume grows) so dashboards don't hammer the transactional Postgres DB.
- Recommended stack addition: a lightweight analytics pipeline (events → queue → warehouse) rather than real-time joins on the OLTP database.

### 11.2 Global + Saved Search / Advanced Query Language

- Index cards (and comments, attachments metadata) into **Elasticsearch/OpenSearch** — already in the tech stack, now put to real use.
- Build a small **query DSL** (your version of JQL), e.g. `project = "Website" AND assignee = currentUser() AND stage != "Done" ORDER BY due_date`. Parse it into an Elasticsearch query — don't try to compile it to raw SQL, search is the right tool.
- `saved_searches(id, user_id, org_id, name, query_string, is_shared)` — personal or team-shared filters, pinned in the sidebar (same UX pattern as Jira's saved filters/JQL).
- Autocomplete for field names/operators in the query bar is a big power-user UX win — worth the investment once the DSL exists.

### 11.3 Time Tracking

- `time_logs(id, card_id, user_id, minutes, description, logged_date, is_billable)` — simple work-log entries per card.
- `cards.estimate_minutes` (planned) vs. sum of `time_logs.minutes` (actual) — surfaced as a progress bar on the card and rolled up to Sprint/Project level.
- `timesheets`: a weekly/monthly view aggregating a user's `time_logs` across all cards/projects — exportable (CSV/PDF) for client billing, a must-have for agencies.
- Billable vs. non-billable flag ties into future invoicing/export features — keep it as a boolean now even if you don't build invoicing yet.

### 11.4 Forms / Intake (Service-Desk style)

- `intake_forms(id, project_id, name, fields_json, is_public, submit_message)` — admin-defined form schema (same JSON-schema pattern as Custom Fields in §10), can be public (no login) or internal-only.
- Public form submission creates a Card directly in a designated List (e.g. "New Requests"), auto-tagging the reporter's email as an external Participant/Watcher.
- Needs basic **spam/rate-limit protection** (captcha, per-IP throttling) since public forms are an open write endpoint into your system — treat this as an internet-facing surface requiring its own security review.
- Optional SLA layer: `sla_policies(project_id, priority, response_due_minutes, resolution_due_minutes)` — track breach status per card, a core Jira Service Management feature enterprises expect if you're chasing IT/support use cases.

### 11.5 Real-Time Collaboration Polish

- **Presence & live cursors**: ephemeral state (who's viewing/editing what) doesn't belong in Postgres — keep it in Redis (or in-memory on the WebSocket server) with short TTLs, broadcast via the existing WebSocket layer, never persisted.
- **"X is typing"**: same pattern — a transient pub/sub event on the card's channel, not a DB write.
- **Conflict-free simultaneous editing** on rich-text card descriptions: use a CRDT library (Yjs or Automerge) rather than naive last-write-wins — this is a meaningfully hard problem, budget real time for it rather than bolting it on late.
- Scale note: WebSocket server needs to be **horizontally scalable with a shared pub/sub backbone** (Redis Pub/Sub or NATS) so presence/typing events reach users connected to different server instances.

### 11.6 Notifications Engine Maturity

- `notification_preferences(user_id, org_id, event_type, channel ENUM('in_app','email','push'), frequency ENUM('instant','digest_daily','digest_weekly','off'))` — granular, not a single on/off toggle.
- `notifications(id, user_id, event_type, payload_json, is_read, created_at)` — in-app notification feed, generated by workers consuming the same event bus (`card.assigned`, `comment.mentioned`, `stage.changed`, etc.) already used for automations/webhooks — one event, many downstream consumers.
- **Digest bundling**: a scheduled worker groups a user's pending digest-frequency notifications into a single email rather than firing one email per event — critical to avoid notification fatigue that kills retention.
- **Do-not-disturb**: per-user quiet hours/timezone-aware scheduling, respected by the digest worker and push dispatch.
- **Mobile push**: requires the native app (11.8) plus a push service (FCM for Android, APNs for iOS) — device tokens stored in `push_devices(user_id, platform, token)`.

### 11.7 Docs/Wiki Module

- New top-level entity alongside Boards: `wiki_spaces(id, org_id, name)` → `wiki_pages(id, space_id, parent_page_id, title, content_json, version, updated_by)` — nested pages, version history via an append-only `wiki_page_revisions` table (cheap, enables rollback).
- Rich text via the same editor framework as card descriptions (e.g. TipTap/ProseMirror) so there's one editor to maintain, not two.
- **Card ↔ Doc linking**: `card_wiki_links(card_id, wiki_page_id)` — this cross-linking is the actual Atlassian moat (Jira+Confluence together), so prioritize the _link_, not just the docs feature in isolation.
- Full-text search on wiki content goes into the same Elasticsearch index as cards (§11.2) so global search covers both.

### 11.8 Native Mobile Apps

- **React Native** is the pragmatic choice — shares business logic/API layer with the web React app, one team can maintain both, and gets you to iOS + Android faster than two fully native codebases.
- Mobile-specific backend needs: push notification dispatch (11.6), offline-friendly API design (support `If-Modified-Since`/ETags so the app can cache and sync deltas), and a lighter-weight "board summary" API to avoid over-fetching on mobile networks.
- Ship in phases: **Phase 1** — read + comment + basic card edit + push notifications (covers 80% of on-the-go use). **Phase 2** — full board editing, drag-drop, offline queue for actions taken without signal.
- Budget separate app-store review/release cycles into your roadmap — this is genuinely slower iteration than web deploys, plan accordingly.

---

## 12. Suggested Build Order (MVP → Growth → Enterprise)

**Phase 1 — MVP (core loop, prove the product)**

1. Auth + Organizations + Users + basic RBAC (Owner/Admin/Member)
2. Workspaces → Projects → Boards → Lists → Cards (core Kanban CRUD + drag-drop)
3. Comments, attachments, labels/tags, due dates, checklists, subtasks
4. Real-time sync (WebSockets) — basic board updates; save live cursors/CRDT editing for Phase 3
5. Notifications v1 (simple in-app + email; granular preferences arrive in Phase 2)
6. Company Admin Panel (user mgmt, billing, branding)
7. Super Admin Panel (tenant mgmt, plans, feature flags)

**Phase 2 — Growth (retention + power-user hooks)** 8. Custom Stage/Status templates (§4c) + Sprints + Phases (§4b) 9. Global search + saved searches (§11.2) — a major daily-use retention driver 10. Notifications engine maturity: granular preferences, digest bundling, DND (§11.6) 11. Automations + webhooks + core integrations (Slack, GitHub, Google Drive) 12. Reporting v1: burndown/velocity, basic dashboards (§11.1) 13. Time tracking (§11.3) — pull earlier if targeting agencies/consultancies specifically 14. Import tools from Jira/Trello/Asana — critical for customer acquisition, don't skip this

**Phase 3 — Enterprise & competitive parity** 15. SSO/SCIM, custom roles, audit log, dedicated-instance tier 16. Advanced reporting: cumulative flow diagrams, cycle/lead time, custom report builder, portfolio dashboards (§11.1) 17. Real-time polish: live cursors, typing indicators, CRDT-based conflict-free editing (§11.5) 18. Forms/intake + SLA policies for service-desk use cases (§11.4) 19. Docs/Wiki module with card-linking (§11.7) 20. Native mobile apps — read/comment/push first, full editing second (§11.8) 21. Plugin/App marketplace + public developer API

**Rule of thumb:** Phase 1 gets you a usable product. Phase 2 gets you retention and word-of-mouth. Phase 3 is what unlocks enterprise contracts and genuine Jira/Trello competition. Don't front-load Phase 3 — teams that try to build wiki/mobile/marketplace before nailing the core board experience usually stall before shipping anything real.

---

_This document is a starting blueprint — happy to go deeper on any one piece: the exact Postgres schema with SQL, the RBAC permission-check middleware code, the React board UI, or the Stripe billing/seat-metering flow. Just say which one._
