ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "pinned_by" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "forwarded_from_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_forwarded_from_chat_messages_id_fk" FOREIGN KEY ("forwarded_from_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_pinned_idx" ON "chat_messages" USING btree ("channel_id","is_pinned");
