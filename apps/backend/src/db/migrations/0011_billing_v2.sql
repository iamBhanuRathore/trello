-- Add new status to subscription_status enum
ALTER TYPE "public"."subscription_status" ADD VALUE IF NOT EXISTS 'past_due_downgrade_pending';

-- Add columns to users table if missing
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp;

-- Add columns to subscriptions table
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_item_id" varchar(255);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_guest_overage_item_id" varchar(255);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_interval" varchar(20) DEFAULT 'monthly';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "pending_seat_change" boolean DEFAULT false NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "seat_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_terms" varchar(20) DEFAULT 'card';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean DEFAULT false NOT NULL;

-- Create billing_events table
CREATE TABLE IF NOT EXISTS "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"organization_id" uuid,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "billing_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action
);

-- Create guest_seats table
CREATE TABLE IF NOT EXISTS "guest_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"billable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "guest_seats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "guest_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
);

-- Create seat_change_requests table
CREATE TABLE IF NOT EXISTS "seat_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"requested_quantity" integer NOT NULL,
	"direction" varchar(10) NOT NULL,
	"stripe_idempotency_key" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seat_change_requests_stripe_idempotency_key_unique" UNIQUE("stripe_idempotency_key"),
	CONSTRAINT "seat_change_requests_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action
);
