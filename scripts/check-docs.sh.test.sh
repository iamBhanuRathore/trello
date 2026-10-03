#!/usr/bin/env bash
# Regression tests for scripts/check-docs.sh (AGENTS.md §3 push gate).
#
# The gate had an ordering bug: a commit whose subject is `docs: …` matches
# EXEMPT_TYPES, so the loop `continue`d before the docs/ check ever ran. A
# documentation commit therefore could not satisfy the gate that asks for one,
# and every push of the 2026-10-04 P0–P4 pass failed with "code changes without
# docs/ updates" despite docs/Progress.md, docs/Decisions.md and docs/Roadmap.md
# all being updated in the range.
#
# These tests build throwaway git repos, so nothing here touches the real
# repository or its history.
#
# Usage: ./scripts/check-docs.sh.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_DOCS="$SCRIPT_DIR/check-docs.sh"

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

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Build a repo whose history is: <code commit> then <docs commit>.
# $1 = subject of the code commit, $2 = subject of the docs commit,
# $3 = "yes" to also have the code commit touch docs/
make_repo() {
  local code_subject="$1" docs_subject="$2" code_touches_docs="${3:-no}"
  local dir="$TMP/repo$RANDOM$RANDOM"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email t@example.com
  git -C "$dir" config user.name Test
  git -C "$dir" config commit.gpgsign false

  mkdir -p "$dir/apps/demo/src" "$dir/docs"
  echo 'export const a = 1;' >"$dir/apps/demo/src/a.ts"
  echo '# Progress' >"$dir/docs/Progress.md"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m "$code_subject"

  echo '# Progress updated' >>"$dir/docs/Progress.md"
  if [[ "$code_touches_docs" == "yes" ]]; then
    git -C "$dir" add -A
    git -C "$dir" commit -q --amend --no-edit
  fi

  echo 'more' >>"$dir/docs/Progress.md"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m "$docs_subject"
  echo "$dir"
}

run_gate() {
  (cd "$1" && SKIP_DOCS_CHECK= "$CHECK_DOCS" HEAD~1...HEAD 2>&1)
  return $?
}

echo "code change + a docs: commit satisfies the gate (the regression)"
repo="$(make_repo 'fix(demo): a real fix' 'docs: record the fix')"
out="$(run_gate "$repo")"; st=$?
assert_eq "exit 0" "0" "$st"
case "$out" in
  *OK*) ok "reports OK" ;;
  *) no "reports OK" "OK in output" "$out" ;;
esac

echo "a docs: commit counts as documentation whatever its type prefix"
for prefix in docs chore ci build test; do
  repo="$(make_repo 'fix(demo): a real fix' "$prefix: housekeeping")"
  out="$(run_gate "$repo")"; st=$?
  assert_eq "$prefix: commit satisfies the gate" "0" "$st"
done

echo "code change with no docs commit still fails"
dir="$TMP/nodocs$RANDOM"
mkdir -p "$dir/apps/demo/src"
git -C "$dir" init -q
git -C "$dir" config user.email t@example.com
git -C "$dir" config user.name Test
echo 'export const a = 1;' >"$dir/apps/demo/src/a.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'fix(demo): a real fix'
echo 'export const b = 2;' >"$dir/apps/demo/src/b.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'feat(demo): another change'
out="$( (cd "$dir" && "$CHECK_DOCS" HEAD~1...HEAD 2>&1) )"; st=$?
assert_eq "exit 1" "1" "$st"
case "$out" in
  *FAIL*) ok "reports FAIL and names the offending commit" ;;
  *) no "reports FAIL" "FAIL in output" "$out" ;;
esac

echo "both argument forms are accepted and neither passes silently"
# A base ref and a full range must agree. Building "$1...HEAD" from an argument
# that is already a range produced "A...B...C", which git resolves to the empty
# set — so the range form reported OK on a commit that should have failed.
for form in "HEAD~1" "HEAD~1...HEAD"; do
  dir="$TMP/argform$RANDOM"
  mkdir -p "$dir/apps/demo/src"
  git -C "$dir" init -q
  git -C "$dir" config user.email t@example.com
  git -C "$dir" config user.name Test
  echo 'export const a = 1;' >"$dir/apps/demo/src/a.ts"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m 'fix(demo): a real fix'
  echo 'export const b = 2;' >"$dir/apps/demo/src/b.ts"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m 'feat(demo): another change'
  out="$( (cd "$dir" && "$CHECK_DOCS" "$form" 2>&1) )"; st=$?
  assert_eq "'$form' fails like the base-ref form" "1" "$st"
done

echo "a commit that touches apps/ AND docs/ satisfies the gate on its own"
repo="$(make_repo 'fix(demo): fix plus inline docs note' 'chore: unrelated' 'yes')"
out="$(run_gate "$repo")"; st=$?
assert_eq "exit 0" "0" "$st"

echo "docs-only range passes without complaining"
dir="$TMP/docsonly$RANDOM"
mkdir -p "$dir/docs"
git -C "$dir" init -q
git -C "$dir" config user.email t@example.com
git -C "$dir" config user.name Test
echo '# Progress' >"$dir/docs/Progress.md"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'docs: initial'
echo 'more' >>"$dir/docs/Progress.md"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'docs: update'
out="$( (cd "$dir" && "$CHECK_DOCS" HEAD~1...HEAD 2>&1) )"; st=$?
assert_eq "exit 0" "0" "$st"
case "$out" in
  *"no non-exempt code changes"*) ok "reports no code changes" ;;
  *) no "reports no code changes" "'no non-exempt code changes' in output" "$out" ;;
esac

echo "the bypass trailer still works"
# The trailer has to be on a commit INSIDE the range — the gate scans the range,
# not the branch. Putting it on the parent commit correctly does not bypass.
dir="$TMP/bypass$RANDOM"
mkdir -p "$dir/apps/demo/src"
git -C "$dir" init -q
git -C "$dir" config user.email t@example.com
git -C "$dir" config user.name Test
echo 'export const a = 1;' >"$dir/apps/demo/src/a.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'fix(demo): first'
echo 'export const b = 2;' >"$dir/apps/demo/src/b.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'fix(demo): trivial

[skip-docs]'
out="$( (cd "$dir" && "$CHECK_DOCS" HEAD~1...HEAD 2>&1) )"; st=$?
assert_eq "exit 0" "0" "$st"
case "$out" in
  *bypassed*) ok "reports the bypass" ;;
  *) no "reports the bypass" "bypassed in output" "$out" ;;
esac

echo "mentioning the trailer in prose does NOT bypass (the regression)"
# The previous check grepped the token across subject+body, so a commit whose
# explanation merely mentioned `[skip-docs]` — including the commit that
# documented this rule — disabled the gate for its whole range.
dir="$TMP/mention$RANDOM"
mkdir -p "$dir/apps/demo/src"
git -C "$dir" init -q
git -C "$dir" config user.email t@example.com
git -C "$dir" config user.name Test
echo 'export const a = 1;' >"$dir/apps/demo/src/a.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'fix(demo): first'
echo 'export const b = 2;' >"$dir/apps/demo/src/b.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'fix(demo): tighten the gate

A commit that mentions the [skip-docs] escape hatch in its prose must not
disable the gate for its whole range.'
out="$( (cd "$dir" && "$CHECK_DOCS" HEAD~1...HEAD 2>&1) )"; st=$?
assert_eq "exit 1" "1" "$st"
case "$out" in
  *bypassed*) no "does not report a bypass" "no bypass" "$out" ;;
  *FAIL*) ok "still enforces the gate" ;;
  *) no "still enforces the gate" "FAIL in output" "$out" ;;
esac

echo "SKIP_DOCS_CHECK=1 still short-circuits"
dir="$TMP/envbypass$RANDOM"
mkdir -p "$dir/apps/demo/src"
git -C "$dir" init -q
git -C "$dir" config user.email t@example.com
git -C "$dir" config user.name Test
echo 'export const a = 1;' >"$dir/apps/demo/src/a.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'fix(demo): trivial'
echo 'export const b = 2;' >"$dir/apps/demo/src/b.ts"
git -C "$dir" add -A
git -C "$dir" commit -q -m 'feat(demo): another change'
out="$( (cd "$dir" && SKIP_DOCS_CHECK=1 "$CHECK_DOCS" HEAD~1...HEAD 2>&1) )"; st=$?
assert_eq "exit 0" "0" "$st"
case "$out" in
  *bypassed*) ok "reports the env bypass" ;;
  *) no "reports the env bypass" "bypassed in output" "$out" ;;
esac

echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
