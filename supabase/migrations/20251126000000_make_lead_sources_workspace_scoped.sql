/*
  # Make Lead Sources Workspace-Scoped

  ## Overview
  Lead sources should be shared across a workspace, not private to individual users.
  This migration:
  1. Adds workspace_id to lead_sources table
  2. Backfills workspace_id from user's workspace
  3. Updates RLS policies to allow workspace members to view lead sources
  4. Only admins can create/edit/delete lead sources
  
  ## Changes
  - Add workspace_id column to lead_sources
  - Migrate existing lead_sources to their user's workspace
  - Update RLS policies for workspace-level access
*/

-- Add workspace_id column to lead_sources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE lead_sources
      ADD COLUMN workspace_id uuid REFERENCES workspace_settings(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill workspace_id for existing lead sources from their user's workspace
UPDATE lead_sources ls
SET workspace_id = us.workspace_id
FROM user_settings us
WHERE ls.user_id = us.user_id
  AND ls.workspace_id IS NULL;

-- Make workspace_id required for new records
ALTER TABLE lead_sources ALTER COLUMN workspace_id SET NOT NULL;

-- Add index for workspace queries
CREATE INDEX IF NOT EXISTS idx_lead_sources_workspace_id ON lead_sources(workspace_id);

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can view own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can insert own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can update own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can delete own lead sources" ON lead_sources;

-- Create new workspace-scoped RLS policies
-- All workspace members can view lead sources
CREATE POLICY "Workspace members can view lead sources"
  ON lead_sources FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_settings WHERE user_id = (SELECT auth.uid())
    )
  );

-- Only admins can create lead sources
CREATE POLICY "Admins can insert lead sources"
  ON lead_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM user_settings 
      WHERE user_id = (SELECT auth.uid()) 
        AND global_role = 'admin'
    )
  );

-- Only admins can update lead sources
CREATE POLICY "Admins can update lead sources"
  ON lead_sources FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_settings 
      WHERE user_id = (SELECT auth.uid()) 
        AND global_role = 'admin'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM user_settings 
      WHERE user_id = (SELECT auth.uid()) 
        AND global_role = 'admin'
    )
  );

-- Only admins can delete lead sources
CREATE POLICY "Admins can delete lead sources"
  ON lead_sources FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM user_settings 
      WHERE user_id = (SELECT auth.uid()) 
        AND global_role = 'admin'
    )
  );

