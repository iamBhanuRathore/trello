# Full-Project Test Log — 2026-09-26 (Hour Blitz)

Goal: exercise every surface in one hour, log every defect with severity for later triage.
Scope: dashboard (all roles) + backend API + super-admin. Excludes: Expo mobile (no device),
real Google OAuth (manually covered), Stripe charges (no test keys), production env.

Severity: S = showstopper (data loss / core flow broken), M = major (workaround needed),
m = minor (annoyance/polish).

Environment: local dev (backend :3001, dashboard :5173, super-admin :5174),
Acme seed (52 users), personas Alex/Elena/Leo/Raymond (`Password123!`).

## Baseline

- smoke suite: 9 passed, 1 skipped (intentional), 0 failed.
- full suite: 19 passed at introduction; this blitz: tour (20 routes green), super-admin portal green, all suites re-run green at close.
- backend `bun test`: pre-existing FK-cleanup failures in auth/boards/forms/reports/developer suites (fail identically on clean tree — verified via `git stash`).

## Defects

| ID                 | Severity | Area                | Title                                                                                  | Repro / Evidence                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                                                                                                                                  |
| ------------------ | -------- | ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERF-01            | **S**    | Backend perf        | Authed requests take 0.9–2.4s; 100% CPU + ~957 stuck in-flight observed                | `curl` timing: `/chat/channels` 2.4s ×3, `/auth/me` 1.77s. Root causes: (1) backend DB is remote (~80ms RTT per round trip, measured); (2) backend Redis is remote Upstash (~100ms/op) on the hot path; (3) N+1 loops (`listUserChannels` 2–3 queries/channel; forms submission counts; sprint velocity per-sprint queries). Under hiccups → pile-ups → wedged server ("Cannot reach API"). | Fixed (this session): `listUserChannels` → 4 queries total (2.4s → 0.4s measured); forms counts → single GROUP BY; velocity → single IN query. **User action needed (cannot do for you): point dev env at local docker postgres+redis** |
| BUG-11 (candidate) | M        | Backend reliability | No timeout on some outbound/Redis paths; single remote dependency can wedge event loop | 98.7% CPU + 957 stuck in-flight observed twice; Google calls already bounded (15s, earlier fix). Redis client has `maxRetriesPerRequest: 3` with no command timeout.                                                                                                                                                                                                                        | Open — recommend command timeout + health-gated fail-fast                                                                                                                                                                               |
| FIND-01            | m        | API errors          | Malformed UUID / bad trash-restore id return 500 instead of 400/404                    | `GET /v1/cards/not-a-uuid` → 500; `POST /v1/trash/restore {itemId:"nope"}` → 500. Bodies sanitized (no leak) but status wrong per error-format standard.                                                                                                                                                                                                                                    | Open                                                                                                                                                                                                                                    |
| FIND-02            | m        | E2E suite           | Tour + super-admin specs hardcode Acme seed IDs / ports                                | `e2e/full/tour.spec.ts` embeds Acme WS/PROJ/BOARD ids; `superadmin.spec.ts` hardcodes `:5174`. Fine locally, brittle in CI.                                                                                                                                                                                                                                                                 | Open — resolve IDs via API at runtime before promoting full tier to CI                                                                                                                                                                  |

## Retest — 2026-09-26 (N1 + full-browser pass)

Scope re-run: typecheck (backend/dashboard/super-admin/mobile/shared-types green),
oxlint (exit 0, warnings only), `dashboard` + `super-admin` production builds green,
backend `bun test` (190 pass / 30 fail — all 30 fail in org-cleanup with the same
`subscriptions_organization_id_organizations_id_fk` FK violation as the baseline; failing
suites span auth/boards/forms/reports/developer plus stages/sprints/phases/roles/notify/docs/audit/importers/SSO/WorkOS/timetracking,
same root cause, not new), mobile `bun test` (3 pass), smoke E2E 9 passed / 1 skipped
(matches baseline), tour 20 routes green, admin/calendar/chat/misc full specs green.
Health: `/health`, `/docs`, `:5173`, `:5174` all 200. PERF-01 fix holds
(`/chat/channels` 0.93s cold → 0.40s warm; `/auth/me` 0.20s). BUG-09/B-10 guards still
in place (`temp-` guard in `BoardView`, `document.dispatchEvent` in `AppSidebar`).
FIND-01 half-fixed: `GET /v1/cards/not-a-uuid` still 500 (still open, not re-logged);
`POST /v1/trash/restore {itemId:"nope"}` now returns 422 validation instead of 500.
BUG-07 control no longer exists (no WIP-limit input rendered in current
`StageTemplates.tsx`), so nothing to re-verify.

## Retest follow-up — all 5 new defects fixed, rows removed per request

FIND-03 (super-admin seed), FIND-04 (git webhook hang), FIND-05 (lint warnings),
FIND-06 (bundle size), FIND-07 (logger/`any` discipline) were fixed one by one and
verified (see `docs/Progress.md` 2026-09-26 entry). Baseline rows above
(PERF-01 / BUG-11 / FIND-01 / FIND-02) are untouched.
