#!/usr/bin/env bash
# Regression tests for scripts/infra-mode.sh and the INFRA_MODE plumbing in
# dev.sh / stop.sh / doctor.sh.
#
# The bug this guards: `bun run dev` refused to start unless a Docker daemon was
# running, even when DATABASE_URL and REDIS_URL pointed at managed services. The
# launcher had no way to express "the databases are not in containers", so a
# developer using Neon + Upstash could not start the stack at all.
#
# The behaviour is asserted by running the real scripts with `docker` replaced by
# a stub that records every invocation, so "remote mode never touches Docker" is a
# mechanical fact rather than an inference from reading the script. Nothing here
# connects to a database, and no real .env is read: every fixture URL is a literal
# in this file, and the scripts run against a throwaway ROOT_DIR (see SANDBOX_ROOT).
#
# Usage: ./scripts/dev.sh.test.sh
#   Exits non-zero if any assertion failed.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0

ok() {
  PASS=$((PASS + 1))
  printf '  ok   %s\n' "$1"
}

no() {
  FAIL=$((FAIL + 1))
  printf '  FAIL %s\n     expected: %s\n     actual:   %s\n' "$1" "$2" "$3"
}

assert_eq() {
  if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "$2" "$3"; fi
}

assert_contains() {
  case "$3" in
    *"$2"*) ok "$1" ;;
    *) no "$1" "'$2' in output" "$3" ;;
  esac
}

assert_not_contains() {
  case "$3" in
    *"$2"*) no "$1" "'$2' NOT in output" "$3" ;;
    *) ok "$1" ;;
  esac
}

# Fixture URLs for the pure-function assertions on `service_endpoint`. The
# passwords are literals that exist only here; assertions below pin that neither
# ever appears in script output (AGENTS.md §6). Nothing here is dialled.
NEON="postgresql://boardly:s3cr3t-neon-pw@ep-foo.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
UPSTASH="rediss://default:s3cr3t-upstash-pw@fixture-redis-0001.upstash.io:6379"

# ---------------------------------------------------------------------------
# Loopback stand-ins for the endpoints the readiness probe actually connects to.
#
# The probe is a real TCP connect, so the probe targets must really accept one.
# Pointing it at a real provider hostname (which an earlier revision of this file
# did) makes the suite fail whenever DNS or the network is unavailable, and would
# make CI depend on a third party's uptime. Two throwaway listeners on loopback
# stand in instead: the assertion is about which endpoints the script contacts and
# what it prints, neither of which needs a real database.
# ---------------------------------------------------------------------------
LISTENER_PIDS=()
start_listener() {
  local port="$1" pid waited=0
  bun -e 'const s=Bun.listen({hostname:"127.0.0.1",port:Number(process.argv[1]),socket:{data(){}}});setTimeout(()=>process.exit(0),120000)' "$port" \
    >/dev/null 2>&1 &
  pid=$!
  LISTENER_PIDS+=("$pid")
  while [ "$waited" -lt 20 ]; do
    nc -z -w 1 127.0.0.1 "$port" >/dev/null 2>&1 && return 0
    sleep 0.2
    waited=$((waited + 1))
  done
  return 1
}

stop_listeners() {
  local pid
  for pid in "${LISTENER_PIDS[@]:-}"; do
    [ -n "$pid" ] || continue
    kill -9 "$pid" 2>/dev/null
    # `disown` before the kill so bash does not print a "Killed" job notice for
    # each listener — a suite whose last output is two apparent crashes reads as
    # failing even when every assertion passed.
    disown "$pid" 2>/dev/null
  done
  return 0
}

# Pick two free high ports so the listeners cannot collide with a real service.
pick_port() {
  local port
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    port="$((20000 + RANDOM % 20000))"
    nc -z -w 1 127.0.0.1 "$port" >/dev/null 2>&1 || {
      printf '%s' "$port"
      return 0
    }
  done
  printf '%s' "1"
}

DB_PORT="$(pick_port)"
REDIS_PORT="$(pick_port)"
[ "$DB_PORT" != "$REDIS_PORT" ] || REDIS_PORT="$((REDIS_PORT + 1))"
if ! start_listener "$DB_PORT" || ! start_listener "$REDIS_PORT"; then
  printf 'FATAL: could not start loopback stand-ins on :%s / :%s\n' "$DB_PORT" "$REDIS_PORT" >&2
  exit 1
fi

PROBE_DB_URL="postgresql://boardly:s3cr3t-db-pw@127.0.0.1:$DB_PORT/neondb"
PROBE_REDIS_URL="redis://:s3cr3t-cache-pw@127.0.0.1:$REDIS_PORT"

# ---------------------------------------------------------------------------
# Sandbox.
#
# Every script under test resolves ROOT_DIR from its own location, and two of
# them act on that tree: dev.sh copies .env.$APP_ENV over apps/backend/.env, and
# stop.sh kills whatever holds ports 3001/5173-5175. Running the real ones against
# the repository with a fixture APP_ENV would overwrite the developer's actual
# backend env with throwaway URLs and kill their running dev stack. So the scripts
# are copied into a throwaway root that holds only fixture files.
# ---------------------------------------------------------------------------
SANDBOX="$(mktemp -d)"
trap 'stop_listeners; rm -rf "$SANDBOX"' EXIT

SANDBOX_ROOT="$SANDBOX/root"
mkdir -p "$SANDBOX_ROOT/scripts" "$SANDBOX_ROOT/apps/backend"
cp "$SCRIPT_DIR/dev.sh" "$SCRIPT_DIR/stop.sh" "$SCRIPT_DIR/doctor.sh" \
  "$SCRIPT_DIR/infra-mode.sh" "$SANDBOX_ROOT/scripts/"

# APP_ENV=remotetest — a non-local DATABASE_URL/REDIS_URL (loopback stand-ins, so
# the readiness probe has something real to connect to without touching the
# network). A separate APP_ENV=localtest holds the compose-file defaults, so a
# mode assertion cannot be satisfied by the remote fixture's own host names.
cat >"$SANDBOX_ROOT/.env.remotetest" <<EOF
INFRA_MODE=remote
DATABASE_URL=$PROBE_DB_URL
DATABASE_TEST_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test
REDIS_URL=$PROBE_REDIS_URL
EOF
cat >"$SANDBOX_ROOT/.env.localtest" <<'EOF'
INFRA_MODE=local
DATABASE_URL=postgresql://boardly:boardly_dev@localhost:5432/boardly_dev
DATABASE_TEST_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test
REDIS_URL=redis://localhost:6379
EOF
# doctor.sh probes $ROOT_DIR/.env and apps/backend/.env. Both are only checked
# for existence and for the "replace-me" placeholder, never read for values.
cat >"$SANDBOX_ROOT/.env" <<'EOF'
JWT_SECRET=sandbox-not-a-real-secret
EOF
cp "$SANDBOX_ROOT/.env" "$SANDBOX_ROOT/apps/backend/.env"

# ---------------------------------------------------------------------------
# Command stubs, first on PATH for every run below.
# ---------------------------------------------------------------------------
STUB_BIN="$SANDBOX/bin"
mkdir -p "$STUB_BIN"

DOCKER_CALLS="$SANDBOX/docker-calls.log"
cat >"$STUB_BIN/docker" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$DOCKER_CALLS"
echo "STUB-DOCKER: \$*" >&2
exit 0
EOF

BUN_CALLS="$SANDBOX/bun-calls.log"
cat >"$STUB_BIN/bun" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$BUN_CALLS"
case "\$1" in
  --version) echo "1.2.0"; exit 0 ;;
esac
exit 0
EOF

chmod +x "$STUB_BIN/docker" "$STUB_BIN/bun"

docker_was_called() { [ -s "$DOCKER_CALLS" ]; }
bun_ran_db_script() { grep -q 'db:migrate\|db:seed' "$BUN_CALLS" 2>/dev/null; }

reset_calls() {
  : >"$DOCKER_CALLS"
  : >"$BUN_CALLS"
}

# APP_ENV selects the fixture env file. INFRA_MODE is passed explicitly by the
# caller in most runs so a mode assertion tests the variable, not the file; the
# file's own value is exercised by the resolve_infra_mode section.
run_sandboxed() {
  local script="$1" app_env="$2"
  shift 2
  reset_calls
  # `env` rather than a bare prefix: the trailing KEY=value arguments arrive as
  # "$@" and would otherwise be run as a command.
  env PATH="$STUB_BIN:$PATH" APP_ENV="$app_env" "$@" \
    bash "$SANDBOX_ROOT/scripts/$script" 2>&1
}

# A passing dev.sh run reaches the four dev servers and blocks on `wait`, so it is
# started in the background and killed once the pre-launch phase has clearly
# finished. `timeout` is not installed by default on macOS, hence no dependency on
# it here.
DEV_TIMEOUT_SECS=25
run_dev() { run_dev_with_path "$STUB_BIN:$PATH" "$@"; }

run_dev_with_path() {
  local path="$1" app_env="$2" infra_mode="$3" allow_remote="$4"
  local log="$SANDBOX/dev.out"
  reset_calls
  env PATH="$path" APP_ENV="$app_env" INFRA_MODE="$infra_mode" \
    ALLOW_REMOTE_DB="$allow_remote" bash "$SANDBOX_ROOT/scripts/dev.sh" >"$log" 2>&1 &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$DEV_TIMEOUT_SECS" ]; do
    sleep 1
    waited=$((waited + 1))
  done
  kill -TERM "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  # Published through a file, not a variable: callers capture stdout in a command
  # substitution, which runs in a subshell, so a variable set here would be lost.
  printf '%s' "$?" >"$SANDBOX/dev.status"
  cat "$log"
}

# ---------------------------------------------------------------------------
# Pure functions from scripts/infra-mode.sh.
# ---------------------------------------------------------------------------
# shellcheck source=scripts/infra-mode.sh
. "$SCRIPT_DIR/infra-mode.sh"
set +e

echo "service_endpoint redacts credentials and applies scheme defaults"
assert_eq "neon pooled url keeps host and default pg port" \
  "ep-foo.ap-southeast-1.aws.neon.tech:5432" "$(service_endpoint "$NEON")"
assert_eq "upstash tls url keeps its explicit port" \
  "fixture-redis-0001.upstash.io:6379" "$(service_endpoint "$UPSTASH")"
assert_eq "explicit pg port" "localhost:5432" \
  "$(service_endpoint 'postgresql://boardly:pw@localhost:5432/boardly_dev')"
assert_eq "explicit redis port" "localhost:6379" \
  "$(service_endpoint 'redis://localhost:6379')"
assert_eq "password is stripped" "db.example.com:5432" \
  "$(service_endpoint 'postgresql://user:hunter2@db.example.com:5432/app')"
assert_eq "empty url is reported, not guessed" "unknown" "$(service_endpoint '')"
assert_eq "schemeless url still parses" "db.example.com:5432" \
  "$(service_endpoint 'db.example.com:5432/app')"
case "$(service_endpoint "$NEON")" in
  *s3cr3t*) no "service_endpoint never echoes the password" "no secret in output" "secret leaked" ;;
  *) ok "service_endpoint never echoes the password" ;;
esac

echo "read_env_key reads one key and nothing else"
ENVF="$SANDBOX/readkey.env"
cat >"$ENVF" <<'EOF'
# a comment
INFRA_MODE=remote
DATABASE_URL=postgresql://u:pw@host:5432/db
  INDENTED=skipped
export EXPORTED_KEY=exported
QUOTED="quoted value"
COMMENTED=remote # trailing note
QUOTED_COMMENT="remote # kept" # dropped
EOF
assert_eq "plain key" "remote" "$(read_env_key "$ENVF" INFRA_MODE)"
assert_eq "indented key" "skipped" "$(read_env_key "$ENVF" INDENTED)"
assert_eq "export prefix stripped" "exported" "$(read_env_key "$ENVF" EXPORTED_KEY)"
assert_eq "quotes unwrapped" "quoted value" "$(read_env_key "$ENVF" QUOTED)"
assert_eq "unquoted inline comment dropped" "remote" "$(read_env_key "$ENVF" COMMENTED)"
assert_eq "comment outside quotes dropped, inside kept" "remote # kept" \
  "$(read_env_key "$ENVF" QUOTED_COMMENT)"
assert_eq "missing key yields empty" "" "$(read_env_key "$ENVF" NO_SUCH_KEY)"
assert_eq "missing file yields empty" "" "$(read_env_key "$SANDBOX/nope.env" INFRA_MODE)"

echo "read_env_key does not leak the file's other variables into the environment"
out="$(bash -c '. "$1"; read_env_key "$2" INFRA_MODE >/dev/null; printf "|%s|%s|%s|" "${DATABASE_URL:-unset}" "${JWT_SECRET:-unset}" "${QUOTED:-unset}"' _ "$SCRIPT_DIR/infra-mode.sh" "$ENVF")"
assert_eq "only the requested key is readable afterwards" "|unset|unset|unset|" "$out"

# resolve_infra_mode is exercised in a subshell because it calls exit on a bad
# value; ROOT_DIR points at the sandbox so it reads the fixture env file.
resolve_in() {
  ROOT_DIR="$SANDBOX_ROOT" APP_ENV="$1" INFRA_MODE="$2" \
    bash -c '. "$1"; resolve_infra_mode; printf "%s" "$INFRA_MODE"' _ "$SCRIPT_DIR/infra-mode.sh" 2>&1
}

echo "resolve_infra_mode"
assert_eq "reads remote from the env file" "remote" "$(resolve_in remotetest '')"
assert_eq "reads local from the env file" "local" "$(resolve_in localtest '')"
assert_eq "the real environment beats the env file" "local" "$(resolve_in remotetest local)"
assert_eq "the real environment can force remote" "remote" "$(resolve_in localtest remote)"
assert_eq "absent INFRA_MODE defaults to local" "local" "$(resolve_in absentapp '')"
assert_contains "a typo is fatal, naming the value" "remtoe" "$(resolve_in remotetest remtoe)"

out="$(ROOT_DIR="$SANDBOX_ROOT" APP_ENV=remotetest INFRA_MODE=remtoe bash -c '. "$1"; resolve_infra_mode' _ "$SCRIPT_DIR/infra-mode.sh" 2>&1)"
st=$?
assert_eq "a typo exits 1 rather than defaulting" "1" "$st"
assert_contains "the error names the acceptable values" "local" "$out"

echo "resolve_infra_mode exports INFRA_MODE for child processes"
out="$(ROOT_DIR="$SANDBOX_ROOT" APP_ENV=remotetest bash -c '. "$1"; resolve_infra_mode >/dev/null; bash -c "printf %s \"\$INFRA_MODE\""' _ "$SCRIPT_DIR/infra-mode.sh")"
assert_eq "INFRA_MODE reaches a child process" "remote" "$out"

# ---------------------------------------------------------------------------
# doctor.sh — remote mode must not consult Docker, and must not report a local
# container it will never use.
# ---------------------------------------------------------------------------
echo "doctor.sh in remote mode"
out="$(run_sandboxed doctor.sh remotetest INFRA_MODE=remote)"
if docker_was_called; then
  no "doctor.sh remote never calls docker" "no docker invocation" "$(cat "$DOCKER_CALLS")"
else
  ok "doctor.sh remote never calls docker"
fi
assert_contains "reports the mode" "remote" "$out"
assert_contains "docker is not required" "NOT REQUIRED" "$out"
assert_not_contains "no container expectation in remote mode" "boardly_postgres" "$out"
assert_contains "probes the configured postgres" "127.0.0.1:$DB_PORT" "$out"
assert_contains "probes the configured redis" "127.0.0.1:$REDIS_PORT" "$out"
assert_contains "still checks the test-db port" "5433" "$out"
assert_not_contains "local pg port is not reported as a free local db" "PostgreSQL Dev" "$out"
assert_contains "warns that tests still need docker" "still needs local Docker" "$out"
assert_not_contains "postgres password never printed" "s3cr3t-db-pw" "$out"
assert_not_contains "redis password never printed" "s3cr3t-cache-pw" "$out"

echo "doctor.sh in local mode"
out="$(run_sandboxed doctor.sh localtest INFRA_MODE=local)"
assert_contains "docker is checked" "Docker daemon" "$out"
assert_contains "checks the postgres container" "boardly_postgres" "$out"
assert_contains "checks the redis container" "boardly_redis" "$out"
assert_contains "reports the local pg port" "PostgreSQL Dev" "$out"
assert_contains "reports the mode" "local" "$out"

echo "doctor.sh rejects a bogus mode"
out="$(run_sandboxed doctor.sh remotetest INFRA_MODE=remtoe)"
st=$?
assert_eq "a bogus mode exits 1" "1" "$st"
assert_contains "the typo is reported" "remtoe" "$out"
if bun_ran_db_script; then no "a bogus mode runs no db script" "no db invocation" "$(cat "$BUN_CALLS")"; else ok "a bogus mode runs no db script"; fi

# ---------------------------------------------------------------------------
# stop.sh — a clean shutdown must not report a Docker error in remote mode.
# ---------------------------------------------------------------------------
echo "stop.sh in remote mode"
out="$(run_sandboxed stop.sh remotetest INFRA_MODE=remote)"
st=$?
if docker_was_called; then
  no "stop.sh remote never calls docker" "no docker invocation" "$(cat "$DOCKER_CALLS")"
else
  ok "stop.sh remote never calls docker"
fi
assert_eq "stop.sh remote exits 0" "0" "$st"
assert_contains "says nothing needed stopping" "no local containers to stop" "$out"
case "$out" in
  *"STUB-DOCKER"*) no "no docker error surfaced" "no STUB-DOCKER in output" "$out" ;;
  *) ok "no docker error surfaced" ;;
esac

echo "stop.sh in local mode still stops containers"
out="$(run_sandboxed stop.sh localtest INFRA_MODE=local)"
st=$?
assert_eq "stop.sh local exits 0" "0" "$st"
assert_contains "compose stop is invoked" "compose stop" "$out"
assert_contains "both pg services named" "postgres_test" "$(cat "$DOCKER_CALLS")"
assert_contains "redis named" "redis" "$(cat "$DOCKER_CALLS")"

# ---------------------------------------------------------------------------
# dev.sh — the launcher. Only the pre-launch phase is under test; see run_dev.
# ---------------------------------------------------------------------------
echo "dev.sh in remote mode"
out="$(run_dev remotetest remote '')"
if docker_was_called; then
  no "dev.sh remote never calls docker" "no docker invocation" "$(cat "$DOCKER_CALLS")"
else
  ok "dev.sh remote never calls docker"
fi
assert_contains "announces remote mode" "Docker not required" "$out"
assert_contains "probes the configured postgres" "127.0.0.1:$DB_PORT" "$out"
assert_contains "probes the configured redis" "127.0.0.1:$REDIS_PORT" "$out"
assert_contains "banner shows the remote postgres" "127.0.0.1:$DB_PORT" "$out"
assert_contains "banner shows the remote redis" "127.0.0.1:$REDIS_PORT" "$out"
assert_contains "banner says tests still need docker" "still needs local Docker" "$out"
assert_not_contains "postgres password never printed" "s3cr3t-db-pw" "$out"
assert_not_contains "redis password never printed" "s3cr3t-cache-pw" "$out"
if bun_ran_db_script; then
  no "remote boot runs no migrations by default" "no db:migrate" "$(cat "$BUN_CALLS")"
else
  ok "remote boot runs no migrations by default"
fi
assert_contains "the skip names the opt-in" "ALLOW_REMOTE_DB=1 bun run db:migrate" "$out"

echo "dev.sh in remote mode with ALLOW_REMOTE_DB=1"
out="$(run_dev remotetest remote 1)"
if bun_ran_db_script; then
  ok "ALLOW_REMOTE_DB=1 runs the migrations"
else
  no "ALLOW_REMOTE_DB=1 runs the migrations" "db:migrate invoked" "no db invocation"
fi
assert_contains "the opt-in names the target" "127.0.0.1:$DB_PORT" "$out"

echo "dev.sh in local mode still starts containers"
run_dev localtest local '' >/dev/null
assert_contains "compose up is invoked" "compose up" "$(cat "$DOCKER_CALLS")"
assert_contains "readiness probes the container" "pg_isready" "$(cat "$DOCKER_CALLS")"

echo "dev.sh surfaces a failed migration instead of swallowing it"
FAIL_BIN="$SANDBOX/bin-fail"
mkdir -p "$FAIL_BIN"
cat >"$FAIL_BIN/bun" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *db:migrate*) echo "error: relation already exists" >&2; exit 1 ;;
esac
exit 0
EOF
chmod +x "$FAIL_BIN/bun"
out="$(run_dev_with_path "$FAIL_BIN:$STUB_BIN:$PATH" remotetest remote 1)"
st="$(cat "$SANDBOX/dev.status")"
assert_eq "a failed db:migrate exits 1" "1" "$st"
assert_contains "the failure is reported" "db:migrate failed" "$out"
assert_contains "the swallowed-|| true regression is called out" "|| true" "$out"
assert_not_contains "the stack does not start on a broken schema" "ALL SERVICES READY" "$out"

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]