CREATE TABLE IF NOT EXISTS "priorities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" varchar(60) NOT NULL,
  "color" varchar(16) DEFAULT '#64748b' NOT NULL,
  "rank" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "priorities" ADD CONSTRAINT "priorities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_priority_name_idx" ON "priorities" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "priorities_org_idx" ON "priorities" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "priority_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "cards" ADD CONSTRAINT "cards_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_priority_idx" ON "cards" USING btree ("priority_id");
