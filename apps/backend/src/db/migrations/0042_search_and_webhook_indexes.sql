-- Search + webhook-lookup indexes.
--
-- Two gaps, both on paths that run on nearly every request:
--
-- 1. `webhooks` and `integrations` had NO indexes at all. The webhook dispatcher
--    runs `WHERE organization_id = $1 AND is_enabled = true` on every internal
--    domain event (see modules/webhooks/service.ts), which was a sequential scan
--    of the whole table, cross-tenant, per event.
--
-- 2. Every search box issues a leading-wildcard ILIKE ('%term%'), which a btree
--    cannot serve. pg_trgm is already installed (migration 0034) and already
--    backs notifications.search_text; these are the remaining columns the app
--    actually searches.
--
-- GIN/trigram indexes are write-amplifying, so each is partial to the rows the
-- query can reach, and CONCURRENTLY is not usable inside drizzle's transactional
-- migration runner — hence plain CREATE INDEX IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS "webhooks_org_enabled_idx" ON "webhooks" USING btree ("organization_id","is_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhooks_org_created_idx" ON "webhooks" USING btree ("organization_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_org_provider_idx" ON "integrations" USING btree ("organization_id","provider");--> statement-breakpoint
-- Global search: cards by title / key / description (partial: search never sees archived rows)
CREATE INDEX IF NOT EXISTS "cards_title_trgm_idx" ON "cards" USING gin ("title" gin_trgm_ops) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_key_trgm_idx" ON "cards" USING gin ("key" gin_trgm_ops) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_description_trgm_idx" ON "cards" USING gin ("description" gin_trgm_ops) WHERE deleted_at IS NULL;--> statement-breakpoint
-- Board / project name search
CREATE INDEX IF NOT EXISTS "boards_name_trgm_idx" ON "boards" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx" ON "projects" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
-- Member directory search: ILIKE on users.name OR users.email
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);