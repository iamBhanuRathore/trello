/**
 * Ordered boot-time schema backstops: idempotent DDL/DML that guarantees critical
 * columns, enums, indexes, and tables exist before the API serves traffic on an
 * unmigrated or freshly booted database. Drizzle migrations under
 * `src/db/migrations/` remain canonical; this is a safety net, not a migration
 * system (see docs/Decisions.md).
 *
 * Every statement carries a stable ledger key recorded in the `boot_migrations`
 * table, so a statement runs once per database instead of on every restart.
 */
export interface BootStep {
  /**
   * Stable ledger key, prefixed with the migration it backstops. Never reuse or
   * renumber an existing key: the ledger skips recorded keys, so renaming one
   * re-runs that statement once, and deleting one silently un-records it. Change
   * a statement only by adding a NEW key and retiring the old one.
   */
  key: string;
  statement: string;
}

export const BOOT_STEPS: BootStep[] = [
  // Enum values
  {
    key: '0002:org_member_role.viewer',
    statement: `ALTER TYPE "org_member_role" ADD VALUE IF NOT EXISTS 'viewer'`,
  },

  // WorkOS SSO columns
  {
    key: 'sso:sso_configurations.workos_organization_id',
    statement: `ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_organization_id" varchar(255)`,
  },
  {
    key: 'sso:sso_configurations.workos_connection_id',
    statement: `ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_connection_id" varchar(255)`,
  },

  // 0035: media scan-gate columns
  {
    key: '0035:attachments.status',
    statement: `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL`,
  },
  {
    key: '0035:attachments.scan_status',
    statement: `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL`,
  },
  {
    key: '0035:attachments.scan_attempts',
    statement: `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL`,
  },
  {
    key: '0035:attachments.scanned_at',
    statement: `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp`,
  },
  {
    key: '0035:attachments.checksum_sha256',
    statement: `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64)`,
  },
  {
    key: '0035:attachments.declared_mime',
    statement: `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100)`,
  },
  {
    key: '0035:attachments.storage_key',
    statement: `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "storage_key" text`,
  },
  {
    key: '0035:chat_attachments.status',
    statement: `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL`,
  },
  {
    key: '0035:chat_attachments.scan_status',
    statement: `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL`,
  },
  {
    key: '0035:chat_attachments.scan_attempts',
    statement: `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL`,
  },
  {
    key: '0035:chat_attachments.scanned_at',
    statement: `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp`,
  },
  {
    key: '0035:chat_attachments.checksum_sha256',
    statement: `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64)`,
  },
  {
    key: '0035:chat_attachments.declared_mime',
    statement: `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100)`,
  },
  {
    key: '0035:chat_attachments.storage_key',
    statement: `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "storage_key" text`,
  },

  // 0039: recover the object key for pre-gate rows from their stored public URL so
  // the documented ready/pending legacy exception stays resolvable. Backfill, so
  // it must stay re-runnable: it is guarded by the `storage_key IS NULL` predicate.
  {
    key: '0039:attachments.storage_key_backfill',
    statement: `UPDATE "attachments" SET "storage_key" = CASE WHEN "url" LIKE '%/orgs/%' THEN substring("url" from '/(orgs/.+)$') ELSE NULLIF(regexp_replace("url", '^.*(attachments/file/|key=)', ''), '') END WHERE "storage_key" IS NULL AND "url" IS NOT NULL AND ("url" LIKE '%/orgs/%' OR "url" LIKE '%attachments/file/%' OR "url" LIKE '%key=%')`,
  },
  {
    key: '0039:chat_attachments.storage_key_backfill',
    statement: `UPDATE "chat_attachments" SET "storage_key" = CASE WHEN "file_url" LIKE '%/orgs/%' THEN substring("file_url" from '/(orgs/.+)$') ELSE NULLIF(regexp_replace("file_url", '^.*(attachments/file/|key=)', ''), '') END WHERE "storage_key" IS NULL AND "file_url" IS NOT NULL AND ("file_url" LIKE '%/orgs/%' OR "file_url" LIKE '%attachments/file/%' OR "file_url" LIKE '%key=%')`,
  },

  // 0034: notification center columns
  {
    key: '0034:notifications.snoozed_until',
    statement: `ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp`,
  },
  {
    key: '0034:notifications.source',
    statement: `ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'notification' NOT NULL`,
  },

  // 0036: inbox federation
  {
    key: '0036:inbox_item_state.table',
    statement: `CREATE TABLE IF NOT EXISTS "inbox_item_state" ("user_id" uuid NOT NULL REFERENCES "users"("id"), "source" varchar(16) NOT NULL, "ref_id" text NOT NULL, "snoozed_until" timestamp, "dismissed_at" timestamp, CONSTRAINT "inbox_item_state_pkey" PRIMARY KEY ("user_id","source","ref_id"))`,
  },

  // 0037: inbound email
  {
    key: '0037:inbound_email_tokens.table',
    statement: `CREATE TABLE IF NOT EXISTS "inbound_email_tokens" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id"), "scope" varchar(16) NOT NULL, "ref_id" uuid NOT NULL, "token_hash" varchar(64) NOT NULL, "token_prefix" varchar(16) NOT NULL, "allowlist" text, "expires_at" timestamp, "revoked_at" timestamp, "created_by" uuid REFERENCES "users"("id"), "created_at" timestamp NOT NULL DEFAULT now())`,
  },
  {
    key: '0037:inbound_token_hash_idx',
    statement: `CREATE UNIQUE INDEX IF NOT EXISTS "inbound_token_hash_idx" ON "inbound_email_tokens" USING btree ("token_hash")`,
  },
  {
    key: '0037:inbound_emails.table',
    statement: `CREATE TABLE IF NOT EXISTS "inbound_emails" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "message_id" varchar(1024) NOT NULL, "organization_id" uuid NOT NULL REFERENCES "organizations"("id"), "token_id" uuid REFERENCES "inbound_email_tokens"("id"), "from_address" varchar(320), "to_address" varchar(320), "subject" varchar(500), "status" varchar(16) NOT NULL DEFAULT 'received', "result" jsonb NOT NULL DEFAULT '{}', "raw_email" text, "raw_truncated" boolean NOT NULL DEFAULT false, "failed_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now())`,
  },
  {
    key: '0037:inbound_emails_message_idx',
    statement: `CREATE UNIQUE INDEX IF NOT EXISTS "inbound_emails_message_idx" ON "inbound_emails" USING btree ("organization_id","message_id")`,
  },

  // 0038: raw inbound email storage
  {
    key: '0038:inbound_emails.raw_email',
    statement: `ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_email" text`,
  },
  {
    key: '0038:inbound_emails.raw_truncated',
    statement: `ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_truncated" boolean NOT NULL DEFAULT false`,
  },
  {
    key: '0038:inbound_emails.failed_at',
    statement: `ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "failed_at" timestamp`,
  },

  // 0033: sliding refresh families
  {
    key: '0033:refresh_tokens.family_id',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" uuid`,
  },
  {
    key: '0033:refresh_tokens.parent_hash',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "parent_hash" varchar(255)`,
  },
  {
    key: '0033:refresh_tokens.replaced_by_hash',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "replaced_by_hash" varchar(255)`,
  },
  {
    key: '0033:refresh_tokens.absolute_expires_at',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "absolute_expires_at" timestamp`,
  },
  {
    key: '0033:refresh_tokens.last_used_at',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp`,
  },
  {
    key: '0033:refresh_tokens.grace_uses',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "grace_uses" integer DEFAULT 0 NOT NULL`,
  },
  {
    key: '0033:refresh_tokens.ua_hash',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "ua_hash" varchar(64)`,
  },
  {
    key: '0033:refresh_tokens.ip_hash',
    statement: `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_hash" varchar(64)`,
  },
  // Backfills for pre-0033 rows: one-shot by nature (the IS NULL predicate empties
  // out), safe to record in the ledger after the first successful run.
  {
    key: '0033:refresh_tokens.family_id_backfill',
    statement: `UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL`,
  },
  {
    key: '0033:refresh_tokens.absolute_expires_at_backfill',
    statement: `UPDATE "refresh_tokens" SET "absolute_expires_at" = "expires_at" WHERE "absolute_expires_at" IS NULL`,
  },
];
