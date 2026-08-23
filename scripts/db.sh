#!/usr/bin/env bash
set -e

# ==============================================================================
# Boardly Database CLI Helper
# Usage:
#   ./scripts/db.sh up       - Start Postgres & Redis containers
#   ./scripts/db.sh down     - Stop Postgres & Redis containers
#   ./scripts/db.sh migrate  - Run Drizzle migrations
#   ./scripts/db.sh seed     - Seed initial plans, permissions, and roles
#   ./scripts/db.sh reset    - Drop schema, re-run migrations, and seed
#   ./scripts/db.sh studio   - Open Drizzle Studio UI
#   ./scripts/db.sh logs     - View database logs
#   ./scripts/db.sh status   - Check status of database containers
# ==============================================================================

# Determine root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Ensure .env is loaded
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

ACTION="${1:-status}"

case "$ACTION" in
  up|start)
    echo -e "${BLUE}📦 Starting PostgreSQL & Redis via Docker...${NC}"
    docker compose up -d postgres postgres_test redis
    echo -e "${GREEN}✅ Database services started.${NC}"
    ;;

  down|stop)
    echo -e "${YELLOW}🛑 Stopping PostgreSQL & Redis...${NC}"
    docker compose stop postgres postgres_test redis
    echo -e "${GREEN}✅ Database services stopped.${NC}"
    ;;

  status|ps)
    echo -e "${BLUE}🔍 Container Status:${NC}"
    docker compose ps postgres postgres_test redis
    ;;

  logs)
    docker compose logs -f postgres redis
    ;;

  migrate)
    echo -e "${BLUE}🔄 Running database migrations...${NC}"
    bun run --cwd "$ROOT_DIR/apps/backend" db:migrate
    echo -e "${GREEN}✅ Migrations completed.${NC}"
    ;;

  migrate:test)
    echo -e "${BLUE}🔄 Running migrations on TEST database...${NC}"
    DATABASE_URL="${DATABASE_TEST_URL:-postgresql://boardly:boardly_test@localhost:5433/boardly_test}" bun run --cwd "$ROOT_DIR/apps/backend" db:migrate
    echo -e "${GREEN}✅ Test DB migrations completed.${NC}"
    ;;

  seed)
    echo -e "${BLUE}🌱 Seeding database...${NC}"
    bun run --cwd "$ROOT_DIR/apps/backend" db:seed
    echo -e "${GREEN}✅ Database seeded.${NC}"
    ;;

  seed:test)
    echo -e "${BLUE}🌱 Seeding TEST database...${NC}"
    DATABASE_URL="${DATABASE_TEST_URL:-postgresql://boardly:boardly_test@localhost:5433/boardly_test}" bun run --cwd "$ROOT_DIR/apps/backend" db:seed
    echo -e "${GREEN}✅ Test DB seeded.${NC}"
    ;;

  reset)
    echo -e "${YELLOW}⚠️  Resetting database (drop schema, migrate, seed)...${NC}"
    bun run --cwd "$ROOT_DIR/apps/backend" db:reset
    echo -e "${GREEN}✅ Database reset complete.${NC}"
    ;;

  studio)
    echo -e "${BLUE}🚀 Launching Drizzle Studio...${NC}"
    bun run --cwd "$ROOT_DIR/apps/backend" db:studio
    ;;

  *)
    echo -e "${BOLD}Boardly Database Management${NC}"
    echo ""
    echo -e "Usage: ${GREEN}./scripts/db.sh [command]${NC}"
    echo ""
    echo "Commands:"
    echo -e "  ${GREEN}up, start${NC}        Start Postgres & Redis docker containers"
    echo -e "  ${GREEN}down, stop${NC}      Stop Postgres & Redis docker containers"
    echo -e "  ${GREEN}status, ps${NC}      Show status of DB containers"
    echo -e "  ${GREEN}migrate${NC}         Run migrations on dev database"
    echo -e "  ${GREEN}migrate:test${NC}    Run migrations on test database"
    echo -e "  ${GREEN}seed${NC}            Seed default plans and roles"
    echo -e "  ${GREEN}seed:test${NC}       Seed test database"
    echo -e "  ${GREEN}reset${NC}           Wipe, re-migrate, and re-seed database"
    echo -e "  ${GREEN}studio${NC}          Open Drizzle Studio UI"
    echo -e "  ${GREEN}logs${NC}            Follow Postgres & Redis container logs"
    echo ""
    exit 1
    ;;
esac
