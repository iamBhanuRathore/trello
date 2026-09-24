ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channels_project_idx" ON "chat_channels" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "is_system" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "channel_id" uuid REFERENCES "chat_channels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN IF NOT EXISTS "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "chat_attachments" ca SET "channel_id" = cm."channel_id" FROM "chat_messages" cm WHERE ca."message_id" = cm."id" AND ca."channel_id" IS NULL;--> statement-breakpoint
UPDATE "chat_attachments" ca SET "uploaded_by" = cm."user_id" FROM "chat_messages" cm WHERE ca."message_id" = cm."id" AND ca."uploaded_by" IS NULL;--> statement-breakpoint
ALTER TABLE "chat_attachments" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachments" ALTER COLUMN "channel_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_channel_idx" ON "chat_attachments" USING btree ("channel_id");
