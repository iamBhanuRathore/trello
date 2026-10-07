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
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${BOLD}${BLUE}🩺 Boardly Environment Doctor${NC}\n"

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
echo -n "Checking Docker daemon... "
if docker info >/dev/null 2>&1; then
  echo -e "${GREEN}OK${NC} (Docker running)"
else
  echo -e "${RED}FAILED${NC} (Docker daemon is not running. Please start Docker Desktop or orbstack)"
  ERRORS=$((ERRORS + 1))
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

# 6. Check Docker containers
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
check_port 5432 "PostgreSQL Dev"
check_port 5433 "PostgreSQL Test"
check_port 6379 "Redis"

echo ""
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 System ready! Run ./start.sh or 'bun dev' to launch the stack.${NC}"
else
  echo -e "${RED}${BOLD}❌ Found $ERRORS critical issue(s). Please fix them before starting.${NC}"
fi
