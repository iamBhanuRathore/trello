#!/usr/bin/env bash
# Regression tests for INFRA_MODE=remote in scripts/setup.sh and scripts/db.sh.
#
# The bug this guards: both scripts answered every infrastructure question with
# Docker, unconditionally.
#
#   setup.sh — required a running Docker daemon before it would do anything,
#     started compose, then blocked forever in `until docker exec … pg_isready`.
#     A developer whose DATABASE_URL/REDIS_URL point at Neon/Upstash could not
#     complete setup at all, even though the stack never needed a container. It
#     also seeded the generated .env with the example's `INFRA_MODE=local`, so
#     the very next `bun run dev` would have started containers against the URLs
#     just configured for the cloud.
#
#   db.sh — `up`/`down`/`status`/`logs` returned a raw daemon error instead of
#     saying there is nothing local to act on and where the data really lives.
#
# The behaviour is asserted by running the real scripts with `docker` replaced
# by a stub that records every invocation, so "remote mode never touches Docker"
# is a mechanical fact rather than an inference from reading the script. Nothing
# here connects to a database and no real .env is read: every fixture URL is a
# literal in this file, and the scripts run against a throwaway ROOT_DIR.
#
# Usage: ./scripts/remote-mode.sh.test.sh
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

# ---------------------------------------------------------------------------
# Loopback stand-ins for the endpoints setup.sh actually probes.
#
# Under remote mode setup.sh opens a TCP connection to the configured Postgres
# and Redis, so those targets must really accept one. Pointing them at real
# provider hostnames (which an earlier revision of this file did) makes the
# suite fail whenever DNS or the network is unavailable, and would make CI
# depend on a third party's uptime. Two throwaway listeners on loopback stand
# in: the assertions are about which endpoints the script contacts and what it
# prints, neither of which needs a real database.
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
    disown "$pid" 2>/dev/null
  done
  return 0
}

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

PROBE_DB_URL="postgresql://boardly:s3cr3t-setup-pw@127.0.0.1:$DB_PORT/neondb"
PROBE_REDIS_URL="redis://:s3cr3t-setup-cache-pw@127.0.0.1:$REDIS_PORT"

# ---------------------------------------------------------------------------
# Sandbox. The scripts under test resolve ROOT_DIR from their own location and
# then write to it: setup.sh creates .env files, copies into apps/backend/, and
# runs `bun install`; db.sh dispatches on argv. Running them against the real
# repository with a fixture APP_ENV would overwrite the developer's actual
# backend env with throwaway URLs.
# ---------------------------------------------------------------------------
SANDBOX="$(mktemp -d)"
trap 'stop_listeners; rm -rf "$SANDBOX"' EXIT

SANDBOX_ROOT="$SANDBOX/root"
mkdir -p "$SANDBOX_ROOT/scripts" "$SANDBOX_ROOT/apps/backend"
cp "$SCRIPT_DIR/setup.sh" "$SCRIPT_DIR/db.sh" "$SCRIPT_DIR/infra-mode.sh" "$SANDBOX_ROOT/scripts/"

# APP_ENV=remotetest — cloud hostnames, no connection is ever made to them.
# setup.sh would fail its reachability probe against these, so they exist for
# db.sh's assertions (which only read the configured endpoint).
cat >"$SANDBOX_ROOT/.env.remotetest" <<'EOF'
INFRA_MODE=remote
DATABASE_URL=postgresql://boardly:s3cr3t-setup-pw@ep-foo.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
DATABASE_TEST_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test
REDIS_URL=rediss://default:s3cr3t-setup-cache-pw@fixture-redis-0001.upstash.io:6379
JWT_SECRET=sandbox-not-a-real-secret
EOF

# APP_ENV=probetest — same remote mode, but pointed at the loopback listeners so
# setup.sh's TCP probe has something real to connect to without touching the
# network.
cat >"$SANDBOX_ROOT/.env.probetest" <<EOF
INFRA_MODE=remote
DATABASE_URL=$PROBE_DB_URL
DATABASE_TEST_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test
REDIS_URL=$PROBE_REDIS_URL
JWT_SECRET=sandbox-not-a-real-secret
EOF

cp "$SANDBOX_ROOT/.env.probetest" "$SANDBOX_ROOT/.env"
cp "$SANDBOX_ROOT/.env.probetest" "$SANDBOX_ROOT/apps/backend/.env"

# APP_ENV=placertest — ships the placeholders the JWT block is supposed to
# replace. Kept separate from probetest so the placeholder assertions do not
# depend on a fixture that never had any.
cat >"$SANDBOX_ROOT/.env.placertest" <<EOF
INFRA_MODE=remote
DATABASE_URL=$PROBE_DB_URL
DATABASE_TEST_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test
REDIS_URL=$PROBE_REDIS_URL
JWT_SECRET=replace-me-with-a-long-random-string
REFRESH_TOKEN_SECRET=replace-me-with-another-long-random-string
EOF

# The example setup.sh copies from, standing in for .env.development.example.
cat >"$SANDBOX_ROOT/.env.remotetest.example" <<'EOF'
# ─── Infrastructure mode ───
INFRA_MODE=local
DATABASE_URL=postgresql://boardly:boardly_dev@localhost:5432/boardly_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-me-with-a-long-random-string
REFRESH_TOKEN_SECRET=replace-me-with-another-long-random-string
EOF

# APP_ENV=localtest: containers, and a deliberately stale legacy .env so the
# sync checks have something to report.
cat >"$SANDBOX_ROOT/.env.localtest" <<'EOF'
INFRA_MODE=local
DATABASE_URL=postgresql://boardly:boardly_dev@localhost:5432/boardly_dev
DATABASE_TEST_URL=postgresql://boardly:boardly_test@localhost:5433/boardly_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=sandbox-not-a-real-secret
EOF
printf 'INFRA_MODE=local\nDATABASE_URL=postgresql://boardly:stale@localhost:5432/stale\n' \
  >"$SANDBOX_ROOT/.env"

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

run_sandboxed() {
  local script="$1" app_env="$2"
  shift 2
  reset_calls
  env PATH="$STUB_BIN:$PATH" APP_ENV="$app_env" "$@" \
    bash "$SANDBOX_ROOT/scripts/$script" 2>&1
}

run_setup() {
  local app_env="$1" infra_mode="$2" allow_remote="$3"
  local log="$SANDBOX/setup.out"
  reset_calls
  env PATH="$STUB_BIN:$PATH" APP_ENV="$app_env" INFRA_MODE="$infra_mode" \
    ALLOW_REMOTE_DB="$allow_remote" bash "$SANDBOX_ROOT/scripts/setup.sh" >"$log" 2>&1
  printf '%s' "$?" >"$SANDBOX/setup.status"
  cat "$log"
}

run_db() {
  local action="$1" app_env="$2" infra_mode="$3"
  local log="$SANDBOX/db.out"
  reset_calls
  env PATH="$STUB_BIN:$PATH" APP_ENV="$app_env" INFRA_MODE="$infra_mode" \
    bash "$SANDBOX_ROOT/scripts/db.sh" "$action" >"$log" 2>&1
  printf '%s' "$?" >"$SANDBOX/db.status"
  cat "$log"
}

# ---------------------------------------------------------------------------
# setup.sh — remote mode must complete without Docker.
# ---------------------------------------------------------------------------
echo "setup.sh in remote mode"
out="$(run_setup probetest remote '')"
st="$(cat "$SANDBOX/setup.status")"
assert_eq "setup exits 0 without Docker" "0" "$st"
if docker_was_called; then
  no "setup remote never calls docker" "no docker invocation" "$(cat "$DOCKER_CALLS")"
else
  ok "setup remote never calls docker"
fi
assert_contains "announces that Docker is not required" "Docker is not required" "$out"
# The old failure mode: an infinite `until docker exec … pg_isready` loop.
assert_not_contains "never execs into a container" "STUB-DOCKER" "$out"
assert_not_contains "no readiness wait is printed" "Waiting for PostgreSQL to be ready" "$out"
assert_contains "probes the configured postgres" "127.0.0.1:$DB_PORT" "$out"
assert_contains "probes the configured redis" "127.0.0.1:$REDIS_PORT" "$out"
assert_not_contains "postgres password never printed" "s3cr3t-setup-pw" "$out"
assert_not_contains "redis password never printed" "s3cr3t-setup-cache-pw" "$out"
if bun_ran_db_script; then
  no "remote setup runs no migrations by default" "no db:migrate" "$(cat "$BUN_CALLS")"
else
  ok "remote setup runs no migrations by default"
fi
assert_contains "the skip names the opt-in" "ALLOW_REMOTE_DB=1" "$out"
assert_contains "the test-db skip is explained" "bun run test" "$out"

echo "setup.sh in remote mode with ALLOW_REMOTE_DB=1"
out="$(run_setup probetest remote 1)"
if bun_ran_db_script; then
  ok "ALLOW_REMOTE_DB=1 runs the migrations"
else
  no "ALLOW_REMOTE_DB=1 runs the migrations" "db:migrate invoked" "no db invocation"
fi
assert_contains "the opt-in names the target" "127.0.0.1:$DB_PORT" "$out"
assert_not_contains "postgres password never printed" "s3cr3t-setup-pw" "$out"

echo "setup.sh seeds the resolved mode into the generated env file"
# Without this, a fresh setup copies .env.example (INFRA_MODE=local) and the
# next `bun run dev` starts containers against cloud URLs.
grep -q "^INFRA_MODE=remote$" "$SANDBOX_ROOT/.env.probetest" &&
  ok "generated env records remote" ||
  no "generated env records remote" "INFRA_MODE=remote" "$(grep '^INFRA_MODE=' "$SANDBOX_ROOT/.env.probetest")"
assert_contains "the seed is reported" "INFRA_MODE=remote recorded" "$out"
# Only the key is rewritten — the configured URL must survive setup untouched.
assert_contains "the configured database URL survives" "$DB_PORT" "$(cat "$SANDBOX_ROOT/.env.probetest")"

echo "setup.sh replaces placeholder secrets"
# Regression in the OS branch used to rewrite INFRA_MODE: `[ "$OSTYPE" == "darwin"* ]`
# is always false, because an unquoted glob inside [ ] is not pathname-expanded
# and is compared literally. macOS therefore took the GNU branch, where
# `sed -i` consumes the script as the backup suffix and errors out — so a
# generated env kept its `replace-me` secrets, which doctor.sh then reports as a
# warning on every run.
run_setup placertest remote 1 >/dev/null
assert_contains "the generation step runs" "Generating secure random JWT secrets" "$(cat "$SANDBOX/setup.out")"
assert_not_contains "no placeholder secret survives" "replace-me" "$(cat "$SANDBOX_ROOT/.env.placertest")"
assert_contains "JWT_SECRET is populated" "JWT_SECRET=" "$(cat "$SANDBOX_ROOT/.env.placertest")"

echo "setup.sh in local mode still uses Docker"
out="$(run_setup localtest local '')"
assert_contains "docker is checked" "Prerequisites verified" "$out"
assert_contains "compose up is invoked" "compose up" "$(cat "$DOCKER_CALLS")"
assert_contains "readiness probes the container" "pg_isready" "$(cat "$DOCKER_CALLS")"
assert_contains "the test database is set up locally" "Setting up test database" "$out"
if bun_ran_db_script; then
  ok "local setup migrates and seeds"
else
  no "local setup migrates and seeds" "db:migrate invoked" "no db invocation"
fi

echo "setup.sh surfaces a failed migration instead of seeding anyway"
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
reset_calls
env PATH="$FAIL_BIN:$STUB_BIN:$PATH" APP_ENV=localtest INFRA_MODE=local \
  bash "$SANDBOX_ROOT/scripts/setup.sh" >"$SANDBOX/setup-fail.out" 2>&1
assert_eq "a failed db:migrate exits 1" "1" "$?"
out="$(cat "$SANDBOX/setup-fail.out")"
assert_contains "the failure is reported" "db:migrate failed" "$out"
assert_not_contains "seeding does not follow a broken schema" "db:seed" "$out"

echo
echo "db.sh container commands under remote"
for action in up down status logs; do
  out="$(run_db "$action" remotetest remote)"
  st="$(cat "$SANDBOX/db.status")"
  assert_eq "db.sh $action remote exits 0" "0" "$st"
  if docker_was_called; then
    no "db.sh $action remote never calls docker" "no docker invocation" "$(cat "$DOCKER_CALLS")"
  else
    ok "db.sh $action remote never calls docker"
  fi
  assert_contains "db.sh $action explains there are no containers" "no local containers" "$out"
  assert_contains "db.sh $action names the cloud postgres" "neon.tech:5432" "$out"
  assert_contains "db.sh $action names the cloud redis" "upstash.io:6379" "$out"
  assert_not_contains "db.sh $action surfaces no daemon error" "STUB-DOCKER" "$out"
  assert_not_contains "db.sh $action never prints the postgres password" "s3cr3t-setup-pw" "$out"
  assert_not_contains "db.sh $action never prints the redis password" "s3cr3t-setup-cache-pw" "$out"
done

echo "db.sh container commands still drive Docker under local"
out="$(run_db status localtest local)"
assert_contains "compose ps is invoked" "compose ps" "$(cat "$DOCKER_CALLS")"
assert_not_contains "local status is not a remote notice" "no local containers" "$out"

out="$(run_db up localtest local)"
assert_contains "compose up is invoked" "compose up" "$(cat "$DOCKER_CALLS")"

out="$(run_db down localtest local)"
assert_contains "compose stop is invoked" "compose stop" "$(cat "$DOCKER_CALLS")"

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]