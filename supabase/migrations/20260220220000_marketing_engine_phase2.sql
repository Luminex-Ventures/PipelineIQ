/*
  # Luma-IQ Intelligent Marketing Engine – Phase 2

  Extends: marketing_spend (source, platform_event_id, raw_payload),
           marketing_allocations (budget caps, last_push timestamps).
  New: marketing_integrations, marketing_campaigns, marketing_actions,
       lead_attribution_touchpoints, marketing_attribution_settings,
       marketing_tracking_events, marketing_recommendations, marketing_automation_rules.
  Ties to existing: deals, lead_sources, marketing_wallets, marketing_channels.
*/

-- ─── Ad platform integrations (OAuth + account selection) ────────────────────
DO $$ BEGIN
  CREATE TYPE marketing_integration_provider AS ENUM ('google_ads', 'meta_ads');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE marketing_integration_status AS ENUM ('connected', 'disconnected', 'error', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspace_settings(id) ON DELETE SET NULL,
  provider marketing_integration_provider NOT NULL,
  external_account_id text NOT NULL,
  external_account_name text,
  token_ref text,
  refresh_token_ref text,
  status marketing_integration_status NOT NULL DEFAULT 'connected',
  last_sync_at timestamptz,
  last_sync_error text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_integrations_user ON marketing_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_integrations_provider ON marketing_integrations(provider);

-- ─── Campaigns (platform-linked; maps allocation → platform campaign) ────────
DO $$ BEGIN
  CREATE TYPE marketing_campaign_status AS ENUM ('active', 'paused', 'removed', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES marketing_integrations(id) ON DELETE CASCADE NOT NULL,
  wallet_id uuid REFERENCES marketing_wallets(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES marketing_channels(id) ON DELETE CASCADE NOT NULL,
  allocation_id uuid REFERENCES marketing_allocations(id) ON DELETE SET NULL,
  platform_campaign_id text NOT NULL,
  platform_campaign_name text,
  status marketing_campaign_status NOT NULL DEFAULT 'active',
  budget_cents_daily bigint,
  budget_cents_monthly bigint,
  last_budget_push_at timestamptz,
  last_status_push_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (integration_id, platform_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_wallet ON marketing_campaigns(wallet_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_integration ON marketing_campaigns(integration_id);

-- ─── Extend allocations (caps + push timestamps) ────────────────────────────
ALTER TABLE marketing_allocations
  ADD COLUMN IF NOT EXISTS budget_cap_daily_cents bigint,
  ADD COLUMN IF NOT EXISTS budget_cap_monthly_cents bigint,
  ADD COLUMN IF NOT EXISTS last_budget_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_push_at timestamptz;

-- ─── Extend spend (source, idempotency, raw for audit) ───────────────────────
ALTER TABLE marketing_spend
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  ADD COLUMN IF NOT EXISTS platform_event_id text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_spend_platform_event
  ON marketing_spend(platform_event_id) WHERE platform_event_id IS NOT NULL;

-- ─── Actions log (every control change: who, what, before/after, platform response) ─
DO $$ BEGIN
  CREATE TYPE marketing_action_type AS ENUM ('pause_campaign', 'resume_campaign', 'update_budget', 'sync_campaigns');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES marketing_wallets(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action_type marketing_action_type NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_state jsonb,
  after_state jsonb,
  platform_response jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_actions_wallet ON marketing_actions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_marketing_actions_created ON marketing_actions(created_at DESC);

-- ─── Lead attribution touchpoints (multi-touch; ties to existing deals) ────
DO $$ BEGIN
  CREATE TYPE attribution_touch_type AS ENUM (
    'ad_click', 'form_submit', 'call', 'email_response', 'sms_response',
    'appointment_set', 'deal_created', 'deal_closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lead_attribution_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  touch_type attribution_touch_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  channel_id uuid REFERENCES marketing_channels(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_touchpoints_deal ON lead_attribution_touchpoints(deal_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_touchpoints_occurred ON lead_attribution_touchpoints(occurred_at);

-- ─── Attribution model per user/workspace ────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE attribution_model_type AS ENUM ('first_touch', 'last_touch', 'linear');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_attribution_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspace_settings(id) ON DELETE SET NULL,
  attribution_model attribution_model_type NOT NULL DEFAULT 'last_touch',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

-- ─── Tracking events (clicks, form submits; gclid/fbclid/UTM) ────────────────
CREATE TABLE IF NOT EXISTS marketing_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  gclid text,
  fbclid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_url text,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_tracking_events_user ON marketing_tracking_events(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_tracking_events_created ON marketing_tracking_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_tracking_events_gclid ON marketing_tracking_events(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_tracking_events_fbclid ON marketing_tracking_events(fbclid) WHERE fbclid IS NOT NULL;

-- ─── UTM / click IDs on deals (optional; for first-touch from form) ──────────
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS fbclid text;

-- ─── Recommendations (rule-based + assistive; explainable) ────────────────────
DO $$ BEGIN
  CREATE TYPE marketing_recommendation_status AS ENUM ('pending', 'applied', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  wallet_id uuid REFERENCES marketing_wallets(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL,
  title text NOT NULL,
  description text,
  suggested_action jsonb NOT NULL DEFAULT '{}',
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  status marketing_recommendation_status NOT NULL DEFAULT 'pending',
  metric_snapshot jsonb,
  applied_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_recommendations_user ON marketing_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_recommendations_status ON marketing_recommendations(status) WHERE status = 'pending';

-- ─── Automation rules (reinvest, min balance, CPL-based budget) ─────────────
DO $$ BEGIN
  CREATE TYPE marketing_automation_rule_type AS ENUM (
    'reinvest_percent_of_commission',
    'min_wallet_balance',
    'cpl_below_increase_budget'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspace_settings(id) ON DELETE SET NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  rule_type marketing_automation_rule_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_automation_rules_user ON marketing_automation_rules(user_id);

-- ─── updated_at triggers ────────────────────────────────────────────────────
CREATE TRIGGER update_marketing_integrations_updated_at BEFORE UPDATE ON marketing_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_marketing_campaigns_updated_at BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_marketing_attribution_settings_updated_at BEFORE UPDATE ON marketing_attribution_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_marketing_automation_rules_updated_at BEFORE UPDATE ON marketing_automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE marketing_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_attribution_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_attribution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own marketing_integrations"
  ON marketing_integrations FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can manage campaigns for own wallets"
  ON marketing_campaigns FOR ALL TO authenticated
  USING (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Users can view actions for own wallets"
  ON marketing_actions FOR SELECT TO authenticated
  USING (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Users can insert actions for own wallets"
  ON marketing_actions FOR INSERT TO authenticated
  WITH CHECK (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Users can manage touchpoints for own deals"
  ON lead_attribution_touchpoints FOR ALL TO authenticated
  USING (deal_id IN (SELECT id FROM deals WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (deal_id IN (SELECT id FROM deals WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Users can manage own attribution_settings"
  ON marketing_attribution_settings FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can manage own tracking_events"
  ON marketing_tracking_events FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can manage own recommendations"
  ON marketing_recommendations FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can manage own automation_rules"
  ON marketing_automation_rules FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

COMMENT ON TABLE marketing_integrations IS 'Phase 2: Ad platform OAuth + account selection (Google/Meta)';
COMMENT ON TABLE marketing_campaigns IS 'Phase 2: Platform campaigns linked to wallet/allocation';
COMMENT ON TABLE marketing_actions IS 'Phase 2: Audit log for pause/resume/budget changes';
COMMENT ON TABLE lead_attribution_touchpoints IS 'Phase 2: Multi-touch attribution per deal';
COMMENT ON TABLE marketing_attribution_settings IS 'Phase 2: First/last/linear model per user';
COMMENT ON TABLE marketing_tracking_events IS 'Phase 2: Clicks, form submits; gclid/fbclid/UTM';
COMMENT ON TABLE marketing_recommendations IS 'Phase 2: Explainable recommendations (pending/applied/dismissed)';
COMMENT ON TABLE marketing_automation_rules IS 'Phase 2: Reinvestment + pacing rules';
