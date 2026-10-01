-- 4.6b follow-up: retain the raw RFC822 payload (capped) so inbound threads can be
-- re-parsed, audited, and reprocessed after a parser fix. Stored text-only; binary
-- attachment bytes are already persisted through the media scan gate.
ALTER TABLE "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_email" text;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_truncated" boolean NOT NULL DEFAULT false;--> statement-breakpoint
-- Failed/abandoned receives need a terminal state distinct from `received` so a
-- redelivery can be resumed instead of being mistaken for a completed send.
ALTER TABLE "inbound_emails" ADD COLUMN IF NOT EXISTS "failed_at" timestamp;