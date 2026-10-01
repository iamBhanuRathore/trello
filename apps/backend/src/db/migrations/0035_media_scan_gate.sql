-- 5.5 Media scan gate: unified lifecycle on attachments + chat_attachments.
-- Fail-closed: nothing is servable unless status=ready AND scan_status=clean
-- (or scan_status=skipped, which is only ever written when SCAN_MODE=disabled
-- in non-production). Legacy rows are backfilled to the documented exception
-- (ready/pending = downloadable until the throttled rescan clears them).
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100);--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "storage_key" text;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100);--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "storage_key" text;--> statement-breakpoint
-- Backfill storage_key from the public URL where possible (local-dev keys are
-- the trailing path segment; S3 keys keep the full org-scoped path).
UPDATE "attachments" SET "declared_mime" = "file_type" WHERE "declared_mime" IS NULL;--> statement-breakpoint
UPDATE "chat_attachments" SET "declared_mime" = "file_type" WHERE "declared_mime" IS NULL;--> statement-breakpoint
-- Documented exception: legacy rows predate the scan gate and stay downloadable
-- (ready/pending) until the throttled rescan worker re-queues them.
UPDATE "attachments" SET "status" = 'ready', "scan_status" = 'pending' WHERE "status" = 'staged';--> statement-breakpoint
UPDATE "chat_attachments" SET "status" = 'ready', "scan_status" = 'pending' WHERE "status" = 'staged';--> statement-breakpoint
-- GC + scan-queue hot path: staged rows by age.
CREATE INDEX IF NOT EXISTS "attachments_status_created_idx" ON "attachments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_status_created_idx" ON "chat_attachments" USING btree ("status","created_at");
