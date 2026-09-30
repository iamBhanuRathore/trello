# SCAFFOLD.md — Phase 0 Bootstrap Guide

> **Historical — Phase 0 is complete.** This file bootstrapped the empty monorepo and is kept for provenance only. Do NOT follow it top-to-bottom on the current tree: exact commands, paths (`packages/config` layout, `.env` keys, CI jobs), and job names below describe the Day-0 scaffold, not the repo as it exists. For current setup see `README.md` + `.env.example`; for what's built see `docs/Progress.md`.

Exact, copy-paste commands to go from empty directory to a working monorepo shell.
An AI agent starting Phase 0 should follow this file in order, top to bottom.
Mark each step ✅ in `PROGRESS.md` as you complete it — do not skip steps or reorder them.

> **Prerequisite:** Bun ≥ 1.1 installed globally (`curl -fsSL https://bun.sh/install | bash`).
> Node.js ≥ 20 also required for some tooling (Turborepo, Playwright). Confirm with `bun --version` and `node --version` before starting.

---

## Step 1 — Initialize the Turborepo monorepo

```bash
# From the project root (/Users/bhanurathore/projects/trello)
bun create turbo@latest . --package-manager bun
```

When prompted:

- Package manager: **bun**
- Starter: choose **empty** (blank starter — we'll scaffold manually)

Then clean out any example apps Turbo generated:

```bash
rm -rf apps/docs apps/web
```

---

## Step 2 — Root package.json and turbo.json

Ensure `package.json` at the root has:

```json
{
  "name": "boardly",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\""
  },
  "devDependencies": {
    "turbo": "latest",
    "prettier": "^3.0.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  }
}
```

Ensure `turbo.json` at the root has:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

---

## Step 3 — Scaffold packages (shared infrastructure)

### 3a. `packages/config` — shared ESLint, TSConfig, Tailwind preset

```bash
mkdir -p packages/config
```

Create `packages/config/package.json`:

```json
{
  "name": "@boardly/config",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./eslint": "./eslint.js",
    "./tsconfig": "./tsconfig.base.json",
    "./tailwind": "./tailwind-preset.ts"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-import": "^2.29.0",
    "typescript": "^5.4.0"
  }
}
```

Create `packages/config/tsconfig.base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### 3b. `packages/shared-types` — Zod schemas, enums, permission keys

```bash
mkdir -p packages/shared-types/src
```

Create `packages/shared-types/package.json`:

```json
{
  "name": "@boardly/shared-types",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./permissions": "./src/permissions.ts",
    "./schemas": "./src/schemas/index.ts"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

### 3c. `packages/ui` — Shared UI components (web)

```bash
mkdir -p packages/ui/src/components
```

Create `packages/ui/package.json`:

```json
{
  "name": "@boardly/ui",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils.ts",
    "./button": "./src/components/button.tsx",
    "./card": "./src/components/card.tsx",
    "./dialog": "./src/components/dialog.tsx",
    "./input": "./src/components/input.tsx",
    "./label": "./src/components/label.tsx",
    "./avatar": "./src/components/avatar.tsx",
    "./dropdown-menu": "./src/components/dropdown-menu.tsx",
    "./switch": "./src/components/switch.tsx"
  },
  "peerDependencies": {
    "@base-ui/react": ">=1.0.0",
    "class-variance-authority": ">=0.7.0",
    "clsx": ">=2.0.0",
    "lucide-react": ">=0.400.0",
    "react": ">=19.0.0",
    "react-dom": ">=19.0.0",
    "tailwind-merge": ">=3.0.0"
  }
}
```

Components live in `packages/ui/src/components/`: `button.tsx`, `card.tsx`, `dialog.tsx`,
`input.tsx`, `label.tsx`, `avatar.tsx`, `dropdown-menu.tsx`, `switch.tsx`.

The shared `cn()` utility lives in `packages/ui/src/utils.ts`.

In consuming apps, add `"@boardly/ui": "workspace:*"` to dependencies and import like:

```ts
import { Button } from '@boardly/ui/button';
import { cn } from '@boardly/ui/utils';
```

### 3d. `packages/test-fixtures` — shared factory/seeder functions

```bash
mkdir -p packages/test-fixtures/src
```

Create `packages/test-fixtures/package.json`:

```json
{
  "name": "@boardly/test-fixtures",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "dependencies": {
    "@boardly/shared-types": "workspace:*"
  }
}
```

---

## Step 4 — Scaffold `apps/backend` (Bun + Elysia)

```bash
mkdir -p apps/backend/src/modules
cd apps/backend
bun init -y
bun add elysia @elysiajs/bearer @elysiajs/cors @elysiajs/swagger
bun add drizzle-orm postgres
bun add -d drizzle-kit @types/bun
```

Create `apps/backend/src/index.ts`:

```typescript
import { Elysia } from 'elysia';

const app = new Elysia()
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  .listen(3001);

console.log(`🚀 Boardly API running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
```

---

## Step 5 — Scaffold `apps/dashboard` (Vite + React + TS)

```bash
cd apps
bun create vite dashboard --template react-ts
cd dashboard
bun add @tanstack/react-query zustand react-router-dom
bun add -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react
bun add -D @playwright/test
bun add tailwindcss @tailwindcss/vite
```

After Tailwind is configured, install shadcn:

```bash
bunx shadcn@latest init
```

---

## Step 6 — Docker Compose for local services

Create `docker-compose.yml` at the project root:

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: boardly
      POSTGRES_PASSWORD: boardly_dev
      POSTGRES_DB: boardly_dev
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  postgres_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: boardly
      POSTGRES_PASSWORD: boardly_test
      POSTGRES_DB: boardly_test
    ports:
      - '5433:5432'

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  postgres_data:
```

Start services:

```bash
docker compose up -d
```

---

## Step 7 — Environment files

Create `.env.example` at the project root (committed to git):

```env
# Backend
DATABASE_URL=postgresql://boardly:boardly_dev@localhost:5432/boardly_dev
DATABASE_TEST_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-string
REFRESH_TOKEN_SECRET=replace-with-another-long-random-string

# WorkOS (SSO/SCIM)
WORKOS_API_KEY=
WORKOS_CLIENT_ID=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Storage (S3-compatible)
STORAGE_BUCKET=
STORAGE_REGION=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_ENDPOINT=

# App URLs
API_URL=http://localhost:3001
DASHBOARD_URL=http://localhost:5173,http://localhost:5174
```

Copy to `.env` (gitignored) and fill real values:

```bash
cp .env.example .env
```

Add to `.gitignore`:

```
.env
.env.local
node_modules
dist
.turbo
```

---

## Step 8 — CI (GitHub Actions)

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: boardly
          POSTGRES_PASSWORD: boardly_test
          POSTGRES_DB: boardly_test
        ports: ['5433:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: Install dependencies
        run: bun install
      - name: Lint
        run: bun run lint
      - name: Typecheck
        run: bun run typecheck
      - name: Unit tests
        run: bun run test
        env:
          DATABASE_TEST_URL: postgresql://boardly:boardly_test@localhost:5433/boardly_test
```

---

## Step 9 — Git hooks (Husky + lint-staged)

```bash
bun add -D husky lint-staged
bunx husky init
```

Add to `.husky/pre-commit`:

```bash
bunx lint-staged
```

Add to root `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{md,json}": ["prettier --write"]
  }
}
```

---

## Step 10 — Verify everything boots

```bash
docker compose up -d
bun install
# In separate terminals:
cd apps/backend && bun run dev   # → :3001/health
cd apps/dashboard && bun run dev # → :5173
bun run test
```

---

## Phase 0 Definition of Done

- [ ] `bun install` runs cleanly with no errors
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes (empty suite is fine)
- [ ] `GET /health` returns `{ status: "ok" }` from the backend
- [ ] Dashboard Vite dev server starts and renders a blank React shell
- [ ] Docker Compose starts PostgreSQL (dev + test) and Redis cleanly
- [ ] `.env.example` committed; `.env` gitignored
- [ ] GitHub Actions CI workflow committed
- [ ] `PROGRESS.md` updated to reflect Phase 0 complete
