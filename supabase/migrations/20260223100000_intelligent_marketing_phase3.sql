/*
  # Intelligent Marketing Phase 3 – Foundation

  - Provider integration framework: marketing_provider_accounts (org/visibility)
  - Marketing budget containers + pools (org/team/private)
  - Allocation decisions (audit trail)
  - Campaign templates (MVP)
  - Attribution overrides (manual correction)
  - Enums: pacing_rule, budget_funding_method, allocation_strategy_mode
*/

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE budget_pacing_rule AS ENUM ('even', 'front_load', 'aggressive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE budget_funding_method AS ENUM ('manual', 'billing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE allocation_strategy_mode AS ENUM (
    'balanced', 'max_roi', 'max_volume', 'quick_wins', 'experiment_heavy'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provider_account_status AS ENUM ('connected', 'disconnected', 'error', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Provider accounts (org/visibility; credential ref only) ──────────────────
CREATE TABLE IF NOT EXISTS marketing_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility_scope visibility_scope NOT NULL DEFAULT 'private',
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_account_id text NOT NULL,
  external_account_name text,
  credential_ref text,
  status provider_account_status NOT NULL DEFAULT 'connected',
  last_sync_at timestamptz,
  last_sync_error text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (organization_id, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_provider_accounts_org ON marketing_provider_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_marketing_provider_accounts_provider ON marketing_provider_accounts(provider);

CREATE TRIGGER update_marketing_provider_accounts_updated_at
  BEFORE UPDATE ON marketing_provider_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE marketing_provider_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider accounts select by visibility"
  ON marketing_provider_accounts FOR SELECT TO authenticated
  USING (can_see_by_visibility(visibility_scope, organization_id, team_id, created_by, auth.uid()));

CREATE POLICY "Provider accounts insert as member"
  ON marketing_provider_accounts FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id) AND (created_by = auth.uid() OR get_org_role(organization_id) IN ('owner', 'admin')));

CREATE POLICY "Provider accounts update by visibility and role"
  ON marketing_provider_accounts FOR UPDATE TO authenticated
  USING (can_see_by_visibility(visibility_scope, organization_id, team_id, created_by, auth.uid()))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Provider accounts delete owner or admin"
  ON marketing_provider_accounts FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR get_org_role(organization_id) IN ('owner', 'admin')
  );

-- ─── Marketing budgets (investment account; org/team/private) ─────────────────
CREATE TABLE IF NOT EXISTS marketing_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility_scope visibility_scope NOT NULL DEFAULT 'private',
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  monthly_budget_cents bigint NOT NULL DEFAULT 0 CHECK (monthly_budget_cents >= 0),
  weekly_cap_cents bigint CHECK (weekly_cap_cents IS NULL OR weekly_cap_cents >= 0),
  per_channel_caps jsonb DEFAULT '{}',
  pacing_rule budget_pacing_rule NOT NULL DEFAULT 'even',
  start_date date,
  end_date date,
  funding_method budget_funding_method NOT NULL DEFAULT 'manual',
  is_paused boolean NOT NULL DEFAULT false,
  strategy_mode allocation_strategy_mode DEFAULT 'balanced',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_budgets_org ON marketing_budgets(organization_id);
CREATE INDEX IF NOT EXISTS idx_marketing_budgets_visibility ON marketing_budgets(visibility_scope);
CREATE INDEX IF NOT EXISTS idx_marketing_budgets_dates ON marketing_budgets(start_date, end_date) WHERE start_date IS NOT NULL;

CREATE TRIGGER update_marketing_budgets_updated_at
  BEFORE UPDATE ON marketing_budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE marketing_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Budgets select by visibility"
  ON marketing_budgets FOR SELECT TO authenticated
  USING (can_see_by_visibility(visibility_scope, organization_id, team_id, created_by, auth.uid()));

CREATE POLICY "Budgets insert as member"
  ON marketing_budgets FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id) AND (created_by = auth.uid() OR get_org_role(organization_id) IN ('owner', 'admin')));

CREATE POLICY "Budgets update by visibility"
  ON marketing_budgets FOR UPDATE TO authenticated
  USING (can_see_by_visibility(visibility_scope, organization_id, team_id, created_by, auth.uid()))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Budgets delete owner or admin or creator"
  ON marketing_budgets FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR get_org_role(organization_id) IN ('owner', 'admin')
  );

-- ─── Allocation decisions (audit trail for engine output) ──────────────────────
DO $$ BEGIN
  CREATE TYPE allocation_decision_status AS ENUM ('pending', 'applied', 'overridden', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS allocation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  budget_id uuid REFERENCES marketing_budgets(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  decisions jsonb NOT NULL DEFAULT '{}',
  explanation text,
  confidence numeric(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status allocation_decision_status NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  overridden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allocation_decisions_org ON allocation_decisions(organization_id);
CREATE INDEX IF NOT EXISTS idx_allocation_decisions_budget ON allocation_decisions(budget_id);
CREATE INDEX IF NOT EXISTS idx_allocation_decisions_period ON allocation_decisions(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_allocation_decisions_status ON allocation_decisions(status);

ALTER TABLE allocation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allocation decisions org admin owner only"
  ON allocation_decisions FOR ALL TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin'))
  WITH CHECK (get_org_role(organization_id) IN ('owner', 'admin'));

-- ─── Campaign templates (MVP) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility_scope visibility_scope NOT NULL DEFAULT 'organization',
  name text NOT NULL,
  channel_id uuid REFERENCES marketing_channels(id) ON DELETE CASCADE NOT NULL,
  target_geography jsonb DEFAULT '{}',
  audience_keywords_placeholder jsonb DEFAULT '{}',
  budget_min_cents bigint CHECK (budget_min_cents IS NULL OR budget_min_cents >= 0),
  budget_max_cents bigint CHECK (budget_max_cents IS NULL OR budget_max_cents >= 0),
  creative_placeholder text,
  landing_page_url text,
  tracking_fields jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_templates_org ON marketing_campaign_templates(organization_id);

CREATE TRIGGER update_marketing_campaign_templates_updated_at
  BEFORE UPDATE ON marketing_campaign_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE marketing_campaign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign templates select by visibility"
  ON marketing_campaign_templates FOR SELECT TO authenticated
  USING (can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()));

CREATE POLICY "Campaign templates insert admin owner"
  ON marketing_campaign_templates FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id) AND get_org_role(organization_id) IN ('owner', 'admin'));

CREATE POLICY "Campaign templates update by visibility"
  ON marketing_campaign_templates FOR UPDATE TO authenticated
  USING (can_see_by_visibility(visibility_scope, organization_id, NULL, created_by, auth.uid()))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Campaign templates delete admin owner"
  ON marketing_campaign_templates FOR DELETE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin'));

-- ─── Attribution overrides (manual correction) ───────────────────────────────
CREATE TABLE IF NOT EXISTS attribution_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  override_lead_source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  override_campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (deal_id)
);

CREATE INDEX IF NOT EXISTS idx_attribution_overrides_deal ON attribution_overrides(deal_id);

ALTER TABLE attribution_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attribution overrides select via deal"
  ON attribution_overrides FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = attribution_overrides.deal_id));

CREATE POLICY "Attribution overrides insert own"
  ON attribution_overrides FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM deals d WHERE d.id = attribution_overrides.deal_id)
  );

CREATE POLICY "Attribution overrides update creator or admin"
  ON attribution_overrides FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM deals d JOIN organization_members om ON om.organization_id = d.organization_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin') WHERE d.id = attribution_overrides.deal_id)
  )
  WITH CHECK (true);

CREATE POLICY "Attribution overrides delete creator or admin"
  ON attribution_overrides FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM deals d JOIN organization_members om ON om.organization_id = d.organization_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin') WHERE d.id = attribution_overrides.deal_id)
  );

-- ─── Attribution settings: extend with window (if not exists) ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_attribution_settings' AND column_name = 'attribution_window_days') THEN
    ALTER TABLE marketing_attribution_settings ADD COLUMN attribution_window_days int DEFAULT 30 CHECK (attribution_window_days IS NULL OR attribution_window_days > 0);
  END IF;
END $$;

-- ─── Optional: link budget to wallet (for spend caps) ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_wallets' AND column_name = 'budget_id') THEN
    ALTER TABLE marketing_wallets ADD COLUMN budget_id uuid REFERENCES marketing_budgets(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_marketing_wallets_budget ON marketing_wallets(budget_id) WHERE budget_id IS NOT NULL;

COMMENT ON TABLE marketing_provider_accounts IS 'Phase 3: Provider account per org/agent; credential_ref only; visibility-scoped';
COMMENT ON TABLE marketing_budgets IS 'Phase 3: Investment account with caps, pacing, strategy mode';
COMMENT ON TABLE allocation_decisions IS 'Phase 3: Audit trail for allocation engine output';
COMMENT ON TABLE marketing_campaign_templates IS 'Phase 3: Campaign templates for geo, audience, budget range';
COMMENT ON TABLE attribution_overrides IS 'Phase 3: Manual attribution correction per deal';
