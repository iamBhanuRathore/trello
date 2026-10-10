-- Inbox/git/chat hot-path indexes (Block 4 perf).
--
-- Surfaced by the slow paths, not assumed:
-- 1. `git_links`: the inbox git source filters
--    WHERE organization_id + state IN (open, changes_requested), newest-first
--    keyset page (see modules/inbox/service.ts). Existing indexes lead with
--    card_id / repository_id — unusable here.
-- 2. `card_views`: the PK leads with card_id; user-first ("recently viewed")
--    lookups need (user_id, viewed_at).
-- 3. `chat_messages`: the feed orders by created_at with a same-millisecond
--    hazard; the id tiebreak makes keyset pages exact.
--
-- Deliberately absent:
-- - `inbox_item_state(user_id, source, ref_id)`: the PK IS that triple,
--   leftmost user_id — every access path is covered.
-- - `notifications.search_text` trigram: exists since 0034.
-- - pg_trgm: installed since 0034 (CREATE EXTENSION kept idempotent below).
--
-- CONCURRENTLY is not usable inside drizzle's transactional migration runner
-- (see 0042) — hence plain CREATE INDEX IF NOT EXISTS.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "git_links_org_state_created_idx" ON "git_links" USING btree ("organization_id","state","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_views_user_idx" ON "card_views" USING btree ("user_id","viewed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_channel_created_id_idx" ON "chat_messages" USING btree ("channel_id","created_at","id");
