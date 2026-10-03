#!/usr/bin/env bash
# check-docs.sh — push-time enforcement for the Documentation Updates Rule (AGENTS.md §3).
#
# Fails when the pushed range contains feat:/fix:/perf: commits touching
# apps/ or packages/ but no commit touching docs/. The push itself becomes
# the "session end" event, so docs can no longer rot between sessions.
#
# Bypass (explicit, visible in history — not silent):
#   - trailer "[skip-docs]" in any commit message in the range, or
#   - env SKIP_DOCS_CHECK=1 (local emergencies only, never in CI).
#
# Usage: check-docs.sh [base] [head]   (defaults: origin/main, HEAD;
#   pre-push passes <local ref> <local oid> <remote ref> <remote oid> lines on stdin)

set -euo pipefail

CODE_PATHS=(apps packages)
DOCS_PATH=docs
# Everything touching code triggers, except explicitly exempt housekeeping.
EXEMPT_TYPES="^(docs|chore|ci|build|test)(\(.+\))?[:!]"
# The bypass is a git-style TRAILER: a line that is exactly `[skip-docs]`.
# It must not match the token appearing anywhere in the message. The previous
# `grep -qE "\[skip-docs\]"` ran over subject+body, so a commit whose
# explanation merely *mentioned* the trailer — for instance the commit that
# documented this very rule — disabled the gate for its whole range. Any prose
# about the escape hatch silenced it.
BYPASS_TRAILER_RE='^[[:space:]]*\[skip-docs\][[:space:]]*$'
if [[ "${SKIP_DOCS_CHECK:-}" == "1" ]]; then
  echo "[check-docs] bypassed via SKIP_DOCS_CHECK=1"
  exit 0
fi

ranges=()
head_ref="${2:-HEAD}"
if [[ $# -ge 1 ]]; then
  # Accept either a base ref or a full range. Building "$1...$head_ref" from an
  # argument that is already a range produced "A...B...C", which git resolves to
  # the empty set — so `check-docs.sh origin/main...HEAD` reported OK on every
  # commit. A gate that passes when given the wrong argument is worse than one
  # that fails, because the mistake is invisible.
  if [[ "$1" == *...* ]]; then
    ranges+=("$1")
  else
    ranges+=("$1...$head_ref")
  fi
elif [[ -t 0 ]]; then
  ranges+=("origin/main...HEAD")
else
  while read -r _local_ref local_oid _remote_ref remote_oid; do
    [[ -z "${local_oid:-}" ]] && continue
    if [[ "$remote_oid" =~ ^0+$ ]]; then
      base=$(git merge-base "$local_oid" origin/main 2>/dev/null || echo "")
      [[ -n "$base" ]] && ranges+=("$base...$local_oid")
    else
      ranges+=("$remote_oid...$local_oid")
    fi
  done
  [[ ${#ranges[@]} -eq 0 ]] && ranges+=("origin/main...HEAD")
fi

code_commits=""
docs_touched=""
bypassed=""
for range in "${ranges[@]}"; do
  while IFS= read -r sha; do
    [[ -z "$sha" ]] && continue
    subject=$(git log -1 --format="%s%n%b" "$sha")
    if echo "$subject" | grep -qE "$BYPASS_TRAILER_RE"; then bypassed="$sha"; fi
    # Record docs/ BEFORE the exempt-type skip. A commit whose subject is
    # `docs: …` matches EXEMPT_TYPES, so the `continue` below used to skip the
    # docs check entirely — which made the gate impossible to satisfy with the
    # documentation commit it is asking for. Every earlier push of this pass
    # failed here despite a real docs/ commit in the range. Exempting a
    # `docs:` commit from *counting as a code change* is correct; exempting it
    # from *counting as documentation* is the bug.
    if git diff-tree --no-commit-id --name-only -r "$sha" | grep -qE "^$DOCS_PATH/"; then
      docs_touched="$sha"
    fi
    if echo "$subject" | grep -qiE "$EXEMPT_TYPES"; then continue; fi
    if git diff-tree --no-commit-id --name-only -r "$sha" | grep -qE "^($(IFS='|'; echo "${CODE_PATHS[*]}"))/"; then
      code_commits+="$(git log -1 --format='%h %s' "$sha")"$'\n'
    fi
  done < <(git log --no-merges --format="%H" "$range" 2>/dev/null || true)
done

if [[ -n "$bypassed" ]]; then
  echo "[check-docs] bypassed via [skip-docs] trailer"
  exit 0
fi

if [[ -z "$code_commits" ]]; then
  echo "[check-docs] OK: no non-exempt code changes in range"
  exit 0
fi

if [[ -n "$docs_touched" ]]; then
  echo "[check-docs] OK: code changes accompanied by docs/ updates"
  exit 0
fi

echo "[check-docs] FAIL: code changes without docs/ updates" >&2
echo "" >&2
echo "Offending commits:" >&2
echo "$code_commits" >&2
echo "Per AGENTS.md §3, before pushing you must:" >&2
echo "  - append the session to docs/Progress.md (Log + Current State)," >&2
echo "  - flip docs/Roadmap.md checkboxes if you completed an item," >&2
echo "  - add docs/Decisions.md entry if the choice was non-trivial." >&2
echo "Trivial change? Amend with a [skip-docs] trailer or set SKIP_DOCS_CHECK=1." >&2
exit 1
