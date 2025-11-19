/*
  # Workspace settings & preferences

  ## Overview
  - introduce workspace_settings table for shared configuration
  - link user_settings rows to workspace via workspace_id
*/

CREATE TABLE IF NOT EXISTS workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text DEFAULT 'My Workspace',
  company_name text,
  timezone text DEFAULT 'America/Los_Angeles',
  locale text DEFAULT 'en-US',
  default_pipeline_view text DEFAULT 'kanban',
  integration_settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- add workspace_id to user_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE user_settings
      ADD COLUMN workspace_id uuid REFERENCES workspace_settings(id);
  END IF;
END $$;

-- backfill a workspace row per user lacking one
DO $$
DECLARE
  rec RECORD;
  new_workspace_id uuid;
BEGIN
  FOR rec IN SELECT id, user_id, workspace_id FROM user_settings LOOP
    IF rec.workspace_id IS NULL THEN
      INSERT INTO workspace_settings (owner_user_id, name)
      VALUES (rec.user_id, 'Workspace')
      RETURNING id INTO new_workspace_id;

      UPDATE user_settings SET workspace_id = new_workspace_id WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- policies
CREATE POLICY "Workspace members can view their workspace"
  ON workspace_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings us
      WHERE us.workspace_id = workspace_settings.id
        AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update workspace"
  ON workspace_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings us
      WHERE us.workspace_id = workspace_settings.id
        AND us.user_id = auth.uid()
        AND us.global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_settings us
      WHERE us.workspace_id = workspace_settings.id
        AND us.user_id = auth.uid()
        AND us.global_role = 'admin'
    )
  );

CREATE POLICY "Admins can insert workspace"
  ON workspace_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
