-- Billing webhook delivery state (idempotency with crash recovery).
--
-- `billing_events.stripe_event_id` is already UNIQUE, but the handler recorded
-- its row only AFTER applying side effects. Two consequences:
--   * a crash between the side effects and the insert left no row, so the whole
--     handler re-ran on Stripe's retry and applied the change twice;
--   * the failure path inserted a row carrying `error`, which the next delivery
--     matched as "already processed" and skipped — so one transient database
--     error permanently dropped a billing event.
--
-- status makes the claim explicit and recoverable:
--   processing -> a worker holds the claim; stale claims (claimed_at older than
--                 the takeover window) may be retried by a later delivery
--   done       -> side effects applied exactly once; later deliveries skip
--   failed     -> side effects did not complete; later deliveries retry
--
-- Existing rows are backfilled to 'done' because every one of them was written
-- after its handler completed (or failed terminally), matching prior behaviour.

ALTER TABLE billing_events
  ADD COLUMN IF NOT EXISTS status varchar(20);

UPDATE billing_events
SET status = 'done'
WHERE status IS NULL;

ALTER TABLE billing_events
  ALTER COLUMN status SET DEFAULT 'done';

ALTER TABLE billing_events
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE billing_events
  ADD COLUMN IF NOT EXISTS claimed_at timestamp;

-- Supports the stale-claim takeover lookup: find processing rows older than the
-- window without scanning the table.
CREATE INDEX IF NOT EXISTS billing_events_status_claimed_at_idx
  ON billing_events (status, claimed_at);

-- Down path
-- DROP INDEX IF EXISTS billing_events_status_claimed_at_idx;
-- ALTER TABLE billing_events DROP COLUMN IF EXISTS claimed_at;
-- ALTER TABLE billing_events DROP COLUMN IF EXISTS status;
