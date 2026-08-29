ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "key" varchar(10);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "task_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "task_number" integer;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "key" varchar(30);
