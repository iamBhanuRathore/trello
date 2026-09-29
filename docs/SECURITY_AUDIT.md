# Security Audit — Boardly (2026-09-28)

Autonomous fix run. Each item below is fixed and committed separately.
Status legend: `[x]` fixed · `[~]` accepted-risk with follow-up (see notes).

## Critical

- [x] C1 `apps/backend/src/lib/env.ts:32-39` — hardcoded `JWT_SECRET`/`REFRESH_TOKEN_SECRET` defaults boot without secrets → token forgery. Fix: no defaults in production, reject placeholders.
- [x] C2 `apps/backend/src/modules/sso/service.ts:194` — `processSSOCallback` trusts `{domain,email,name}` body, no IdP proof → account takeover. Fix: verify via WorkOS `authenticateWithCode`.
- [x] C3 `apps/backend/src/modules/auth/workos.service.ts:136` — `mock_test_` bypasses WorkOS in all envs → JIT account. Fix: gate behind `NODE_ENV==='test'` only.

## High

- [x] H1 `middleware/auth.ts:90` + `realtime/routes.ts:89`, `chat.gateway.ts:24`, `search/routes.ts:9` — JWT org claims trusted, no membership/status recheck; WS board/channel unchecked. Fix: membership check in `authPlugin`, per-action resource→org verify.
- [ ] H2 `db/index.ts:52` — `withOrgContext` unused; RLS on 3 tables only. Fix: deny-by-default RLS migration + helper adoption.
- [x] H3 `modules/webhooks/service.ts:98` — `fetch(userUrl)` SSRF (metadata/internal). Fix: https-only + private-IP/DNS block + allowlist option.
- [x] H4 `modules/calendar/google.ts:41` — `CALENDAR_TOKEN_KEY` falls back to `SHA256("")`. Fix: throw when unset.
- [x] H5 `modules/sso/service.ts:66` — SCIM token `Math.random`, plaintext, `eq()` compare. Fix: `randomBytes`, store hash, constant-time compare.
- [x] H6 `modules/git/service.ts:116` — webhook secret via `Math.random`. Fix: `randomBytes`.
- [x] H7 `apps/dashboard/src/components/MarkdownRenderer.tsx:92-124` — `javascript:`/`data:` links render as `<a href>`/`<img src>`. Fix: scheme allowlist.

## Medium

- [x] M1 `modules/auth/service.ts:281,336` — refresh reuse = 401, no family revocation; `signOut` ignores owner. Fix: revoke family on reuse; assert owner.
- [x] M2 `modules/auth/service.ts:539` — `getMyPermissions` unscoped role-name match. Fix: scope by org.
- [x] M3 `apps/backend/src/index.ts:74,110` — CORS `!origin→true`, LAN allowed, credentials on. Fix: strict allowlist.
- [x] M4 `middleware/rateLimiter.ts:150` — org-only key, skips pre-auth, fail-open. Fix: per-IP bucket for auth, fail-closed.
- [x] M5 `modules/auth/workos.service.ts:24` + `routes.ts:34,42,54,62` — `redirectUri` unvalidated. Fix: allowlist vs `DASHBOARD_URL`.
- [x] M6 `modules/billing/routes.ts:188` → `service.ts:683` — `returnUrl` open redirect. Fix: origin check.
- [x] M7 `modules/cards/routes.ts:50-95` — unauth local upload + sniffable serve. Fix: auth + MIME allowlist + `nosniff`/`attachment`.
- [x] M8 `modules/cards/routes.ts:559`, `chat/routes.ts:483` — unbounded `fileName/fileType/sizeBytes`. Fix: `maxLength:255`, MIME enum, `0..25MB`.
- [x] M9 `modules/cards/service.ts:1082` — `updateCard` mass-assign `...rest`. Fix: `pick()` whitelist.
- [x] M10 `automations/routes.ts:31`, `forms/routes.ts:44`, `importers/schema.ts:9` — unbounded `t.Any()`. Fix: depth/size caps, `maxLength`, proto-key reject.
- [x] M11 `modules/organizations/service.ts:358` — invite tokens plaintext. Fix: `sha256` store/compare.
- [x] M12 `db/patch.ts:11,67` — logs full `DATABASE_URL`. Fix: redacted host.
- [x] M13 `modules/sso/service.ts:151` — SSO `state` predictable, never verified. Fix: `randomBytes` + TTL store + verify.
- [x] M14 `lib/email.ts:80` — `toName` header injection. Fix: strip `[\r\n"]`.
- [x] M15 `lib/s3.ts:65` — presigned PUT 1h, no constraints. Fix: 5min + content constraints.
- [x] M16 billing/search/cards missing `requirePermission`. Fix: add guards + private-card filter.

## Low

- [x] L1 `docker-compose.yml` — weak passwords, Redis no auth, `0.0.0.0` ports. Fix: `${VAR:?}` + `requirepass` + loopback.
- [x] L2 `lib/email.ts:62` — SMTP opportunistic TLS. Fix: `requireTLS` outside localhost.
- [x] L3 `modules/boards/routes.ts:63` → `Workspaces.tsx:701` — raw `background` into `style`. Fix: hex/`https:`-only.
- [x] L4 `.github/workflows/docker-build.yml` — `contents:write` + self-push loop. Fix: `contents:read` + bot guard.
- [x] L5 `db/seedOrganization.ts:628` — shared `Password123!`. Fix: gate non-prod + random passwords.

## Verified clean (no change)

Stripe webhook sig, refresh hash+CSPRNG, bcrypt, AES-GCM IV, no `dangerouslySetInnerHTML`, bound SQL params, `.env` untracked.

## Follow-up (accepted risk)

- [~] H2 RLS/`withOrgContext`: app-level org scoping verified per service
  (explicit `organizationId` filters + JWT membership check + WS resource
  checks). DB-level `FORCE RLS` deliberately NOT enabled: the app connects as
  the table owner and never sets `app.current_org_id`, so enforcing it now
  would return zero rows outage-wide. Path forward: route reads/writes through
  `withOrgContext`, then enable `FORCE RLS` on all 33 org-scoped tables and run
  app traffic as a least-privilege (non-BYPASSRLS) role.
- Test note: `sso/auth/org` suites have a pre-existing `afterAll` cleanup
  failure (`roles` FK blocks org delete; fails identically on base commit
  `31cd602`). Functional tests pass (incl. new hashed-token + WorkOS-code flows).

## Post-fix review (2026-09-28)

Re-audited all fixes for breakage/loopholes. Found and fixed:

- R1 calendar scheduling silently dropped by `updateCard` whitelist
  (`scheduledStart/End` re-added; internal caller).
- R2 local-dev uploads 401'd: dashboard `fetch(PUT)` sends no auth —
  added `uploadToPresignedUrl()` (Bearer only for same-origin buffer URLs,
  never for S3 signatures) and wired both upload call sites.
- R3 WS handshake skipped membership check (deactivated users kept sockets)
  — enforced at `open()`; presence actions already self-scoped.
- R4 webhook SSRF guard blocked dev `http://localhost` at DNS step while
  allowing it at scheme step — loopback now consistently allowed off-prod.
- R5 filename/column mismatches: presigned keys truncated to guard limit,
  `fileType` cap 100 to match DB columns, mint-time extension fail-fast.
- R6 `signOut` 500 on malformed userId — UUID-format guard.
- R7 new cross-tenant IDOR found in review: sprints/phases had zero org
  scoping (any authed user, any org, full CRUD by id) — project-join guards
  added, routes pass `organizationId`, unit-test callers unaffected (optional param).
- R8 mass-assignment spreads hardened to explicit picks in boards, orgs,
  projects, workspaces, stages, automations, webhooks, sprints, phases services.
- Verified live: prod boot refuses without secrets; prod CORS reflects only
  allowlisted origins; tampered JWT 401; SSRF metadata/LAN 400, legit https
  created+deleted; old SSO body-shape 422; refresh rotation/reuse-burn/
  owner-scoped signout proven against test DB; sign-in→me/search/billing 200.
- Residuals: SSO `state` optional (code exchange is the auth); pre-auth IP
  bucket is shared behind NAT (2rps/30burst); `billing_manager` maps to a
  nonexistent system role (pre-existing); sso/auth/org suites' `afterAll`
  cleanup FK failure is pre-existing on base `31cd602`.
