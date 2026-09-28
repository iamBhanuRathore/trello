import postgres from 'postgres';
import { env } from '../lib/env';

const urls = [
  env.DATABASE_URL,
  env.DATABASE_TEST_URL || 'postgresql://boardly:boardly_test@localhost:5433/boardly_test',
];

/** Never print credentials: host/db only (same convention as redis/client). */
function redactedDbHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

for (const url of urls) {
  if (!url) continue;
  console.log(`Connecting to: ${redactedDbHost(url)}`);
  try {
    const sql = postgres(url, { max: 1 });
    await sql.unsafe(`
      ALTER TYPE "subscription_status" ADD VALUE IF NOT EXISTS 'past_due_downgrade_pending';
      ALTER TYPE "org_member_role" ADD VALUE IF NOT EXISTS 'viewer';
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp;
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "key" varchar(20);
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "task_counter" integer DEFAULT 0 NOT NULL;
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "start_date" timestamp;
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "end_date" timestamp;
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
      ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "order" double precision DEFAULT 0 NOT NULL;
      ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "priority" varchar(20) DEFAULT 'medium';
      ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb;
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_item_id" varchar(255);
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_guest_overage_item_id" varchar(255);
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_interval" varchar(20) DEFAULT 'monthly';
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "pending_seat_change" boolean DEFAULT false NOT NULL;
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "seat_version" integer DEFAULT 0 NOT NULL;
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_terms" varchar(20) DEFAULT 'card';
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp;
      ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean DEFAULT false NOT NULL;

      CREATE TABLE IF NOT EXISTS "billing_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "stripe_event_id" varchar(255) NOT NULL UNIQUE,
        "event_type" varchar(100) NOT NULL,
        "organization_id" uuid REFERENCES "organizations"("id"),
        "payload" jsonb NOT NULL,
        "processed_at" timestamp DEFAULT now() NOT NULL,
        "error" text
      );

      CREATE TABLE IF NOT EXISTS "guest_seats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
        "user_id" uuid NOT NULL REFERENCES "users"("id"),
        "billable" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "deleted_at" timestamp
      );

      CREATE TABLE IF NOT EXISTS "seat_change_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id"),
        "requested_quantity" integer NOT NULL,
        "direction" varchar(10) NOT NULL,
        "stripe_idempotency_key" varchar(255) NOT NULL UNIQUE,
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    await sql.end();
    console.log(`✅ Applied schema patch to ${redactedDbHost(url)}`);
  } catch (err: unknown) {
    console.error(`Error on ${redactedDbHost(url)}:`, err instanceof Error ? err.message : err);
  }
}
process.exit(0);
