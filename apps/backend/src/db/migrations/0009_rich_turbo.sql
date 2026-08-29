CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "status" "invitation_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invited_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "invited_by_name" varchar(255);--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "system_role_name_idx" ON "roles" USING btree ("name") WHERE is_system_role = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_role_name_idx" ON "roles" USING btree ("organization_id","name");