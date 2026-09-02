-- Migration: Enable Row-Level Security (RLS) on tenant tables
-- Isolates multi-tenant data using session context variable `app.current_org_id`

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspaces' AND policyname = 'workspaces_org_isolation'
  ) THEN
    CREATE POLICY workspaces_org_isolation ON workspaces
      FOR ALL
      USING (
        current_setting('app.current_org_id', true) IS NOT NULL
        AND current_setting('app.current_org_id', true) <> ''
        AND organization_id = current_setting('app.current_org_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'boards' AND policyname = 'boards_org_isolation'
  ) THEN
    CREATE POLICY boards_org_isolation ON boards
      FOR ALL
      USING (
        current_setting('app.current_org_id', true) IS NOT NULL
        AND current_setting('app.current_org_id', true) <> ''
        AND organization_id = current_setting('app.current_org_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cards' AND policyname = 'cards_org_isolation'
  ) THEN
    CREATE POLICY cards_org_isolation ON cards
      FOR ALL
      USING (
        current_setting('app.current_org_id', true) IS NOT NULL
        AND current_setting('app.current_org_id', true) <> ''
        AND organization_id = current_setting('app.current_org_id', true)::uuid
      );
  END IF;
END $$;
