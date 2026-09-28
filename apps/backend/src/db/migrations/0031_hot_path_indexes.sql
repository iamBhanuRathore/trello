-- Hot-path index sweep (5.3). Every index here backs a query the app actually
-- issues; audit_log/activity_log were primary-key-only, so each audit page was
-- a full table scan plus a second one for the count.
-- Message feed: WHERE channel_id + top-level + not deleted ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS "chat_messages_channel_created_idx" ON "chat_messages" USING btree ("channel_id","created_at" DESC);--> statement-breakpoint
-- Thread replies: WHERE parent_message_id ORDER BY created_at
CREATE INDEX IF NOT EXISTS "chat_messages_parent_created_idx" ON "chat_messages" USING btree ("parent_message_id","created_at");--> statement-breakpoint
-- Board payload: WHERE list_id IN (...) AND active ORDER BY position
CREATE INDEX IF NOT EXISTS "cards_list_position_active_idx" ON "cards" USING btree ("list_id","position") WHERE is_archived = false AND deleted_at IS NULL;--> statement-breakpoint
-- Audit log paging + filters
CREATE INDEX IF NOT EXISTS "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_org_action_created_idx" ON "audit_log" USING btree ("organization_id","action","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_org_target_created_idx" ON "audit_log" USING btree ("organization_id","target","created_at" DESC) WHERE "target" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
-- Activity log org feed + per-entity history
CREATE INDEX IF NOT EXISTS "activity_log_org_created_idx" ON "activity_log" USING btree ("organization_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
-- Unread badge count: WHERE user_id AND is_read = false
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at" DESC) WHERE is_read = false;--> statement-breakpoint
-- Digest sweep: WHERE is_dispatched = false
CREATE INDEX IF NOT EXISTS "notifications_undispatched_idx" ON "notifications" USING btree ("created_at") WHERE is_dispatched = false;
