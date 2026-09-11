import { treaty } from '@elysiajs/eden';
import type { App } from '@boardly/backend';

// Eden Treaty type-safe client — dashboard side.
//
// Fully typed via the backend `App` (`apps/backend/src/eden.ts`). Requirements
// that keep this compiling (do not regress):
// - `packages/shared-types` uses erasable `const` objects + unions, never `enum`
//   (this app sets `erasableSyntaxOnly`; `enum` = TS1294).
// - `elysia` resolves to ONE copy via tsconfig `paths` (backend copy); bun's
//   per-graph duplicates otherwise fail treaty's constraint (TS2344).
// - Backend files obey `verbatimModuleSyntax` (`import type`) and
//   `noUnusedLocals` — this program type-checks backend sources.
// - Always `import type { App }` (never runtime-import backend: `index.ts`
//   connects db/redis and calls `app.listen()` on import).
//
// Base is the server ROOT (no `/v1` suffix): `eden.health.get()`,
// `eden.v1.boards.get()`, … `VITE_API_URL` is versioned for axios (`.../v1`);
// the suffix is stripped here. axios (`./api.ts`) stays for existing calls +
// token-refresh interceptors; prefer Eden for new calls and unwrap every call
// with the shared `edenCall` helper from `./api` (never hand-roll checks).
// Eden returns `{ data, error }` (no throw by default) — narrow `error` first.

function resolveEdenBase(): string {
  const versioned =
    (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001/v1';
  return versioned.replace(/\/v1\/?$/, '') || 'http://localhost:3001';
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('boardly_access_token');
  return token ? { authorization: `Bearer ${token}` } : {};
}

export const eden = treaty<App>(resolveEdenBase(), {
  fetch: {
    credentials: 'include',
  },
  headers: (_path: string) => authHeaders(),
});

// Convenience shorthand: `edenV1.boards.get()` === `eden.v1.boards.get()`.
export const edenV1 = eden.v1;

export type EdenClient = typeof eden;
