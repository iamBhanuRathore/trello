# Stage 1 — production dependencies
FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/super-admin/package.json ./apps/super-admin/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/ ./packages/
RUN bun install --frozen-lockfile --production --ignore-scripts

# Stage 2 — minimal runtime image
FROM oven/bun:1.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy dependencies and shared packages
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy backend source, migrations, and drizzle config
COPY apps/backend/src            ./apps/backend/src
COPY apps/backend/src/db/migrations ./apps/backend/src/db/migrations
COPY apps/backend/drizzle.config.ts ./apps/backend/drizzle.config.ts
COPY apps/backend/package.json   ./apps/backend/package.json

EXPOSE 3001
USER bun
CMD ["bun", "run", "apps/backend/src/index.ts"]
