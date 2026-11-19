-- Integration Hub: per-module API key scopes, monthly quotas, inbound webhook
-- endpoints, and outbound integration configuration/run history.
--
-- Written idempotently (IF NOT EXISTS) to match this repo's migration
-- convention: several of these tables are also maintained by boot backstops,
-- so a replay on an existing database must not fail.

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "hit_limit" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "hits" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "hits_period_start" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "api_key_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL REFERENCES "api_keys"("id") ON DELETE cascade,
	"module" varchar(32) NOT NULL,
	"can_read" boolean DEFAULT false NOT NULL,
	"can_write" boolean DEFAULT false NOT NULL,
	"fields" jsonb,
	"hit_limit" integer,
	"hits" bigint DEFAULT 0 NOT NULL,
	"hits_period_start" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_modules_key_module_idx" ON "api_key_modules" USING btree ("api_key_id","module");--> statement-breakpoint

-- Backfill module scopes for keys created before this migration. Those rows only
-- carry the legacy `scopes` chips (e.g. ["cards:read"] or ["*"]); without rows in
-- api_key_modules the public API would reject every request from an existing key.
WITH legacy_scopes AS (
	SELECT
		k."id" AS api_key_id,
		CASE WHEN s.scope = '*' THEN m.module ELSE split_part(s.scope, ':', 1) END AS module,
		CASE WHEN s.scope = '*' THEN 'read' ELSE split_part(s.scope, ':', 2) END AS action
	FROM "api_keys" k
	CROSS JOIN LATERAL jsonb_array_elements_text(k."scopes") AS s(scope)
	LEFT JOIN (VALUES ('cards'), ('boards'), ('projects'), ('comments')) AS m(module)
		ON s.scope = '*'
)
INSERT INTO "api_key_modules" ("api_key_id", "module", "can_read", "can_write")
SELECT
	api_key_id,
	module,
	bool_or(action = 'read'),
	bool_or(action = 'write')
FROM legacy_scopes
WHERE module IN ('cards', 'boards', 'projects', 'comments')
	AND action IN ('read', 'write')
GROUP BY api_key_id, module
ON CONFLICT ("api_key_id", "module") DO NOTHING;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "inbound_webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"label" varchar(255) NOT NULL,
	"target_module" varchar(32) NOT NULL,
	"default_ref_id" uuid,
	"token_hash" varchar(255) NOT NULL,
	"token_ciphertext" text NOT NULL,
	"token_prefix" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"hits" bigint DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"last_status_code" integer,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "inbound_webhook_endpoints_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_webhook_endpoints_org_module_idx" ON "inbound_webhook_endpoints" USING btree ("organization_id","target_module");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "inbound_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL REFERENCES "inbound_webhook_endpoints"("id") ON DELETE cascade,
	"idempotency_key" varchar(255),
	"status_code" integer NOT NULL,
	"entity_type" varchar(32),
	"entity_id" uuid,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_webhook_deliveries_idempotency_idx" ON "inbound_webhook_deliveries" USING btree ("endpoint_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_webhook_deliveries_endpoint_idx" ON "inbound_webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "outbound_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"name" varchar(255) NOT NULL,
	"source_module" varchar(32) NOT NULL,
	"trigger_events" jsonb DEFAULT '[]' NOT NULL,
	"trigger_filter" jsonb,
	"auth_enabled" boolean DEFAULT false NOT NULL,
	"auth_config" jsonb,
	"data_config" jsonb DEFAULT '{}' NOT NULL,
	"field_mappings" jsonb DEFAULT '[]' NOT NULL,
	"success_check" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_status" varchar(32),
	"last_status_code" integer,
	"last_run_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_integrations_org_active_idx" ON "outbound_integrations" USING btree ("organization_id","is_active");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "outbound_integration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL REFERENCES "outbound_integrations"("id") ON DELETE cascade,
	"organization_id" uuid NOT NULL,
	"event" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid,
	"status" varchar(16) NOT NULL,
	"stage" varchar(16),
	"request_summary" jsonb,
	"response_status" integer,
	"response_body" text,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_integration_runs_integration_idx" ON "outbound_integration_runs" USING btree ("integration_id","created_at");
