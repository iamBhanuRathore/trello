#!/usr/bin/env bash
set -e

# ==============================================================================
# Boardly Setup & Initialization Script
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/infra-mode.sh
. "$SCRIPT_DIR/infra-mode.sh"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║             🚀 BOARDLY PROJECT SETUP                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
if ! command -v bun >/dev/null 2>&1; then
  echo -e "${RED}❌ Bun is required but not installed. Visit https://bun.sh${NC}"
  exit 1
fi

# 2. Resolve infrastructure mode (scripts/infra-mode.sh)
#
# Before the env file is written, so the mode chosen here is the one seeded into
# it. dev.sh/stop.sh/doctor.sh read the same key from the same file.
APP_ENV="${APP_ENV:-development}"
resolve_infra_mode
echo -e "${GREEN}✅ Bun verified.${NC}"

# Docker is a prerequisite only when the databases live in containers. Under
# INFRA_MODE=remote the stack talks to managed services and a missing daemon is
# not a problem to report.
if [ "$INFRA_MODE" = "remote" ]; then
  echo -e "${CYAN}☁️  INFRA_MODE=remote — Docker is not required for setup.${NC}"
elif docker info >/dev/null 2>&1; then
  echo -e "${GREEN}✅ Prerequisites verified (Docker running).${NC}"
else
  echo -e "${RED}❌ Docker daemon is not running. Please start Docker Desktop or orbstack.${NC}"
  echo -e "${YELLOW}   Using cloud databases instead? Set INFRA_MODE=remote and re-run.${NC}"
  exit 1
fi

# 3. Environment Configuration (APP_ENV=production for prod template, default development)
ENV_SRC="$ROOT_DIR/.env.${APP_ENV}.example"
if [ ! -f "$ENV_SRC" ]; then
  ENV_SRC="$ROOT_DIR/.env.example"
fi
ENV_DST="$ROOT_DIR/.env.${APP_ENV}"
if [ ! -f "$ENV_DST" ]; then
  echo "Creating $ENV_DST from $(basename "$ENV_SRC")..."
  cp "$ENV_SRC" "$ENV_DST"
fi

# Record the resolved mode in the env file so every later script agrees with the
# one this run was configured for. resolve_infra_mode reads INFRA_MODE from here
# first, so a fresh setup seeded from the example (which ships INFRA_MODE=local)
# would otherwise have dev.sh start containers against the URLs just configured
# for a cloud stack — the exact "remote but behaves local" failure the flag
# exists to prevent. Only the KEY is rewritten; DATABASE_URL/REDIS_URL are left
# exactly as the operator set them. Writing the resolved value is idempotent:
# when the file already says `remote`, this rewrites `remote`.
if grep -q "^INFRA_MODE=" "$ENV_DST" 2>/dev/null; then
  # `case`, not `[ "$OSTYPE" == "darwin"* ]`: an unquoted glob inside [ ] is not
  # pathname-expanded, so the test compares the literal string "darwin*" and is
  # always false. That bug sent macOS down the GNU branch, where `sed -i` treats
  # the script as the backup suffix and fails.
  case "$OSTYPE" in
    darwin*) sed -i '' "s|^INFRA_MODE=.*|INFRA_MODE=$INFRA_MODE|" "$ENV_DST" ;;
    *) sed -i "s|^INFRA_MODE=.*|INFRA_MODE=$INFRA_MODE|" "$ENV_DST" ;;
  esac
  echo "  INFRA_MODE=$INFRA_MODE recorded in $(basename "$ENV_DST")."
fi

# Back-compat: legacy .env path used by older scripts
if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ENV_DST" "$ROOT_DIR/.env"
fi

# Generate strong secrets if placeholder remains
if grep -q "replace-me" "$ENV_DST" 2>/dev/null; then
  echo "Generating secure random JWT secrets..."
  SECRET1=$(openssl rand -base64 36 2>/dev/null || node -e "console.log(require('crypto').randomBytes(36).toString('base64'))")
  SECRET2=$(openssl rand -base64 36 2>/dev/null || node -e "console.log(require('crypto').randomBytes(36).toString('base64'))")
  
  # Replace in env file
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|JWT_SECRET=replace-me.*|JWT_SECRET=$SECRET1|g" "$ENV_DST"
    sed -i '' "s|REFRESH_TOKEN_SECRET=replace-me.*|REFRESH_TOKEN_SECRET=$SECRET2|g" "$ENV_DST"
  else
    sed -i "s|JWT_SECRET=replace-me.*|JWT_SECRET=$SECRET1|g" "$ENV_DST"
    sed -i "s|REFRESH_TOKEN_SECRET=replace-me.*|REFRESH_TOKEN_SECRET=$SECRET2|g" "$ENV_DST"
  fi
fi

# Sync to backend (+ legacy .env for back-compat)
cp "$ENV_DST" "$ROOT_DIR/apps/backend/.env"
cp "$ENV_DST" "$ROOT_DIR/.env"
echo -e "${GREEN}✅ Environment files ready ($ENV_DST, .env & apps/backend/.env).${NC}"

# 3. Install dependencies
echo -e "\n${BLUE}📦 Installing monorepo dependencies...${NC}"
bun install
echo -e "${GREEN}✅ Dependencies installed.${NC}"

# 4. Start database services
#
# In remote mode there are no containers to start and nothing to exec into, so
# both the compose call and the pg_isready/redis-cli waits are skipped. Instead
# the configured endpoints are probed directly — the same TCP check dev.sh
# performs, for the same reason: it catches a wrong host/port or a firewall,
# while a credential or TLS failure surfaces as the backend's own connect error
# at boot, where the real message is available.
if [ "$INFRA_MODE" = "local" ]; then
  echo -e "\n${BLUE}🐳 Starting PostgreSQL and Redis containers...${NC}"
  docker compose up -d postgres postgres_test redis

  echo -n "Waiting for PostgreSQL to be ready"
  until docker exec boardly_postgres pg_isready -U boardly -d boardly_dev >/dev/null 2>&1; do
    echo -n "."
    sleep 1
  done
  echo -e " ${GREEN}READY${NC}"

  echo -n "Waiting for Redis to be ready"
  until docker exec boardly_redis redis-cli ping >/dev/null 2>&1; do
    echo -n "."
    sleep 1
  done
  echo -e " ${GREEN}READY${NC}"
else
  infra_endpoint_label
  echo -e "\n${CYAN}☁️  INFRA_MODE=remote — skipping containers; probing configured services.${NC}"
  for EP in "$INFRA_DB_EP" "$INFRA_REDIS_EP"; do
    if [ "$EP" = "unknown" ]; then
      echo -e "${RED}✗ Could not read a host from the configured DATABASE_URL/REDIS_URL.${NC}" >&2
      exit 1
    fi
    echo -n "  ${EP} ... "
    if nc -z -w 10 "${EP%%:*}" "${EP##*:}" >/dev/null 2>&1; then
      echo -e "${GREEN}reachable${NC}"
    else
      echo -e "${RED}UNREACHABLE${NC}"
      echo -e "${RED}✗ ${EP} did not accept a TCP connection.${NC}" >&2
      echo "   Credentials and TLS are not checked here — a reachable host that" >&2
      echo "   rejects the connection will fail at backend boot with a real error." >&2
      exit 1
    fi
  done
fi

# 5. Run Migrations & Seed
#
# Remote writes are opt-in via ALLOW_REMOTE_DB=1, mirroring dev.sh and db.sh:
# running setup on a laptop should not apply schema to a shared database other
# developers and CI are pointed at.
if [ "$INFRA_MODE" = "local" ] || [ "${ALLOW_REMOTE_DB:-}" = "1" ]; then
  echo -e "\n${BLUE}🔄 Running database schema migrations...${NC}"
  if [ "$INFRA_MODE" != "local" ]; then
    echo -e "${YELLOW}⚠️  ALLOW_REMOTE_DB=1 — migrations will be applied to ${INFRA_DB_EP}.${NC}"
  fi
  # A failed migrate must not be followed by a seed against a schema of unknown
  # shape. dev.sh calls this out explicitly; setup.sh used to ignore it.
  if ! bun run --cwd "$ROOT_DIR/apps/backend" db:migrate; then
    echo -e "${RED}❌ db:migrate failed — refusing to seed on a database with an unknown schema.${NC}" >&2
    exit 1
  fi

  echo -e "\n${BLUE}🌱 Seeding default plans, permissions, and roles...${NC}"
  bun run --cwd "$ROOT_DIR/apps/backend" db:seed
  echo -e "${GREEN}✅ Database initialized and seeded successfully.${NC}"
else
  echo -e "\n${YELLOW}⏭️  Skipping migrations & seeds — the configured database is remote.${NC}"
  echo -e "   Run them deliberately when you mean to:"
  echo -e "     ${CYAN}ALLOW_REMOTE_DB=1 ./scripts/setup.sh${NC}"
  echo -e "     ${CYAN}ALLOW_REMOTE_DB=1 ./scripts/db.sh migrate${NC}"
fi

# 6. Test database
#
# Always the local container on :5433 — `bun run test` connects to
# DATABASE_TEST_URL there and needs local Docker regardless of INFRA_MODE, so
# under remote the containers are not started and this is skipped with a note
# rather than run against a cloud host.
if [ "$INFRA_MODE" = "local" ]; then
  echo -e "\n${BLUE}🔄 Setting up test database...${NC}"
  DATABASE_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test bun run --cwd "$ROOT_DIR/apps/backend" db:migrate >/dev/null 2>&1 || true
  DATABASE_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test bun run --cwd "$ROOT_DIR/apps/backend" db:seed >/dev/null 2>&1 || true
  echo -e "${GREEN}✅ Test database ready.${NC}"
else
  echo -e "\n${YELLOW}⏭️  Skipping test database setup — it lives in local containers (:5433).${NC}"
  echo -e "   ${CYAN}bun run test${NC} still needs them: ${CYAN}ALLOW_REMOTE_DB=1${NC} does not apply here."
fi

echo -e "\n${GREEN}${BOLD}========================================================"
echo "🎉 Setup complete! You are ready to start development."
echo "   Run: ./start.sh   (or 'bun dev' / 'bun start')"
echo "   Infrastructure: ${CYAN}${INFRA_MODE}${NC}"
if [ "$INFRA_MODE" = "remote" ]; then
  echo -e "   ${YELLOW}bun run test${NC} still needs local Docker (DATABASE_TEST_URL on :5433)."
fi
echo "========================================================${NC}\n"
