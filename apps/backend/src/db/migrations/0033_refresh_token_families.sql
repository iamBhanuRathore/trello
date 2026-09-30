-- Sliding refresh-token families (7d idle / 30d absolute / 10s reuse grace).
-- Step 1: add columns as nullable so existing rows survive.
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" uuid;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "parent_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "replaced_by_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "absolute_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "grace_uses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ua_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_hash" varchar(64);--> statement-breakpoint
-- Step 2: backfill. Existing tokens keep their original expiry as the absolute
-- cap (never extended) and each becomes its own single-token family.
UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL;--> statement-breakpoint
UPDATE "refresh_tokens" SET "absolute_expires_at" = "expires_at" WHERE "absolute_expires_at" IS NULL;--> statement-breakpoint
-- Step 3: enforce NOT NULL + invariant (idle expiry never past absolute).
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ALTER COLUMN "absolute_expires_at" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_expiry_clamp" CHECK ("expires_at" <= "absolute_expires_at"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");
