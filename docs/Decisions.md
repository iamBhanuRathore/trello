# DECISIONS.md — Architecture Decision Records

Short log of significant technical decisions: what was decided, why, and what alternatives were rejected. Append new entries at the top (most recent first). Keep each entry short — a paragraph or two, not an essay. The goal is answering "why did we choose X?" a year from now without re-deriving it.

**When to add an entry:** any decision that would be annoying to re-litigate later — framework/library choices, data model trade-offs, security/multi-tenancy approach, anything a future session might otherwise "helpfully" second-guess and change without knowing why it was picked.

---

## Template for new entries

```
### YYYY-MM-DD — Short title of the decision

**Context:** What problem/question prompted this decision.

**Decision:** What was chosen.

**Alternatives considered:** What else was on the table, and why they were passed over.

**Consequences:** What this makes easier/harder going forward.
```

---

## Entries

### 2026-09-25 — Calendar Write UX: Popovers over Modals, Scoped Google Writes

**Context:** The calendar needed detail views, quick-create, and rescheduling of Google meetings. Two choices: full modals vs anchored popovers, and how far Google-write permissions should reach.

**Decision:**

1. **Popovers, not modals:** event details and quick-create render in viewport-clamped portal popovers (Escape/outside-click dismissal, same convention as card hover previews). A modal would steal context on a dense grid; the popover keeps the time slot visible while acting.
2. **Google writes stay user-scoped:** create/patch/delete act only on the connector's own calendar via stored refresh tokens — never service-wide. Pushed task links store `html_url` so tasks can deep-link back to Google.
3. **Press-then-drag:** click selects (popover), 5px movement promotes to drag. Distinguishes inspection from rearrangement without modifier keys, matching Google Calendar.

**Alternatives considered:** Full CardModal-style dialogs for event details (rejected — overkill, loses grid context); Google push webhook channels for instant inbound sync (rejected — needs public HTTPS; polling + instant push covers v1, same call as before).

**Consequences:** All calendar interactions complete without leaving the grid. Outlook later copies the same three endpoints.

### 2026-09-25 — GitHub Automations via Webhooks (No API Dependency)

**Context:** 4.3 wanted repo sync, ticket auto-linking, PR-driven card movement, and review badges. A full GitHub App (private keys, JWT, installation tokens, Octokit) is heavy ops for v1; polling the REST API is rate-limited and latent.

**Decision:** pure webhook ingestion. GitHub POSTs push/PR/review payloads (already containing commits, titles, branch refs, states) to a public HMAC-verified endpoint; everything derives from payload data. Ticket keys parsed from branch/commit/PR text; stage moves resolve the org's first `in_progress`/`done` category stage; comments authored by a dedicated no-login bot user; per-repo secrets AES-GCM sealed. Same-repo-multi-org fan-out with any-secret-verifies routing.

**Alternatives considered:** GitHub App + Octokit (rejected for v1 — webhook payloads already carry every field the features need; add when check-runs or file contents are required); polling cron (rejected — latent, rate-limited).

**Consequences:** Zero GitHub API surface, near-instant automation, works on any plan tier. GitLab follows the same shape (different HMAC header + payload mapping). Webhook secrets must be saved at connect time (shown once).

### 2026-09-24 — Google Calendar Sync + Time-Blocking (Direct API, Motion/Cron Parity)

**Context:** Roadmap 4.1 demanded calendar views, drag time-blocking, 2-way provider sync, and sprint/milestone overlays. The build-vs-integrate choice: full custom sync engine vs Google Calendar API directly.

**Decision:**

1. **Google API for sync, owned UI for views:** `googleapis` on the backend (`modules/calendar/`: `google.ts` OAuth + AES-GCM token crypto, `service.ts` sync/feed, `routes.ts`); hand-rolled Month/Week/Day grids on the frontend (zero date libs beyond `date-fns`, matching the hand-rolled SVG chart convention). No FullCalendar — bundle + theming cost for what pointer math covers.
2. **Per-user connections, not org integrations:** OAuth consent is personal, so `calendar_connections` is user-scoped with unique `(user_id, provider)`; refresh tokens AES-GCM encrypted (`CALENDAR_TOKEN_KEY`). The existing org `integrations` mock catalog was left untouched.
3. **Scheduling lives on cards:** `scheduled_start`/`scheduled_end` columns + `PATCH /calendar/cards/:id/schedule` (validates, reuses `updateCard`, best-effort push to actor's Google). Event links tracked in `calendar_event_links` for upsert/delete.
4. **Incremental pull, on-demand push:** syncToken-based incremental pull when un-ranged (410 → one full re-pull); push on schedule + manual "Sync now". Google push webhooks deferred (needs public HTTPS channel setup — polling + instant push covers v1).
5. **Outlook deferred:** same connection/sync pattern will apply; Roadmap bullet split to track it separately.

**Alternatives considered:** FullCalendar (rejected — bundle/theming); WorkOS-proxied Google tokens (rejected — direct OAuth gives proper `calendar.events` scope + refresh tokens); syncing via org-level service account (rejected — per-user consent matches Google's model and avoids domain-wide delegation setup).

**Consequences:** 4.1 done except Outlook. Any new provider copies `google.ts` + connection row. Server is "configured" only when `GOOGLE_CLIENT_ID/SECRET` + `CALENDAR_TOKEN_KEY` are set; UI degrades to local-only scheduling otherwise.

### 2026-09-24 — Channel→Project Activity Feed & Chat File Uploads (Slack Parity)

**Context:** Roadmap 4.2 had one open bullet (channel-to-project linking with automated activity feed), and chat attachments were half-wired: `sendMessage` accepted `attachmentIds` but nothing created `chat_attachments` rows and the composer had no attach button. Two latent gaps surfaced along the way: migration `0017_chat_reply_to.sql` shipped without a journal entry (fresh DBs via `db:migrate` silently skip it), and bare `bun run db:migrate` migrates whatever `DATABASE_URL` resolves to rather than the documented dev DB.

**Decision:**

1. **Linking:** `chat_channels.project_id` FK (`ON DELETE SET NULL`, migration `0018`), link/unlink endpoints restricted to channel Owner/Admin with same-org project verification; DMs rejected with 400 (checked before the admin gate so the guard is reachable — DM members are never admins). `getChannelDetails` embeds `{id, name, key}`.
2. **Activity feed as system messages:** `chat_messages.is_system` flag rendered as centered pills (hover actions hidden). `postSystemMessage` bypasses announcement-only mode so automation feedback always lands; `notifyProjectChannels` fans card created/moved/archived events to linked channels. Cards-service hooks are fire-and-forget (`.catch(() => {})`) — feed must never break mutations.
3. **Uploads:** `chat_attachments.message_id` nullable + `channel_id`/`uploaded_by` (backfilled from messages); `POST /channels/:id/attachments` returns presigned URL + staged row, composer uploads then sends ids. `sendMessage` link scoped to same channel (previously any attachment id could be hijacked cross-channel). `generatePresignedUploadUrl` gained an optional key-scope param (`chat/<channelId>` vs default `cards/<cardId>`); local-dev fallback endpoints are key-agnostic.
4. **Migrations:** retro-journaled 0017 (idempotent, safe) and journaled 0018, so `db:migrate` covers fresh environments.

**Alternatives considered:** Separate activity table (rejected — feed already renders the message stream; new table = new API + migration for identical UX); blocking/transactional feed writes (rejected — chat outage must not break card mutations).

**Consequences:** 4.2 fully complete. Rule: every new `chat_*` migration must carry a journal entry; verify target DB after `db:migrate` when `DATABASE_URL` is implicit.

### 2026-09-15 — Universal LIFO Escape Stack & Cross-Platform Keyboard Shortcuts

**Context:** Users required full keyboard accessibility matching Slack, Linear, and Microsoft Teams: pressing Escape should predictably dismiss active modals and drawers without closing underlying surfaces, and common productivity keybindings (command palette, shortcuts cheatsheet, channel navigation, and Up-arrow editing) were needed for daily operations.

**Decision:**

1. Implemented a capture-phase Last-In-First-Out (LIFO) stack in `packages/ui/src/components/dialog.tsx` and `apps/dashboard/src/hooks/useEscapeKey.ts`. When Escape is pressed, only the topmost active modal/drawer pops, preventing multi-modal cascade closures.
2. Built a searchable `KeyboardShortcutsModal.tsx` accessible via `?` (Shift+/) or `⌘/` / `Ctrl+/`.
3. Created `useGlobalShortcuts.ts` to manage non-input chords (`G` then `C` for Chat, `G` then `B` for Boards, `G` then `T` for Tasks), channel cycling (`Alt+↑`/`Alt+↓`), and quick creation hotkeys.
4. Implemented Up-arrow message editing in `ChatFeed.tsx` and `ChatMessageCard.tsx` when the composer is empty.

**Alternatives considered:** Native bubbling listeners (rejected — form inputs and nested dialogs often stopped bubbling or closed simultaneously); third-party hotkey libraries (rejected — lightweight custom hooks avoid bundle bloat and integrate natively with React 19).

**Consequences:** Rock-solid modal dismissal order across stacked dialogs and drawers; zero mouse dependency for common day-to-day collaboration tasks.

### 2026-09-14 — Board page aggregate + loading states (kills board N+1)

**Context:** Board page (`/b/:id`) fired 1× board + 1× lists + N× `cards?listId` (each with 6 enrichment queries) via `useEffect`, with no `isLoading`/skeleton/error/empty states — blank UI while fetching.

**Decision:** `GET /v1/boards/:id/full` returns `{board, lists:[{...list, cards:[enriched]}]}` in ~8 Neon queries, cached as one payload under existing `bv:{board}` (`boardfull` scope) so all current bumps invalidate it. `BoardView.tsx` uses single `['board','full',id]` query (`staleTime 30s`) with skeleton columns, error+retry, and empty-list states; mutations invalidate the full key.

**Alternatives considered:** Per-list `listCards` cache only (kept — still serves other surfaces, but first board load still paid N× Neon misses).

**Consequences:** Board loads skip Neon on hit (1 Upstash RTT); miss cost unchanged (~8 queries once per 60s).

### 2026-09-14 — Aggressive breadth caching + workspaces tree (free-tier latency)

**Context:** Workspaces page fired 18 requests (2× `/me` ~1s, 5× `projects?ws` up to 1.42s, 8× `boards?project` up to 1.03s) against Neon free + Upstash free. Per-request Neon RTT dominated.

**Decision:** Cache breadth, not TTL length: `ov/wv/pv` versions (`cachedOrgRead/WorkspaceRead/ProjectRead`, 60-120s) for workspaces/projects/boards/getBoard/labels; TTL-only (`cachedTTL`) for `getMe` 60s, notifications 20s, prefs/push/saved 60s, search 30s, members 30s, org 60s. New `GET /v1/workspaces/tree` returns workspaces→projects→boards in 3 queries cached as one payload (60s); dashboard `Workspaces.tsx`/`AppSidebar.tsx` use it with `staleTime 30s`, eliminating N+1. Fixed stale gaps first: board/label/list-rename/list-delete/subtask-parent/trash bumps.

**Alternatives considered:** Longer TTLs (rejected — stale-board risk); per-endpoint caching only without tree (kept as fallback, but 13 Upstash RTTs still cost vs 1).

**Consequences:** Repeat loads skip Neon (1 Upstash RTT ~50-100ms); mutations pay version bumps; 20-60s stale windows on inbox/search/members (documented); free Upstash stays <256MB via short TTLs, no SCAN.

### 2026-09-13 — Upstash read cache (versioned, 1-RTT reads)

**Context:** Neon free tier makes every DB round-trip ~100-300ms from IN; a card open fires ~10 requests × (permission join + N queries). Upstash Singapore chosen (closest to user + Neon SG).

**Decision:** `lib/cache.ts` versioned read-through cache: board version `bv:{board}` scopes `listLists`/`listCards`, card version `cv:{card}` scopes `getCard`; reads are 1 Redis RTT via Lua (version+payload); mutations bump versions (card→board map with DB fallback, no SCAN). RBAC allows cached 60s (denials never), plan tier TTL 60→300s, rate-limiter Redis timeout 50→400ms for remote RTT. Fixed `z.coerce.boolean` silently disabling Redis on `"false"`, Upstash auto-TLS, credential redaction in logs.

**Alternatives considered:** TTL-only caching (stale-board risk on drag-move); batch card endpoint (still recommended next — cache shrinks each request, batching shrinks count).

**Consequences:** Repeat reads skip Neon entirely; 60s stale-allow window after role changes (documented); mutations pay ~2 Redis RTTs for bumps.

### 2026-09-13 — Dev boot seed: skip-when-complete + batched base seed

**Context:** `dev.sh` runs `db:seed` on every boot; it replayed the full enterprise seed (~3-4 min, thousands of sequential auto-commit statements over Docker fsync) and grew append-only log tables (time/audit/activity have no conflict guard) on every boot.

**Decision:** (1) `seedFullOrganization()` fast-path: skip when `acme-corp` has 50 members + cards (<1s); `--force` replays. (2) Base seed batched: multi-row permission insert, one DELETE with IN-subquery for Member revoke, one INSERT..SELECT per role (was ~500 sequential statements → ~10). 3:44 → ~4s. Same final state (verified counts 95/82/22/7).

**Alternatives considered:** Wrapping seed in one transaction (bigger change, lock risk); removing seed from `dev.sh` (loses first-boot provisioning).

**Consequences:** Dev deletions of seed data now survive reboots; `db:seed:org --force` or `db:reset` restores full seed. Noticed but untouched: `org.delete` duplicated in `ALL_PERMISSION_KEYS` (95 unique of 96).

### 2026-09-13 — Query perf via indexes + Promise.all, no endpoint changes

**Context:** Board load fired 5x `GET /cards?listId` at 3-5s each and login cascades at ~500ms-1.6s on localhost. EXPLAIN showed `Seq Scan` on every FK filter (only PKs/unique constraints indexed); each request also paid 6-8 sequential DB round-trips plus per-request auth/permission/rate-limit overhead.

**Decision:** (1) Additive index migration `0015` (47 indexes on FK/sort/user-lookup columns) — no table rewrites, applies via normal CI auto-migrate. (2) Fan out independent awaits with `Promise.all`, keeping queries and return shapes byte-identical. (3) Escape `%_\\` in LIKE terms + early-return empty search. Deferred: batch endpoints, result limits, `pg_trgm`, permission caching.

**Alternatives considered:** New batch endpoints (`cards?boardId=`) would cut round-trips further but change API + frontend; limits/pagination would change contracts. Saved for a follow-up with frontend coordination.

**Consequences:** Same API, fewer round-trips per request (e.g. `listCards` 8→2 sequential hops), index scans once tables grow. FK-ordered deletes stay sequential where constraints require it (items-before-checklists).

### 2026-09-09 — Shared DatePicker replaces all native date inputs

**Context:** Every date field used `<input type="date">`, whose popup is OS/browser chrome that ignores theming entirely (the broken-looking calendar in the report) and behaves inconsistently across browsers.

**Decision:**

1. New `DatePicker` in `@boardly/ui` (Base UI Popover + Portal + Positioner, same pattern as the menu/tooltip primitives): Monday-first ISO grid, month nav, Today/Clear footer, min/max bounds, clear button, `required` asterisk, full keyboard/ARIA wiring. Zero new dependencies (hand-rolled month math). Same `YYYY-MM-DD` string contract as the native inputs.
2. Swapped all 8 usages: task Deadline, worklog Date, composer Due Date, board inline-composer date, sprint start/end (end bounded by start via `min`), phase start/end. Sprint create is now disabled until both required dates are set (replacing the lost native `required` gate).

**Alternatives considered:** `react-day-picker` (rejected — dependency + styling override work for what ~200 lines of owned code covers, consistent with the hand-rolled SVG chart call).

**Consequences:** No native date popup remains in the dashboard (verified by grep). Any new date field uses `DatePicker` from `@boardly/ui`.

### 2026-09-09 — Subtask badge source fix, borderless checklist rename, tooltip stuck-instant bug

**Context:** (1) New subtasks showed "Completed" — `listSubtasks` never joined `lists`, so `listName` was always undefined and the `|| 'Completed'` fallback lied. (2) Checklist rename swapped the header for an input + Save/Cancel row (layout shift, cramped). (3) Tooltips still felt instant despite the 500 ms standard.

**Decision:**

1. `listSubtasks` now joins `lists` and returns real `listName`; frontend fallback changed to `card?.listName || 'To Do'` so no missing value can ever render as "Completed" again.
2. Checklist rename is Trello-style borderless: click title → inline input in place (progress bar stays), `Enter` saves, `Escape`/blur cancels. No buttons, no layout shift.
3. Root-caused the fast tooltip: `GlobalTooltip`'s skip-delay flag was only reset on `mouseout` — hiding via scroll/mousedown left instant-show stuck on permanently. All hide paths now reset the 300 ms grace window.

**Alternatives considered:** Frontend-only badge fallback to parent column (rejected — masks the missing join; real data is one join away).

**Consequences:** Status pills are truthful by construction; tooltip timing is now actually 500 ms in all paths.

### 2026-09-09 — Composer width, checklist placeholder, required-field convention (RHF deferred)

**Context:** Composer felt cramped at `max-w-xl`; the multi-line checklist placeholder renders collapsed/misleading in browsers (placeholder text cannot contain line breaks); and nothing marked Task Title as mandatory.

**Decision:**

1. Dialog `max-w-xl` → `max-w-3xl`; checklist textarea single-line placeholder + `rows={4}` (live checkbox preview below already teaches the one-per-line format as they type).
2. Required-field convention (new `RequiredMark` in the composer): red `*` + sr-only "(required)", muted "Required" hint under the field, `aria-required`/`aria-invalid`, inline `role="alert"` error on submit attempt. Submit stays clickable so the error can surface (with explanatory tooltip), instead of a dead disabled button.
3. React Hook Form evaluated and **deferred**: this form has one required field and no cross-field rules — controlled state + inline error covers it with zero bundle cost. Graduate to RHF + zod when a form exceeds ~5 fields or needs cross-field/async validation; `RequiredMark`-style marking applies everywhere regardless.

**Alternatives considered:** Adding RHF now for uniformity (rejected — dependency + refactor cost with no validation problem to solve yet); native `required` bubbles (rejected — inconsistent styling, no custom messaging).

**Consequences:** Any new form copies the asterisk + inline-error pattern; RHF adoption has a clear trigger threshold.

### 2026-09-09 — Composer dialog space + live checklist preview, subtask popup-only

**Context:** The enriched composer felt cramped at `max-w-xl`, typed checklist lines had no visual confirmation (raw textarea only), and the task view still kept a redundant inline subtask input next to the Full Editor path.

**Decision:**

1. Dialog widened to `max-w-2xl`; Participants/Observers paired side-by-side in a 2-col grid.
2. Checklist section gained a live preview: each parsed line renders as a checkbox row with position counter and hover-remove (removal edits the source text, so preview is always truthful).
3. Inline subtask input deleted entirely — header + Add and all menu entries open the composer popup directly; dead state/mutations (`addSubtaskMutation`, inline title/assignee state) removed with it.

**Alternatives considered:** Tabs/wizard steps in the composer (rejected — single scrolling form with grouped sections matches Jira and keeps everything one submit); keeping inline quick-add alongside (rejected — two paths doing the same job caused the original "still broken" confusion).

**Consequences:** One subtask creation path. Composer sections now own the full creation surface.

### 2026-09-09 — Server-side member search for all composer dropdowns

**Context:** Assignee/participant/observer dropdowns rendered a fully-downloaded org directory (`GET /orgs/:id/members` with no limit) and filtered client-side — breaks at thousands of employees (payload, memory, DOM rows). Backend already supports `search`/`limit`/`offset` + `X-Total-Count`; `MemberPicker` already used it, but the composer selects did not.

**Decision:**

1. `packages/ui/searchable-select`: backward-compatible async props — `onSearchChange` (disables client filtering, forwards keystrokes), `onReachEnd`/`isLoadingMore` (infinite scroll), `isLoadingOptions`, `footer`. No existing consumer affected (all optional).
2. Dashboard `useOrgMemberSearch` hook: 250 ms debounce + `useInfiniteQuery` (25/page) + 2-min stale / 5-min gc caching, mirroring `MemberPicker`.
3. `AsyncMemberSearchableSelect` (single, You + Unassigned pinned, pinned-id resolution, "N of M" footer) and `AsyncMemberChipPicker` (multi, search box, selections pinned on top) in `components/ui/AsyncMemberSelect.tsx`.
4. Composer uses async variants whenever `orgId` is known (both call sites pass it); removed BoardView's unbounded `getMembers` fetch that existed only for the modal. Static-array fallbacks stay for callers without org context.

**Alternatives considered:** Extending `MemberPicker` popovers into the dialog (rejected — popover-in-dialog stacking/focus issues; chips + async select fit the form better); raising the fetch limit (rejected — just moves the cliff).

**Consequences:** Composer member traffic is now ~25-row cached pages + debounced search. Rule going forward: no unbounded directory fetch for any dropdown (PROMPT_PATTERNS.md §9 audit).

### 2026-09-09 — Shared subtask composer with locked parent (Jira benchmark)

**Context:** Subtask creation was a title-only inline form (assignee defaulted silently, no description/dates/estimates), which is why it felt "broken" next to the full task composer. Benchmark: Jira's create-subtask dialog — full field set with the parent fixed.

**Decision:**

1. Extracted `CreateTaskModal` from `BoardView.tsx` into `components/board/CreateTaskModal.tsx` (zero behavior change for board usage) with `parentCardId`/`parentCardTitle` props: subtask mode shows a locked "Parent Task" row, retitles to "Create Subtask", and posts `parentCardId` (already supported by `POST /cards`).
2. Task detail subtask form gained a "Full Editor" button opening the composer with parent = current task, column = current column, typed title carried over; on create it refreshes subtasks and opens the new subtask. Modal is `React.lazy` in both call sites (own 5.7 kB chunk).
3. Quick inline add stays for rapid entry; full composer covers description, assignee, due date, story points, estimates.

**Alternatives considered:** New standalone subtask page/route (rejected — modal keeps context; Jira/Linear both use dialogs); duplicating the composer in TaskDetailView (rejected — shared component, one source of truth).

**Consequences:** Board and subtask creation share one composer going forward — field additions apply to both.

### 2026-09-09 — Event-sourced task history for people/label/watcher changes

**Context:** The activity feed showed "X is now an observer" but never "stopped watching" — observer entries were synthesized on the frontend from the _current_ watchers list, so deleting the row erased the event. Audit found the same gap class everywhere: assign/unassign, participant add/remove, label attach/detach, and unwatch wrote no history rows at all (only checklist ops did, via `comments`-channel entries).

**Decision:**

1. All 8 mutations now write persistent `comments`-channel history rows in the existing emoji style (`👀` watch, `👤` assignee, `🤝` participant, `🏷️` label), fire-and-forget (`.catch(() => {})`) so history never breaks the mutation. Self vs. admin-acted wording handled (`Started watching` vs. `Added **Name** as an observer`). Actor threaded through routes; automation callers already pass `actorId`.
2. Frontend `systemActivities` no longer synthesizes watcher entries (would duplicate the persistent rows); `isActivityComment` recognizes the 3 new emoji prefixes so they render as history pills with the existing verb-lowercasing.
3. `card.test.ts` watch test extended to assert both history rows exist.

**Alternatives considered:** Separate `activity_log` table reads for the feed (rejected — feed already renders the comments channel; new table = new API + migration for identical UX); keeping frontend synthesis alongside backend rows (rejected — duplicates every watch).

**Consequences:** History is now append-only and complete for people/label/watcher events. Rule going forward: any new card mutation must write a history row (add to the `PROMPT_PATTERNS.md` §9 audit).

### 2026-09-09 — Enterprise interaction standard + checklist input/save fixes

**Context:** Two checklist UX defects showed features shipping below market standard: (1) the section Save button was always enabled but a silent no-op when nothing was pending (everything auto-saves instantly); (2) the add-item field was single-line, so `Shift+Enter` couldn't create new lines. Standing rule added as `AGENTS.md` §7: every feature must match Linear/Jira/Notion interaction quality — never a minimal local-product implementation.

**Decision:**

1. Checklist add-item `<Input>` → auto-growing `<textarea>`: `Enter` saves, `Shift+Enter` newline, `Escape` cancels, IME-composition guard. Benchmark: Notion/Linear comment editors. Multi-line submit reuses the existing bulk-add split path, so pasted/typed lines still fan out into separate items.
2. Section Save is now dirty-tracked (`hasPendingChecklistChanges` over new-checklist form, item text, title edit, draft items, dirty description): disabled with explanatory tooltip when pristine, and now also flushes a typed new-checklist title.
3. `PROMPT_PATTERNS.md` §§3–4, 9 updated so all future build/audit prompts enforce the standard.

**Alternatives considered:** Keeping single-line + documenting "paste lines to bulk add" (rejected — typing multi-item lists is core checklist behavior in every competitor); hiding Save when pristine instead of disabling (rejected — disabled-with-tooltip teaches the auto-save model better).

**Consequences:** Checklist section is now the reference implementation for §7. Rule going forward: no enabled button that silently does nothing; no single-line input where competitors allow multi-line.

### 2026-09-09 — Dashboard route-level code splitting (React.lazy + manualChunks)

**Context:** `apps/dashboard/src/App.tsx` static-imported all ~30 pages, so every user downloaded the entire dashboard (BoardView's dnd-kit tree, reports, docs, all admin screens) on first load.

**Decision:**

1. Every route page is `React.lazy`-loaded (`.then(m => ({ default: m.X }))` mapping since pages use named exports) under a single `<Suspense fallback={<RouteFallback />}>` in `App.tsx`. Layouts stay eager (persistent shell).
2. Heavy on-demand modals are split too and mount only when opened: `CardModal`/`AutomationsModal`/`FormBuilderModal` in `BoardView.tsx`, `TrashBinModal`/`AppearanceModal` in `DashboardLayout.tsx`, `AppearanceModal` in `AdminLayout.tsx`. Shared fallback: `components/common/RouteFallback.tsx`.
3. `vite.config.ts` adds stable `manualChunks` (`vendor-react`, `vendor-query`, `vendor-dnd`, `vendor-ui`) so third-party code stays cached across deploys while route chunks change independently.
4. Convention locked in `docs/PROMPT_PATTERNS.md` §4: new pages MUST be lazy-registered, never static-imported.

**Alternatives considered:** Per-route `<Suspense>` wrappers (rejected — one wrapper covers all routes with less boilerplate); eager layouts split too (rejected — shell flickers on every navigation); leaving modals eager (rejected — CardModal pulls the heaviest board dependency tree).

**Consequences:** Initial bundle is shell + current route only; new pages automatically get their own chunk if the author follows §4. Rule going forward: `App.tsx` must never contain a static page import — flag it in review (PROMPT_PATTERNS.md §9 audit).

### 2026-09-09 — Shared enums as const objects + Eden Treaty end-to-end types

**Context:** Wiring Eden Treaty (`treaty<App>`) in the dashboard pulled backend sources into a program with `erasableSyntaxOnly`, where `packages/shared-types` runtime `enum`s are illegal (15x TS1294). Bun also installs one `elysia` copy per peer graph, and Elysia's private fields made cross-copy `App` fail treaty's constraint (TS2344).

**Decision:**

1. `packages/shared-types/src/enums`: all 15 `enum`s → `const` object + union type (same names/values; runtime shape byte-identical to old string enums, `z.nativeEnum` untouched). Locked by DB-free `apps/backend/src/db/enums.test.ts` asserting shared values mirror Drizzle `pgEnum` sets.
2. Dashboard `tsconfig.app.json` pins type-resolution `elysia` → backend copy (single-copy rule; runtime bundling unaffected).
3. Dashboard `src/lib/eden.ts` is now `treaty<App>` (`import type { App }` from `@boardly/backend`); axios client stays for existing calls + token refresh.
4. Fixed 4 trivial backend lints exposed by the stricter cross-program check (`import type` x3, one unused import) — backend `typecheck` is now fully green.

**Alternatives considered:** Relaxing dashboard `erasableSyntaxOnly` (rejected — deliberate strictness); generated `.d.ts` contract package (rejected — drift surface for what source imports already solve); untyped `treaty()` client (rejected — loses the autocomplete/type errors this migration was for).

**Consequences:** Frontend gets compile-time API drift detection (wrong query key = type error). Rule going forward: never reintroduce `enum` in `shared-types`; keep `elysia`/`@elysiajs/eden` versions in sync across backend + dashboard. Route body schemas live in per-module `schema.ts` with exported `Static` types — dashboard annotates Eden payloads with them so completions work even on older TS language servers (verified on 5.9.3), which can't expand Eden's deep conditional body types inline.

---

### 2026-09-02 — K8s Deployment, Helm GitOps & Multi-Tenant Isolation Architecture

**Context:** Boardly backend needed enterprise-grade containerization, horizontal autoscaling on AWS EKS, zero-downtime deployment pipelines with GitOps/ArgoCD, multi-tenant noisy neighbor isolation, RDS Proxy transaction pooling compatibility, and Row-Level Security (RLS) enforcement.

**Decision:**

1. **Container & CI/CD**: Multi-stage Bun 1.2 Alpine image (`apps/backend/Dockerfile`) bundled with Drizzle migrations. GitHub Actions pipeline (`.github/workflows/docker-build.yml`) builds immutable SHA-tagged images and updates GitOps Helm values.
2. **Helm & Kubernetes**: Authored complete Helm chart (`infra/helm/boardly-backend/`) with RollingUpdate (`maxSurge: 1, maxUnavailable: 0`), `securityContext` (`readOnlyRootFilesystem: true`, non-root bun user, all capabilities dropped), `topologySpreadConstraints` across nodes, HPA (3-20 replicas with 300s scale-down stabilization), PDB (`minAvailable: 2`), ExternalSecrets (AWS Secrets Manager), cert-manager TLS Ingress with per-IP rate limiting, and pre-upgrade migration Job hook.
3. **Multi-Tenant Rate Limiting & Concurrency Quota**: Created atomic Redis Lua token-bucket rate limiter (`rateLimiter.ts`) enforcing plan-tier RPS/burst caps with a 50ms hard timeout and fail-open policy (`rate_limiter_fail_open_total` alert metric). Created heavy-endpoint concurrency semaphore (`tenantQuota.ts`) with `HOLD_TTL_SECONDS: 300` safety net.
4. **Database & RLS Layer**: Configured `prepare: false` across postgres clients for RDS Proxy / PgBouncer transaction pooling safety. Implemented `withOrgContext()` enforcing `SET LOCAL app.current_org_id` with 3-second read-after-write Redis TTL markers for monotonic read consistency. Added RLS migration (`0012_enable_row_level_security.sql`) and lint rule (`scripts/lint-raw-db.ts`).
5. **Graceful Draining**: Implemented in-flight request tracking with 25-second drain window on `SIGTERM` / `SIGINT` before closing Redis and Postgres pools, paired with K8s 45s `terminationGracePeriodSeconds` and `preStop: sleep 5`.

**Alternatives considered:** Self-hosted PgBouncer pod sidecars (rejected — AWS RDS Proxy provides fully managed pooling and failover); fail-closed rate limiter (rejected — Redis outage should degrade fairness rather than bring down API availability); in-memory per-pod rate limiting (rejected — Bun has no cluster module and per-pod counters scale 20× incorrectly across pods).

**Consequences:** Backend is horizontally scalable up to 20+ pods with full tenant isolation, predictable GitOps releases, zero-downtime rolling updates, and sub-second failover recovery.

---

### 2026-09-02 — Human-Readable Schema Validation Error Formatting

**Context:** Elysia/TypeBox validation failures on route request bodies/parameters returned raw, unparsed internal schema JSON strings containing AST trees (`{ "type": 50, "schema": ... }`) in the `details` field, confusing API clients and exposing internal framework serialization.

**Decision:**

1. Created `formatValidationError` in `apps/backend/src/lib/errors.ts` to parse TypeBox error trees into clean, user-friendly error objects with clear field names and messages (e.g. `Field 'email' must be a valid email address (e.g. user@example.com)` or `Field 'password' is required`).
2. Integrated `formatValidationError` into the global Elysia `.onError` handler (`apps/backend/src/index.ts`) for `code === 'VALIDATION'`.
3. Added unit tests in `src/lib/errors.test.ts`.

**Alternatives considered:** Returning raw `error.message` strings directly (rejected — unreadable and noisy for API consumers).

**Consequences:** Frontend and API clients receive clean, predictable `{ error, message, details: [{ field, message }] }` error responses for invalid inputs.

---

**Context:** WebSocket presence (`boardPresence` Map) and board mutation events (`eventBus`) ran in-memory per Node/Bun process, preventing horizontal scaling across multi-instance backend clusters or containers.

**Decision:**

1. Created an isolated domain module `apps/backend/src/redis/` containing `client.ts`, `pubsub.ts`, `presence.ts`, and `index.ts`.
2. Implemented `PresenceStore` interface with `RedisPresenceStore` (Redis Hash `presence:board:{boardId}` + Sorted Set TTL tracking `presence:board:{boardId}:ttl` + active board indexing) and `InMemoryPresenceStore` fallback.
3. Implemented `RedisPubSub` broker with separate `pubClient` and `subClient` ioredis connections listening on `boardly:realtime` and bridging events into local Bun WebSocket `server.publish()`.
4. Added periodic background TTL sweeper and WebSocket heartbeat keep-alive (`action: 'heartbeat'` every 25s) from `useRealtimeBoard.ts`.
5. Supported transparent graceful degradation: if Redis is disconnected or `REDIS_DISABLED=true`, the backend automatically falls back to single-instance in-memory event bus and presence storage.

**Alternatives considered:** Single connection for pub/sub (rejected — violates Redis Pub/Sub protocol where subscriber connections enter dedicated subscriber state); raw in-memory only (rejected — prevents clustering).

**Consequences:** Backend can now horizontally scale across any number of stateless Bun/Node instances behind load balancers with real-time presence and board sync shared across all cluster nodes.

---

**Context:** Enterprise users require SAML 2.0 / OIDC Single Sign-On with Okta, Azure AD (Entra ID), and Google Workspace alongside individual developer Google OAuth sign-in, while maintaining backward-compatible email/password authentication for platform Super Admins, seed accounts, and invited team members.

**Decision:**

1. Integrated `@workos-inc/node` SDK for authorization URL generation and code exchange across Google OAuth and enterprise SSO domains (`apps/backend/src/modules/auth/workos.service.ts`).
2. Added `/v1/auth/workos/google-url`, `/v1/auth/workos/sso-url`, and `/v1/auth/workos/callback` endpoints, enabling Just-In-Time (JIT) user provisioning and automatic domain-to-organization membership resolution.
3. Enhanced frontend login UI (`Login.tsx`) with "Continue with Google" button and domain-routed "Enterprise Single Sign-On (SSO)" expandable form, paired with a dedicated callback handler route (`/auth/callback` in `AuthCallback.tsx`).
4. Maintained complete parity across token issuance: regardless of authentication method (Google OAuth, SSO, or Email/Password), users receive identical signed Boardly JWT access and refresh token pairs.

**Alternatives considered:** Replacing email/password entirely with Google OAuth (rejected — breaks enterprise domain users, demo seed accounts, and Super Admin fallback portal); building custom SAML/SCIM protocol parsing from scratch (rejected — excessive maintenance complexity and security liability).

**Consequences:** Seamless 3-tier authentication covering individual users, enterprise tenants, and platform owners with zero breaking changes to existing accounts.

---

**Context:** Database query errors and unhandled exceptions were directly leaking internal SQL queries, parameter payloads, and table schemas in HTTP responses to the frontend. Furthermore, inviting members with the `'viewer'` role failed because `'viewer'` was omitted from the PostgreSQL `org_member_role` enum type.

**Decision:**

1. Created a centralized error handling and sanitization utility (`apps/backend/src/lib/errors.ts`) with `formatErrorResponse` and `handleRouteError`. All internal database queries, ORM dumps, and unhandled 500 errors are masked to clear human-readable messages (e.g. 409 Conflict, 400 Bad Request, or sanitized 500) while logging full query and stack diagnostics to server logs via `logger.error`.
2. Added `'viewer'` to `org_member_role` enum in PostgreSQL and Drizzle schema, updated `OrgMemberRole` shared TypeScript enums, and wrapped `inviteMember` in database transactions with strict input validation.

**Alternatives considered:** Exposing `err.message` across routes (rejected — severe security vulnerability and information disclosure risk).

**Consequences:** Eliminates all SQL/schema leaks across all API endpoints, ensures consistent JSON error structures, and supports complete user onboarding for Viewer roles.

---

### 2026-08-16 — Multi-Theme & Dark Theme Customization Engine

**Context:** Users need dark mode and customizable visual themes to work comfortably in various lighting conditions and express team identity.

**Decision:** Built a multi-theme engine supporting 3 interface modes (Light, Dark, System auto-matching OS `prefers-color-scheme`), 6 handcrafted theme palettes (Default Zinc, Midnight OLED, Oceanic Azure, Emerald Forest, Synthwave Sunset, Nordic Frost), and 6 accent colors (Indigo, Sky, Emerald, Neon Violet, Rose, Amber + custom HEX). Implemented via CSS custom properties on `:root` / `.dark` / `[data-theme="..."]` attributes and persisted via `localStorage` with a Zustand store (`themeStore.ts`).

**Alternatives considered:** CSS-in-JS runtime themes or static precompiled stylesheet swapping (rejected — CSS custom properties combined with Tailwind CSS v4 `@custom-variant dark` provide zero runtime overhead, instant switching without layout reflow, and full white-label compatibility).

**Consequences:** Instantaneous, zero-flicker theme switching across all dashboard components and layouts with zero rebuild necessary.

---

**Context:** Mobile team members working in low-connectivity or offline environments need to create cards, add comments, and check off tasks without blocking UI interaction or losing updates.

**Decision:** Implemented an optimistic offline action queue (`offlineQueue.ts`) that persists mutations locally and provides an automated batch replay mechanism against REST endpoints upon network recovery.

**Alternatives considered:** Disabling mutations while offline (rejected — poor mobile user experience during travel or field work).

**Consequences:** Seamless mobile offline capability with manual and automatic synchronization.

---

**Context:** Developers and DevOps engineers need programmatically scoped API keys to interact with Boardly REST APIs from automated scripts and CI pipelines.

**Decision:** Formatted keys as `bk_live_<random_bytes>`, storing only the first 12 characters (`keyPrefix`) for UI identification and the SHA-256 cryptographic hash (`keyHash`) in the database. The full key is revealed exactly once to the user upon creation.

**Alternatives considered:** Storing plaintext API keys or reversibly encrypted keys (rejected — serious security vulnerability in case of database leak).

**Consequences:** Secure, industry-standard API key authentication matching GitHub/Stripe best practices.

---

### 2026-08-16 — Power-Up & Extension Marketplace Architecture

**Context:** Users require third-party tool integrations (GitHub, Slack, Jira, Custom Fields, Time Tracking) that can be installed on-demand without code changes.

**Decision:** Created a declarative App manifest model (`marketplace_apps`) with configurable capability definitions and per-organization/per-board installation state (`installed_apps`).

**Alternatives considered:** Hardcoding all integrations directly into the core dashboard UI (rejected — clutters interface and prevents third-party ecosystem growth).

**Consequences:** Clean pluggable architecture with custom configuration schemas and one-click installs.

---

**Context:** Enterprise organizations require automated user life-cycle management from corporate identity providers (Okta, Azure AD, Google Workspace) without manual invites.

**Decision:** Implemented domain-routed SAML/OIDC configuration (`sso_configurations`) and a SCIM 2.0 webhook listener (`/v1/sso/scim`) supporting `user.create`, `user.update`, and `user.delete` (deactivation).

**Alternatives considered:** Manual CSV employee imports (rejected — high administrative toil and security risks with stale accounts).

**Consequences:** Instant enterprise tenant onboarding, secure Just-In-Time (JIT) provisioning, and immediate deactivation upon employee departure.

---

### 2026-08-16 — Real-Time In-Memory Presence Registry with Automatic Disconnect Cleanup

**Context:** Distributed teams need to see who is currently viewing a board and editing specific cards to prevent conflicting edits.

**Decision:** Enhanced WebSocket connection handler to maintain an in-memory board-presence registry broadcasting `presence:update`, `presence:card_focus`, and `presence:typing` with automatic cleanup on socket `close`.

**Alternatives considered:** Persistent database writes on every mouse move / card focus (rejected — excessive I/O and latency).

**Consequences:** Ultra-low latency presence indicators (<20ms) with zero persistent database overhead.

---

**Context:** Customer support and ops teams require inbound tickets submitted from external users to be automatically prioritized with firm resolution timeframes.

**Decision:** Built an intake form engine where submissions dynamically create Kanban cards on the target list, format JSON payload into Markdown task bodies, and calculate `dueDate = submissionTime + slaHours`.

**Alternatives considered:** Manual triage and due-date entry by support agents (rejected — high toil and slow response times).

**Consequences:** Guaranteed SLA tracking with immediate visibility on overdue risks across board and project reports.

---

### 2026-08-16 — Stacked Area Cumulative Flow Diagrams (CFD) in Pure SVG

**Context:** Kanban engineering teams need to analyze work-in-progress (WIP) stability and spot bottleneck widening across stages over 7, 14, or 30-day windows.

**Decision:** Rendered dynamic stacked multi-stage polylines and polygons natively in SVG.

**Alternatives considered:** Heavy charting libraries (Recharts / D3) — passed over to maintain instant initial load times and standard design token integration.

**Consequences:** High-fidelity visual flow analysis with 0 external dependency bloat.

---

**Context:** Enterprise tenants require fine-grained access control beyond hardcoded roles (e.g. contracting QA, reviewers, auditors).

**Decision:** Implemented a unified `roles` & `role_permissions` join table structure where system roles (admin, member) coexist with organization-scoped custom roles. Missing system permissions are auto-seeded on service boot.

**Alternatives considered:** JSON arrays of string permissions stored directly on the member table (rejected — violates relational integrity, prevents reusable named role assignments, and complicates audit querying).

**Consequences:** Complete flexibility for tenants to define and name roles while preserving backward compatibility with legacy RBAC guards.

---

### 2026-08-16 — Integrated Docs & Wiki with Bidirectional Card Linking

**Context:** Product and engineering teams need to author specifications, RFCs, and meeting notes directly linked to their execution tasks and Kanban boards.

**Decision:** Created a `documents` schema with Markdown support and a `document_cards` composite junction table enabling many-to-many bidirectional linking between docs and cards.

**Alternatives considered:** External links stored only in card descriptions (rejected — loses backlinks, discoverability, and project-level knowledge organization).

**Consequences:** Teams can seamlessly jump between high-level architectural RFCs and real-time execution cards on their boards.

---

**Context:** We needed burndown and velocity charts for sprint analytics and project tracking in `apps/dashboard`. We evaluated pulling in third-party chart libraries (Recharts, Chart.js, Tremor) vs. custom SVG rendering.

**Decision:** Handcrafted, accessible, responsive SVG components styled with Tailwind CSS tokens.

**Alternatives considered:** Recharts / Chart.js (rejected — introduces large bundle weight, React 19 peer-dep inconsistencies, and rigid canvas/DOM layouts that resist custom styling).

**Consequences:** Keeps client bundle size lightweight (0 extra dependencies), guarantees 100% theme consistency with dark mode tokens, and allows fine-grained animations for actual vs. ideal burndown lines.

---

### 2026-08-16 — Native Trello & Structured Task Migration Importer

**Context:** Teams migrating from Trello or existing systems need a seamless way to import boards without manual transcription.

**Decision:** Implemented an in-browser parsing pipeline with validation preview combined with backend atomic creation (`importers/service.ts`). It maps Trello's list IDs, card IDs, checklists, and color palettes directly to Boardly schema entities.

**Alternatives considered:** Running an asynchronous background migration job via BullMQ (deferred to Phase 3 for large enterprise files >50MB; synchronous endpoint handles standard board exports under 50ms).

**Consequences:** Instant board migration with immediate redirection to the created board view.

---

### 2026-08-10 — Native Bun WebSockets vs. Redis Pub/Sub for MVP Real-Time Sync

**Context:** We needed a way to sync board updates (card moves, edits) across multiple clients in real-time.

**Decision:** We are using Bun's native WebSocket `server.publish()` combined with an internal Node `EventEmitter` (`src/lib/event-bus.ts`) for the MVP. We are NOT introducing Redis Pub/Sub yet.

**Alternatives considered:** Using Redis Pub/Sub directly for all WebSocket events (rejected for MVP because it adds operational overhead and complexity when we only have a single backend instance right now).

**Consequences:** By decoupling the services from the WebSocket module via an `EventEmitter`, we ensure that swapping to Redis Pub/Sub in the future (when scaling horizontally) will only require changing the implementation in `event-bus.ts`, leaving the services untouched.

---

### Backend framework — Elysia over NestJS/Express-on-Bun

**Context:** Needed a backend framework for a Bun runtime, supporting a large, RBAC-heavy, multi-tenant feature surface.

**Decision:** Bun + Elysia.

**Alternatives considered:** Express-on-Bun (rejected — doesn't leverage Bun's native performance, dated middleware model). NestJS (strong alternative, gives more out-of-the-box DI/module structure, but was passed over in favor of Elysia's Bun-native speed and end-to-end type safety via Eden Treaty). Rust + Axum (rejected as the default backend — see next entry).

**Consequences:** Elysia's ecosystem is younger than NestJS's, so module structure/RBAC guard conventions must be self-imposed rather than framework-provided (see `Agents.md` §5). Gained: very fast dev iteration, full type safety from backend to frontend without codegen.

---

### Backend language — TypeScript over Rust (for now)

**Context:** Considered Rust for the backend given its performance/safety reputation.

**Decision:** TypeScript across the entire stack (dashboard, website, mobile, backend), not Rust.

**Alternatives considered:** Full Rust backend (Axum) — rejected as the default because this app's complexity is in business logic (RBAC, multi-tenancy, custom workflows) and iteration speed, not raw compute; Rust's stricter iteration loop works against rapid pre-PMF product development. Revisit selectively later for isolated hot paths (realtime fan-out, search indexing) once real scale problems exist — not by default.

**Consequences:** One language across the whole company/codebase — shared types, faster hiring, faster iteration. Accepting that a future performance bottleneck may need a Rust service carved out specifically for that bottleneck.

---

### Multi-tenancy strategy — Shared DB with `organization_id` + Postgres RLS

**Context:** Needed to decide tenant isolation strategy: shared DB, schema-per-tenant, or DB-per-tenant.

**Decision:** Shared database, every table has `organization_id`, enforced by both application-layer scoping AND Postgres Row-Level Security as a last line of defense.

**Alternatives considered:** DB-per-tenant (rejected as the default — too costly/complex to manage at MVP stage, but reserved as a premium "dedicated instance" tier for large enterprise clients later). Schema-per-tenant (rejected — middle ground that adds operational complexity without RLS's guarantee).

**Consequences:** Cheaper and simpler to scale early. Requires strict discipline: every query must be tenant-scoped at the app layer, never relying on RLS alone (see `Agents.md` §5). A tenant data leak is treated as a security incident, not a bug.

---

### UI component libraries — shadcn/ui + Aceternity UI (web), React Native Reusables (mobile)

**Context:** Needed a UI component approach across dashboard, website, and mobile that stays visually consistent and easy to theme (white-label branding per tenant).

**Decision:** shadcn/ui as the base component layer for web, Aceternity UI for website marketing/animation-heavy sections, React Native Reusables (the direct shadcn port, built on NativeWind) for mobile.

**Alternatives considered:** A single cross-platform UI library like Tamagui or gluestack (rejected for now — smaller community/less design flexibility than the shadcn ecosystem; may be revisited if maintaining two component sets becomes painful). Chakra/MUI/Ant Design (rejected — fragments the design system, no copy-in ownership model).

**Consequences:** Design tokens must be centralized in `packages/config` and consumed by both `packages/ui` (web) and `packages/ui-native` (mobile) to keep visual parity — see `Agents.md` §4.

---

### 2026-08-25 — DragOverlay & Real-Time Dynamic List Re-parenting for Kanban Boards

**Context:** The initial drag-and-drop implementation transformed card DOM nodes in-place inside `overflow-y: auto` column containers. This caused cards to be clipped by column bounds when dragged across the board, triggered jittery scrollbars, provided no real-time slot opening feedback when dragging over other columns, and allowed hover tooltips to pop up during drags.

**Decision:** Adopted `@dnd-kit/core`'s `<DragOverlay>` rendered outside column scroll containers with portal elevation, combined with `onDragOver` dynamic local state list re-parenting, a ghost dashed placeholder in the source slot, and multi-container collision detection (`pointerWithin` + `rectIntersection` + `closestCorners`). All hover tooltips are suppressed globally when an active drag is underway.

**Alternatives considered:** Native HTML5 Drag and Drop (rejected — lack of smooth touch/mobile support and rigid drag image styling), Framer Motion Reorder (rejected — limited multi-column kanban coordination compared to dnd-kit).

**Consequences:** Buttery-smooth, glitch-free dragging across columns with responsive visual slot opening, crisp click handling (via `distance: 6` PointerSensor), and high-fidelity glassmorphic drag elevation matching modern SaaS standards (Linear, Trello).

---

### 2026-08-30 — Enterprise Per-Head (Per-Seat) SaaS Billing & Fair Proration Engine (v2)

**Context:** The platform requires an automated, self-serve per-head SaaS billing engine that lets organizations purchase and adjust seats without manual sales interaction, while preventing concurrency race conditions, preserving unbilled guest collaboration, and handling downgrades safely.

**Decision:** Implemented an industry-standard per-seat billing architecture (Slack/Linear standard):

1. **Atomic Concurrency Locking**: Member invitations and seat adjustments execute under Postgres `SELECT ... FOR UPDATE` row-level locks on `subscriptions`.
2. **Single Source of Truth Webhook Engine**: Subscription states (`seatCount`, `planId`, `status`, `currentPeriodEnd`) are updated strictly through cryptographic Stripe webhooks with database idempotency logs (`billing_events`).
3. **Proration Isolation**:
   - Seat additions trigger immediate proration via `updateSubscriptionSeatQuantity` (`proration_behavior: 'create_prorations'`).
   - Seat decreases are scheduled at the period boundary via `scheduleSubscriptionSeatDecrease` (`subscription_schedules` with `proration_behavior: 'none'`), removing zero premature credits.
4. **Slack-Style Fair Billing**: Deactivating members retains their paid seat as a **Vacant Seat**, allowing replacement colleagues to be onboarded at $0 proration.
5. **Capped Guest Model**: Unbilled viewers are capped per tier (Free: 3 guests, Pro: 10 guests/seat, Business: 25 guests/seat, Enterprise: unlimited), with additional viewers billed via `$3/guest/mo` overage line items.
6. **Downgrade Member Gate**: Blocks cancellation if active billable members exceed 5 on Free plan downgrade. If bypassed externally on Stripe, puts the subscription in `past_due_downgrade_pending` and alerts administrators.
7. **Enterprise Invoicing**: High-tier enterprise contracts route through sales-assisted Stripe Invoicing (`send_invoice`, NET-30/60) rather than self-serve card checkout.

**Alternatives considered:** Flat-tier subscription pricing (rejected — does not scale with organization size, loses expansion revenue), manual seat approval workflow (rejected — introduces high friction for buyer organizations).

**Consequences:** Complete self-serve upgrade capability for organizations, mathematically sound proration tracking, zero seat-oversubscription race conditions, and clear upgrade triggers.

---

### 2026-09-15 — Enterprise Chat & Cross-Timezone Collaboration Architecture (Teams Parity)

**Context:** The platform required an enterprise-grade messaging and collaboration experience on par with Microsoft Teams, Slack, and Linear. Requirements included 1-on-1 Direct Messages, public/private group channels, 3-tier admin governance (Owner, Admin, Member), mutual shared groups inspection between teammates, timezone and working hours presence tracking (`available`, `busy`, `away`, `leave`, `offline`), bidirectional task card discussions and mentions, and a unified experience accessible both as a full workspace (`/chat`) and as a floating messenger dock across all board views.

**Decision:**

1. **Modular Socket Gateways inside Backend**: Instead of introducing operational complexity, duplicated authentication, and network latency with a standalone socket microservice, real-time WebSockets were implemented directly in `apps/backend` via modular gateway handlers (`chat.gateway.ts`, `presence.gateway.ts`) multiplexed through Bun uWebSockets and Redis Pub/Sub (`initializeRedisPubSub`).
2. **Deterministic Timezone & Working Hours Presence Engine**: Implemented `presenceService.ts` to compute localized user schedules using `Intl.DateTimeFormat`. User presence transitions automatically between `available` and `away` (off-hours) based on weekly work windows, with support for manual status overrides with expiration.
3. **Off-Hours Composer Banner with Silent Delivery**: When messaging teammates outside their localized working hours, the UI displays an off-hours banner with a one-click silent send toggle, preventing intrusive after-hours push notifications.
4. **Mutual Shared Groups Discovery**: Implemented a dedicated grouped SQL query (`getSharedChannels`) allowing users to inspect mutual group memberships directly from any teammate's profile in the details drawer.
5. **Dual-Mode UI (Full Workspace + Global Floating Dock)**: Delivered a full-screen Teams-style workspace on `/chat` with collapsible rails, thread drawers, and channel details, paired with a persistent floating bottom-right dock (`<GlobalChatDock />`) across all boards and docs with live unread badge syncing.

**Alternatives considered:**

- Standalone Socket Microservice (rejected — would add significant deployment overhead, port multiplexing, and redundant JWT auth logic with zero performance gain under Bun's uWebSockets engine).
- Polling-only REST chat (rejected — fails the enterprise real-time requirement for typing indicators, instant message delivery, and live presence).

**Consequences:** Seamless, low-latency collaboration across timezones with zero extra infrastructure overhead, robust 3-tier group governance, and bidirectional task integration.

---

### 2026-09-15 — Chat Details Drawer Ergonomics, Laptop Responsiveness, and Safe Membership Actions (Slack/Discord Parity)

**Context:** User reported three critical UX defects on `/chat`:

1. Channel details and the member list were permanently open by default on every channel, consuming ~350px of horizontal width and forcing the central chat message stream into a cramped column on 13"/14" laptop viewports.
2. An exposed, full-width red button labeled `[-> Leave Channel]` with a `LogOut` icon was positioned directly below the member list, causing users to mistake it for logging out of their Boardly user account and risking accidental channel departure.
3. On laptop displays (`< 2xl`), having side panels statically docked inside the flex flow shrunk message cards, previews, and composers below acceptable usability widths.

**Decision:**

1. **Closed-by-Default Architecture**: Initialized `isDetailsPaneOpen: false` in `chatStore.ts` and ensure channel transitions reset `isDetailsPaneOpen` to `false`. Added an intuitive click action to the header's member count (`{channel.memberCount} members`) alongside the `PanelRight` toggle button.
2. **Safe Membership Footer & Confirmation**:
   - Eliminated the prominent red button and replaced the misleading `LogOut` icon with `UserMinus`.
   - Moved the leave action into a subtle bottom `Membership` section.
   - Guarded channel owners from leaving channels they created without transferring ownership.
   - Enforced an explicit `ConfirmDialog` modal explaining rejoin prerequisites prior to removing membership.
3. **Adaptive Laptop Slide-Over Drawer (`< 2xl`)**:
   - Configured `ChatDetailsPane` and `ChatThreadPane` to render as floating slide-over overlay panels with an ambient backdrop (`bg-black/40 backdrop-blur-2xs z-30`) on laptop/tablet viewports (`< 2xl`), while preserving the dual-column static layout on large monitors (`2xl:static`).

**Alternatives considered:**

- Removing member lists entirely (rejected — users still need to inspect teammate roles and presence when coordinating).
- Keeping static 3-column layout on laptops with narrower column widths (rejected — reduces composer usability and clips code blocks/task cards).

**Consequences:** Full-width, distortion-free messaging experience on laptops matching Slack and Discord; completely eliminates accidental channel departures and logout confusion.

---

### 2026-09-15 — Chat Quote Replies, Delivery Status Ticks, and Offline Outbox Queue (WhatsApp/Telegram/Slack Parity)

**Context:** The platform chat needed market-standard messaging feedback and offline resilience matching WhatsApp, Telegram, and Slack:

1. Users expected to quote-reply directly to existing messages in the central chat stream with visual context previews.
2. Users needed explicit delivery status tracking: Sending/Queued (Clock), Sent to server (One tick), Delivered to recipient client (Double grey tick), and Read/seen (Blue double tick).
3. The composer Send button was disabled during in-flight mutations and offline mode, preventing users from typing and sending rapid multiple messages or working while disconnected.

**Decision:**

1. **Schema & Backend Reply Architecture**:
   - Added `reply_to_message_id` nullable FK column and index to `chat_messages` (migration `0017_chat_reply_to.sql`).
   - Extended `sendMessage`, `listMessages`, and `listThreadReplies` to resolve and return `replyTo: { id, body, authorName }`.
2. **Delivery Status Progression Engine**:
   - Status transitions deterministically from:
     - `sending` / `queued`: Local client generation (`temp-${Date.now()}`) or offline state $\rightarrow$ renders animated Clock icon.
     - `sent`: Successfully saved on PostgreSQL $\rightarrow$ single grey checkmark.
     - `delivered`: Direct message recipient is online (presence active/idle) or has active socket connection $\rightarrow$ double grey checkmark.
     - `read`: Recipient has `lastReadAt >= message.createdAt` $\rightarrow$ double blue checkmark (color: `#3b82f6`).
   - Real-time updates push via `chat:read_receipt` broadcast and update the client-side `readReceipts` map.
3. **Non-Blocking Compose & Offline Outbox Architecture**:
   - The Send button is never disabled when messages are sending or when offline; it is strictly disabled only when the input field is empty.
   - Built a client-side outbox queue in `chatStore.ts` backed by `localStorage` (`boardly_chat_outbox`).
   - Typing and sending immediately generates an optimistic message, appends to the UI, clears the text area, and enqueues to the outbox.
   - The outbox automatically drains sequentially (FIFO) via `window.addEventListener('online')` and WebSocket reconnection.

**Alternatives considered:**

- Blocking multi-message sending until server confirmation (rejected — breaks fluid conversational flow and causes perceived lag).
- Thread replies only without inline quote replies (rejected — quote replies are essential for quick conversational context in main channels).

**Consequences:** Zero-friction, resilient messaging experience on par with WhatsApp and Slack, with persistent offline support and clear delivery transparency.

## 2026-09-26 — Test-Log Fixes: Seed Platform Admin, Webhook Batching, Lint Gates

**Context:** Five defects from the full-project test pass (FIND-03..07) fixed in one session.

1. **Alex Vance carries `isPlatformAdmin` (FIND-03).** The OPS login page labels Alex "CEO / Platform Admin Demo Account" and the e2e spec logs in as him, but no seed granted the flag — app, spec, and UI contradicted each other. Alternatives: separate `admin@platform.com` account (rejected — more moving parts across seed/spec/login UI for a demo env) vs relaxing the gate (rejected — weakens the platform boundary). Chose to make the seed match the product's stated demo model. Org-level RBAC unaffected (flag only gates the OPS console + global visibility already implied by org_owner in tests).

2. **Webhook correctness via batching, not backgrounding (FIND-04).** The hang was serial per-card awaits × duplicate ticket keys, not just slow Redis. Alternatives: background the post-processing and return 200 immediately (rejected — delivery receipt would lie about link creation; GitHub retries on 5xx/timeout, so a fast-but-dishonest 200 is worse than a fast-and-complete one) vs parallel `Promise.all` per card (rejected — pool of 5–10 still serializes 30 cards into waves). Chose single-statement bulk writes (`ON CONFLICT DO UPDATE` with `excluded.*`, bulk comment insert, one board lookup): constant ~5 statements regardless of fan-out. Timeouts (`commandTimeout`, publish races) stay as backstops, which also partially mitigates BUG-11.

3. **`no-console: error` with narrow exceptions (FIND-07).** Gated in all three apps; backend exempts `db/*` CLI scripts, `lib/logger.ts` (the implementation), and `lib/env.ts` (boot validation; can't import logger — circular dep via `logger → env`). Dashboard/super-admin gate is blanket; the gate immediately caught 8 more live `console.*` sites (incl. 3 silent-failure catches converted to toasts). Residual `any` at external-SDK/test/drizzle-builder boundaries left as tracked debt rather than cosmetic-cast.

**Consequences:** Elysia `parse` (not `type`) is now the documented pattern for raw-body routes; bulk-write is the pattern for webhook fan-out; `errorMessage/errorStatus/errorCode/errorResponseStatus` are the standard `unknown`-catch narrowers.

## 2026-09-27 — Bare-Letter Chat Shortcuts Kept; Focus Restoration Instead

**Context:** The New DM dialog appeared to open "by itself" after every close. Investigation found no auto-open path (local state, no persistence, no effects): the documented bare-`C` shortcut fires on any keypress outside text fields, and modal close stranded focus on `<body>`, so continued typing re-triggered it.

**Alternatives considered:** removing/gating the shortcut on interactive focus (rejected — deviates from Linear/Gmail vim-style standard and the in-app cheatsheet documents `C`); background-only fix (insufficient — any focus loss re-arms the loop).

**Decision:** keep bare-letter shortcuts; add `useFocusReturn` (module-level focusin tracker that ignores in-dialog focus so autoFocus can't overwrite the invoker record, layout-effect restore with freshness/containment guards) to DM + channel modals. Same hook pattern to reuse for future dialogs.

## 2026-09-27 — Telegram-Parity Chat Menu: Benchmark and Scope Choices

**Context:** User asked for the Telegram message menu (Reply/Translate/Copy/Pin/Forward/Select/Seen/Delete + reactions) in group channels. Benchmarked Telegram (message menu gold standard) vs Slack (threads/emoji-first, no translate/forward) vs Discord (copy-ID developer slant): matched Telegram's item order and Seen-viewer pattern, kept our Slack-style thread + task-from-message hover actions untouched.

**Alternatives considered:** per-item backend tables for forwards (rejected — clone-with-`forwarded_from_id` preserves audit without join cost); translation via paid API/LLM (rejected — MyMemory free tier needs no key and matches Telegram's inline-translate UX); seen state via per-message receipts table (rejected — `lastReadAt` watermark already gives N-Seen at zero write cost on send).

**Consequences:** pin/forward/seen are group + DM capable; thread replies excluded from pin (Telegram parity); bulk forward reuses the single-forward path sequentially.

## 2026-09-27 — Chat: Route-Owned Selection, WS-Primary Freshness

**Context:** Two coupled symptoms — channel selection bouncing (URL flipping) and a `channels`/`read` request storm. Polling + per-event invalidation overlapped slow (5s+) responses; a store↔URL mirror made selection fightable from any writer.

**Alternatives considered:** longer poll intervals alone (rejected — treats volume, not the per-event invalidation loop, and keeps redundant traffic while live); full socket-driven with no HTTP fallback (rejected — socket drops must not freeze the list; fallback polls stay).

**Decision:** route param owns selection (one-way sync into the store); socket is the primary freshness source with an 8s-coalesced channels refresh and in-place patching for the open channel; HTTP polling is disconnected-fallback only. Read receipts/reactions patch or scope instead of invalidating broad keys.

## 2026-09-27 — WhatsApp-Style Chat Bubbles: Benchmark and Scope Choices

**Context:** Chat rendered Slack-style (all messages left-aligned, ticks only in the author header). User asked for WhatsApp-style left/right bubbles with single/double/blue ticks, user-configurable with left/right as default.

**Alternatives considered:** solid-color outgoing bubbles like real WhatsApp (#005c4b) (rejected — `MarkdownRenderer` emits theme-colored spans like `text-primary` that break on saturated backgrounds, and `bg-primary` shifts across 6 accent themes); per-message read-receipt table (rejected — `lastReadAt` watermark + live `chat:read_receipt` already drive sent/delivered/read at zero write cost); backend-persisted layout preference (rejected — pure view preference, no cross-device need; localStorage via chatStore is enough).

**Decision:** tinted outgoing bubbles (`bg-primary/15`, right) + muted incoming (`bg-muted/50`, left) so all theme/markdown colors stay readable; shared tick component (Clock sending / single-grey sent / double-grey delivered / double-blue read / red failed) moved into the bubble footer in bubbles mode, unchanged in classic header; `messageLayout` in chatStore persisted as `boardly_chat_layout` (default `bubbles`), toggled from the ChatFeed header. Benchmark: WhatsApp (bubbles + ticks gold standard) over Slack (left-aligned) and Teams (tinted own-messages).

## 2026-09-27 — Chat Gestures: WhatsApp Mapping, Menu Kept on Right-Click

**Context:** User asked for WhatsApp gestures (swipe reply/forward, long-press select) on top of the Telegram-style context menu added earlier. The two conflict on long-press: Telegram opens a menu, WhatsApp enters selection.

**Alternatives considered:** long-press opens menu with Select inside (rejected — user explicitly asked long-press to select, and swipe already covers mobile reply/forward); mouse-drag swipe on desktop (rejected — breaks text selection; double-click + hover buttons cover desktop); per-message receipts for bulk ops (rejected — same watermark logic, `allSettled` per batch).

**Decision:** touch long-press enters select mode (WhatsApp benchmark); right-click keeps the full Telegram menu on desktop. Esc hierarchy: selection first, then dialogs. Optimistic `temp-*` rows are unselectable — the server 404s on forward/delete for unsynced ids, which caused the user-reported "status code 404" toast during multi-forward.

## 2026-09-28 — WS Auth via Query Token: Public-Prefix Exemption

**Context:** Global `authPlugin` derive rejected the realtime upgrade (no Bearer header on WS handshakes), killing all sockets with 401 and freezing presence offline.

**Alternatives considered:** custom `Sec-WebSocket-Protocol` token header (rejected — needs frontend + backend changes and non-standard client handling); per-message auth only (rejected — open() already validates `?token=` and closes on failure, so exemption loses nothing).

**Decision:** `/v1/realtime/ws` joins `PUBLIC_PATH_PREFIXES`; handshake auth stays in `open()`. Frontend adds reconnect-with-backoff so backend restarts don't silently end realtime. Any future WS route must follow the same validate-in-`open()` pattern.

## 2026-09-28 — Priorities as Org-Scoped Config Table (not enum/labels)

**Context:** Priority existed only as an ad-hoc DB column plus hardcoded frontend strings; the My Tasks priority filter was dead (param accepted, ignored).

**Alternatives considered:** Postgres enum (rejected — adding a level needs a migration, no per-org variance, no colors); reusing board labels (rejected — board-scoped, multi-assign, wrong semantics); free-text column (rejected — no color mapping, typo-prone filtering).

**Decision:** `priorities` table per org (unique name, hex color validated `^#[0-9a-fA-F]{3,6}$`, rank order, single default), lazy-seeded Urgent/High/Medium(default)/Low; `cards.priority_id` set-null; delete reassigns to default (never orphans, last level protected); `org.update` gates mutations. Frontend renders colors exclusively from the API. Benchmark: Jira (org-level priority schemes with icons/colors) over Trello (fixed labels).
