ALTER TYPE "public"."subscription_status" ADD VALUE 'past_due_downgrade_pending';--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"organization_id" uuid,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "guest_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"billable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seat_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"requested_quantity" integer NOT NULL,
	"direction" varchar(10) NOT NULL,
	"stripe_idempotency_key" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seat_change_requests_stripe_idempotency_key_unique" UNIQUE("stripe_idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_subscription_item_id" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "stripe_guest_overage_item_id" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" varchar(20) DEFAULT 'monthly';--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_seat_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "seat_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_terms" varchar(20) DEFAULT 'card';--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_seats" ADD CONSTRAINT "guest_seats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_seats" ADD CONSTRAINT "guest_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_change_requests" ADD CONSTRAINT "seat_change_requests_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "deactivation_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "deactivated_by" uuid;