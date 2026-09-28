ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "allow_unassigned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "default_assignee_strategy" varchar(16) DEFAULT 'unassigned' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "default_assignee_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD CONSTRAINT "organizations_default_assignee_id_users_id_fk" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "description" varchar(500);--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_role_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "assigned_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organization_role_members" ADD CONSTRAINT "organization_role_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organization_role_members" ADD CONSTRAINT "organization_role_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organization_role_members" ADD CONSTRAINT "organization_role_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organization_role_members" ADD CONSTRAINT "organization_role_members_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_role_member_unique_idx" ON "organization_role_members" USING btree ("organization_id","role_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_role_member_role_idx" ON "organization_role_members" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_role_member_user_idx" ON "organization_role_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "components" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" varchar(500),
  "lead_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "components" ADD CONSTRAINT "components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "components" ADD CONSTRAINT "components_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "components" ADD CONSTRAINT "components_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "component_board_name_idx" ON "components" USING btree ("board_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "component_org_idx" ON "components" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "component_board_idx" ON "components" USING btree ("board_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_components" (
  "card_id" uuid NOT NULL,
  "component_id" uuid NOT NULL,
  "added_by" uuid,
  "added_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "card_components_card_id_component_id_pk" PRIMARY KEY ("card_id","component_id")
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "card_components" ADD CONSTRAINT "card_components_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "card_components" ADD CONSTRAINT "card_components_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "card_components" ADD CONSTRAINT "card_components_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_components_component_idx" ON "card_components" USING btree ("component_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "project_id" uuid,
  "board_id" uuid,
  "component_id" uuid,
  "default_role_id" uuid,
  "default_user_id" uuid,
  "updated_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_default_role_id_roles_id_fk" FOREIGN KEY ("default_role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_default_user_id_users_id_fk" FOREIGN KEY ("default_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_rules_org_idx" ON "assignment_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_rules_project_idx" ON "assignment_rules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_rules_board_idx" ON "assignment_rules" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_rules_component_idx" ON "assignment_rules" USING btree ("component_id");
