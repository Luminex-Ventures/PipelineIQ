/*
  # Add Teams and Role-Based Access Control

  ## Overview
  This migration adds team hierarchy and role-based access control to support:
  - Agent: can only see their own deals
  - Team Lead: can see all deals for users in their team
  - Sales Manager: can see all deals across multiple teams
  - Admin: full access to all data

  ## Changes
  
  ### 1. New Tables
  
  #### teams
  - `id` (uuid, primary key)
  - `name` (text, unique, not null) - team name
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  #### user_teams
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK → auth.users)
  - `team_id` (uuid, FK → teams)
  - `role` (enum: agent, team_lead) - role within the team
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ### 2. Schema Changes
  - Add `global_role` to user_settings (enum: agent, team_lead, sales_manager, admin)
  
  ### 3. Security
  - Enable RLS on all new tables
  - Add policies for role-based access
  
  ## Notes
  - Users can belong to one team (v1 simplification)
  - Global role determines cross-team visibility
  - Team role determines within-team permissions
*/

-- Create enum for global roles
DO $$ BEGIN
  CREATE TYPE global_role AS ENUM ('agent', 'team_lead', 'sales_manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for team roles
DO $$ BEGIN
  CREATE TYPE team_role AS ENUM ('agent', 'team_lead');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_teams table
CREATE TABLE IF NOT EXISTS user_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role team_role DEFAULT 'agent' NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, team_id)
);

-- Add global_role to user_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'global_role'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN global_role global_role DEFAULT 'agent' NOT NULL;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_teams_user_id ON user_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_user_teams_team_id ON user_teams(team_id);

-- Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_teams ENABLE ROW LEVEL SECURITY;

-- Policies for teams table
CREATE POLICY "Users can view their own team"
  ON teams FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT team_id FROM user_teams WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can view all teams"
  ON teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = auth.uid()
      AND global_role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
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

-- Policies for user_teams table
CREATE POLICY "Users can view their own team membership"
  ON user_teams FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Team leads can view their team members"
  ON user_teams FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM user_teams
      WHERE user_id = auth.uid() AND role = 'team_lead'
    )
  );

CREATE POLICY "Admins and managers can view all team memberships"
  ON user_teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = auth.uid()
      AND global_role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Admins can manage team memberships"
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

-- Update deals policies to support team visibility
DROP POLICY IF EXISTS "Users can view own deals" ON deals;
DROP POLICY IF EXISTS "Users can create own deals" ON deals;
DROP POLICY IF EXISTS "Users can update own deals" ON deals;
DROP POLICY IF EXISTS "Users can delete own deals" ON deals;

-- New policies for deals with team support
CREATE POLICY "Users can view accessible deals"
  ON deals FOR SELECT
  TO authenticated
  USING (
    -- Own deals
    user_id = auth.uid()
    OR
    -- Team lead can see team deals
    user_id IN (
      SELECT ut.user_id
      FROM user_teams ut
      INNER JOIN user_teams my_team ON my_team.team_id = ut.team_id
      WHERE my_team.user_id = auth.uid() AND my_team.role = 'team_lead'
    )
    OR
    -- Sales manager and admin can see all deals
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = auth.uid()
      AND global_role IN ('admin', 'sales_manager')
    )
  );

CREATE POLICY "Users can create own deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update accessible deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    user_id IN (
      SELECT ut.user_id
      FROM user_teams ut
      INNER JOIN user_teams my_team ON my_team.team_id = ut.team_id
      WHERE my_team.user_id = auth.uid() AND my_team.role = 'team_lead'
    )
    OR
    EXISTS (
      SELECT 1 FROM user_settings
      WHERE user_id = auth.uid()
      AND global_role IN ('admin', 'sales_manager')
    )
  )
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own deals"
  ON deals FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
