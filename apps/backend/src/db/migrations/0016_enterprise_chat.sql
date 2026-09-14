DO $$ BEGIN
  CREATE TYPE "public"."chat_channel_type" AS ENUM('direct', 'group_private', 'group_public', 'task_thread');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."chat_member_role" AS ENUM('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."user_presence_status" AS ENUM('available', 'busy', 'away', 'leave', 'offline');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type" "chat_channel_type" DEFAULT 'direct' NOT NULL,
  "name" varchar(255),
  "topic" text,
  "avatar_url" varchar(2048),
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_archived" boolean DEFAULT false NOT NULL,
  "is_announcement_only" boolean DEFAULT false NOT NULL,
  "allow_member_invites" boolean DEFAULT true NOT NULL,
  "card_id" uuid REFERENCES "cards"("id") ON DELETE SET NULL,
  "last_message_at" timestamp DEFAULT now() NOT NULL,
  "last_message_preview" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_channel_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "chat_member_role" DEFAULT 'member' NOT NULL,
  "last_read_at" timestamp DEFAULT now() NOT NULL,
  "is_muted" boolean DEFAULT false NOT NULL,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "parent_message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "is_edited" boolean DEFAULT false NOT NULL,
  "is_announcement" boolean DEFAULT false NOT NULL,
  "deleted_at" timestamp,
  "deleted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "file_name" varchar(500) NOT NULL,
  "file_url" varchar(2048) NOT NULL,
  "file_size" integer DEFAULT 0 NOT NULL,
  "file_type" varchar(100) DEFAULT 'application/octet-stream' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "chat_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(64) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_working_hours" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
  "schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_presence_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "user_presence_status" DEFAULT 'available' NOT NULL,
  "custom_status_text" varchar(255),
  "expires_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_channels_org_idx" ON "chat_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channels_card_idx" ON "chat_channels" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_channels_last_msg_idx" ON "chat_channels" USING btree ("last_message_at");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_members_channel_user_idx" ON "chat_channel_members" USING btree ("channel_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_members_user_idx" ON "chat_channel_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_members_channel_idx" ON "chat_channel_members" USING btree ("channel_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_messages_channel_idx" ON "chat_messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_parent_idx" ON "chat_messages" USING btree ("parent_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_created_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_attachments_msg_idx" ON "chat_attachments" USING btree ("message_id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_reactions_msg_user_emoji_idx" ON "chat_reactions" USING btree ("message_id", "user_id", "emoji");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_reactions_msg_idx" ON "chat_reactions" USING btree ("message_id");
