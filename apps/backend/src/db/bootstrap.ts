import { sql } from 'drizzle-orm';
import type { Database } from './index';
import { logger } from '../lib/logger';

/**
 * Boot-time schema and column backstops to ensure critical columns, enums,
 * and tables exist before handling traffic on unmigrated or newly booted databases.
 */
export async function runBootMigrations(db: Database): Promise<void> {
  try {
    // Ensure enum values and schema columns are up to date in the database on boot
    await db
      .execute(sql`ALTER TYPE "org_member_role" ADD VALUE IF NOT EXISTS 'viewer'`)
      .catch(() => {});
    await db
      .execute(
        sql`ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_organization_id" varchar(255)`
      )
      .catch(() => {});
    await db
      .execute(
        sql`ALTER TABLE IF EXISTS "sso_configurations" ADD COLUMN IF NOT EXISTS "workos_connection_id" varchar(255)`
      )
      .catch(() => {});

    // Media scan-gate columns (0035): boot-time backstop so DBs that haven't run
    // `db:migrate` yet don't crash on missing columns. Migrations are canonical.
    for (const ddl of [
      `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL`,
      `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL`,
      `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL`,
      `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp`,
      `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64)`,
      `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100)`,
      `ALTER TABLE IF EXISTS "attachments" ADD COLUMN IF NOT EXISTS "storage_key" text`,
      `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'staged' NOT NULL`,
      `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_status" varchar(16) DEFAULT 'pending' NOT NULL`,
      `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scan_attempts" integer DEFAULT 0 NOT NULL`,
      `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp`,
      `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "checksum_sha256" varchar(64)`,
      `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "declared_mime" varchar(100)`,
      `ALTER TABLE IF EXISTS "chat_attachments" ADD COLUMN IF NOT EXISTS "storage_key" text`,
    ]) {
      await db.execute(sql.raw(ddl)).catch(() => {});
    }

    // 0039: recover the object key for pre-gate rows from their stored public URL so
    // the documented ready/pending legacy exception stays resolvable.
    for (const ddl of [
      `UPDATE "attachments" SET "storage_key" = CASE WHEN "url" LIKE '%/orgs/%' THEN substring("url" from '/(orgs/.+)$') ELSE NULLIF(regexp_replace("url", '^.*(attachments/file/|key=)', ''), '') END WHERE "storage_key" IS NULL AND "url" IS NOT NULL AND ("url" LIKE '%/orgs/%' OR "url" LIKE '%attachments/file/%' OR "url" LIKE '%key=%')`,
      `UPDATE "chat_attachments" SET "storage_key" = CASE WHEN "file_url" LIKE '%/orgs/%' THEN substring("file_url" from '/(orgs/.+)$') ELSE NULLIF(regexp_replace("file_url", '^.*(attachments/file/|key=)', ''), '') END WHERE "storage_key" IS NULL AND "file_url" IS NOT NULL AND ("file_url" LIKE '%/orgs/%' OR "file_url" LIKE '%attachments/file/%' OR "file_url" LIKE '%key=%')`,
    ]) {
      await db.execute(sql.raw(ddl)).catch(() => {});
    }

    // Inbox federation (0036): same backstop pattern as above.
    for (const ddl of [
      `ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp`,
      `ALTER TABLE IF EXISTS "notifications" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'notification' NOT NULL`,
    ]) {
      await db.execute(sql.raw(ddl)).catch(() => {});
    }
    await db
      .execute(
        sql`CREATE TABLE IF NOT EXISTS "inbox_item_state" ("user_id" uuid NOT NULL REFERENCES "users"("id"), "source" varchar(16) NOT NULL, "ref_id" text NOT NULL, "snoozed_until" timestamp, "dismissed_at" timestamp, CONSTRAINT "inbox_item_state_pkey" PRIMARY KEY ("user_id","source","ref_id"))`
      )
      .catch(() => {});

    // Inbound email tables (0037): same backstop pattern as above.
    await db
      .execute(
        sql`CREATE TABLE IF NOT EXISTS "inbound_email_tokens" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL REFERENCES "organizations"("id"), "scope" varchar(16) NOT NULL, "ref_id" uuid NOT NULL, "token_hash" varchar(64) NOT NULL, "token_prefix" varchar(16) NOT NULL, "allowlist" text, "expires_at" timestamp, "revoked_at" timestamp, "created_by" uuid REFERENCES "users"("id"), "created_at" timestamp NOT NULL DEFAULT now())`
      )
      .catch(() => {});
    await db
      .execute(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS "inbound_token_hash_idx" ON "inbound_email_tokens" USING btree ("token_hash")`
      )
      .catch(() => {});
    await db
      .execute(
        sql`CREATE TABLE IF NOT EXISTS "inbound_emails" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "message_id" varchar(1024) NOT NULL, "organization_id" uuid NOT NULL REFERENCES "organizations"("id"), "token_id" uuid REFERENCES "inbound_email_tokens"("id"), "from_address" varchar(320), "to_address" varchar(320), "subject" varchar(500), "status" varchar(16) NOT NULL DEFAULT 'received', "result" jsonb NOT NULL DEFAULT '{}', "raw_email" text, "raw_truncated" boolean NOT NULL DEFAULT false, "failed_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now())`
      )
      .catch(() => {});
    await db
      .execute(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS "inbound_emails_message_idx" ON "inbound_emails" USING btree ("organization_id","message_id")`
      )
      .catch(() => {});
    await db
      .execute(
        sql`ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_email" text`
      )
      .catch(() => {});
    await db
      .execute(
        sql`ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "raw_truncated" boolean NOT NULL DEFAULT false`
      )
      .catch(() => {});
    await db
      .execute(
        sql`ALTER TABLE IF EXISTS "inbound_emails" ADD COLUMN IF NOT EXISTS "failed_at" timestamp`
      )
      .catch(() => {});

    // Sliding refresh families (0033): same backstop pattern as above.
    for (const ddl of [
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" uuid`,
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "parent_hash" varchar(255)`,
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "replaced_by_hash" varchar(255)`,
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "absolute_expires_at" timestamp`,
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp`,
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "grace_uses" integer DEFAULT 0 NOT NULL`,
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "ua_hash" varchar(64)`,
      `ALTER TABLE IF EXISTS "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_hash" varchar(64)`,
    ]) {
      await db.execute(sql.raw(ddl)).catch(() => {});
    }
    await db
      .execute(
        sql`UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL`
      )
      .catch(() => {});
    await db
      .execute(
        sql`UPDATE "refresh_tokens" SET "absolute_expires_at" = "expires_at" WHERE "absolute_expires_at" IS NULL`
      )
      .catch(() => {});
  } catch (err) {
    logger.warn({ err }, 'Error running boot-time schema backstops');
  }
}
