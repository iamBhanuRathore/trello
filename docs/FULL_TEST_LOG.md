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
- full suite: 19 passed across smoke+full at introduction; this session 18 passed + 1 git-webhook timeout (see PERF-01).
- backend `bun test`: pre-existing FK-cleanup failures in auth/boards/forms/reports/developer suites (fail identically on clean tree — verified via `git stash`).

## Defects

| ID                 | Severity | Area                | Title                                                                                  | Repro / Evidence                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                                                                                                                                  |
| ------------------ | -------- | ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERF-01            | **S**    | Backend perf        | Authed requests take 0.9–2.4s; 100% CPU + ~957 stuck in-flight observed                | `curl` timing: `/chat/channels` 2.4s ×3, `/auth/me` 1.77s. Root causes: (1) backend DB is remote (~80ms RTT per round trip, measured); (2) backend Redis is remote Upstash (~100ms/op) on the hot path; (3) N+1 loops (`listUserChannels` 2–3 queries/channel; forms submission counts; sprint velocity per-sprint queries). Under hiccups → pile-ups → wedged server ("Cannot reach API"). | Fixed (this session): `listUserChannels` → 4 queries total (2.4s → 0.4s measured); forms counts → single GROUP BY; velocity → single IN query. **User action needed (cannot do for you): point dev env at local docker postgres+redis** |
| BUG-11 (candidate) | M        | Backend reliability | No timeout on some outbound/Redis paths; single remote dependency can wedge event loop | 98.7% CPU + 957 stuck in-flight observed twice; Google calls already bounded (15s, earlier fix). Redis client has `maxRetriesPerRequest: 3` with no command timeout.                                                                                                                                                                                                                        | Open — recommend command timeout + health-gated fail-fast                                                                                                                                                                               |
