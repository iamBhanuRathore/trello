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
echo -e "\n${BLUE}Stopping Docker services...${NC}"
docker compose stop postgres postgres_test redis

echo -e "\n${GREEN}✅ All Boardly services and containers stopped cleanly.${NC}"
