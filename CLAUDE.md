# AI Assistant Instructions

- **Knowledge Graph**: Before searching the codebase or reading random files, always consult `graphify-out/GRAPH_REPORT.md` first (node/edge counts in its header; regenerate when stale — the tree moves faster than the index).
- **Stack**: Bun + Elysia (backend :3001), React + Vite + Tailwind (dashboard :5173), Super Admin (:5174), PostgreSQL (Drizzle ORM), Redis, Stripe.
- **Output Style**: Be concise and terse. Omit pleasantries and fluff. Focus on actionable diffs and compact bullet points to minimize output tokens.
