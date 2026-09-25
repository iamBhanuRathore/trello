# Boardly End-to-End (E2E) Comprehensive Testing & Defect Report

**Date:** August 26, 2026  
**Environment:** Local Development (`http://localhost:5173`, Backend: `http://localhost:3001`)  
**Test Coverage:** Happy Flows, Core Business Logic, Edge Cases, Permission/RBAC Controls, UI/UX & Responsive Views, API & Database Constraints.

---

## 📋 Executive Summary

A comprehensive End-to-End audit was executed across the entire **Boardly** platform (both Frontend Single Page App and Backend REST & WebSocket APIs). The testing encompassed multiple roles (**Org Owner**, **Org Admin**, **CTO**, **Product Lead**, **Developer**, **Plain Member**, and **External Stakeholder**) and all major functional modules.

### Overall Health & Test Results

- **Backend Test Suite:** 109 Passing / 3 Failing (RBAC router regression).
- **Frontend Build Status:** Failing TypeScript compilation due to deprecated TS 6/7 compiler flags.
- **UI/UX & Feature Verification:** Core Kanban workflows, card details, markdown descriptions, checklists, time tracking, search palette, docs wiki, branding, and audit logs are functional with high responsiveness, but several critical logic, routing, error-boundary, and UX defects were uncovered.

---

## 🗂️ Defect Summary Table

| ID         | Category           | Title                                                                         | Severity     | Status          | Affected Files / Components                                                                                                                         |
| ---------- | ------------------ | ----------------------------------------------------------------------------- | ------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BUG-01** | Backend / RBAC     | Organization Router `.use()` Middleware Leak Causes False 403s                | **CRITICAL** | ✅ **Resolved** | [`apps/backend/src/modules/organizations/routes.ts`](file:///Users/bhanurathore/projects/trello/apps/backend/src/modules/organizations/routes.ts)   |
| **BUG-02** | Frontend / Build   | `tsconfig.app.json` Deprecated `baseUrl` Breaks Production Build              | **HIGH**     | ✅ **Resolved** | [`apps/dashboard/tsconfig.app.json`](file:///Users/bhanurathore/projects/trello/apps/dashboard/tsconfig.app.json)                                   |
| **BUG-03** | Frontend / Routing | Missing 404 Catch-All Route Renders Blank Dark Screen                         | **HIGH**     | ✅ **Resolved** | [`apps/dashboard/src/App.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/App.tsx)                                               |
| **BUG-04** | Backend / DB       | Postgres Invalid UUID Syntax on Label Operations & Automations                | **HIGH**     | ✅ **Resolved** | [`apps/backend/src/modules/cards/service.ts`](file:///Users/bhanurathore/projects/trello/apps/backend/src/modules/cards/service.ts)                 |
| **BUG-05** | UI/UX / Admin      | Billing Page "Upgrade Plan" Button Is Non-Functional (Dead Click)             | **MEDIUM**   | ✅ **Resolved** | [`apps/dashboard/src/pages/admin/Billing.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/admin/Billing.tsx)               |
| **BUG-06** | UI/UX / Reports    | Project Reports Infinite Spinner on Error / Missing Empty State               | **MEDIUM**   | ✅ **Resolved** | [`apps/dashboard/src/pages/ProjectReports.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/ProjectReports.tsx)             |
| **BUG-07** | UI/UX / Forms      | Stage Templates WIP Limit Input Allows Unvalidated Input Values               | **LOW**      | ✅ **Resolved** | [`apps/dashboard/src/pages/admin/StageTemplates.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/admin/StageTemplates.tsx) |
| **BUG-08** | Code Quality       | Unused Imports & Exhaustive-Deps React Warnings                               | **LOW**      | ✅ **Resolved** | Multiple Dashboard Components                                                                                                                       |
| **BUG-09** | Frontend / UX      | Opening a Just-Created Card Shows "Task not found" (Optimistic Temp-ID Click) | **MEDIUM**   | ✅ **Resolved** | [`apps/dashboard/src/pages/BoardView.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/BoardView.tsx)                       |
| **BUG-10** | Frontend / UX      | Sidebar "Search or jump to…" Button Silently Does Nothing                     | **MEDIUM**   | ✅ **Resolved** | [`apps/dashboard/src/components/AppSidebar.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/components/AppSidebar.tsx)           |

---

## 🔍 Detailed Defect Breakdown & Reproduction Steps

---

### 🔴 BUG-01: Organization Router `.use()` Middleware Leak (RBAC Test Failures)

- **Severity:** **CRITICAL**
- **Affected Module:** Backend RBAC & Organization Member Management
- **File:** [`apps/backend/src/modules/organizations/routes.ts`](file:///Users/bhanurathore/projects/trello/apps/backend/src/modules/organizations/routes.ts#L10-L128)
- **Description:**
  In `apps/backend/src/modules/organizations/routes.ts`, `requirePermission(...)` middlewares are chained using `.use(requirePermission(...))` sequentially on the same top-level Elysia router instance. In Elysia 1.x, calling `.use(...)` appends derive/beforeHandle hooks that apply globally to subsequent route definitions. As a result:
  1. The final `.use(requirePermission('member.remove'))` overrides or stacks upon earlier handlers.
  2. Plain members with valid `org.read` permission attempting to list organization members (`GET /v1/orgs/:orgId/members`) receive a `403 Forbidden: missing permission: member.remove`.
  3. This causes **3 unit/integration test failures** in `apps/backend/src/modules/organizations/org.routes.test.ts`.

#### Steps to Reproduce:

1. Run `bun run --cwd apps/backend test`.
2. Observe test failure:
   ```text
   (fail) Organization routes — RBAC enforcement over HTTP > a plain member CAN list members (holds org.read)
   (fail) Organization routes — RBAC enforcement over HTTP > an org owner CAN remove a member
   (fail) Organization routes — RBAC enforcement over HTTP > a plain member CANNOT remove an org member
   ```

#### Recommended Fix:

Do not chain `.use(requirePermission(...))` at the top level of the same router. Instead, scope permissions per route using Elysia's `beforeHandle` route hook or nested `.guard()` blocks:

```typescript
.get('/:orgId/members', handler, {
  beforeHandle: requirePermission('org.read').beforeHandle
})
```

or

```typescript
.guard({ beforeHandle: requirePermission('org.read') }, (app) =>
  app.get('/:orgId/members', handler)
)
```

---

### 🟠 BUG-02: `tsconfig.app.json` Deprecated `baseUrl` Option Fails Production Build

- **Severity:** **HIGH**
- **Affected Module:** Dashboard Build & CI/CD Pipeline
- **File:** [`apps/dashboard/tsconfig.app.json`](file:///Users/bhanurathore/projects/trello/apps/dashboard/tsconfig.app.json#L23)
- **Description:**
  Running `tsc -b` (or `bun run --cwd apps/dashboard build`) fails immediately with TypeScript error `TS5101`:
  ```text
  tsconfig.app.json(23,5): error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.
  ```
  This prevents building the frontend production bundle for deployments.

#### Steps to Reproduce:

1. Execute in terminal: `bun run --cwd apps/dashboard build`.
2. Build halts with Exit Code 2.

#### Recommended Fix:

Add `"ignoreDeprecations": "6.0"` to compilerOptions in `apps/dashboard/tsconfig.app.json` or migrate path aliases to standard bundler path resolutions.

---

### 🟠 BUG-03: Missing 404 Catch-All Route Displays Blank Dark Screen

- **Severity:** **HIGH**
- **Affected Module:** Dashboard Router & Error Boundary
- **File:** [`apps/dashboard/src/App.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/App.tsx#L55-L102)
- **Visual Evidence:**  
  ![404 Dark Screen](/Users/bhanurathore/.gemini/antigravity-ide/brain/0fe9c3c7-6b47-41d8-b3cf-fc4fc4c8d2e8/route_404_page_1787718954866.png)
- **Description:**
  When a user navigates to an invalid URL path (e.g. `http://localhost:5173/random-unmatched-route-xyz`), the React router matches no route and renders an empty layout (a blank dark screen) without an error message, "404 Page Not Found" graphic, or navigation button to return to `/` or `/login`.

#### Steps to Reproduce:

1. Log in and navigate to `http://localhost:5173/non-existent-page`.
2. Observe complete blank page without feedback.

#### Recommended Fix:

Add a fallback catch-all route `<Route path="*" element={<NotFoundPage />} />` inside `App.tsx` with a friendly "Page Not Found" screen and a "Return to Dashboard" action button.

---

### 🟠 BUG-04: Postgres Invalid UUID Syntax on Label Operations & Automations

- **Severity:** **HIGH**
- **Affected Module:** Cards Service & Automations Engine
- **File:** [`apps/backend/src/modules/cards/service.ts`](file:///Users/bhanurathore/projects/trello/apps/backend/src/modules/cards/service.ts)
- **Description:**
  When linking labels to cards (`card_labels`), raw string non-UUID values (e.g. `'test-label-id'`) passed from automation actions or mocked test payloads trigger an unhandled database exception:
  ```text
  PostgresError: invalid input syntax for type uuid: "test-label-id"
  code: "22P02"
  query: "insert into \"card_labels\" (\"card_id\", \"label_id\") values ($1, $2) on conflict do nothing"
  ```

#### Steps to Reproduce:

1. Trigger card label attachment with non-UUID label ID.
2. Observe 500 error log in backend database queries.

#### Recommended Fix:

Ensure all label handlers validate `z.string().uuid()` or parse valid UUIDs before executing SQL inserts against Postgres UUID columns.

---

### 🟡 BUG-05: Billing Page "Upgrade Plan" Button Is a Dead Click

- **Severity:** **MEDIUM**
- **Affected Module:** Admin Billing (`/admin/billing`)
- **File:** [`apps/dashboard/src/pages/admin/Billing.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/admin/Billing.tsx#L65-L85)
- **Description:**
  On the Billing Admin page, the "Upgrade Plan" button is rendered prominently in the UI. However, clicking the button does not trigger any action, modal, toast notification, or checkout link.

#### Steps to Reproduce:

1. Navigate to `http://localhost:5173/admin/billing`.
2. Click on the "Upgrade Plan" button.
3. Observe nothing happens.

#### Recommended Fix:

Connect the button to an upgrade plan modal or display a contact sales / tier selector dialog.

---

### 🟡 BUG-06: Project Reports Infinite Spinner on Error / Missing Empty State

- **Severity:** **MEDIUM**
- **Affected Module:** Analytics & Project Reports
- **File:** [`apps/dashboard/src/pages/ProjectReports.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/ProjectReports.tsx#L80-L89)
- **Visual Evidence:**  
  ![Reports Loading State](/Users/bhanurathore/.gemini/antigravity-ide/brain/0fe9c3c7-6b47-41d8-b3cf-fc4fc4c8d2e8/project_reports_page_1787718964000.png)  
  _Loaded Reports State:_  
  ![Reports Loaded](/Users/bhanurathore/.gemini/antigravity-ide/brain/0fe9c3c7-6b47-41d8-b3cf-fc4fc4c8d2e8/project_reports_page_loaded_1787718968828.png)
- **Description:**
  When navigating to `/projects/:projectId/reports`, if the initial summary query takes time, encounters a 404, or fails to fetch data, the page gets stuck in `Loading project analytics...` without an error alert or retry button.

#### Steps to Reproduce:

1. Navigate to `/projects/non-existent-project-id/reports`.
2. Observe infinite spinner without error message.

#### Recommended Fix:

Handle `isError` explicitly in `useQuery` and render an `ErrorState` component with a retry button and back link.

---

### 🟢 BUG-07: Stage Templates WIP Limit Input Allows Unvalidated Input Values

- **Severity:** **LOW**
- **Affected Module:** Stage Templates Settings (`/admin/stages`)
- **File:** [`apps/dashboard/src/pages/admin/StageTemplates.tsx`](file:///Users/bhanurathore/projects/trello/apps/dashboard/src/pages/admin/StageTemplates.tsx)
- **Visual Evidence:**  
  ![Stage Row Added](/Users/bhanurathore/.gemini/antigravity-ide/brain/0fe9c3c7-6b47-41d8-b3cf-fc4fc4c8d2e8/stage_row_added_1787639487616.png)  
  ![Verify Stage Inputs](/Users/bhanurathore/.gemini/antigravity-ide/brain/0fe9c3c7-6b47-41d8-b3cf-fc4fc4c8d2e8/verify_stage_inputs_1787639516968.png)
- **Description:**
  When configuring stage templates, the WIP (Work-in-Progress) limit number input does not enforce `min={0}` or `max={999}` HTML constraints, allowing negative numbers or non-numeric characters to be entered before saving.

#### Recommended Fix:

Add `min={0}` and input sanitization to the WIP limit input element.

---

### 🟢 BUG-08: Code Quality — Unused Imports & React Exhaustive-Deps Warnings

- **Severity:** **LOW**
- **Affected Module:** Frontend Code Quality
- **Files:**
  - `src/components/common/ConfirmDialog.tsx` (unused `DialogHeader`)
  - `src/components/SearchPalette.tsx` (unused `Palette`, `ArrowRight`)
  - `src/pages/Settings/WebhookSettings.tsx` (missing dependency in `useEffect`)
  - `src/components/board/TaskDetailView.tsx` (`useImperativeHandle` ref warning)
- **Description:**
  Linter (`oxlint`) reports 13 warnings for unused variables/imports and non-memoized hook dependencies that could cause unexpected re-renders.

---

## 🌟 Verified Happy Flows & Working Functionality

The following key platform capabilities were validated and confirmed working smoothly:

### 1. 🛡️ Authentication & Access Controls

- **Invalid Credentials Handling:** Proper error prompt and feedback displayed (`login_error_message_1787638754057.png`).
- **Valid Login & Token Persistence:** Alex Vance (`alex.vance@acme.corp`) logged in and token persisted in `localStorage`.
- **Admin & Super Admin Navigation:** Role guards successfully permit Org Owner to access `/admin/*` and `/super-admin/*`.

### 2. 🗄️ Organization Administration & Governance

- **Users Management (`/admin/users`):** Filtering, role badges, and user counts displayed cleanly (`filtered_users_admin_owner_1787718916319.png`).
- **Audit Logs (`/admin/audit-logs`):** Event history, actor search filter, and CSV export work properly (`audit_logs_main_1787639354863.png`).
- **Branding Customizer (`/admin/branding`):** Organization name, primary brand color picker, and live preview persist and save correctly (`branding_persisted_1787639454121.png`).
- **Developer Settings (`/admin/developer`):** API key generation, revocation, and scope management.
- **SSO Settings (`/admin/sso`):** IdP presets (Okta, Azure AD, Google SAML) and SCIM token manager.
- **Super Admin Tenants & Plans (`/super-admin/tenants`, `/super-admin/plans`):** Multi-tenant catalog and plan tier matrices load properly (`superadmin_tenants_page_1787718946133.png`, `superadmin_plans_page_1787718950393.png`).

### 3. 📋 Kanban Board & Card Management

- **Card Creation & Inline Inputs:** Tasks added instantly to lists.
- **Task Detail Modal (`TaskDetailView`):**
  - Title editing and autosave.
  - Markdown description editor with live render (`saved_description_1787718184871.png`).
  - Checklist creation with item toggle and progress bar.
  - Comment thread with author avatar and timestamp.
  - Time tracking logging: logged 1h 30m with description, visible in history table (`logged_time_entry_1787718676261.png`).
  - Label assignment with color tags.

### 4. ⚡ Productivity & Search

- **Global Command Palette (`Control+K` / `Cmd+K`):** Instant search indexing for cards, boards, and quick actions (`search_command_palette_1787718998362.png`).
- **Project Docs & Wiki (`/projects/:id/docs`):** Rich document creation, markdown rendering, and task linking (`project_docs_page_1787718987188.png`).
- **Timesheets (`/timesheets`):** User hours aggregation matrix with date filtering.
- **My Tasks (`/my-tasks`):** Filter by assigned user and status columns.

---

## 📸 Screenshots & Visual Media Reference

| Area                       | Image File                                      | Description                              |
| -------------------------- | ----------------------------------------------- | ---------------------------------------- |
| **Login Error Feedback**   | `login_error_message_1787638754057.png`         | Invalid credentials error banner         |
| **Admin Audit Trail**      | `audit_logs_main_1787639354863.png`             | Compliance audit logs table and filters  |
| **Admin Users Management** | `filtered_users_admin_owner_1787718916319.png`  | User directory with search filter        |
| **Branding Settings**      | `branding_persisted_1787639454121.png`          | Live brand color and org name customizer |
| **Stage Templates**        | `verify_stage_inputs_1787639516968.png`         | Workflow builder and WIP limit controls  |
| **Task Modal & Markdown**  | `saved_description_1787718184871.png`           | Card modal with rendered description     |
| **Time Tracking Entry**    | `logged_time_entry_1787718676261.png`           | Logged duration and time log history     |
| **Analytics & Reports**    | `project_reports_page_loaded_1787718968828.png` | Velocity, Burndown, and CFD charts       |
| **Project Docs Wiki**      | `project_docs_page_1787718987188.png`           | Documentation and markdown preview       |
| **Global Command Palette** | `search_command_palette_1787718998362.png`      | Cmd+K Search dialog and instant results  |
| **Super Admin Tenants**    | `superadmin_tenants_page_1787718946133.png`     | Multi-tenant organization list           |
| **Super Admin Plans**      | `superadmin_plans_page_1787718950393.png`       | Subscription tiers and feature limits    |
| **404 Route Defect**       | `route_404_page_1787718954866.png`              | Blank screen on unmatched route          |

---

## 🛠️ Prioritized Action Plan for Fixes

1. **Step 1 (Critical):** Fix backend organization routes Elysia middleware scoping so permissions are attached per-route rather than leaking globally (`BUG-01`).
2. **Step 2 (High):** Add `"ignoreDeprecations": "6.0"` in `apps/dashboard/tsconfig.app.json` to restore `bun run build` / `tsc -b` (`BUG-02`).
3. **Step 3 (High):** Implement a dedicated `NotFoundPage` and catch-all route `*` in `App.tsx` (`BUG-03`).
4. **Step 4 (High):** Validate UUIDs in cards and automations service before SQL execution to avoid Postgres 22P02 syntax errors (`BUG-04`).
5. **Step 5 (Medium):** Wire the "Upgrade Plan" button on `/admin/billing` to open a plan selection modal (`BUG-05`).
6. **Step 6 (Medium):** Add error state and retry UI in `ProjectReports.tsx` when analytics queries fail or return 404 (`BUG-06`).
7. **Step 7 (Low):** Sanitize WIP limit inputs on `/admin/stages` and clean up linter warnings (`BUG-07`, `BUG-08`).

---

## 🤖 Automated E2E Suite (Playwright, 2026-09-26)

Two-tier suite under `apps/dashboard/e2e/` (`smoke` gates PRs, `full` runs nightly/on-demand),
using seed personas from `docs/SEED_CREDENTIALS.md` (`Password123!`) for role coverage plus
isolated `e2e-<stamp>` entities (deleted in `afterAll`) for mutation flows.
Result at introduction: **19 passed, 1 skipped (intentional prod-guard placeholder), 0 failed.**
CI job `e2e-smoke` in `.github/workflows/ci.yml` runs the smoke tier against seeded Postgres + Redis.

### 🟠 BUG-09: Opening a Just-Created Card Shows "Task not found"

**Severity:** MEDIUM — affects every fast user, not just tests.

**Context:** The inline card composer is optimistic: new tiles render immediately with
`temp-*` ids until the server responds (`onReplaceCard`). Clicking the tile in that
window opens `CardModal` with the temp id, and `GET /v1/cards/temp-…` 404s into the
"Task not found" wall, which never retries.

#### Steps to Reproduce:

1. On any board, click "+ Add a card", type a title, submit.
2. Within ~1s (before the server round-trip replaces the tile), click the new card.
3. Modal shows "Task not found — This card may have been deleted or archived."

#### Fix Applied:

`handleCardClick` in `BoardView.tsx` ignores `temp-`-prefixed ids (the tile is replaced
with the real card within a beat, so the click is safely dropped).

### 🟠 BUG-10: Sidebar "Search or jump to…" Button Silently Does Nothing

**Severity:** MEDIUM — dead control in primary navigation.

**Context:** The button synthesizes `Cmd+K` via `window.dispatchEvent(new KeyboardEvent(...))`,
but `SearchPalette` listens at `document` level — and window-targeted events never reach
document listeners. Real keyboard Cmd+K worked, so this only broke the clickable path.

#### Steps to Reproduce:

1. Click "Search or jump to…" in the sidebar (do not press Cmd+K).
2. Nothing happens — no palette, no error.

#### Fix Applied:

Dispatch the synthetic event on `document` instead of `window` in `AppSidebar.tsx`.
Covered by `e2e/full/misc.spec.ts` (palette opens via button click).
