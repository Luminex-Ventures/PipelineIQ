/*
  # Invite-based onboarding & role management

  - Adds workspace_invitations table for invite tracking
  - Adds is_active flag to user_settings for deactivation
  - Provides helper RPCs for listing members, managing roles, and accepting invites
*/

DO $$ BEGIN
  CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'canceled', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace_settings(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  email text NOT NULL,
  intended_role global_role NOT NULL DEFAULT 'agent',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status invite_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_token ON workspace_invitations(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace ON workspace_invitations(workspace_id, status);

ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace leaders can view invitations"
  ON workspace_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_settings us
      WHERE us.user_id = (SELECT auth.uid())
        AND us.workspace_id = workspace_invitations.workspace_id
        AND us.global_role IN ('admin', 'sales_manager', 'team_lead')
    )
  );

CREATE POLICY "Workspace leaders can manage invitations"
  ON workspace_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_settings us
      WHERE us.user_id = (SELECT auth.uid())
        AND us.workspace_id = workspace_invitations.workspace_id
        AND (
          us.global_role = 'admin'
          OR (
            us.global_role IN ('sales_manager', 'team_lead')
            AND workspace_invitations.intended_role = 'agent'
          )
        )
    )
  );

CREATE POLICY "Workspace leaders update invitations"
  ON workspace_invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_settings us
      WHERE us.user_id = (SELECT auth.uid())
        AND us.workspace_id = workspace_invitations.workspace_id
        AND us.global_role IN ('admin', 'sales_manager', 'team_lead')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_settings us
      WHERE us.user_id = (SELECT auth.uid())
        AND us.workspace_id = workspace_invitations.workspace_id
        AND us.global_role IN ('admin', 'sales_manager', 'team_lead')
    )
  );

CREATE TRIGGER update_workspace_invitations_updated_at
  BEFORE UPDATE ON workspace_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add activation flag to user settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

UPDATE user_settings SET is_active = true WHERE is_active IS NULL;

-- RPC: list workspace members (admin-only)
CREATE OR REPLACE FUNCTION get_workspace_members(p_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  global_role global_role,
  team_role team_role,
  team_id uuid,
  is_active boolean,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer record;
BEGIN
  SELECT user_id, workspace_id, global_role
  INTO viewer
  FROM user_settings
  WHERE user_id = (SELECT auth.uid());

  IF viewer.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF viewer.workspace_id IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'Different workspace';
  END IF;

  IF viewer.global_role <> 'admin' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
    SELECT
      us.user_id,
      au.email,
      COALESCE(au.raw_user_meta_data->>'name', au.email) AS full_name,
      us.global_role,
      ut.role AS team_role,
      ut.team_id,
      COALESCE(us.is_active, true) AS is_active,
      au.last_sign_in_at
    FROM user_settings us
    LEFT JOIN user_teams ut ON ut.user_id = us.user_id
    LEFT JOIN auth.users au ON au.id = us.user_id
    WHERE us.workspace_id = p_workspace_id
    ORDER BY au.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_workspace_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_workspace_members(uuid) TO authenticated;

-- RPC: manage workspace member (admin only)
CREATE OR REPLACE FUNCTION manage_workspace_member(
  target_user uuid,
  action text,
  new_role global_role DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer record;
  target record;
  remaining_admins integer;
BEGIN
  SELECT user_id, workspace_id, global_role, is_active
  INTO viewer
  FROM user_settings
  WHERE user_id = (SELECT auth.uid());

  IF viewer.user_id IS NULL OR viewer.workspace_id IS NULL THEN
    RAISE EXCEPTION 'Viewer not assigned to workspace';
  END IF;

  IF viewer.global_role <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can manage members';
  END IF;

  SELECT *
  INTO target
  FROM user_settings
  WHERE user_id = target_user;

  IF target.user_id IS NULL THEN
    RAISE EXCEPTION 'Target not found';
  END IF;

  IF target.workspace_id IS DISTINCT FROM viewer.workspace_id THEN
    RAISE EXCEPTION 'Target belongs to a different workspace';
  END IF;

  IF action = 'update_role' THEN
    IF new_role IS NULL THEN
      RAISE EXCEPTION 'New role required';
    END IF;

    IF target.global_role = 'admin' AND new_role <> 'admin' THEN
      SELECT COUNT(*)
      INTO remaining_admins
      FROM user_settings
      WHERE workspace_id = viewer.workspace_id
        AND global_role = 'admin'
        AND is_active = true
        AND user_id <> target_user;

      IF remaining_admins < 1 THEN
        RAISE EXCEPTION 'Cannot remove the last admin in the workspace';
      END IF;
    END IF;

    IF target_user = viewer.user_id AND new_role <> 'admin' THEN
      RAISE EXCEPTION 'Admins cannot demote themselves via this action';
    END IF;

    UPDATE user_settings
    SET global_role = new_role
    WHERE user_id = target_user;
  ELSIF action = 'deactivate' THEN
    IF target.global_role = 'admin' THEN
      SELECT COUNT(*)
      INTO remaining_admins
      FROM user_settings
      WHERE workspace_id = viewer.workspace_id
        AND global_role = 'admin'
        AND is_active = true
        AND user_id <> target_user;

      IF remaining_admins < 1 THEN
        RAISE EXCEPTION 'Cannot deactivate the final admin';
      END IF;
    END IF;

    UPDATE user_settings
    SET is_active = false
    WHERE user_id = target_user;
  ELSIF action = 'reactivate' THEN
    UPDATE user_settings
    SET is_active = true
    WHERE user_id = target_user;
  ELSE
    RAISE EXCEPTION 'Unknown action %', action;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION manage_workspace_member(uuid, text, global_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION manage_workspace_member(uuid, text, global_role) TO authenticated;

-- RPC: accept invite after signup
CREATE OR REPLACE FUNCTION accept_workspace_invite(invite_token uuid)
RETURNS TABLE (
  workspace_id uuid,
  assigned_role global_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite workspace_invitations%ROWTYPE;
  viewer uuid := (SELECT auth.uid());
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO invite
  FROM workspace_invitations
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite invalid or expired';
  END IF;

  UPDATE workspace_invitations
  SET status = 'accepted',
      accepted_at = now()
  WHERE id = invite.id;

  INSERT INTO user_settings (user_id, workspace_id, global_role, is_active)
  VALUES (viewer, invite.workspace_id, invite.intended_role, true)
  ON CONFLICT (user_id)
  DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    global_role = EXCLUDED.global_role,
    is_active = true;

  IF invite.team_id IS NOT NULL THEN
    -- Map global role to a team role: team leads join as team_lead; everyone else joins as agent
    -- This avoids downgrading team leads to agent on acceptance.
    -- (Sales managers/admins may not need a team role; keep them as agent for membership if a team is provided.)
    -- Note: team_role enum only supports agent | team_lead.
    -- If you later add more team roles, update this mapping.
    INSERT INTO user_teams (user_id, team_id, role)
    VALUES (
      viewer,
      invite.team_id,
      CASE
        WHEN invite.intended_role = 'team_lead' THEN 'team_lead'
        ELSE 'agent'
      END
    )
    ON CONFLICT (user_id, team_id)
    DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN QUERY SELECT invite.workspace_id, invite.intended_role;
END;
$$;

REVOKE ALL ON FUNCTION accept_workspace_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_workspace_invite(uuid) TO authenticated;

-- RPC: public invite preview for onboarding
CREATE OR REPLACE FUNCTION get_invite_preview(invite_token uuid)
RETURNS TABLE (
  email text,
  intended_role global_role,
  workspace_name text,
  status invite_status,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite record;
BEGIN
  SELECT
    wi.email,
    wi.intended_role,
    ws.name AS workspace_name,
    wi.status,
    wi.expires_at
  INTO invite
  FROM workspace_invitations wi
  LEFT JOIN workspace_settings ws ON ws.id = wi.workspace_id
  WHERE wi.token = invite_token;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT invite.email, invite.intended_role, invite.workspace_name, invite.status, invite.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION get_invite_preview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_invite_preview(uuid) TO PUBLIC;

-- RPC: workspace teams listing for invite UX
CREATE OR REPLACE FUNCTION get_workspace_teams(p_workspace_id uuid)
RETURNS TABLE (
  team_id uuid,
  name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer record;
BEGIN
  SELECT user_id, workspace_id, global_role
  INTO viewer
  FROM user_settings
  WHERE user_id = (SELECT auth.uid());

  IF viewer.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF viewer.workspace_id IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'Different workspace';
  END IF;

  IF viewer.global_role NOT IN ('admin', 'sales_manager', 'team_lead') THEN
    RAISE EXCEPTION 'Insufficient role';
  END IF;

  RETURN QUERY
    SELECT DISTINCT t.id, t.name
    FROM teams t
    JOIN user_teams ut ON ut.team_id = t.id
    JOIN user_settings us ON us.user_id = ut.user_id
    WHERE us.workspace_id = p_workspace_id
    ORDER BY t.name;
END;
$$;

REVOKE ALL ON FUNCTION get_workspace_teams(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_workspace_teams(uuid) TO authenticated;
