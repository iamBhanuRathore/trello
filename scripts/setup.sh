#!/usr/bin/env bash
set -e

# ==============================================================================
# Boardly Setup & Initialization Script
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

if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker daemon is not running. Please start Docker Desktop or orbstack.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Prerequisites verified.${NC}"

# 2. Environment Configuration
echo -e "\n${BLUE}⚙️  Configuring environment variables...${NC}"
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "Creating .env from .env.example..."
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

# Generate strong secrets if placeholder remains
if grep -q "replace-me" "$ROOT_DIR/.env" 2>/dev/null; then
  echo "Generating secure random JWT secrets..."
  SECRET1=$(openssl rand -base64 36 2>/dev/null || node -e "console.log(require('crypto').randomBytes(36).toString('base64'))")
  SECRET2=$(openssl rand -base64 36 2>/dev/null || node -e "console.log(require('crypto').randomBytes(36).toString('base64'))")
  
  # Replace in .env
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|JWT_SECRET=replace-me.*|JWT_SECRET=$SECRET1|g" "$ROOT_DIR/.env"
    sed -i '' "s|REFRESH_TOKEN_SECRET=replace-me.*|REFRESH_TOKEN_SECRET=$SECRET2|g" "$ROOT_DIR/.env"
  else
    sed -i "s|JWT_SECRET=replace-me.*|JWT_SECRET=$SECRET1|g" "$ROOT_DIR/.env"
    sed -i "s|REFRESH_TOKEN_SECRET=replace-me.*|REFRESH_TOKEN_SECRET=$SECRET2|g" "$ROOT_DIR/.env"
  fi
fi

# Sync to backend
cp "$ROOT_DIR/.env" "$ROOT_DIR/apps/backend/.env"
echo -e "${GREEN}✅ Environment files ready (.env & apps/backend/.env).${NC}"

# 3. Install dependencies
echo -e "\n${BLUE}📦 Installing monorepo dependencies...${NC}"
bun install
echo -e "${GREEN}✅ Dependencies installed.${NC}"

# 4. Start Docker services
echo -e "\n${BLUE}🐳 Starting PostgreSQL and Redis containers...${NC}"
docker compose up -d postgres postgres_test redis

# 5. Wait for database readiness
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

# 6. Run Migrations & Seed
echo -e "\n${BLUE}🔄 Running database schema migrations...${NC}"
bun run --cwd "$ROOT_DIR/apps/backend" db:migrate

echo -e "\n${BLUE}🌱 Seeding default plans, permissions, and roles...${NC}"
bun run --cwd "$ROOT_DIR/apps/backend" db:seed

# Also migrate test database for quick test execution
echo -e "\n${BLUE}🔄 Setting up test database...${NC}"
DATABASE_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test bun run --cwd "$ROOT_DIR/apps/backend" db:migrate >/dev/null 2>&1 || true
DATABASE_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test bun run --cwd "$ROOT_DIR/apps/backend" db:seed >/dev/null 2>&1 || true
echo -e "${GREEN}✅ Database initialized and seeded successfully.${NC}"

echo -e "\n${GREEN}${BOLD}========================================================"
echo "🎉 Setup complete! You are ready to start development."
echo "   Run: ./start.sh   (or 'bun dev' / 'bun start')"
echo "========================================================${NC}\n"
