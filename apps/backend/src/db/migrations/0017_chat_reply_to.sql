ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "reply_to_message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_reply_to_idx" ON "chat_messages" USING btree ("reply_to_message_id");
