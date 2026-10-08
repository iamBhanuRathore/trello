#!/usr/bin/env bash
# ==============================================================================
# Shared infrastructure-mode helpers for dev.sh, stop.sh and doctor.sh.
#
# Sourced, never executed. Defines:
#   read_env_key FILE KEY       — one dotenv key, nothing else exported
#   resolve_infra_mode           — sets INFRA_MODE=local|remote, fatal on garbage
#   service_endpoint URL        — "host:port", credentials stripped
#   infra_endpoint_label        — the same, resolved for the active APP_ENV
# ==============================================================================

# ==============================================================================
# Infrastructure mode
#
#   local  — Postgres + Redis come from docker-compose.yml, so Docker is a hard
#            prerequisite for launching.
#   remote — DATABASE_URL / REDIS_URL point at cloud services (Neon, Upstash,
#            RDS) and Docker is not consulted at all.
#
# This is an explicit flag rather than a guess derived from the URL host. A host
# that looks local can be a tunnel or a socket-forwarder, and db.sh already keeps
# an "is this host local?" classifier (`db_is_local`) for a different question —
# whether a *write* needs ALLOW_REMOTE_DB=1. Overloading it here would make one
# answer serve two unrelated questions, and the second failure would be silent:
# a `remote` stack pointed at localhost would look healthy and fail per-request.
#
# An unknown value is fatal rather than defaulted. A typo must not quietly select
# a mode (AGENTS.md §7, no dead controls) — `INFRA_MODE=remtoe` that silently
# became `local` would fail as "Docker is not running", sending you to start
# Docker rather than at the misspelling.
#
# `bun run test` is deliberately out of scope: ~59 backend suites connect to
# DATABASE_TEST_URL and share one database with scoped teardown
# (docs/Decisions.md 2026-10-04), so it stays on local Docker regardless.
# ==============================================================================

# Reads a single key out of a dotenv file without exporting anything else.
#
# Sourcing the file wholesale would put every secret in it into the environment of
# every child process dev.sh starts — Vite, Next and four dev servers all inherit
# it (AGENTS.md §6). db.sh's line-by-line loader is deliberately scoped to the
# commands that must write; this is the read-only counterpart.
read_env_key() {
  local file="$1" key="$2" line k
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    k="${line#"${line%%[![:space:]]*}"}" # ltrim, so indented keys still match
    case "$k" in
      '' | '#'*) continue ;;
      "$key"=*) ;;
      export\ "$key"=*) k="${k#export }" ;;
      *) continue ;;
    esac
    k="${k#*=}"
    k="${k#"${k%%[![:space:]]*}"}" # ltrim the value
    k="${k%"${k##*[![:space:]]}"}" # rtrim
    case "$k" in
      '"'*)
        # A quoted value may legitimately contain '#', so it ends at the closing
        # quote; anything after it (a trailing comment) is discarded.
        k="${k#\"}"
        k="${k%%\"*}"
        ;;
      \'*)
        k="${k#\'}"
        k="${k%%\'*}"
        ;;
      *) k="${k%%[[:space:]]#*}" ;;
    esac
    printf '%s' "$k"
    return 0
  done <"$file"
}

# Sets INFRA_MODE. Precedence: the real environment wins over the dotenv file, so
# `INFRA_MODE=remote bun run dev` overrides a file that says `local`. Exports the
# result so it reaches `bun run stop` and child processes.
resolve_infra_mode() {
  local mode="${INFRA_MODE:-}"
  if [ -z "$mode" ] && [ -f "$ROOT_DIR/.env.${APP_ENV}" ]; then
    mode="$(read_env_key "$ROOT_DIR/.env.${APP_ENV}" INFRA_MODE)"
  fi
  case "$mode" in
    local | remote)
      INFRA_MODE="$mode"
      ;;
    '')
      INFRA_MODE="local"
      ;;
    *)
      echo "INFRA_MODE must be 'local' or 'remote' (got '${mode}')." >&2
      echo "  Set INFRA_MODE in $ROOT_DIR/.env.${APP_ENV} or export it." >&2
      exit 1
      ;;
  esac
  export INFRA_MODE
}

# Prints "host:port" for a service URL. Credentials are never echoed (AGENTS.md
# §6) — the same redaction db.sh applies when it prints its write target.
#
# A URL with no explicit port is normal and must not be an error: Neon's pooled
# connection strings are exactly `postgresql://user:pw@ep-…-pooler.region.aws.neon.tech/db`,
# and the port is implied by the scheme. So the scheme's default is applied rather
# than treating the missing port as a malformed value.
service_endpoint() {
  local url="$1"
  local scheme rest hostport host port
  scheme="${url%%://*}"
  case "$url" in
    *://*) rest="${url#*://}" ;;
    *) rest="$url" ;;
  esac
  hostport="${rest%%/*}"
  hostport="${hostport##*@}"
  host="${hostport%%:*}"
  if [ "$hostport" = "$host" ]; then
    port=""
  else
    port="${hostport##*:}"
  fi
  if [ -z "$port" ]; then
    case "$scheme" in
      rediss | redis) port=6379 ;;
      *) port=5432 ;;
    esac
  fi
  if [ -z "$host" ]; then
    echo "unknown"
    return 1
  fi
  echo "$host:$port"
}

# Resolves INFRA_DB_EP / INFRA_REDIS_EP for the active APP_ENV. Safe to call in
# either mode — doctor.sh prints them as diagnostics in both, so a local report
# shows where local actually points rather than a hardcoded string that can drift
# from the compose file.
infra_endpoint_label() {
  local env_file="$ROOT_DIR/.env.${APP_ENV}"
  INFRA_DB_URL="$(read_env_key "$env_file" DATABASE_URL)"
  INFRA_REDIS_URL="$(read_env_key "$env_file" REDIS_URL)"
  INFRA_DB_EP="$(service_endpoint "$INFRA_DB_URL")"
  INFRA_REDIS_EP="$(service_endpoint "$INFRA_REDIS_URL")"
}