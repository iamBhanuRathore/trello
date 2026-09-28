-- Global monotonic change cursor for the board realtime feed.
-- Timestamp cursors are lossy: a batched rewrite (rebalance) stamps every row
-- with the same millisecond, so `updated_at > cursor` silently skips the tail of
-- the batch. One shared sequence across cards+lists gives a single gapless-
-- enough integer ordering that both tables can be paged with one cursor.
CREATE SEQUENCE IF NOT EXISTS "board_change_seq" AS BIGINT START 1 INCREMENT 1;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "change_seq" BIGINT;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "change_seq" BIGINT;--> statement-breakpoint
UPDATE "cards" SET "change_seq" = nextval('board_change_seq') WHERE "change_seq" IS NULL;--> statement-breakpoint
UPDATE "lists" SET "change_seq" = nextval('board_change_seq') WHERE "change_seq" IS NULL;--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "change_seq" SET DEFAULT nextval('board_change_seq');--> statement-breakpoint
ALTER TABLE "lists" ALTER COLUMN "change_seq" SET DEFAULT nextval('board_change_seq');--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "change_seq" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ALTER COLUMN "change_seq" SET NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION board_change_seq_bump() RETURNS trigger AS $$
BEGIN
  NEW.change_seq := nextval('board_change_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS cards_change_seq_trg ON "cards";--> statement-breakpoint
CREATE TRIGGER cards_change_seq_trg BEFORE UPDATE ON "cards" FOR EACH ROW EXECUTE FUNCTION board_change_seq_bump();--> statement-breakpoint
DROP TRIGGER IF EXISTS lists_change_seq_trg ON "lists";--> statement-breakpoint
CREATE TRIGGER lists_change_seq_trg BEFORE UPDATE ON "lists" FOR EACH ROW EXECUTE FUNCTION board_change_seq_bump();--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_change_seq_idx" ON "cards" USING btree ("change_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lists_change_seq_idx" ON "lists" USING btree ("change_seq");
