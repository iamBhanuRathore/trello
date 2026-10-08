#!/usr/bin/env bash

# ==============================================================================
# Boardly Environment Doctor & Diagnostics
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
CYAN='\033[0;36m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

APP_ENV="${APP_ENV:-development}"
# shellcheck source=scripts/infra-mode.sh
. "$SCRIPT_DIR/infra-mode.sh"
resolve_infra_mode
infra_endpoint_label

echo -e "${BOLD}${BLUE}🩺 Boardly Environment Doctor${NC}\n"
echo -e "${BOLD}Infrastructure mode:${NC} ${CYAN}${INFRA_MODE}${NC}\n"

# 1. Check Bun
echo -n "Checking Bun runtime... "
if command -v bun >/dev/null 2>&1; then
  BUN_VER=$(bun --version)
  echo -e "${GREEN}OK${NC} (v$BUN_VER)"
else
  echo -e "${RED}FAILED${NC} (Bun is required: https://bun.sh)"
  ERRORS=$((ERRORS + 1))
fi

# 2. Check Node
echo -n "Checking Node.js... "
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node --version)
  echo -e "${GREEN}OK${NC} ($NODE_VER)"
else
  echo -e "${YELLOW}WARNING${NC} (Node.js not found in PATH, though Bun is primary)"
  WARNINGS=$((WARNINGS + 1))
fi

# 3. Check Docker
#
# Only a hard requirement in local mode. Under INFRA_MODE=remote the databases are
# cloud endpoints and Docker is not on the path at all — reporting it FAILED there
# would send you to start Docker to fix a stack that does not use it.
if [ "$INFRA_MODE" = "remote" ]; then
  echo -e "Checking Docker daemon... ${GREEN}NOT REQUIRED${NC} (INFRA_MODE=remote)"
else
  echo -n "Checking Docker daemon... "
  if docker info >/dev/null 2>&1; then
    echo -e "${GREEN}OK${NC} (Docker running)"
  else
    echo -e "${RED}FAILED${NC} (Docker daemon is not running. Please start Docker Desktop or orbstack)"
    ERRORS=$((ERRORS + 1))
  fi
fi

# 4. Check .env file
echo -n "Checking root .env file... "
if [ -f "$ROOT_DIR/.env" ]; then
  if grep -q "replace-me" "$ROOT_DIR/.env"; then
    echo -e "${YELLOW}WARNING${NC} (.env has placeholder JWT secrets)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "${GREEN}OK${NC}"
  fi
else
  echo -e "${RED}MISSING${NC} (Run ./scripts/setup.sh to generate)"
  ERRORS=$((ERRORS + 1))
fi

# 5. Check apps/backend/.env file
echo -n "Checking apps/backend/.env file... "
if [ -f "$ROOT_DIR/apps/backend/.env" ]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${YELLOW}MISSING${NC} (Will be auto-copied from root .env)"
fi

# 6. Check where Postgres and Redis actually are
#
# In remote mode there are no containers to inspect, so the useful diagnostic is
# the resolved endpoint rather than a container name that will never exist. Same
# in local mode: the endpoint is printed so a URL pointing somewhere other than
# the compose file is visible instead of silently assumed.
if [ "$INFRA_MODE" = "local" ]; then
  echo -n "Checking PostgreSQL container (boardly_postgres)... "
  if docker ps --format '{{.Names}}' | grep -q "^boardly_postgres$"; then
    echo -e "${GREEN}RUNNING${NC}"
  else
    echo -e "${YELLOW}NOT RUNNING${NC} (Will start on ./start.sh)"
  fi

  echo -n "Checking Redis container (boardly_redis)... "
  if docker ps --format '{{.Names}}' | grep -q "^boardly_redis$"; then
    echo -e "${GREEN}RUNNING${NC}"
  else
    echo -e "${YELLOW}NOT RUNNING${NC} (Will start on ./start.sh)"
  fi
fi

# TCP reachability only. A cloud endpoint can be reachable and still reject the
# credential or fail TLS negotiation; that surfaces as the backend's own connect
# error at boot, which is a better place for it than a false green here.
probe_endpoint() {
  local hostport="$1" host port
  if [ "$hostport" = "unknown" ]; then
    echo -e "${RED}UNPARSEABLE${NC} (no host in the configured URL)"
    return 1
  fi
  host="${hostport%%:*}"
  port="${hostport##*:}"
  if nc -z -w 5 "$host" "$port" >/dev/null 2>&1; then
    echo -e "${GREEN}REACHABLE${NC}"
  else
    echo -e "${RED}UNREACHABLE${NC}"
    return 1
  fi
}

echo -n "Checking PostgreSQL endpoint (${INFRA_DB_EP})... "
probe_endpoint "$INFRA_DB_EP" || ERRORS=$((ERRORS + 1))

echo -n "Checking Redis endpoint (${INFRA_REDIS_EP})... "
probe_endpoint "$INFRA_REDIS_EP" || ERRORS=$((ERRORS + 1))

if [ "$INFRA_MODE" = "remote" ]; then
  echo -e "  ${YELLOW}note${NC} reachability is TCP-only; a bad credential or TLS setup surfaces as a backend connect error at boot."
fi

# 7. Check Ports
check_port() {
  local port=$1
  local service=$2
  echo -n "Checking port $port ($service)... "
  if lsof -i ":$port" >/dev/null 2>&1; then
    local proc=$(lsof -i ":$port" -sTCP:LISTEN -t | head -n 1)
    local proc_name=$(ps -p "$proc" -o comm= 2>/dev/null || echo "process")
    echo -e "${BLUE}IN USE${NC} by $proc_name (PID: $proc)"
  else
    echo -e "${GREEN}AVAILABLE${NC}"
  fi
}

echo ""
echo -e "${BOLD}Port Availability:${NC}"
check_port 3001 "Backend API"
check_port 5173 "Dashboard Web"
check_port 5174 "Super Admin Portal"
check_port 5175 "Marketing Website"
# 5432/6379 are only bound by the local compose stack. Under INFRA_MODE=remote
# nothing listens on them, so reporting them "AVAILABLE" would imply a local
# database is on hand. 5433 is checked in both modes: the backend suite connects
# to DATABASE_TEST_URL on :5433 and needs local Docker even in remote mode.
if [ "$INFRA_MODE" = "local" ]; then
  check_port 5432 "PostgreSQL Dev"
fi
check_port 5433 "PostgreSQL Test"
if [ "$INFRA_MODE" = "local" ]; then
  check_port 6379 "Redis"
fi

echo ""
# Printed unconditionally, not only on a clean run: `bun run test` needs local
# Docker under INFRA_MODE=remote regardless of whether anything else is wrong, and
# a diagnostic that only appears when everything is fine is the diagnostic you do
# not get to see when you need it.
if [ "$INFRA_MODE" = "remote" ]; then
  echo -e "${YELLOW}⚠️  'bun run test' still needs local Docker: the backend suite uses DATABASE_TEST_URL on :5433.${NC}"
fi

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 System ready! Run 'bun run dev' to launch the stack.${NC}"
else
  echo -e "${RED}${BOLD}❌ Found $ERRORS critical issue(s). Please fix them before starting.${NC}"
fi
