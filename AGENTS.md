# AI Coding Assistant Guidelines (Boardly)

## 1. Codebase Knowledge Graph & Navigation (MANDATORY)

- **Primary Architecture Reference**: Always inspect [`graphify-out/GRAPH_REPORT.md`](file:///Users/bhanurathore/projects/trello/graphify-out/GRAPH_REPORT.md) **first** before performing broad multi-file searches or code modifications.
- **Community Hubs**: Consult the community clusters in `graphify-out/GRAPH_REPORT.md` to locate exact dependency trees, module entrypoints, database models, and service interfaces.
- **Token Efficiency**: Rely on the Knowledge Graph index rather than repeatedly reading unindexed directories.

## 2. Project Architecture & Stack

- **Backend (`apps/backend`)**: Bun runtime, Elysia.js REST API (`/v1/*`), Drizzle ORM, PostgreSQL, Redis Pub/Sub, Stripe billing SDK, WorkOS SSO.
- **Frontend Dashboard (`apps/dashboard`)**: React 18, Vite, Tailwind CSS v4, Lucide Icons, Zustand, TanStack Query, Radix/Base UI.
- **Platform Super Admin (`apps/super-admin`)**: Standalone Vite SPA on `:5174` for multi-tenant cluster management and platform metrics.
- **Shared Packages (`packages/`)**: `@boardly/shared-types` (DTOs, permissions matrix, role enums), `@boardly/ui` (shared components).

## 3. Documentation Updates Rule

- Keep markdown documents in `docs/` (e.g. `Progress.md`, `Decisions.md`) updated after implementing significant features or architectural changes.
- **Enforced by `scripts/check-docs.sh` in `.husky/pre-push`**: pushing code changes under `apps/`/`packages/` (any type except `docs/chore/ci/build/test`) fails unless the pushed range also touches `docs/` (`Progress.md` log + Current State, `Roadmap.md` checkboxes, `Decisions.md` if non-trivial). The push is the "session end" event — batch micro-commits, document once per push.
- **Trivial changes**: add a `[skip-docs]` trailer to the commit message (visible in history) or set `SKIP_DOCS_CHECK=1` for local emergencies. Skipping must be explicit, never silent.

## 4. Response Conciseness & Output Token Reduction (STRICT)

- **Zero Fluff**: Skip conversational filler, preamble, self-evident explanations, and redundant summaries.
- **Direct & Terse**: Provide code diffs/actions immediately with compact bullet points.
- **Surgical Edits**: Never rewrite large files or re-quote unchanged code. Focus strictly on modified lines.

## 5. UI/UX Notification & Toast Etiquette (STRICT)

- **No Noisy Success Toasts**: Never trigger success toasts or banner popups for routine, immediate local interactions (e.g. pasting a screenshot, adding a file to an upload tray, typing, selecting a filter) where the UI already provides direct visual feedback (such as preview pills or badges).
- **Failure-Focused Alerts**: Reserve notification popups strictly for failures (`toast.error(...)`) or completed asynchronous backend actions.
- **Unobstructed Viewports**: Alerts and toasts must never obstruct the user's active viewport, input fields, or chat composers.

## 6. Environment File Security (STRICT — NO EXCEPTIONS)

- **Never read `.env` files**: Do NOT open, view, read, log, print, or output the contents of any `.env`, `.env.local`, `.env.production`, `.env.staging`, or any other environment file that contains real secrets/credentials.
- **`.env.example` is allowed**: You MAY read `.env.example` files (they contain placeholder values, not real secrets) to understand required environment variable names and structure.
- **No indirect reads**: Do NOT run shell commands that print `.env` file contents (e.g. `cat .env`, `echo $(cat .env)`, `printenv`, `env | grep ...`).
- **No logging of secrets**: Never include environment variable values in logs, diffs, artifact files, or any output — even partially or redacted.
- **Reason**: `.env` files contain database passwords, API keys, JWT secrets, and third-party credentials. Exposure in any output is a security violation.

## 7. Enterprise-Grade Feature Standard (STRICT — NO EXCEPTIONS)

- **Every feature ships at industry/enterprise level**: Boardly competes with Jira, Linear, Notion, and Asana. Every new feature or feature set MUST match the interaction quality, polish, and robustness of those products — never a minimal "local product" implementation.
- **Market-standard interactions are mandatory**: keyboard shortcuts (`Enter` to submit / `Shift+Enter` for newline, `Escape` to cancel, `Cmd/Ctrl+Enter` where applicable), optimistic UI with rollback on failure, dirty-tracked save buttons (disabled when pristine), loading/empty/error states for every async surface, and accessible focus management in modals and popovers.
- **No dead or misleading UI**: every visible button must either act or be disabled with an explanatory tooltip. A control that silently does nothing is a defect, not a limitation.
- **Benchmark before building**: when implementing a feature, explicitly compare against how Linear/Jira/Notion handle the same interaction and match or exceed it. Note the benchmark in `docs/Decisions.md` when the choice is non-trivial.

## 8. Commit After Changes, Never Push (STRICT — NO EXCEPTIONS)

- **Commit when done**: after completing all requested changes, create a checkpoint commit (`git add` only intended files, inspect `git status`/`git diff` first, concise message matching repo style). Commit the pre-change state first if the tree is dirty.
- **No co-author trailers**: commit messages use the repo's own conventional-commit style and nothing else. Do NOT append `Co-Authored-By:`, `Signed-off-by:`, `Reviewed-by:`, or any other attribution/attestation trailer — not for an AI assistant and not for a human. GitHub renders a `Co-Authored-By:` trailer as "user and <name>", which puts a second identity on every commit in this repo's history. Attribution belongs in the commit body prose where it is genuinely useful, not in a machine-parsed trailer.
- **Never push**: do NOT run `git push`, do NOT create PRs, do NOT force-push — CI/CD pipelines own deployment. Leave commits local for the user to push.
- **Never amend a failed commit**: fix and create a new commit instead.

## 9. Responsive Design Standard (STRICT — NO EXCEPTIONS)

Every page in `apps/dashboard` (and `apps/super-admin`) MUST be usable at all of these widths — mobile (360–480px), tablet (768px), laptop (1280px), desktop monitor (1536px+), ultrawide (2560px). Tailwind v4 breakpoints: `sm:640` `md:768` `lg:1024` `xl:1280` `2xl:1536`.

- **No fixed-width pile-ups**: sidebars/panes use `w-full` + `sm:`/`md:` widths, never bare `w-72`/`w-80` in a multi-pane row. Multi-pane surfaces (Chat: list/feed/details) collapse to list-OR-detail below `lg:` (Slack pattern) with an in-flow back affordance — never three squeezed columns.
- **Grids scale up AND down**: stat/card grids start at 1–2 cols and add columns per breakpoint (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`); never 4-across below `xl:` in narrow viewports. Button/pill rows `flex-wrap` instead of overflowing; long titles `truncate` inside `min-w-0` containers.
- **Touch targets**: interactive controls ≥ 36px on coarse pointers; hover-only actions must have a touch/click equivalent (context menu, long-press, visible button).
- **Dialogs/sheets**: `w-full` with `max-w-*`, `max-h-[90vh]` scrollable bodies; side panes become overlays (`fixed inset-y-0 right-0`) below `2xl:` where the layout already does so.
- **Verify by resizing**: before committing UI work, resize to 390px and 820px widths and confirm no horizontal overflow (`overflow-x` on `document.body`), no clipped primary actions, no wrapped-blob badges.

## 10. File Size Discipline (STRICT — NO EXCEPTIONS)

- **Do not create large files until it is very necessary.** Default to small, single-responsibility modules. A new file over **400 lines** requires a stated reason; over **600 lines** requires splitting before the change is considered done.
- **Split by concern, not by line count**: extract hooks, sub-components, columns/config tables, and service helpers into sibling modules (`components/`, `columns/`, `hooks/`) instead of letting one component grow into every state, query, mutation, and renderer for a page.
- **Prefer editing over growing**: when adding a feature to an already-large file, decide explicitly whether the new code belongs in a new file. Appending to a 900-line component is a defect, not the path of least resistance.
- **Data belongs in config, not JSX**: long static maps (permission descriptions, role metadata, category labels) live in a typed const or a shared-types module — never inline in a render function.
- **Backend mirrors this**: `service.ts` files split into domain submodules behind a re-export facade (see `organizations/service.ts` → `org-common` / `org-manage` / `org-members` / `org-invitations`).
- **Why**: oversized files defeat the knowledge-graph navigation in §1 (thin, weakly-connected communities), blow up diff/review cost, and make regressions hard to isolate — the largest files in this repo are the ones that keep producing defects.

## 11. Dialog Close Contract (STRICT — NO EXCEPTIONS)

- **One close path**: every dialog (Radix or hand-rolled portal) MUST close exclusively through `useDialogClose({ isOpen, onClose, ... })` (`apps/dashboard/src/hooks/useDialogClose.ts`) — X button → `requestClose`, backdrop → `handleOverlayClick`, Radix → `handleOpenChange`. Never wire `onClose`, `useEscapeKey`, or inline overlay checks directly.
- **Why**: duplicate close gestures (double Esc listeners, overlay+button both firing, focus-strand shortcut refires) caused the recurring "close twice / reopens" bug class. `requestClose` is idempotent per open session; Esc is capture-phase so it can't double-fire with inner handlers; invoker focus restores automatically.
- **Dirty editors**: pass `isDirty` + `onDirtyRequest` (open the unsaved-changes prompt) instead of branching close logic inside the dialog.
