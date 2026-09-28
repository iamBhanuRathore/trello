# Security Audit — Boardly (2026-09-28)

Autonomous fix run. Each item below is fixed and committed separately.
Status legend: `[ ]` open · `[x]` fixed.

## Critical

- [ ] C1 `apps/backend/src/lib/env.ts:32-39` — hardcoded `JWT_SECRET`/`REFRESH_TOKEN_SECRET` defaults boot without secrets → token forgery. Fix: no defaults in production, reject placeholders.
- [ ] C2 `apps/backend/src/modules/sso/service.ts:194` — `processSSOCallback` trusts `{domain,email,name}` body, no IdP proof → account takeover. Fix: verify via WorkOS `authenticateWithCode`.
- [ ] C3 `apps/backend/src/modules/auth/workos.service.ts:136` — `mock_test_` bypasses WorkOS in all envs → JIT account. Fix: gate behind `NODE_ENV==='test'` only.

## High

- [ ] H1 `middleware/auth.ts:90` + `realtime/routes.ts:89`, `chat.gateway.ts:24`, `search/routes.ts:9` — JWT org claims trusted, no membership/status recheck; WS board/channel unchecked. Fix: membership check in `authPlugin`, per-action resource→org verify.
- [ ] H2 `db/index.ts:52` — `withOrgContext` unused; RLS on 3 tables only. Fix: deny-by-default RLS migration + helper adoption.
- [ ] H3 `modules/webhooks/service.ts:98` — `fetch(userUrl)` SSRF (metadata/internal). Fix: https-only + private-IP/DNS block + allowlist option.
- [ ] H4 `modules/calendar/google.ts:41` — `CALENDAR_TOKEN_KEY` falls back to `SHA256("")`. Fix: throw when unset.
- [ ] H5 `modules/sso/service.ts:66` — SCIM token `Math.random`, plaintext, `eq()` compare. Fix: `randomBytes`, store hash, constant-time compare.
- [ ] H6 `modules/git/service.ts:116` — webhook secret via `Math.random`. Fix: `randomBytes`.
- [ ] H7 `apps/dashboard/src/components/MarkdownRenderer.tsx:92-124` — `javascript:`/`data:` links render as `<a href>`/`<img src>`. Fix: scheme allowlist.

## Medium

- [ ] M1 `modules/auth/service.ts:281,336` — refresh reuse = 401, no family revocation; `signOut` ignores owner. Fix: revoke family on reuse; assert owner.
- [ ] M2 `modules/auth/service.ts:539` — `getMyPermissions` unscoped role-name match. Fix: scope by org.
- [ ] M3 `apps/backend/src/index.ts:74,110` — CORS `!origin→true`, LAN allowed, credentials on. Fix: strict allowlist.
- [ ] M4 `middleware/rateLimiter.ts:150` — org-only key, skips pre-auth, fail-open. Fix: per-IP bucket for auth, fail-closed.
- [ ] M5 `modules/auth/workos.service.ts:24` + `routes.ts:34,42,54,62` — `redirectUri` unvalidated. Fix: allowlist vs `DASHBOARD_URL`.
- [ ] M6 `modules/billing/routes.ts:188` → `service.ts:683` — `returnUrl` open redirect. Fix: origin check.
- [ ] M7 `modules/cards/routes.ts:50-95` — unauth local upload + sniffable serve. Fix: auth + MIME allowlist + `nosniff`/`attachment`.
- [ ] M8 `modules/cards/routes.ts:559`, `chat/routes.ts:483` — unbounded `fileName/fileType/sizeBytes`. Fix: `maxLength:255`, MIME enum, `0..25MB`.
- [ ] M9 `modules/cards/service.ts:1082` — `updateCard` mass-assign `...rest`. Fix: `pick()` whitelist.
- [ ] M10 `automations/routes.ts:31`, `forms/routes.ts:44`, `importers/schema.ts:9` — unbounded `t.Any()`. Fix: depth/size caps, `maxLength`, proto-key reject.
- [ ] M11 `modules/organizations/service.ts:358` — invite tokens plaintext. Fix: `sha256` store/compare.
- [ ] M12 `db/patch.ts:11,67` — logs full `DATABASE_URL`. Fix: redacted host.
- [ ] M13 `modules/sso/service.ts:151` — SSO `state` predictable, never verified. Fix: `randomBytes` + TTL store + verify.
- [ ] M14 `lib/email.ts:80` — `toName` header injection. Fix: strip `[\r\n"]`.
- [ ] M15 `lib/s3.ts:65` — presigned PUT 1h, no constraints. Fix: 5min + content constraints.
- [ ] M16 billing/search/cards missing `requirePermission`. Fix: add guards + private-card filter.

## Low

- [ ] L1 `docker-compose.yml` — weak passwords, Redis no auth, `0.0.0.0` ports. Fix: `${VAR:?}` + `requirepass` + loopback.
- [ ] L2 `lib/email.ts:62` — SMTP opportunistic TLS. Fix: `requireTLS` outside localhost.
- [ ] L3 `modules/boards/routes.ts:63` → `Workspaces.tsx:701` — raw `background` into `style`. Fix: hex/`https:`-only.
- [ ] L4 `.github/workflows/docker-build.yml` — `contents:write` + self-push loop. Fix: `contents:read` + bot guard.
- [ ] L5 `db/seedOrganization.ts:628` — shared `Password123!`. Fix: gate non-prod + random passwords.

## Verified clean (no change)

Stripe webhook sig, refresh hash+CSPRNG, bcrypt, AES-GCM IV, no `dangerouslySetInnerHTML`, bound SQL params, `.env` untracked.
