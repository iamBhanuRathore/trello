# AI Coding Assistant Guidelines (Boardly)

## 1. Codebase Knowledge Graph & Navigation (MANDATORY)

- **Primary Architecture Reference**: Always inspect [`graphify-out/GRAPH_REPORT.md`](file:///Users/bhanurathore/projects/trello/graphify-out/GRAPH_REPORT.md) **first** before performing broad multi-file searches or code modifications.
- **Community Hubs**: Consult the 140 community clusters in `graphify-out/GRAPH_REPORT.md` to locate exact dependency trees, module entrypoints, database models, and service interfaces.
- **Token Efficiency**: Rely on the Knowledge Graph index rather than repeatedly reading unindexed directories.

## 2. Project Architecture & Stack

- **Backend (`apps/backend`)**: Bun runtime, Elysia.js REST API (`/v1/*`), Drizzle ORM, PostgreSQL, Redis Pub/Sub, Stripe billing SDK, WorkOS SSO.
- **Frontend Dashboard (`apps/dashboard`)**: React 18, Vite, Tailwind CSS v4, Lucide Icons, Zustand, TanStack Query, Radix/Base UI.
- **Platform Super Admin (`apps/super-admin`)**: Standalone Vite SPA on `:5174` for multi-tenant cluster management and platform metrics.
- **Shared Packages (`packages/`)**: `@boardly/shared-types` (DTOs, permissions matrix, role enums), `@boardly/ui` (shared components).

## 3. Documentation Updates Rule

- Keep markdown documents in `docs/` (e.g. `Progress.md`, `Decisions.md`) updated after implementing significant features or architectural changes.

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
