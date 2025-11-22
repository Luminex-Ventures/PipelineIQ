-- Add team scope to lead_sources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_sources' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE lead_sources ADD COLUMN team_id uuid REFERENCES teams(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_sources_team_id ON lead_sources(team_id);

-- Refresh lead_sources policies for team/shared access
DROP POLICY IF EXISTS "Users can view own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can insert own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can update own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can delete own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Team leads can manage team lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Admins and sales managers can manage all lead sources" ON lead_sources;

CREATE POLICY "Users can view own lead sources"
  ON lead_sources FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR team_id IN (SELECT team_id FROM user_teams WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Users can insert own lead sources"
  ON lead_sources FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own lead sources"
  ON lead_sources FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own lead sources"
  ON lead_sources FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Team leads can manage team lead sources"
  ON lead_sources FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = (SELECT auth.uid()) AND role = 'team_lead'
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = (SELECT auth.uid()) AND role = 'team_lead'
    )
  );

CREATE POLICY "Admins and sales managers can manage all lead sources"
  ON lead_sources FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid()) AND global_role IN ('admin', 'sales_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid()) AND global_role IN ('admin', 'sales_manager')
    )
  );

-- Refresh pipeline_statuses policies for team/shared access
DROP POLICY IF EXISTS "Users can view own statuses" ON pipeline_statuses;
DROP POLICY IF EXISTS "Users can insert own statuses" ON pipeline_statuses;
DROP POLICY IF EXISTS "Users can update own statuses" ON pipeline_statuses;
DROP POLICY IF EXISTS "Users can delete own statuses" ON pipeline_statuses;
DROP POLICY IF EXISTS "Team leads can manage team statuses" ON pipeline_statuses;
DROP POLICY IF EXISTS "Admins and sales managers can manage all statuses" ON pipeline_statuses;

CREATE POLICY "Users can view own statuses"
  ON pipeline_statuses FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR team_id IN (SELECT team_id FROM user_teams WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Users can insert own statuses"
  ON pipeline_statuses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own statuses"
  ON pipeline_statuses FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own statuses"
  ON pipeline_statuses FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Team leads can manage team statuses"
  ON pipeline_statuses FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = (SELECT auth.uid()) AND role = 'team_lead'
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = (SELECT auth.uid()) AND role = 'team_lead'
    )
  );

CREATE POLICY "Admins and sales managers can manage all statuses"
  ON pipeline_statuses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid()) AND global_role IN ('admin', 'sales_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid()) AND global_role IN ('admin', 'sales_manager')
    )
  );
