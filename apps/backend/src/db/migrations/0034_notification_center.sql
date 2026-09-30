-- Notification Center revamp: starring, archiving, server-side search.
-- Additive only: three nullable-with-default columns + indexes. No rewrites.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "is_starred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill search_text from the enriched payload (same fields the service writes).
UPDATE "notifications" SET "search_text" = lower(
  coalesce("payload"->>'cardTitle','') || ' ' ||
  coalesce("payload"->>'cardKey','') || ' ' ||
  coalesce("payload"->>'boardTitle','') || ' ' ||
  coalesce("payload"->>'actorName','') || ' ' ||
  coalesce("payload"->>'commentText','') || ' ' ||
  coalesce("payload"->>'commentSnippet','') || ' ' ||
  coalesce("payload"->>'messagePreview','') || ' ' ||
  coalesce("event_type",'')
) WHERE "search_text" = '';--> statement-breakpoint
-- Trigram support for substring search over search_text.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
-- Main inbox list: user's visible rows newest-first (keyset on created_at, id).
CREATE INDEX IF NOT EXISTS "notifications_inbox_idx" ON "notifications" USING btree ("user_id","organization_id","created_at" DESC,"id" DESC) WHERE archived_at IS NULL;--> statement-breakpoint
-- Badge + needs-action: unread visible rows.
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" USING btree ("user_id","organization_id") WHERE is_read = false AND archived_at IS NULL;--> statement-breakpoint
-- Substring search scoped per user by the query itself; GIN keeps it indexed.
CREATE INDEX IF NOT EXISTS "notifications_search_trgm_idx" ON "notifications" USING gin ("search_text" gin_trgm_ops);
