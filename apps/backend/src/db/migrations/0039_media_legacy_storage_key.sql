-- 5.5 follow-up: make the documented legacy exception actually resolvable.
-- 0035 backfilled pre-gate rows to ready/pending (still downloadable) but left
-- storage_key NULL, so those rows had no object to serve. Recover the key from
-- the stored public URL:
--   * S3 virtual-host / path-style URLs keep the org-scoped path  → from '/orgs/'
--   * local-dev URLs expose a single leaf (…/attachments/file/<leaf>?key=<leaf>)
UPDATE "attachments"
SET "storage_key" = CASE
      WHEN "url" LIKE '%/orgs/%' THEN substring("url" from '/(orgs/.+)$')
      ELSE NULLIF(regexp_replace("url", '^.*(attachments/file/|key=)', ''), '')
    END
WHERE "storage_key" IS NULL
  AND "url" IS NOT NULL
  AND (
    "url" LIKE '%/orgs/%'
    OR "url" LIKE '%attachments/file/%'
    OR "url" LIKE '%key=%'
  );--> statement-breakpoint
UPDATE "chat_attachments"
SET "storage_key" = CASE
      WHEN "file_url" LIKE '%/orgs/%' THEN substring("file_url" from '/(orgs/.+)$')
      ELSE NULLIF(regexp_replace("file_url", '^.*(attachments/file/|key=)', ''), '')
    END
WHERE "storage_key" IS NULL
  AND "file_url" IS NOT NULL
  AND (
    "file_url" LIKE '%/orgs/%'
    OR "file_url" LIKE '%attachments/file/%'
    OR "file_url" LIKE '%key=%'
  );