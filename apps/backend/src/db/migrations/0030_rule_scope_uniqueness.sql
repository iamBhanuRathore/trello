-- One assignment rule per scope. The app-side upsert was NULL-unsafe, so
-- repeated writes of the same scope (e.g. an org rule) appended a duplicate
-- every call and the resolver picked arbitrarily. Dedupe first (keep the most
-- recently updated row per scope), then enforce at the index level so two
-- concurrent upserts can't both insert.
DELETE FROM "assignment_rules" a
USING "assignment_rules" b
WHERE a.organization_id = b.organization_id
  AND COALESCE(a.project_id, '00000000-0000-0000-0000-000000000000') = COALESCE(b.project_id, '00000000-0000-0000-0000-000000000000')
  AND COALESCE(a.board_id, '00000000-0000-0000-0000-000000000000') = COALESCE(b.board_id, '00000000-0000-0000-0000-000000000000')
  AND COALESCE(a.component_id, '00000000-0000-0000-0000-000000000000') = COALESCE(b.component_id, '00000000-0000-0000-0000-000000000000')
  AND (a.updated_at, a.created_at) < (b.updated_at, b.created_at);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assignment_rules_scope_unique_idx"
  ON "assignment_rules" USING btree (
    "organization_id",
    COALESCE("project_id", '00000000-0000-0000-0000-000000000000'),
    COALESCE("board_id", '00000000-0000-0000-0000-000000000000'),
    COALESCE("component_id", '00000000-0000-0000-0000-000000000000')
  );
