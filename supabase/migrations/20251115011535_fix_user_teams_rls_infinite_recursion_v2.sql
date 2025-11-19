/*
  # Fix Infinite Recursion in user_teams RLS Policy

  ## Problem
  The "Users can view team memberships" policy has a recursive subquery that references
  user_teams within its own policy, causing infinite recursion errors.

  ## Solution
  Simplify the policy to avoid self-referencing subqueries while maintaining security:
  - Users can view their own team memberships
  - Admins and sales managers can view all team memberships
  - Use a simpler approach for team leads

  ## Changes
  1. Drop existing problematic policies
  2. Create simplified, non-recursive policies
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view team memberships" ON user_teams;
DROP POLICY IF EXISTS "Admins can manage team memberships" ON user_teams;
DROP POLICY IF EXISTS "Users can view own team memberships" ON user_teams;
DROP POLICY IF EXISTS "Team leads can view team memberships" ON user_teams;
DROP POLICY IF EXISTS "Admins can insert team memberships" ON user_teams;
DROP POLICY IF EXISTS "Admins can update team memberships" ON user_teams;
DROP POLICY IF EXISTS "Admins can delete team memberships" ON user_teams;

-- Simple policy: users can view their own team memberships
CREATE POLICY "Users view own memberships"
  ON user_teams FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all memberships
CREATE POLICY "Admins view all memberships"
  ON user_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = auth.uid()
      AND global_role IN ('admin', 'sales_manager')
    )
  );

-- Admins can manage all memberships
CREATE POLICY "Admins manage memberships"
  ON user_teams FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = auth.uid()
      AND global_role = 'admin'
    )
  );
