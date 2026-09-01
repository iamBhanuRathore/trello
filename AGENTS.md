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
