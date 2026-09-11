// Eden Treaty type entry — backend side.
//
// `App` is already exported from `./index` (`export type App = typeof app`).
// This module is the canonical import for AI agents + frontend type inference.
//
// RULES FOR AI AGENTS:
// - Always use `import type { App } from ...` (type-only, erased at runtime).
// - NEVER runtime-import `./index` in frontend code: it has side effects
//   (db.connect, redis.connect, app.listen, graceful-shutdown handlers).
// - Frontend canonical import: `import type { App } from '@boardly/backend'`
//   (see `apps/dashboard/tsconfig.app.json` paths mapping).
// - Keep `elysia` + `@elysiajs/eden` versions in sync between
//   `apps/backend/package.json` and `apps/dashboard/package.json`.
export type { App } from './index';
