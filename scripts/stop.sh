#!/usr/bin/env bash

# ==============================================================================
# Boardly Stop Script
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Stopping Boardly development environment...${NC}\n"

# 1. Kill any stray processes listening on app ports
for PORT in 3001 5173 5174 5175; do
  PID=$(lsof -ti :$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo -e "Stopping process on port $PORT (PID: $PID)..."
    kill -9 $PID 2>/dev/null || true
  fi
done

# 2. Stop Docker containers
#
# INFRA_MODE=remote runs no containers, so there is nothing to stop and `docker
# compose stop` would fail with a daemon error the user cannot act on — a stop
# script that reports failure on a clean shutdown is worse than one that says
# nothing was running. See scripts/infra-mode.sh.
APP_ENV="${APP_ENV:-development}"
# shellcheck source=scripts/infra-mode.sh
. "$SCRIPT_DIR/infra-mode.sh"
resolve_infra_mode

if [ "$INFRA_MODE" = "local" ]; then
  echo -e "\n${BLUE}Stopping Docker services...${NC}"
  docker compose stop postgres postgres_test redis
  echo -e "\n${GREEN}✅ All Boardly services and containers stopped cleanly.${NC}"
else
  echo -e "\n${GREEN}✅ Dev servers stopped cleanly (INFRA_MODE=remote — no local containers to stop).${NC}"
fi
