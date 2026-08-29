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

echo -e "${BOLD}${CYAN}"
cat << "EOF"
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

# 2. Check Docker
if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker daemon is not running. Please start Docker Desktop or orbstack.${NC}"
  exit 1
fi

# 3. Ensure .env exists
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo -e "${YELLOW}⚠️  .env not found. Running setup first...${NC}"
  bash "$SCRIPT_DIR/setup.sh"
fi

# Ensure backend .env is synchronized
cp "$ROOT_DIR/.env" "$ROOT_DIR/apps/backend/.env" 2>/dev/null || true

# 4. Start Docker Containers if needed
echo -e "${BLUE}🐳 Ensuring PostgreSQL & Redis containers are running...${NC}"
docker compose up -d postgres postgres_test redis

# 5. Quick readiness check
echo -n "⏳ Waiting for database services... "
for i in {1..30}; do
  if docker exec boardly_postgres pg_isready -U boardly -d boardly_dev >/dev/null 2>&1 && \
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

# 6. Apply database migrations and default seeds
echo -e "${BLUE}🔄 Verifying database schema & seed data...${NC}"
bun run --cwd "$ROOT_DIR/apps/backend" db:migrate >/dev/null 2>&1 || true
bun run --cwd "$ROOT_DIR/apps/backend" db:seed >/dev/null 2>&1 || true
echo -e "${GREEN}✅ Database ready.${NC}"

# 7. Check for conflicting port processes and clean stale Vite caches
rm -rf "$ROOT_DIR/node_modules/.vite" "$ROOT_DIR/apps/dashboard/node_modules/.vite" "$ROOT_DIR/apps/super-admin/node_modules/.vite" 2>/dev/null || true
for PORT in 3001 5173 5174; do
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
echo -e "  ${BOLD}⚡ Backend API:${NC}       ${CYAN}http://localhost:3001${NC}"
echo -e "  ${BOLD}📚 Swagger Docs:${NC}      ${CYAN}http://localhost:3001/docs${NC}"
echo -e "  ${BOLD}🩺 Health Check:${NC}      ${CYAN}http://localhost:3001/health${NC}"
echo -e "  ${BOLD}💾 PostgreSQL:${NC}        ${CYAN}localhost:5432${NC} (db: boardly_dev)"
echo -e "  ${BOLD}⚡ Redis:${NC}             ${CYAN}localhost:6379${NC}"
echo -e "${BOLD}${GREEN}================================================================${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services.${NC}\n"

# 9. Concurrently run Backend, Dashboard & Super Admin with clean termination trap
BACKEND_PID=""
DASHBOARD_PID=""
SUPERADMIN_PID=""

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
  echo -e "${GREEN}✅ Dev servers stopped. (Database containers remain running; use 'bun run stop' or './scripts/stop.sh' to stop them).${NC}"
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

# Wait for all processes
wait $BACKEND_PID $DASHBOARD_PID $SUPERADMIN_PID
