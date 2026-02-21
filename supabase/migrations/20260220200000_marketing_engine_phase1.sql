/*
  # Luma-IQ Intelligent Marketing Engine – Phase 1

  Tables: marketing_wallets, marketing_funding, marketing_transactions,
  marketing_channels, marketing_allocations, marketing_spend.
  Extends: lead_sources (marketing_channel_id for attribution).
*/

-- ─── Channels (Google + Meta for Phase 1) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

INSERT INTO marketing_channels (slug, name) VALUES
  ('google_ads', 'Google Ads'),
  ('meta_ads', 'Meta Ads')
ON CONFLICT (slug) DO NOTHING;

-- ─── Wallets ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspace_settings(id) ON DELETE SET NULL,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  total_funded_cents bigint NOT NULL DEFAULT 0,
  total_spent_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_wallets_user ON marketing_wallets(user_id);

-- ─── Funding ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE marketing_funding_type AS ENUM ('one_time', 'recurring');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE marketing_funding_status AS ENUM ('completed', 'scheduled', 'failed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_funding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES marketing_wallets(id) ON DELETE CASCADE NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  type marketing_funding_type NOT NULL DEFAULT 'one_time',
  status marketing_funding_status NOT NULL DEFAULT 'completed',
  scheduled_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_funding_wallet ON marketing_funding(wallet_id);
CREATE INDEX IF NOT EXISTS idx_marketing_funding_created ON marketing_funding(created_at DESC);

-- ─── Transactions (audit ledger) ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE marketing_transaction_type AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS marketing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES marketing_wallets(id) ON DELETE CASCADE NOT NULL,
  type marketing_transaction_type NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  balance_after_cents bigint NOT NULL,
  description text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_transactions_wallet ON marketing_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_marketing_transactions_created ON marketing_transactions(created_at DESC);

-- ─── Allocations (monthly budget per channel) ───────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES marketing_wallets(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES marketing_channels(id) ON DELETE CASCADE NOT NULL,
  monthly_budget_cents bigint NOT NULL DEFAULT 0 CHECK (monthly_budget_cents >= 0),
  is_paused boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (wallet_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_allocations_wallet ON marketing_allocations(wallet_id);

-- ─── Spend (recorded spend per channel for CPL/ROI) ─────────────────────────
CREATE TABLE IF NOT EXISTS marketing_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES marketing_wallets(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES marketing_channels(id) ON DELETE CASCADE NOT NULL,
  allocation_id uuid REFERENCES marketing_allocations(id) ON DELETE SET NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  period_start date NOT NULL,
  period_end date NOT NULL,
  campaign_name text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_spend_wallet ON marketing_spend(wallet_id);
CREATE INDEX IF NOT EXISTS idx_marketing_spend_channel ON marketing_spend(channel_id);
CREATE INDEX IF NOT EXISTS idx_marketing_spend_period ON marketing_spend(period_start, period_end);

-- ─── Lead source → channel (attribution) ────────────────────────────────────
ALTER TABLE lead_sources
  ADD COLUMN IF NOT EXISTS marketing_channel_id uuid REFERENCES marketing_channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_sources_marketing_channel ON lead_sources(marketing_channel_id) WHERE marketing_channel_id IS NOT NULL;

-- ─── updated_at triggers ──────────────────────────────────────────────────
CREATE TRIGGER update_marketing_wallets_updated_at BEFORE UPDATE ON marketing_wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_marketing_allocations_updated_at BEFORE UPDATE ON marketing_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_funding ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_spend ENABLE ROW LEVEL SECURITY;

-- Channels: read-only for all authenticated
CREATE POLICY "Anyone can read marketing_channels"
  ON marketing_channels FOR SELECT TO authenticated USING (true);

-- Wallets: own only (agent-level)
CREATE POLICY "Users can view own marketing_wallets"
  ON marketing_wallets FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own marketing_wallets"
  ON marketing_wallets FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own marketing_wallets"
  ON marketing_wallets FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Funding: via wallet ownership
CREATE POLICY "Users can view own funding"
  ON marketing_funding FOR SELECT TO authenticated
  USING (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Users can insert own funding"
  ON marketing_funding FOR INSERT TO authenticated
  WITH CHECK (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));

-- Transactions: via wallet ownership
CREATE POLICY "Users can view own transactions"
  ON marketing_transactions FOR SELECT TO authenticated
  USING (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));

-- Allocations: via wallet ownership
CREATE POLICY "Users can manage own allocations"
  ON marketing_allocations FOR ALL TO authenticated
  USING (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));

-- Spend: via wallet ownership
CREATE POLICY "Users can view own spend"
  ON marketing_spend FOR SELECT TO authenticated
  USING (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Users can insert own spend"
  ON marketing_spend FOR INSERT TO authenticated
  WITH CHECK (wallet_id IN (SELECT id FROM marketing_wallets WHERE user_id = (SELECT auth.uid())));

COMMENT ON TABLE marketing_wallets IS 'Phase 1: Marketing wallet per agent (balance, funded, spent)';
COMMENT ON TABLE marketing_funding IS 'Phase 1: Funding history (one-time and recurring)';
COMMENT ON TABLE marketing_transactions IS 'Phase 1: Transaction ledger for audit';
COMMENT ON TABLE marketing_allocations IS 'Phase 1: Monthly budget per channel (Google, Meta)';
COMMENT ON TABLE marketing_spend IS 'Phase 1: Recorded spend per channel for CPL/ROI';
