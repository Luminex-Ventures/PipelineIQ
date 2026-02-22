/*
  # Multi-Tenant Phase 1 – Backfill and RLS

  - Backfill organization_id, assigned_to_id, created_by on deals, lead_sources,
    marketing_wallets, marketing_spend, conversation_contacts, conversation_threads, teams
  - Replace RLS policies to enforce org membership + visibility + assignment
  - Legacy rows (organization_id NULL) keep existing behavior until fully migrated
*/

-- ─── Helper: resolve user → organization_id via workspace ────────────────────
CREATE OR REPLACE FUNCTION user_org_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ws.organization_id
  FROM user_settings us
  JOIN workspace_settings ws ON ws.id = us.workspace_id
  WHERE us.user_id = p_user_id
  LIMIT 1;
$$;

-- ─── Backfill deals ───────────────────────────────────────────────────────────
UPDATE deals d
SET
  organization_id = user_org_id(d.user_id),
  assigned_to_id = COALESCE(d.assigned_to_id, d.user_id),
  created_by = COALESCE(d.created_by, d.user_id)
WHERE d.organization_id IS NULL AND user_org_id(d.user_id) IS NOT NULL;

-- ─── Backfill lead_sources ────────────────────────────────────────────────────
UPDATE lead_sources ls
SET
  organization_id = user_org_id(ls.user_id),
  created_by = COALESCE(ls.created_by, ls.user_id)
WHERE ls.organization_id IS NULL AND user_org_id(ls.user_id) IS NOT NULL;

-- ─── Backfill marketing_wallets ───────────────────────────────────────────────
UPDATE marketing_wallets mw
SET
  organization_id = user_org_id(mw.user_id),
  created_by = COALESCE(mw.created_by, mw.user_id)
WHERE mw.organization_id IS NULL AND user_org_id(mw.user_id) IS NOT NULL;

-- ─── Backfill marketing_spend (org + created_by from wallet owner) ─────────────
UPDATE marketing_spend ms
SET
  organization_id = (SELECT user_org_id(mw.user_id) FROM marketing_wallets mw WHERE mw.id = ms.wallet_id),
  created_by = COALESCE(ms.created_by, (SELECT mw.user_id FROM marketing_wallets mw WHERE mw.id = ms.wallet_id))
WHERE ms.organization_id IS NULL
  AND EXISTS (SELECT 1 FROM marketing_wallets mw WHERE mw.id = ms.wallet_id AND user_org_id(mw.user_id) IS NOT NULL);

-- ─── Backfill conversation_contacts ───────────────────────────────────────────
UPDATE conversation_contacts cc
SET
  organization_id = user_org_id(cc.user_id),
  created_by = COALESCE(cc.created_by, cc.user_id)
WHERE cc.organization_id IS NULL AND user_org_id(cc.user_id) IS NOT NULL;

-- ─── Backfill conversation_threads ────────────────────────────────────────────
UPDATE conversation_threads ct
SET
  organization_id = user_org_id(ct.user_id),
  created_by = COALESCE(ct.created_by, ct.user_id)
WHERE ct.organization_id IS NULL AND user_org_id(ct.user_id) IS NOT NULL;

-- ─── Backfill teams (org from first member’s workspace) ─────────────────────────
UPDATE teams t
SET organization_id = (
  SELECT user_org_id(ut.user_id)
  FROM user_teams ut
  WHERE ut.team_id = t.id
  LIMIT 1
)
WHERE t.organization_id IS NULL
  AND EXISTS (
    SELECT 1 FROM user_teams ut
    WHERE ut.team_id = t.id AND user_org_id(ut.user_id) IS NOT NULL
  );

-- ─── Deals RLS: org-scoped + legacy ───────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view accessible deals" ON deals;
DROP POLICY IF EXISTS "Team lead can view team deals" ON deals;
DROP POLICY IF EXISTS "Users can insert own deals" ON deals;
DROP POLICY IF EXISTS "Users can update accessible deals" ON deals;
DROP POLICY IF EXISTS "Users can delete own deals" ON deals;

-- Select: org-scoped (member + assigned or admin/owner) OR legacy (own or global role)
CREATE POLICY "Deals select org or legacy"
  ON deals FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND is_org_member(organization_id) AND (
      get_org_role(organization_id) IN ('owner', 'admin')
      OR assigned_to_id = auth.uid()
      OR (assigned_to_id IS NULL AND created_by = auth.uid())
    ))
    OR
    (organization_id IS NULL AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_settings
        WHERE user_id = auth.uid() AND global_role IN ('admin', 'sales_manager', 'team_lead')
      )
    ))
  );

-- Insert: must set organization_id from current user's org when creating; allow legacy own
CREATE POLICY "Deals insert org or own"
  ON deals FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

-- Update: same visibility as select for org; legacy unchanged
CREATE POLICY "Deals update org or legacy"
  ON deals FOR UPDATE TO authenticated
  USING (
    (organization_id IS NOT NULL AND is_org_member(organization_id) AND (
      get_org_role(organization_id) IN ('owner', 'admin')
      OR assigned_to_id = auth.uid()
      OR (assigned_to_id IS NULL AND created_by = auth.uid())
    ))
    OR
    (organization_id IS NULL AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_settings
        WHERE user_id = auth.uid() AND global_role IN ('admin', 'sales_manager', 'team_lead')
      )
    ))
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

-- Delete: only own (creator/assignee) or org owner/admin
CREATE POLICY "Deals delete org or own"
  ON deals FOR DELETE TO authenticated
  USING (
    (organization_id IS NOT NULL AND is_org_member(organization_id) AND (
      get_org_role(organization_id) IN ('owner', 'admin')
      OR created_by = auth.uid()
      OR assigned_to_id = auth.uid()
    ))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

-- ─── Lead sources RLS: visibility scope + legacy ──────────────────────────────
DROP POLICY IF EXISTS "Users can view own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can insert own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can update own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Users can delete own lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Admins and managers can manage all lead sources" ON lead_sources;
DROP POLICY IF EXISTS "Admins and sales managers can manage all lead sources" ON lead_sources;

CREATE POLICY "Lead sources select"
  ON lead_sources FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
    OR (organization_id IS NULL AND EXISTS (
      SELECT 1 FROM user_settings WHERE user_id = auth.uid() AND global_role IN ('admin', 'sales_manager', 'team_lead')
    ))
  );

CREATE POLICY "Lead sources insert"
  ON lead_sources FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Lead sources update"
  ON lead_sources FOR UPDATE TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
    OR (organization_id IS NULL AND EXISTS (
      SELECT 1 FROM user_settings WHERE user_id = auth.uid() AND global_role IN ('admin', 'sales_manager', 'team_lead')
    ))
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Lead sources delete"
  ON lead_sources FOR DELETE TO authenticated
  USING (
    (organization_id IS NOT NULL AND (created_by = auth.uid() OR get_org_role(organization_id) IN ('owner', 'admin')))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

-- ─── Marketing wallets RLS: visibility + legacy ───────────────────────────────
DROP POLICY IF EXISTS "Users can view own marketing_wallets" ON marketing_wallets;
DROP POLICY IF EXISTS "Users can insert own marketing_wallets" ON marketing_wallets;
DROP POLICY IF EXISTS "Users can update own marketing_wallets" ON marketing_wallets;

CREATE POLICY "Marketing wallets select"
  ON marketing_wallets FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, team_id, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Marketing wallets insert"
  ON marketing_wallets FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Marketing wallets update"
  ON marketing_wallets FOR UPDATE TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, team_id, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Marketing wallets delete"
  ON marketing_wallets FOR DELETE TO authenticated
  USING (
    (organization_id IS NOT NULL AND (created_by = auth.uid() OR get_org_role(organization_id) IN ('owner', 'admin')))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

-- ─── Marketing spend RLS: visibility + legacy ───────────────────────────────────
DROP POLICY IF EXISTS "Users can view own spend" ON marketing_spend;
DROP POLICY IF EXISTS "Users can insert own spend" ON marketing_spend;

CREATE POLICY "Marketing spend select"
  ON marketing_spend FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR (organization_id IS NULL AND EXISTS (
      SELECT 1 FROM marketing_wallets mw WHERE mw.id = marketing_spend.wallet_id AND mw.user_id = auth.uid()
    ))
  );

CREATE POLICY "Marketing spend insert"
  ON marketing_spend FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR EXISTS (SELECT 1 FROM marketing_wallets mw WHERE mw.id = marketing_spend.wallet_id AND mw.user_id = auth.uid())
  );

CREATE POLICY "Marketing spend update"
  ON marketing_spend FOR UPDATE TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR EXISTS (SELECT 1 FROM marketing_wallets mw WHERE mw.id = marketing_spend.wallet_id AND mw.user_id = auth.uid())
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR EXISTS (SELECT 1 FROM marketing_wallets mw WHERE mw.id = marketing_spend.wallet_id AND mw.user_id = auth.uid())
  );

CREATE POLICY "Marketing spend delete"
  ON marketing_spend FOR DELETE TO authenticated
  USING (
    (organization_id IS NOT NULL AND (created_by = auth.uid() OR get_org_role(organization_id) IN ('owner', 'admin')))
    OR EXISTS (SELECT 1 FROM marketing_wallets mw WHERE mw.id = marketing_spend.wallet_id AND mw.user_id = auth.uid())
  );

-- ─── Conversation contacts RLS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own conversation_contacts" ON conversation_contacts;
DROP POLICY IF EXISTS "Users can insert own conversation_contacts" ON conversation_contacts;
DROP POLICY IF EXISTS "Users can update own conversation_contacts" ON conversation_contacts;
DROP POLICY IF EXISTS "Users can delete own conversation_contacts" ON conversation_contacts;

CREATE POLICY "Conversation contacts select"
  ON conversation_contacts FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Conversation contacts insert"
  ON conversation_contacts FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Conversation contacts update"
  ON conversation_contacts FOR UPDATE TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Conversation contacts delete"
  ON conversation_contacts FOR DELETE TO authenticated
  USING (
    (organization_id IS NOT NULL AND (created_by = auth.uid() OR get_org_role(organization_id) IN ('owner', 'admin')))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

-- ─── Conversation threads RLS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own conversation_threads" ON conversation_threads;
DROP POLICY IF EXISTS "Users can insert own conversation_threads" ON conversation_threads;
DROP POLICY IF EXISTS "Users can update own conversation_threads" ON conversation_threads;
DROP POLICY IF EXISTS "Users can delete own conversation_threads" ON conversation_threads;

CREATE POLICY "Conversation threads select"
  ON conversation_threads FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Conversation threads insert"
  ON conversation_threads FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Conversation threads update"
  ON conversation_threads FOR UPDATE TO authenticated
  USING (
    (organization_id IS NOT NULL AND can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
    OR (organization_id IS NULL AND user_id = auth.uid())
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND is_org_member(organization_id))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

CREATE POLICY "Conversation threads delete"
  ON conversation_threads FOR DELETE TO authenticated
  USING (
    (organization_id IS NOT NULL AND (created_by = auth.uid() OR get_org_role(organization_id) IN ('owner', 'admin')))
    OR (organization_id IS NULL AND user_id = auth.uid())
  );

-- ─── Tasks: visibility via deal access (org + legacy) ───────────────────────────
DROP POLICY IF EXISTS tasks_select_policy ON tasks;
DROP POLICY IF EXISTS tasks_update_policy ON tasks;
DROP POLICY IF EXISTS tasks_insert_policy ON tasks;
DROP POLICY IF EXISTS "Users can view own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON tasks;

CREATE POLICY "Tasks select via deal access"
  ON tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = tasks.deal_id));

CREATE POLICY "Tasks insert via deal access"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM deals d WHERE d.id = tasks.deal_id));

CREATE POLICY "Tasks update via deal access"
  ON tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = tasks.deal_id))
  WITH CHECK (EXISTS (SELECT 1 FROM deals d WHERE d.id = tasks.deal_id));

CREATE POLICY "Tasks delete via deal access"
  ON tasks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = tasks.deal_id));

-- ─── Deal notes: follow deals RLS (org + legacy) ───────────────────────────────
DROP POLICY IF EXISTS "Users can view notes for accessible deals" ON deal_notes;
DROP POLICY IF EXISTS "Users can create notes for accessible deals" ON deal_notes;

CREATE POLICY "Users can view notes for accessible deals"
  ON deal_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_notes.deal_id));

CREATE POLICY "Users can create notes for accessible deals"
  ON deal_notes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_notes.deal_id)
  );

-- Update/delete policies unchanged: users can only update/delete their own notes

-- ─── Lead attribution touchpoints: follow deals RLS ────────────────────────────
DROP POLICY IF EXISTS "Users can manage touchpoints for own deals" ON lead_attribution_touchpoints;
CREATE POLICY "Users can manage touchpoints for accessible deals"
  ON lead_attribution_touchpoints FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = lead_attribution_touchpoints.deal_id))
  WITH CHECK (EXISTS (SELECT 1 FROM deals d WHERE d.id = lead_attribution_touchpoints.deal_id));

COMMENT ON FUNCTION user_org_id(uuid) IS 'Resolve user to organization_id via user_settings.workspace_id → workspace_settings.organization_id';
