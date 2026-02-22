/*
  # Multi-Tenant Phase 1 – Organization model and data ownership foundation

  - Organizations (independent, brokerage, team)
  - Organization members (owner, admin, agent)
  - Visibility scope (organization, team, private)
  - Subscription/tiering foundation
  - Backfill one org per existing workspace; link workspace and users
  - Add organization_id, created_by, visibility_scope, assigned_to_id to Phase 1 objects
  - RLS helper functions (no policy changes yet; columns nullable for safe rollout)
*/

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE organization_type AS ENUM ('independent', 'brokerage', 'team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE org_role AS ENUM ('owner', 'admin', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE visibility_scope AS ENUM ('organization', 'team', 'private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Organizations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  organization_type organization_type NOT NULL DEFAULT 'independent',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_tier text DEFAULT 'starter',
  agent_limit int DEFAULT 10 CHECK (agent_limit >= 0),
  active_user_count int DEFAULT 0 CHECK (active_user_count >= 0),
  billing_metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(organization_type);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ─── Organization members (created before org policies that reference it) ───────
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role org_role NOT NULL DEFAULT 'agent',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON organization_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view same org members"
  ON organization_members FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins and owners can manage members"
  ON organization_members FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- ─── Organizations RLS (after organization_members exists) ─────────────────────
CREATE POLICY "Users can view organizations they belong to"
  ON organizations FOR SELECT TO authenticated
  USING (
    id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners can update own organization"
  ON organizations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─── Link workspace_settings to organization ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_settings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE workspace_settings ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_workspace_settings_organization ON workspace_settings(organization_id) WHERE organization_id IS NOT NULL;

-- ─── Link teams to organization ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE teams ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_teams_organization ON teams(organization_id) WHERE organization_id IS NOT NULL;

-- ─── Deals: organization, assignment, visibility ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'organization_id') THEN
    ALTER TABLE deals ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'assigned_to_id') THEN
    ALTER TABLE deals ADD COLUMN assigned_to_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'created_by') THEN
    ALTER TABLE deals ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_deals_organization ON deals(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to_id) WHERE assigned_to_id IS NOT NULL;

-- ─── Lead sources: organization, created_by, visibility ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lead_sources' AND column_name = 'organization_id') THEN
    ALTER TABLE lead_sources ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lead_sources' AND column_name = 'created_by') THEN
    ALTER TABLE lead_sources ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lead_sources' AND column_name = 'visibility_scope') THEN
    ALTER TABLE lead_sources ADD COLUMN visibility_scope visibility_scope DEFAULT 'private';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_lead_sources_organization ON lead_sources(organization_id) WHERE organization_id IS NOT NULL;

-- ─── Tasks: org via deal; created_by ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'created_by') THEN
    ALTER TABLE tasks ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Marketing wallets: organization, created_by, visibility ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_wallets' AND column_name = 'organization_id') THEN
    ALTER TABLE marketing_wallets ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_wallets' AND column_name = 'created_by') THEN
    ALTER TABLE marketing_wallets ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_wallets' AND column_name = 'visibility_scope') THEN
    ALTER TABLE marketing_wallets ADD COLUMN visibility_scope visibility_scope DEFAULT 'private';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_marketing_wallets_organization ON marketing_wallets(organization_id) WHERE organization_id IS NOT NULL;

-- ─── Marketing spend: organization, created_by, visibility (foundation for ROI) ─
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_spend' AND column_name = 'organization_id') THEN
    ALTER TABLE marketing_spend ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_spend' AND column_name = 'created_by') THEN
    ALTER TABLE marketing_spend ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_spend' AND column_name = 'visibility_scope') THEN
    ALTER TABLE marketing_spend ADD COLUMN visibility_scope visibility_scope DEFAULT 'organization';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_marketing_spend_organization ON marketing_spend(organization_id) WHERE organization_id IS NOT NULL;

-- ─── Conversation contacts: organization, created_by, visibility ──────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_contacts' AND column_name = 'organization_id') THEN
    ALTER TABLE conversation_contacts ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_contacts' AND column_name = 'created_by') THEN
    ALTER TABLE conversation_contacts ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_contacts' AND column_name = 'visibility_scope') THEN
    ALTER TABLE conversation_contacts ADD COLUMN visibility_scope visibility_scope DEFAULT 'private';
  END IF;
END $$;

-- ─── Conversation threads: organization, created_by, visibility ────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_threads' AND column_name = 'organization_id') THEN
    ALTER TABLE conversation_threads ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_threads' AND column_name = 'created_by') THEN
    ALTER TABLE conversation_threads ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversation_threads' AND column_name = 'visibility_scope') THEN
    ALTER TABLE conversation_threads ADD COLUMN visibility_scope visibility_scope DEFAULT 'private';
  END IF;
END $$;

-- ─── RLS helper functions ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = uid
  );
$$;

CREATE OR REPLACE FUNCTION get_org_role(org_id uuid, uid uuid DEFAULT auth.uid())
RETURNS org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM organization_members
  WHERE organization_id = org_id AND user_id = uid
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION can_see_by_visibility(
  scope visibility_scope,
  org_id uuid,
  team_id uuid,
  created_by uuid,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF scope = 'private' THEN
    RETURN created_by = uid;
  END IF;
  IF scope = 'organization' AND org_id IS NOT NULL THEN
    RETURN is_org_member(org_id, uid);
  END IF;
  IF scope = 'team' AND team_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_teams ut
      WHERE ut.team_id = can_see_by_visibility.team_id AND ut.user_id = uid
    );
  END IF;
  RETURN false;
END;
$$;

COMMENT ON TABLE organizations IS 'Multi-tenant Phase 1: Top-level tenant (independent agent, brokerage, or team)';
COMMENT ON TABLE organization_members IS 'Multi-tenant Phase 1: User membership in org with role (owner, admin, agent)';
COMMENT ON TYPE visibility_scope IS 'Who can see a row: organization, team, or private';

-- ─── Backfill: one organization per existing workspace; owner as member ─────────
DO $$
DECLARE
  ws RECORD;
  new_org_id uuid;
BEGIN
  FOR ws IN
    SELECT id, owner_user_id, name FROM workspace_settings WHERE organization_id IS NULL AND owner_user_id IS NOT NULL
  LOOP
    INSERT INTO organizations (name, organization_type, owner_id, active_user_count)
    VALUES (COALESCE(ws.name, 'My Organization'), 'independent', ws.owner_user_id, 1)
    RETURNING id INTO new_org_id;
    UPDATE workspace_settings SET organization_id = new_org_id WHERE id = ws.id;
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (new_org_id, ws.owner_user_id, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END LOOP;
END $$;

-- Add all workspace members (user_settings.workspace_id) as org members if not already
INSERT INTO organization_members (organization_id, user_id, role)
SELECT ws.organization_id, us.user_id, 'agent'
FROM user_settings us
JOIN workspace_settings ws ON ws.id = us.workspace_id
WHERE ws.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = ws.organization_id AND om.user_id = us.user_id
  )
ON CONFLICT (organization_id, user_id) DO NOTHING;
