-- 4.6b inbound email: capability tokens + receive log with Message-ID idempotency.
-- Tokens are random bearer secrets (SHA-256 hashed at rest); scope pins the
-- target (board → default list, list, or card for replies). Allowlist bounds
-- who may send through a token; expiry + revocation kill leaks.
CREATE TABLE IF NOT EXISTS "inbound_email_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "scope" varchar(16) NOT NULL,
  "ref_id" uuid NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "token_prefix" varchar(16) NOT NULL,
  "allowlist" text,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_token_hash_idx" ON "inbound_email_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_token_scope_idx" ON "inbound_email_tokens" USING btree ("organization_id","scope","ref_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar(1024) NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "token_id" uuid REFERENCES "inbound_email_tokens"("id"),
  "from_address" varchar(320),
  "to_address" varchar(320),
  "subject" varchar(500),
  "status" varchar(16) NOT NULL DEFAULT 'received',
  "result" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_emails_message_idx" ON "inbound_emails" USING btree ("organization_id","message_id");
