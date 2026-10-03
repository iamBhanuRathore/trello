#!/usr/bin/env bash
set -e

# ==============================================================================
# Boardly Database CLI Helper
# Usage:
#   ./scripts/db.sh up       - Start Postgres & Redis containers
#   ./scripts/db.sh down     - Stop Postgres & Redis containers
#   ./scripts/db.sh migrate  - Run Drizzle migrations on $DATABASE_URL
#   ./scripts/db.sh seed     - Seed initial plans, permissions, and roles
#   ./scripts/db.sh reset    - Drop schema, re-run migrations, and seed
#   ./scripts/db.sh studio   - Open Drizzle Studio UI
#   ./scripts/db.sh logs     - View database logs
#   ./scripts/db.sh status   - Check status of database containers
#
# Every writing command names its target before it runs and refuses a remote
# host unless ALLOW_REMOTE_DB=1 — see require_writable_target below.
# ==============================================================================

# Determine root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Load .env, but let the real environment win.
#
# The previous `set -a; source .env; set +a` overwrote every variable the caller
# had already exported, so `DATABASE_URL=... ./scripts/db.sh migrate` and the
# ALLOW_REMOTE_DB escape hatch below were both inert — .env always had the last
# word. Each line is applied only when its key is not already set.
load_dotenv() {
  local file="$1"
  [ -f "$file" ] || return 0
  local existing line key
  existing="$(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p')"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*) continue ;;
      [A-Za-z_]*=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    key="${key#export }"
    key="${key//[[:space:]]/}"
    case "$key" in
      [A-Za-z_]*) ;;
      *) continue ;;
    esac
    if ! printf '%s\n' "$existing" | grep -qx "$key"; then
      # Same trust model as `source`: the file is already trusted, and it was
      # being executed line by line by `source` anyway.
      eval "export $line"
    fi
  done <"$file"
  unset existing line key
}

load_dotenv "$ROOT_DIR/.env"

LOCAL_TEST_DB_URL="postgresql://boardly:boardly_test@localhost:5433/boardly_test"

# ------------------------------------------------------------------------------
# Target resolution
#
# `db.sh up` starts a local Postgres container, so the obvious reading of
# `db.sh migrate` is "migrate the database I just started". It did not do that:
# migrate/seed/reset/studio forwarded .env's DATABASE_URL verbatim, which in
# this repo points at Neon. That is how migration 0040_billing_event_status.sql
# was applied to the shared remote database during what was meant to be local
# work. The commands now print the resolved target and refuse a non-local host
# unless ALLOW_REMOTE_DB=1, so the accident needs an explicit, visible opt-in.
# ------------------------------------------------------------------------------

# Prints "host:port/database" for a postgres URL. Credentials are never echoed
# (AGENTS.md §6) — only the host and database name are shown.
db_target() {
  local url="$1"
  local rest="${url#*://}"
  local hostport="${rest%%/*}"
  local dbname="${rest#*/}"
  dbname="${dbname%%\?*}"
  # Strip any userinfo that survived.
  hostport="${hostport##*@}"
  echo "${hostport:-unknown}/${dbname:-unknown}"
}

db_is_local() {
  local url="$1"
  local host
  host="$(db_target "$url" | cut -d: -f1)"
  case "$host" in
    localhost | 127.* | ::1 | "[::1]" | host.docker.internal | postgres | "") return 0 ;;
    *) return 1 ;;
  esac
}

require_writable_target() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo -e "${RED}✗ ${label}: DATABASE_URL is not set.${NC}" >&2
    exit 1
  fi
  local target
  target="$(db_target "$url")"
  if db_is_local "$url"; then
    echo -e "${BLUE}  target: ${target} (local)${NC}"
    return 0
  fi
  if [ "${ALLOW_REMOTE_DB:-}" = "1" ]; then
    echo -e "${YELLOW}⚠️  target: ${target} (REMOTE)${NC}"
    return 0
  fi
  echo -e "${RED}✗ ${label} would write to the REMOTE database ${target}.${NC}" >&2
  echo "" >&2
  echo "  db.sh up starts a LOCAL container; this command would ignore it and" >&2
  echo "  apply the change to the shared remote database instead." >&2
  echo "" >&2
  echo "  Local work:      ./scripts/db.sh ${label%%:*}:test" >&2
  echo "  Remote, on purpose:  ALLOW_REMOTE_DB=1 ./scripts/db.sh ${label%%:*}" >&2
  exit 1
}

# `bun run --cwd DIR script` works, but `bun --cwd DIR run script` silently
# prints bun's help and exits 0 without running anything. Changing directory
# removes the flag-order dependency entirely.
run_in_backend() {
  (cd "$ROOT_DIR/apps/backend" && bun run "$@")
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
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
      require_writable_target "migrate" "${DATABASE_URL:-}"
      run_in_backend db:migrate
      echo -e "${GREEN}✅ Migrations completed.${NC}"
      ;;

    migrate:test)
      echo -e "${BLUE}🔄 Running migrations on TEST database...${NC}"
      require_writable_target "migrate:test" "${DATABASE_TEST_URL:-$LOCAL_TEST_DB_URL}"
      DATABASE_URL="${DATABASE_TEST_URL:-$LOCAL_TEST_DB_URL}" run_in_backend db:migrate
      echo -e "${GREEN}✅ Test DB migrations completed.${NC}"
      ;;

    seed)
      echo -e "${BLUE}🌱 Seeding database...${NC}"
      require_writable_target "seed" "${DATABASE_URL:-}"
      run_in_backend db:seed
      echo -e "${GREEN}✅ Database seeded.${NC}"
      ;;

    seed:test)
      echo -e "${BLUE}🌱 Seeding TEST database...${NC}"
      require_writable_target "seed:test" "${DATABASE_TEST_URL:-$LOCAL_TEST_DB_URL}"
      DATABASE_URL="${DATABASE_TEST_URL:-$LOCAL_TEST_DB_URL}" run_in_backend db:seed
      echo -e "${GREEN}✅ Test DB seeded.${NC}"
      ;;

    reset)
      echo -e "${YELLOW}⚠️  Resetting database (drop schema, migrate, seed)...${NC}"
      require_writable_target "reset" "${DATABASE_URL:-}"
      run_in_backend db:reset
      echo -e "${GREEN}✅ Database reset complete.${NC}"
      ;;

    studio)
      echo -e "${BLUE}🚀 Launching Drizzle Studio...${NC}"
      require_writable_target "studio" "${DATABASE_URL:-}"
      run_in_backend db:studio
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
      echo -e "  ${GREEN}migrate${NC}         Run migrations on DATABASE_URL"
      echo -e "  ${GREEN}migrate:test${NC}    Run migrations on DATABASE_TEST_URL (local)"
      echo -e "  ${GREEN}seed${NC}            Seed default plans and roles on DATABASE_URL"
      echo -e "  ${GREEN}seed:test${NC}       Seed DATABASE_TEST_URL (local)"
      echo -e "  ${GREEN}reset${NC}           Wipe, re-migrate, and re-seed DATABASE_URL"
      echo -e "  ${GREEN}studio${NC}          Open Drizzle Studio UI on DATABASE_URL"
      echo -e "  ${GREEN}logs${NC}            Follow Postgres & Redis container logs"
      echo ""
      echo -e "The non-:test commands act on DATABASE_URL, which may be a shared remote"
      echo -e "database. They print the target and refuse a remote host unless you set"
      echo -e "  ${GREEN}ALLOW_REMOTE_DB=1${NC}. For local work use the ${GREEN}:test${NC} variants."
      echo -e "Note: CI=${GREEN}true${NC} does NOT unlock a remote write."
      echo ""
      exit 1
      ;;
  esac
fi
