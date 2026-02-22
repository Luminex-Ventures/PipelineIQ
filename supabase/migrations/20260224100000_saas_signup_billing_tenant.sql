/*
  # SaaS Signup + Billing + Tenant Provisioning

  - Plans (config-driven)
  - Tenant reservations (lifecycle: draft → reserved → checkout → payment_pending → active | failed | canceled)
  - Provisioning jobs (queued/running/succeeded/failed)
  - Subscriptions (provider_customer_id, subscription_id, status, plan_code)
  - Subdomain blocklist, organizations.subdomain
  - Audit log for lifecycle and billing events
*/

-- ─── Plans (config-driven; seed below) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  max_agents int NOT NULL DEFAULT 1 CHECK (max_agents >= 0),
  provider_price_id text,
  features jsonb DEFAULT '[]',
  sort_order int NOT NULL DEFAULT 0,
  is_enterprise boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TRIGGER update_saas_plans_updated_at
  BEFORE UPDATE ON saas_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO saas_plans (code, name, description, max_agents, provider_price_id, features, sort_order, is_enterprise) VALUES
  ('independent', 'Independent Agent', 'Solo agent plan', 1, NULL, '["Pipeline", "Analytics", "Marketing"]', 1, false),
  ('small_team', 'Small Team', 'Up to 10 agents', 10, NULL, '["Pipeline", "Analytics", "Marketing", "Team"]', 2, false),
  ('large_team', 'Large Team', 'Up to 50 agents', 50, NULL, '["Pipeline", "Analytics", "Marketing", "Team", "API"]', 3, false),
  ('enterprise', 'Enterprise', 'Custom', 0, NULL, '["Everything", "Dedicated support"]', 4, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  max_agents = EXCLUDED.max_agents,
  provider_price_id = EXCLUDED.provider_price_id,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_enterprise = EXCLUDED.is_enterprise,
  updated_at = now();

-- ─── Tenant lifecycle state ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE tenant_reservation_state AS ENUM (
    'draft', 'reserved', 'checkout_initiated', 'payment_pending',
    'active', 'past_due', 'canceled', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE provisioning_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing', 'incomplete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Subdomain blocklist (reserved words) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS subdomain_blocklist (
  word text PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL
);

INSERT INTO subdomain_blocklist (word) VALUES
  ('admin'), ('api'), ('www'), ('app'), ('support'), ('billing'), ('docs'), ('mail'), ('status'),
  ('help'), ('blog'), ('dev'), ('staging'), ('test'), ('demo'), ('luma'), ('luma-iq'), ('root'),
  ('login'), ('signup'), ('auth'), ('dashboard'), ('api-docs'), ('webhooks')
ON CONFLICT (word) DO NOTHING;

-- ─── Organizations: add subdomain (unique; nullable for existing) ─────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'subdomain') THEN
    ALTER TABLE organizations ADD COLUMN subdomain text UNIQUE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_subdomain ON organizations(subdomain) WHERE subdomain IS NOT NULL;

-- ─── Tenant reservations (signup flow; lifecycle state) ──────────────────────
CREATE TABLE IF NOT EXISTS tenant_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain text NOT NULL,
  plan_code text NOT NULL REFERENCES saas_plans(code),
  workspace_name text NOT NULL,
  owner_email text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  state tenant_reservation_state NOT NULL DEFAULT 'draft',
  expires_at timestamptz,
  checkout_session_id text,
  provider_customer_id text,
  provider_subscription_id text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  idempotency_event_id text,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (subdomain)
);

CREATE INDEX IF NOT EXISTS idx_tenant_reservations_state ON tenant_reservations(state);
CREATE INDEX IF NOT EXISTS idx_tenant_reservations_checkout ON tenant_reservations(checkout_session_id) WHERE checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_reservations_idempotency ON tenant_reservations(idempotency_event_id) WHERE idempotency_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_reservations_expires ON tenant_reservations(expires_at) WHERE expires_at IS NOT NULL;

CREATE TRIGGER update_tenant_reservations_updated_at
  BEFORE UPDATE ON tenant_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Provisioning jobs (server-side; retries + dead-letter) ─────────────────────
CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES tenant_reservations(id) ON DELETE CASCADE,
  status provisioning_job_status NOT NULL DEFAULT 'queued',
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provisioning_jobs_status ON provisioning_jobs(status);
CREATE INDEX IF NOT EXISTS idx_provisioning_jobs_reservation ON provisioning_jobs(reservation_id);

-- ─── Subscriptions (after provisioning; link org to provider) ──────────────────
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  provider_customer_id text NOT NULL,
  provider_subscription_id text,
  plan_code text NOT NULL REFERENCES saas_plans(code),
  status subscription_status NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_org ON saas_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_provider_customer ON saas_subscriptions(provider_customer_id);

CREATE TRIGGER update_saas_subscriptions_updated_at
  BEFORE UPDATE ON saas_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Audit log (lifecycle, billing, invites) ───────────────────────────────────
DO $$ BEGIN
  CREATE TYPE audit_event_type AS ENUM (
    'tenant_created', 'tenant_state_change', 'subscription_created', 'subscription_updated',
    'plan_change', 'user_invited', 'billing_status_change', 'provisioning_started', 'provisioning_completed', 'provisioning_failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS saas_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type audit_event_type NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor_id text,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_log_entity ON saas_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_saas_audit_log_created ON saas_audit_log(created_at DESC);

-- ─── RLS: tenant_reservations (anon can insert draft/reserved; polling via Edge Function only) ───
ALTER TABLE tenant_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert draft or reserved (anon)"
  ON tenant_reservations FOR INSERT TO anon
  WITH CHECK (state IN ('draft', 'reserved'));
CREATE POLICY "Service role full access"
  ON tenant_reservations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- RLS: provisioning_jobs (service role only; admin view later)
ALTER TABLE provisioning_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role provisioning_jobs"
  ON provisioning_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS: saas_subscriptions (org members can read own org)
ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can read org subscription"
  ON saas_subscriptions FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Service role saas_subscriptions"
  ON saas_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS: saas_plans (read-only for all)
ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plans"
  ON saas_plans FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated read plans"
  ON saas_plans FOR SELECT TO authenticated USING (true);

-- RLS: saas_audit_log (service role write; admin read via app later)
ALTER TABLE saas_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role audit"
  ON saas_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS: subdomain_blocklist (read for validation)
ALTER TABLE subdomain_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read blocklist"
  ON subdomain_blocklist FOR SELECT TO anon USING (true);

COMMENT ON TABLE saas_plans IS 'SaaS: Config-driven plans (Independent, Small Team, Large Team, Enterprise)';
COMMENT ON TABLE tenant_reservations IS 'SaaS: Signup flow lifecycle; provision only after webhook confirms payment';
COMMENT ON TABLE provisioning_jobs IS 'SaaS: Server-side provisioning with retries';
COMMENT ON TABLE saas_subscriptions IS 'SaaS: Org subscription state from provider';
COMMENT ON TABLE saas_audit_log IS 'SaaS: Audit trail for tenant and billing events';

-- ─── Enterprise leads (contact-sales form) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL DEFAULT 'enterprise',
  name text NOT NULL,
  email text NOT NULL,
  company text,
  team_size text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enterprise_leads_created ON enterprise_leads(created_at DESC);

ALTER TABLE enterprise_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon insert for contact form"
  ON enterprise_leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Service role read"
  ON enterprise_leads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── RPC: subdomain available (rate-limit at app/edge layer) ────────────────────
CREATE OR REPLACE FUNCTION saas_subdomain_available(p_subdomain text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
BEGIN
  norm := lower(trim(p_subdomain));
  IF length(norm) < 3 OR length(norm) > 30 THEN
    RETURN false;
  END IF;
  IF norm !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM subdomain_blocklist WHERE word = norm) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE subdomain = norm) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_reservations WHERE subdomain = norm AND state NOT IN ('canceled', 'failed') AND (expires_at IS NULL OR expires_at > now())) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- ─── RPC: resolve tenant (subdomain → organization_id for authenticated member) ─
CREATE OR REPLACE FUNCTION resolve_tenant(p_subdomain text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id AND om.user_id = auth.uid()
  WHERE o.subdomain = p_subdomain
  LIMIT 1;
$$;
