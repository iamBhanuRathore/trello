#!/usr/bin/env bash
# Regression tests for scripts/db.sh target resolution and the remote-write guard.
#
# db.sh can drop a schema (db.sh reset). The bug this guards: `migrate`, `seed`,
# `reset` and `studio` forwarded .env's DATABASE_URL verbatim, so a developer who
# ran `db.sh up` (local container) and then `db.sh migrate` wrote to whatever
# DATABASE_URL happened to be — which is how 0040_billing_event_status.sql landed
# on the shared remote database. These tests never connect to anything: every case
# either exercises a pure function or asserts that the guard refuses *before*
# invoking bun.
#
# Usage: ./scripts/db.sh.test.sh
#   Exits non-zero on the first failure.

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

# ---------------------------------------------------------------------------
# Pure functions: source db.sh without running its command dispatch.
# ---------------------------------------------------------------------------
# shellcheck source=scripts/db.sh
. "$SCRIPT_DIR/db.sh"
# db.sh sets -e for its own dispatch; these tests assert on non-zero exits.
set +e

LOCAL_URL="postgresql://boardly:boardly_test@localhost:5433/boardly_test"
REMOTE_URL="postgresql://u:sup3rsecret@ep-foo.us-east-2.aws.neon.tech/neondb?sslmode=require"

echo "db_target redacts credentials"
assert_eq "neon host and db only" \
  "ep-foo.us-east-2.aws.neon.tech/neondb" "$(db_target "$REMOTE_URL")"
assert_eq "local url" "localhost:5433/boardly_test" "$(db_target "$LOCAL_URL")"
assert_eq "no userinfo" "localhost:5432/boardly" "$(db_target "postgresql://localhost:5432/boardly")"
case "$(db_target "$REMOTE_URL")" in
  *sup3rsecret*) no "password never echoed" "no secret in output" "secret leaked" ;;
  *) ok "password never echoed" ;;
esac

echo "db_is_local classifies hosts"
db_is_local "$LOCAL_URL" && ok "localhost is local" || no "localhost is local" local remote
db_is_local "postgresql://boardly:x@postgres:5432/boardly" && ok "compose service name is local" || no "compose service name is local" local remote
db_is_local "$REMOTE_URL" && no "neon is remote" remote local || ok "neon is remote"

# ---------------------------------------------------------------------------
# The real environment must beat .env, otherwise the guard is unreachable.
# ---------------------------------------------------------------------------
echo "real environment overrides .env"
got="$(DATABASE_URL="$REMOTE_URL" bash -c '. "$1"; printf "%s" "$DATABASE_URL"' _ "$SCRIPT_DIR/db.sh")"
assert_eq "preset DATABASE_URL survives .env load" "$REMOTE_URL" "$got"

# Assert only that .env still supplies the key. Its value is a credential
# (AGENTS.md §6) and this test has no business printing or pinning it.
# CI has no .env, so these two assertions are local-only.
if [ -f "$ROOT_DIR/.env" ]; then
  got="$(bash -c '. "$1"; [ -n "${DATABASE_URL:-}" ] && printf set || printf unset' _ "$SCRIPT_DIR/db.sh")"
  assert_eq "unset DATABASE_URL is filled in from .env" "set" "$got"

  got="$(bash -c '. "$1"; [ -n "${DATABASE_TEST_URL:-}" ] && printf set || printf unset' _ "$SCRIPT_DIR/db.sh")"
  assert_eq "DATABASE_TEST_URL is filled in from .env" "set" "$got"
else
  printf '  skip .env assertions (no %s)\n' "$ROOT_DIR/.env"
fi

# ---------------------------------------------------------------------------
# Guard behaviour. These run the real script; a refusal exits before bun runs,
# so nothing connects. The ALLOW_REMOTE_DB case uses `studio`, which prints its
# banner and target before launching drizzle-kit.
# ---------------------------------------------------------------------------
echo "remote writes are refused without an explicit opt-in"
out="$(cd "$ROOT_DIR" && DATABASE_URL="$REMOTE_URL" ./scripts/db.sh migrate 2>&1)"
st=$?
assert_eq "migrate on remote exits 1" "1" "$st"
case "$out" in
  *REMOTE*) ok "migrate names the remote target" ;;
  *) no "migrate names the remote target" "REMOTE in output" "$out" ;;
esac
case "$out" in
  *"drizzle"* | *"migrate.ts"*) no "migrate never reached the runner" "no drizzle invocation" "drizzle was invoked" ;;
  *) ok "migrate never reached the runner" ;;
esac

out="$(cd "$ROOT_DIR" && DATABASE_URL="$REMOTE_URL" ./scripts/db.sh reset 2>&1)"
st=$?
assert_eq "reset on remote exits 1" "1" "$st"

out="$(cd "$ROOT_DIR" && DATABASE_URL="$REMOTE_URL" ./scripts/db.sh seed 2>&1)"
st=$?
assert_eq "seed on remote exits 1" "1" "$st"

out="$(cd "$ROOT_DIR" && DATABASE_TEST_URL="$REMOTE_URL" ./scripts/db.sh migrate:test 2>&1)"
st=$?
assert_eq "migrate:test on remote test url exits 1" "1" "$st"

out="$(cd "$ROOT_DIR" && DATABASE_TEST_URL="$REMOTE_URL" ./scripts/db.sh seed:test 2>&1)"
st=$?
assert_eq "seed:test on remote test url exits 1" "1" "$st"

out="$(cd "$ROOT_DIR" && DATABASE_URL="" ./scripts/db.sh seed 2>&1)"
st=$?
assert_eq "empty DATABASE_URL exits 1" "1" "$st"
case "$out" in
  *"is not set"*) ok "empty DATABASE_URL explains itself" ;;
  *) no "empty DATABASE_URL explains itself" "'is not set' in output" "$out" ;;
esac

# CI is an accepted opt-in, so the guard must not block it.
# The opt-in paths are exercised by calling the guard directly rather than
# through a subcommand: allowing the write means the subcommand would go on to
# connect, and a deliberately bogus host would leave the test making DNS
# attempts against a real provider's domain.
out="$(cd "$ROOT_DIR" && CI=true bash -c '. "$1"; require_writable_target migrate "$2"' _ "$SCRIPT_DIR/db.sh" "$REMOTE_URL" 2>&1)"
case "$out" in
  *"ep-foo.us-east-2.aws.neon.tech/neondb"*) ok "CI is allowed through and echoes the target" ;;
  *) no "CI is allowed through and echoes the target" "target in output" "$out" ;;
esac

echo "ALLOW_REMOTE_DB is the documented opt-in"
out="$(ALLOW_REMOTE_DB=1 bash -c '. "$1"; require_writable_target reset "$2"' _ "$SCRIPT_DIR/db.sh" "$REMOTE_URL" 2>&1)"
case "$out" in
  *"ep-foo.us-east-2.aws.neon.tech/neondb"*) ok "opt-in echoes the remote target" ;;
  *) no "opt-in echoes the remote target" "target in output" "$out" ;;
esac
case "$out" in
  *sup3rsecret*) no "opt-in does not leak the password" "no secret in output" "secret leaked" ;;
  *) ok "opt-in does not leak the password" ;;
esac

out="$(ALLOW_REMOTE_DB=1 bash -c '. "$1"; require_writable_target migrate "$2"' _ "$SCRIPT_DIR/db.sh" "$LOCAL_URL" 2>&1)"
case "$out" in
  *"(local)"*) ok "local target still labelled local under opt-in" ;;
  *) no "local target still labelled local under opt-in" "(local) in output" "$out" ;;
esac

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
