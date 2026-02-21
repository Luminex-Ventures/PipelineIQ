/*
  # Luma Conversations – Phase 1 schema

  Tables: connected_accounts, conversation_contacts, threads, messages,
  campaigns, campaign_steps, campaign_enrollments, webhook_events.
  Enums: connected_account_provider, connected_account_status, thread_channel,
  message_direction, message_status, campaign_enrollment_status.
*/

-- Enums
DO $$ BEGIN
  CREATE TYPE connected_account_provider AS ENUM ('gmail', 'microsoft', 'twilio');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE connected_account_status AS ENUM ('connected', 'disconnected', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE thread_channel AS ENUM ('email', 'sms');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_enrollment_status AS ENUM ('active', 'paused', 'completed', 'stopped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1) connected_accounts
CREATE TABLE IF NOT EXISTS connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider connected_account_provider NOT NULL,
  status connected_account_status NOT NULL DEFAULT 'connected',
  external_account_id text,
  token_ref text,
  metadata jsonb DEFAULT '{}',
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_id ON connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider ON connected_accounts(provider);

-- 2) contacts (conversation contacts; separate from deal client fields)
CREATE TABLE IF NOT EXISTS conversation_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text,
  email text,
  phone text,
  tags text[] DEFAULT '{}',
  unsubscribed_email boolean DEFAULT false NOT NULL,
  opted_out_sms boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_contacts_user_id ON conversation_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_contacts_email ON conversation_contacts(user_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_contacts_phone ON conversation_contacts(user_id, phone) WHERE phone IS NOT NULL;

-- 3) threads
CREATE TABLE IF NOT EXISTS conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  primary_contact_id uuid REFERENCES conversation_contacts(id) ON DELETE SET NULL,
  channel thread_channel NOT NULL,
  subject text,
  last_message_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_user_id ON conversation_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_last_message_at ON conversation_threads(user_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_channel ON conversation_threads(user_id, channel);

-- 4) messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  thread_id uuid REFERENCES conversation_threads(id) ON DELETE CASCADE NOT NULL,
  direction message_direction NOT NULL,
  channel thread_channel NOT NULL,
  from_address text,
  from_phone text,
  to_address text,
  to_phone text,
  subject text,
  body_text text NOT NULL DEFAULT '',
  body_html text,
  provider_message_id text,
  sent_at timestamptz,
  received_at timestamptz DEFAULT now(),
  status message_status NOT NULL DEFAULT 'sent',
  error text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread_id ON conversation_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_id ON conversation_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_provider_id ON conversation_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- 5) campaigns
CREATE TABLE IF NOT EXISTS conversation_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  channel thread_channel NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_campaigns_user_id ON conversation_campaigns(user_id);

-- 6) campaign_steps
CREATE TABLE IF NOT EXISTS conversation_campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES conversation_campaigns(id) ON DELETE CASCADE NOT NULL,
  step_order int NOT NULL,
  delay_days int NOT NULL DEFAULT 0,
  subject text,
  body_template text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_campaign_steps_campaign_id ON conversation_campaign_steps(campaign_id);

-- 7) campaign_enrollments
CREATE TABLE IF NOT EXISTS conversation_campaign_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES conversation_campaigns(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES conversation_contacts(id) ON DELETE CASCADE NOT NULL,
  status campaign_enrollment_status NOT NULL DEFAULT 'active',
  current_step int NOT NULL DEFAULT 0,
  next_send_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_campaign_id ON conversation_campaign_enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_next_send_at ON conversation_campaign_enrollments(next_send_at) WHERE status = 'active';

-- 8) webhook_events (audit)
CREATE TABLE IF NOT EXISTS conversation_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}',
  received_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_webhook_events_received_at ON conversation_webhook_events(received_at DESC);

-- updated_at triggers (reuse existing function if present)
CREATE TRIGGER update_connected_accounts_updated_at BEFORE UPDATE ON connected_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_contacts_updated_at BEFORE UPDATE ON conversation_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_threads_updated_at BEFORE UPDATE ON conversation_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_campaigns_updated_at BEFORE UPDATE ON conversation_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_campaign_enrollments_updated_at BEFORE UPDATE ON conversation_campaign_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_webhook_events ENABLE ROW LEVEL SECURITY;

-- Policies (use (SELECT auth.uid()) for performance)
CREATE POLICY "Users can view own connected_accounts"
  ON connected_accounts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own connected_accounts"
  ON connected_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own connected_accounts"
  ON connected_accounts FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own connected_accounts"
  ON connected_accounts FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can view own conversation_contacts"
  ON conversation_contacts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own conversation_contacts"
  ON conversation_contacts FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own conversation_contacts"
  ON conversation_contacts FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own conversation_contacts"
  ON conversation_contacts FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can view own conversation_threads"
  ON conversation_threads FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own conversation_threads"
  ON conversation_threads FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own conversation_threads"
  ON conversation_threads FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own conversation_threads"
  ON conversation_threads FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can view own conversation_messages"
  ON conversation_messages FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own conversation_messages"
  ON conversation_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own conversation_messages"
  ON conversation_messages FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can view own conversation_campaigns"
  ON conversation_campaigns FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own conversation_campaigns"
  ON conversation_campaigns FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own conversation_campaigns"
  ON conversation_campaigns FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own conversation_campaigns"
  ON conversation_campaigns FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- campaign_steps: access via campaign ownership
CREATE POLICY "Users can view steps of own campaigns"
  ON conversation_campaign_steps FOR SELECT TO authenticated
  USING (
    campaign_id IN (SELECT id FROM conversation_campaigns WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Users can insert steps of own campaigns"
  ON conversation_campaign_steps FOR INSERT TO authenticated
  WITH CHECK (
    campaign_id IN (SELECT id FROM conversation_campaigns WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Users can update steps of own campaigns"
  ON conversation_campaign_steps FOR UPDATE TO authenticated
  USING (
    campaign_id IN (SELECT id FROM conversation_campaigns WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Users can delete steps of own campaigns"
  ON conversation_campaign_steps FOR DELETE TO authenticated
  USING (
    campaign_id IN (SELECT id FROM conversation_campaigns WHERE user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Users can view own campaign_enrollments"
  ON conversation_campaign_enrollments FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own campaign_enrollments"
  ON conversation_campaign_enrollments FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own campaign_enrollments"
  ON conversation_campaign_enrollments FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own campaign_enrollments"
  ON conversation_campaign_enrollments FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- webhook_events: service role writes; users can view own
CREATE POLICY "Users can view own webhook_events"
  ON conversation_webhook_events FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Service role can insert webhook_events"
  ON conversation_webhook_events FOR INSERT TO service_role
  WITH CHECK (true);

COMMENT ON TABLE connected_accounts IS 'Luma Conversations: OAuth and Twilio connected accounts per user';
COMMENT ON TABLE conversation_contacts IS 'Luma Conversations: contacts for inbox and campaigns';
COMMENT ON TABLE conversation_threads IS 'Luma Conversations: email/SMS thread per contact channel';
COMMENT ON TABLE conversation_messages IS 'Luma Conversations: individual messages in a thread';
COMMENT ON TABLE conversation_campaigns IS 'Luma Conversations: drip campaigns';
COMMENT ON TABLE conversation_campaign_steps IS 'Luma Conversations: campaign step definitions';
COMMENT ON TABLE conversation_campaign_enrollments IS 'Luma Conversations: contact enrolled in campaign';
COMMENT ON TABLE conversation_webhook_events IS 'Luma Conversations: audit log for provider webhooks';
