-- 4.6a federated inbox: snooze/dismiss watermarks without a materialized table.
-- DMs/tasks/git have nowhere to store per-user triage state, so state lives in
-- inbox_item_state; notification rows carry their own snooze/source columns.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'notification' NOT NULL;--> statement-breakpoint
UPDATE "notifications" SET "source" = 'notification' WHERE "source" IS NULL OR "source" = '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_snooze_idx" ON "notifications" USING btree ("user_id","snoozed_until") WHERE snoozed_until IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_item_state" (
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "source" varchar(16) NOT NULL,
  "ref_id" text NOT NULL,
  "snoozed_until" timestamp,
  "dismissed_at" timestamp,
  CONSTRAINT "inbox_item_state_pkey" PRIMARY KEY ("user_id","source","ref_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_item_state_user_idx" ON "inbox_item_state" USING btree ("user_id");
