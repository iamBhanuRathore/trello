-- Durable SSO login state.
--
-- The `state` parameter (CSRF + replay protection for the SSO redirect) was
-- stored only in Redis, and the callback skipped verifying it whenever Redis was
-- unavailable:
--
--   if (redis && isRedisAvailable()) { ...verify state... }
--   // Without Redis the WorkOS code exchange below is still required auth.
--
-- During a Redis outage — the exact window when an attacker benefits — SSO login
-- had no CSRF or replay protection at all.
--
-- The database becomes the single source of truth. `expires_at` replaces the
-- Redis TTL (600s), `consumed_at` makes each state single-use, and the
-- organization reference cascades so deleting an org clears its pending states.

CREATE TABLE IF NOT EXISTS sso_login_states (
  state            varchar(128) PRIMARY KEY,
  domain           varchar(255) NOT NULL,
  organization_id  uuid REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at       timestamp    NOT NULL,
  consumed_at      timestamp,
  created_at       timestamp    NOT NULL DEFAULT now()
);

-- Supports the expiry sweep that prunes abandoned login attempts.
CREATE INDEX IF NOT EXISTS sso_login_states_expires_at_idx
  ON sso_login_states (expires_at);

-- Down path
-- DROP INDEX IF EXISTS sso_login_states_expires_at_idx;
-- DROP TABLE IF EXISTS sso_login_states;