CREATE INDEX IF NOT EXISTS "cards_list_updated_idx" ON "cards" USING btree ("list_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lists_board_updated_idx" ON "lists" USING btree ("board_id","updated_at");
