/*
  # Fix RLS Performance and Security Issues

  ## Overview
  This migration fixes critical security and performance issues:
  
  1. **RLS Performance**: Wraps all auth.uid() calls in (SELECT auth.uid()) to prevent
     re-evaluation on every row, improving query performance at scale
  
  2. **Duplicate Policies**: Removes duplicate INSERT policy on deals table
  
  3. **Multiple Permissive Policies**: Consolidates overlapping SELECT policies for
     teams and user_teams tables
  
  4. **Function Security**: Fixes search_path mutability for update_updated_at_column
  
  ## Changes
  
  ### Performance Optimizations
  - All RLS policies updated to use (SELECT auth.uid()) instead of auth.uid()
  - Reduces function calls from O(n) to O(1) per query
  
  ### Security Fixes
  - Removed duplicate INSERT policy on deals
  - Consolidated SELECT policies to avoid confusion
  - Fixed function search_path to be immutable
  
  ### Note on Unused Indexes
  - Indexes are kept as they will be used as data scales
  - They're currently unused due to low data volume in development
*/

-- Drop all existing RLS policies to recreate them with optimized auth.uid() calls
-- lead_sources policies
DROP POLICY IF EXISTS "Users can view own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can insert own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can update own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can delete own lead sources" ON lead_sources;

-- tasks policies
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

-- user_settings policies
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;

-- teams policies (we'll consolidate these)
DROP POLICY IF EXISTS "Users can view their own team" ON teams;
DROP POLICY IF EXISTS "Admins and managers can view all teams" ON teams;
DROP POLICY IF EXISTS "Admins can manage teams" ON teams;

-- user_teams policies (we'll consolidate these)
DROP POLICY IF EXISTS "Users can view their own team membership" ON user_teams;
DROP POLICY IF EXISTS "Team leads can view their team members" ON user_teams;
DROP POLICY IF EXISTS "Admins and managers can view all team memberships" ON user_teams;
DROP POLICY IF EXISTS "Admins can manage team memberships" ON user_teams;

-- deals policies (remove duplicate)
DROP POLICY IF EXISTS "Users can view accessible deals" ON deals;
DROP POLICY IF EXISTS "Users can create own deals" ON deals;
DROP POLICY IF EXISTS "Users can insert own deals" ON deals;
DROP POLICY IF EXISTS "Users can update accessible deals" ON deals;
DROP POLICY IF EXISTS "Users can delete own deals" ON deals;

-- Recreate lead_sources policies with optimized auth.uid()
CREATE POLICY "Users can view own lead sources"
  ON lead_sources FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

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

-- Recreate tasks policies with optimized auth.uid()
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Recreate user_settings policies with optimized auth.uid()
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Recreate teams policies - CONSOLIDATED into single SELECT policy
CREATE POLICY "Users can view teams"
  ON teams FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own team
    id IN (
      SELECT team_id FROM user_teams WHERE user_id = (SELECT auth.uid())
    )
    OR
    -- Admins and managers can see all teams
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role = 'admin'
    )
  );

-- Recreate user_teams policies - CONSOLIDATED into single SELECT policy
CREATE POLICY "Users can view team memberships"
  ON user_teams FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own membership
    user_id = (SELECT auth.uid())
    OR
    -- Team leads can see their team members
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = (SELECT auth.uid()) AND role = 'team_lead'
    )
    OR
    -- Admins and managers can see all memberships
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Admins can manage team memberships"
  ON user_teams FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role = 'admin'
    )
  );

-- Recreate deals policies with optimized auth.uid() - SINGLE INSERT POLICY
CREATE POLICY "Users can view accessible deals"
  ON deals FOR SELECT
  TO authenticated
  USING (
    -- Own deals
    user_id = (SELECT auth.uid())
    OR
    -- Team lead can see team deals
    user_id IN (
      SELECT ut.user_id
      FROM user_teams ut
      INNER JOIN user_teams my_team ON my_team.team_id = ut.team_id
      WHERE my_team.user_id = (SELECT auth.uid()) AND my_team.role = 'team_lead'
    )
    OR
    -- Sales manager and admin can see all deals
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Users can insert own deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update accessible deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR
    user_id IN (
      SELECT ut.user_id
      FROM user_teams ut
      INNER JOIN user_teams my_team ON my_team.team_id = ut.team_id
      WHERE my_team.user_id = (SELECT auth.uid()) AND my_team.role = 'team_lead'
    )
    OR
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = (SELECT auth.uid())
      AND global_role IN ('admin', 'sales_manager')
    )
  )
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own deals"
  ON deals FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Fix function search_path mutability
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers that were dropped
CREATE TRIGGER update_lead_sources_updated_at
  BEFORE UPDATE ON lead_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_teams_updated_at
  BEFORE UPDATE ON user_teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
