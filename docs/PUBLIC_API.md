# Public API, Inbound URLs & Outbound Integrations

Everything in this document is managed from **Admin → Integrations**
(`/admin/integrations`). The hub reuses two existing permissions:
`integration.manage` (API keys, inbound URLs, outbound integrations) and
`webhook.manage` (event webhooks).

---

## 1. Public REST API

Base URL: `https://<your-boardly-host>/v1/public`

Authentication — send either header:

```http
Authorization: Bearer bk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```http
x-api-key: bk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are created in **Integrations → API Keys**. The secret is displayed once;
Boardly stores only a SHA-256 hash. Revoking a key is immediate and keeps the
row for audit; deleting removes it permanently.

### Scopes

A key holds one row per module (`cards`, `boards`, `projects`, `comments`) with:

- `read` / `write` flags
- an optional field allowlist (`null` = every field the module exposes)
- an optional monthly hit limit (per module)
- an optional global monthly hit limit on the key

Required-on-create fields are always retained on write scopes.

Requests are rejected with **403** when the key lacks the scope, and with
**422** when a body contains unknown, read-only, or out-of-scope fields.
Reads only ever return allowed fields.

### Quotas

Counters reset at **00:00 UTC on the first of each month**. Exceeding a limit
returns **429** (with the same rate-limit headers so clients can back off).
Limited keys also receive:

```http
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1772409600
Retry-After: 1234567
```

### Endpoints

| Method | Path                                                          | Scope            |
| ------ | ------------------------------------------------------------- | ---------------- |
| GET    | `/public/whoami`                                              | any valid key    |
| GET    | `/public/cards?boardId=&listId=&updatedSince=&limit=&offset=` | `cards:read`     |
| GET    | `/public/cards/:id`                                           | `cards:read`     |
| POST   | `/public/cards`                                               | `cards:write`    |
| PATCH  | `/public/cards/:id`                                           | `cards:write`    |
| GET    | `/public/boards?projectId=`                                   | `boards:read`    |
| GET    | `/public/boards/:id`                                          | `boards:read`    |
| GET    | `/public/boards/:id/lists`                                    | `boards:read`    |
| POST   | `/public/boards`                                              | `boards:write`   |
| PATCH  | `/public/boards/:id`                                          | `boards:write`   |
| GET    | `/public/projects?workspaceId=`                               | `projects:read`  |
| GET    | `/public/projects/:id`                                        | `projects:read`  |
| POST   | `/public/projects`                                            | `projects:write` |
| PATCH  | `/public/projects/:id`                                        | `projects:write` |
| GET    | `/public/cards/:id/comments?limit=&offset=`                   | `comments:read`  |
| POST   | `/public/cards/:id/comments`                                  | `comments:write` |

Notes:

- `PATCH /public/cards/:id` with a new `listId` moves the card through the
  canonical move path, so positions, history and automations behave exactly as
  in the UI.
- Creating a card/board/project/comment or moving a card emits the same internal
  events as the UI, so event webhooks and outbound integrations fire.
- List responses are capped at 100 items; use `limit`/`offset`.
- Card list responses include `X-Total-Count`.
- `isArchived`, `isTemplate`, `boardId`, `projectId`, `userId`, timestamps and
  IDs are read-only. Structural references are immutable through PATCH: moving
  a board between projects or a project between workspaces, and changing a
  project key, return **422** instead of being silently ignored.
- `PATCH /public/projects/:id` accepts `startDate`/`endDate` (and `null` clears
  them).

### Error responses

| Status | Meaning                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ |
| 400    | Malformed request / invalid filter                                                         |
| 401    | Missing, invalid, expired, or revoked API key                                              |
| 403    | Key is valid but lacks the required module scope                                           |
| 404    | Record not found **in this organization**                                                  |
| 413    | Payload exceeds the size limit                                                             |
| 422    | Validation failed (unknown/read-only/out-of-scope field, bad type, missing required field) |
| 429    | Monthly quota exceeded                                                                     |
| 500    | Unexpected server error                                                                    |

Errors use:

```json
{
  "error": "Human-readable message",
  "details": { "code": "SCOPE_DENIED", "module": "cards", "action": "write" }
}
```

All resources are organization-scoped: an ID from another tenant behaves as
not found.

---

## 2. Inbound webhook URLs

Create a URL per source under **Integrations → Inbound**. The URL embeds a
capability token:

```text
https://<your-boardly-host>/v1/public/inbound/binw_xxxxxxxxxxxxxxxxxxxx
```

- `POST` a JSON object. Max body size **256 KB**.
- Optional `Idempotency-Key` header: a repeat with the same key returns the
  original entity (`200`, `"idempotent": true`) instead of creating a duplicate.
  The key is claimed before the entity is created, so two concurrent retries
  cannot both insert; the loser receives **409** while the first is still in
  flight, and a replay of a failed request returns its recorded error status.
- Unknown payload fields are ignored (form tools add noise). Known but
  read-only fields (`id`, `boardId`, …), invalid values or missing required
  fields return **422**.
- Disabled endpoints return **403**; unknown/revoked tokens return **401**.
- Token hashes are stored at rest; the token is sealed (AES-256-GCM) so the URL
  can be re-displayed to admins.

Targets and their defaults:

| Target   | Required payload      | Default reference          |
| -------- | --------------------- | -------------------------- |
| Cards    | `title`, `listId`     | optional default list      |
| Boards   | `name`, `projectId`   | optional default project   |
| Projects | `name`, `workspaceId` | optional default workspace |
| Comments | `body`, `cardId`      | optional default card      |

Example:

```bash
curl -X POST "$INBOUND_URL" \
  -H 'content-type: application/json' \
  -H "Idempotency-Key: form-123" \
  -d '{"title":"Website request","description":"From the contact form"}'
```

Response:

```json
{ "id": "uuid", "type": "cards" }
```

Every request (success or failure) is recorded in delivery history; the endpoint
tracks hits, last used time and last status code.

---

## 3. Outbound integrations

**Integrations → Outbound** pushes Boardly events to a CRM or internal API.

Each integration defines:

1. **Source module + triggers** — `card.created`, `card.updated`, `card.moved`,
   `card.archived`, `card.commented`, `card.assigned`, `card.labeled`,
   `board.created`, `board.updated`, `project.created`, `project.updated`.
   `card.moved` supports an optional list/stage filter.
2. **Data call** — URL, method (`POST`/`PUT`/`PATCH`), headers, and an optional
   body template. Without a body template the mapped JSON payload is sent.
3. **Auth call (optional)** — URL, method, headers, body, token path, optional
   second token path, and cache TTL. The extracted token is cached per
   integration until the TTL expires.
4. **Field mappings** — each row maps a target JSON path to:
   - `crm_field`: a source field (`title`, `dueDate`, …),
   - `static`: a literal (numbers/booleans/null are coerced),
   - `auth_token`: `{{auth_token}}` or `{{auth_token_2}}`.

   Optional date formats: ISO 8601, date only (`YYYY-MM-DD`), Unix seconds,
   Unix milliseconds. Target paths support arrays (`items[].rate`). Paste a JSON
   schema to generate target rows automatically.

5. **Success check (optional)** — a response path and expected value. A
   mismatch marks the run failed even when HTTP is 2xx.

### Delivery semantics

- Network errors and `5xx` responses retry **twice** with backoff; `4xx` and
  success-check failures do not retry.
- Timeouts are 10 seconds per attempt.
- Every run is stored (30-day retention) with event, entity, stage, response
  status, duration and error. The integration shows last status/run.
- `Send test` dispatches against the newest matching record so you can verify
  mappings before enabling real traffic.
- URLs are SSRF-checked at save **and** on every hop: HTTPS only (plain HTTP
  only for loopback when `ALLOW_HTTP_WEBHOOKS=1`), no credentials in URLs, no
  private/internal addresses, max 3 redirects.

Auth and data configs are sealed with AES-256-GCM (`enc:v1:`); the dashboard
decrypts them only for admins with `integration.manage`.

---

## 4. Event webhooks (unchanged contract)

Event webhooks remain the simple signed fan-out: Boardly POSTs
`{ event, payload, actorId, timestamp }` with an HMAC-SHA256 signature header to
every subscribed URL. Use them for one-way notifications; use outbound
integrations when you need auth, field mapping, or success checks.
