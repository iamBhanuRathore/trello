#!/usr/bin/env bash
set -e

# ==============================================================================
# Boardly One-Command Dev Launcher
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# shellcheck source=scripts/infra-mode.sh
. "$SCRIPT_DIR/infra-mode.sh"

echo -e "${BOLD}${CYAN}"
cat <<"EOF"
  ____                        _ _       
 | __ )  ___   __ _ _ __   __| | |_   _ 
 |  _ \ / _ \ / _` | '__| / _` | | | | |
 | |_) | (_) | (_| | |   | (_| | | |_| |
 |____/ \___/ \__,_|_|    \__,_|_|\__, |
                                  |___/ 
EOF
echo -e "${NC}"
echo -e "${BOLD}Starting Boardly Full Stack Development Environment...${NC}\n"

# 1. Check Bun
if ! command -v bun >/dev/null 2>&1; then
  echo -e "${RED}❌ Bun is required but not installed. Visit https://bun.sh${NC}"
  exit 1
fi

# 2. Resolve infrastructure mode (see scripts/infra-mode.sh for why it is explicit)
APP_ENV="${APP_ENV:-development}"
resolve_infra_mode

# 3. Check Docker — only a prerequisite when the databases live in containers
if [ "$INFRA_MODE" = "local" ]; then
  if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker daemon is not running. Please start Docker Desktop or orbstack.${NC}"
    exit 1
  fi
else
  echo -e "${BLUE}☁️  INFRA_MODE=remote — Docker not required; using the configured DATABASE_URL/REDIS_URL.${NC}"
fi

# 4. Ensure env exists (APP_ENV=production to dry-run prod config, default development)
if [ ! -f "$ROOT_DIR/.env.${APP_ENV}" ]; then
  echo -e "${YELLOW}⚠️  .env.${APP_ENV} not found. Running setup first...${NC}"
  APP_ENV="$APP_ENV" bash "$SCRIPT_DIR/setup.sh"
fi

# Ensure backend .env is synchronized (Bun loads apps/backend/.env, not .env.development)
cp "$ROOT_DIR/.env.${APP_ENV}" "$ROOT_DIR/apps/backend/.env" 2>/dev/null || true

infra_endpoint_label

# 5. Start containers / confirm the remote endpoints are reachable
if [ "$INFRA_MODE" = "local" ]; then
  echo -e "${BLUE}🐳 Ensuring PostgreSQL & Redis containers are running...${NC}"
  docker compose up -d postgres postgres_test redis

  echo -n "⏳ Waiting for database services... "
  for i in {1..30}; do
    if docker exec boardly_postgres pg_isready -U boardly -d boardly_dev >/dev/null 2>&1 &&
      docker exec boardly_redis redis-cli ping >/dev/null 2>&1; then
      echo -e "${GREEN}READY!${NC}"
      break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
      echo -e "${RED}TIMEOUT waiting for database.${NC}"
      exit 1
    fi
  done
else
  # No container to exec into, so the readiness question is answered against the
  # configured endpoints directly. This is a TCP reachability probe, not an
  # authenticated handshake: it catches a wrong host/port or a firewall, but an
  # auth or TLS failure surfaces as the backend's own connect error at boot.
  echo -e "${BLUE}☁️  Checking configured services are reachable...${NC}"
  for EP in "$INFRA_DB_EP" "$INFRA_REDIS_EP"; do
    if [ "$EP" = "unknown" ]; then
      echo -e "${RED}✗ Could not read a host from the configured DATABASE_URL/REDIS_URL.${NC}" >&2
      exit 1
    fi
    HOST="${EP%%:*}"
    PORT_NUM="${EP##*:}"
    echo -n "  ${EP} ... "
    if nc -z -w 10 "$HOST" "$PORT_NUM" >/dev/null 2>&1; then
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

# 6. Apply database migrations and default seeds
#
# In remote mode this is opt-in only, for the same reason db.sh refuses a remote
# write without ALLOW_REMOTE_DB=1 (Decisions.md 2026-10-04): `bun run dev` on a
# laptop should not be writing schema to a shared database that other developers
# and CI are pointed at. It previously ran unconditionally with `|| true`, which
# both wrote to the shared DB on every boot and swallowed the failure (Progress.md
# 2026-09-28 records a dev Neon DB whose journal claimed 42 migrations while the
# schema had zero tables, hidden by exactly that swallow).
if [ "$INFRA_MODE" = "local" ] || [ "${ALLOW_REMOTE_DB:-}" = "1" ]; then
  echo -e "${BLUE}🔄 Verifying database schema & seed data...${NC}"
  if [ "$INFRA_MODE" != "local" ]; then
    echo -e "${YELLOW}⚠️  ALLOW_REMOTE_DB=1 — migrations will be applied to ${INFRA_DB_EP}.${NC}"
  fi
  if bun run --cwd "$ROOT_DIR/apps/backend" db:migrate; then
    bun run --cwd "$ROOT_DIR/apps/backend" db:seed
    echo -e "${GREEN}✅ Database ready.${NC}"
  else
    echo -e "${RED}❌ db:migrate failed — refusing to seed on a database with an unknown schema.${NC}" >&2
    echo "   (the previous '|| true' hid this; the Neon dev DB hit exactly that state)" >&2
    exit 1
  fi
else
  echo -e "${YELLOW}⏭️  Skipping migrations & seeds — DATABASE_URL (${INFRA_DB_EP}) is remote.${NC}"
  echo -e "   Run them deliberately when you mean to:"
  echo -e "     ${CYAN}ALLOW_REMOTE_DB=1 bun run db:migrate${NC}"
  echo -e "     ${CYAN}ALLOW_REMOTE_DB=1 bun run db:seed${NC}"
fi

# 7. Check for conflicting port processes and clean stale Vite caches
rm -rf "$ROOT_DIR/node_modules/.vite" "$ROOT_DIR/apps/dashboard/node_modules/.vite" "$ROOT_DIR/apps/super-admin/node_modules/.vite" "$ROOT_DIR/apps/website/.next" 2>/dev/null || true
for PORT in 3001 5173 5174 5175; do
  PID=$(lsof -ti :$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo -e "${YELLOW}⚠️  Port $PORT in use by PID $PID. Terminating old process...${NC}"
    kill -9 $PID 2>/dev/null || true
  fi
done

# 8. Print banner & service URLs
echo -e "\n${BOLD}${GREEN}================================================================${NC}"
echo -e "${BOLD}${GREEN}               ✨ ALL SERVICES READY ✨                         ${NC}"
echo -e "${BOLD}${GREEN}================================================================${NC}"
echo -e "  ${BOLD}🌐 User Dashboard:${NC}   ${CYAN}http://localhost:5173${NC}"
echo -e "  ${BOLD}👑 Super Admin Portal:${NC} ${MAGENTA}http://localhost:5174${NC}"
echo -e "  ${BOLD}📣 Marketing Website:${NC} ${CYAN}http://localhost:5175${NC}"
echo -e "  ${BOLD}⚡ Backend API:${NC}       ${CYAN}http://localhost:3001${NC}"
echo -e "  ${BOLD}📚 Swagger Docs:${NC}      ${CYAN}http://localhost:3001/docs${NC}"
echo -e "  ${BOLD}🩺 Health Check:${NC}      ${CYAN}http://localhost:3001/health${NC}"
echo -e "  ${BOLD}💾 PostgreSQL:${NC}        ${CYAN}${INFRA_DB_EP}${NC} (${INFRA_MODE})"
echo -e "  ${BOLD}⚡ Redis:${NC}             ${CYAN}${INFRA_REDIS_EP}${NC} (${INFRA_MODE})"
if [ "$INFRA_MODE" = "remote" ]; then
  echo -e "  ${BOLD}🧪 Tests:${NC}             ${YELLOW}bun run test${NC} still needs local Docker (DATABASE_TEST_URL on :5433)"
fi
echo -e "${BOLD}${GREEN}================================================================${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services.${NC}\n"

# 9. Concurrently run Backend, Dashboard, Super Admin & Website with clean termination trap
BACKEND_PID=""
DASHBOARD_PID=""
SUPERADMIN_PID=""
WEBSITE_PID=""

cleanup() {
  echo -e "\n\n${YELLOW}🛑 Shutting down development servers...${NC}"
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$DASHBOARD_PID" ]; then
    kill "$DASHBOARD_PID" 2>/dev/null || true
  fi
  if [ -n "$SUPERADMIN_PID" ]; then
    kill "$SUPERADMIN_PID" 2>/dev/null || true
  fi
  if [ -n "$WEBSITE_PID" ]; then
    kill "$WEBSITE_PID" 2>/dev/null || true
  fi
  if [ "$INFRA_MODE" = "local" ]; then
    echo -e "${GREEN}✅ Dev servers stopped. (Database containers remain running; use 'bun run stop' or './scripts/stop.sh' to stop them).${NC}"
  else
    echo -e "${GREEN}✅ Dev servers stopped. Nothing else to stop — INFRA_MODE=remote uses no local containers.${NC}"
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Start Backend API
bun run --cwd "$ROOT_DIR/apps/backend" dev &
BACKEND_PID=$!

# Start Dashboard Web
bun run --cwd "$ROOT_DIR/apps/dashboard" dev &
DASHBOARD_PID=$!

# Start Super Admin Portal Web
bun run --cwd "$ROOT_DIR/apps/super-admin" dev &
SUPERADMIN_PID=$!

# Start Marketing Website
bun run --cwd "$ROOT_DIR/apps/website" dev &
WEBSITE_PID=$!

# Wait for all processes
wait $BACKEND_PID $DASHBOARD_PID $SUPERADMIN_PID $WEBSITE_PID
