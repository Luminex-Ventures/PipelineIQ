/*
  Fix deal_notes RLS policies to support team-based access.
  
  Previously, only the deal owner could view/create notes.
  Now team leads can access notes on their team's deals,
  and admins/sales_managers can access all notes.
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view notes for their deals" ON deal_notes;
DROP POLICY IF EXISTS "Users can create notes for their deals" ON deal_notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON deal_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON deal_notes;

-- SELECT: View notes on any deal you can access
CREATE POLICY "Users can view notes for accessible deals"
  ON deal_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_notes.deal_id
      AND (
        -- Own deals
        deals.user_id = (SELECT auth.uid())
        OR
        -- Team lead can see team deals' notes
        deals.user_id IN (
          SELECT ut.user_id
          FROM user_teams ut
          INNER JOIN user_teams my_team ON my_team.team_id = ut.team_id
          WHERE my_team.user_id = (SELECT auth.uid()) AND my_team.role = 'team_lead'
        )
        OR
        -- Admin / sales manager can see all notes
        EXISTS (
          SELECT 1 FROM user_settings
          WHERE user_settings.user_id = (SELECT auth.uid())
          AND user_settings.global_role IN ('admin', 'sales_manager')
        )
      )
    )
  );

-- INSERT: Create notes on any deal you can access
CREATE POLICY "Users can create notes for accessible deals"
  ON deal_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_notes.deal_id
      AND (
        -- Own deals
        deals.user_id = (SELECT auth.uid())
        OR
        -- Team lead can add notes to team deals
        deals.user_id IN (
          SELECT ut.user_id
          FROM user_teams ut
          INNER JOIN user_teams my_team ON my_team.team_id = ut.team_id
          WHERE my_team.user_id = (SELECT auth.uid()) AND my_team.role = 'team_lead'
        )
        OR
        -- Admin / sales manager can add notes to any deal
        EXISTS (
          SELECT 1 FROM user_settings
          WHERE user_settings.user_id = (SELECT auth.uid())
          AND user_settings.global_role IN ('admin', 'sales_manager')
        )
      )
    )
  );

-- UPDATE: Users can still only update their own notes
CREATE POLICY "Users can update their own notes"
  ON deal_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can still only delete their own notes
CREATE POLICY "Users can delete their own notes"
  ON deal_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
