/*
  # Transaction & E-sign integrations (DocuSign, Dotloop)

  - transaction_integration_provider enum and transaction_integrations table.
  - RLS: users manage own rows.
*/

DO $$ BEGIN
  CREATE TYPE transaction_integration_provider AS ENUM ('docusign', 'dotloop');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_integration_status AS ENUM ('connected', 'disconnected', 'error', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS transaction_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider transaction_integration_provider NOT NULL,
  external_account_id text NOT NULL,
  external_account_name text,
  token_ref text,
  refresh_token_ref text,
  status transaction_integration_status NOT NULL DEFAULT 'connected',
  last_sync_at timestamptz,
  last_sync_error text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_transaction_integrations_user ON transaction_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_integrations_provider ON transaction_integrations(provider);

CREATE TRIGGER update_transaction_integrations_updated_at
  BEFORE UPDATE ON transaction_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE transaction_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own transaction_integrations"
  ON transaction_integrations FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE transaction_integrations IS 'Transaction & e-sign integrations (DocuSign, Dotloop) per user';
