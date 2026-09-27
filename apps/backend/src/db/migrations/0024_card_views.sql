CREATE TABLE IF NOT EXISTS "card_views" (
  "card_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "viewed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "card_views_pkey" PRIMARY KEY ("card_id","user_id")
);--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "card_views" ADD CONSTRAINT "card_views_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "card_views" ADD CONSTRAINT "card_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_views_card_idx" ON "card_views" USING btree ("card_id","viewed_at" DESC);
