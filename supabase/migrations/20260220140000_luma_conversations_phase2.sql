/*
  # Luma Conversations – Phase 2 schema

  Adds: organizations, organization_members, templates, automations, events,
  sequences + sequence_steps + sequence_enrollments, message_send_queue,
  ai_thread_insights, ai_contact_insights, touches.
  Extends: conversation_contacts (communication_consent), conversation_threads (deal_id, stage_id, opportunity_type).
*/

-- ─── Extend Phase 1 tables ─────────────────────────────────────────────────
ALTER TABLE conversation_contacts
  ADD COLUMN IF NOT EXISTS communication_consent text DEFAULT 'unknown'
    CHECK (communication_consent IN ('unknown', 'consented', 'declined'));

ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES pipeline_statuses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_type text;

CREATE INDEX IF NOT EXISTS idx_conversation_threads_deal_id ON conversation_threads(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_threads_stage_id ON conversation_threads(stage_id) WHERE stage_id IS NOT NULL;

-- ─── Organizations (messaging teams/broker) ───────────────────────────────
CREATE TABLE IF NOT EXISTS messaging_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS messaging_organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messaging_org_members_org ON messaging_organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_messaging_org_members_user ON messaging_organization_members(user_id);

-- ─── Templates (personal + org-shared) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS messaging_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel thread_channel NOT NULL,
  name text NOT NULL,
  subject text,
  body text NOT NULL DEFAULT '',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT messaging_templates_owner CHECK (org_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_messaging_templates_user ON messaging_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_messaging_templates_org ON messaging_templates(org_id) WHERE org_id IS NOT NULL;

-- ─── Events (for automation engine) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS messaging_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_messaging_events_unprocessed ON messaging_events(created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messaging_events_user ON messaging_events(user_id);

-- ─── Automations (rules: trigger + conditions + actions) ───────────────────
CREATE TABLE IF NOT EXISTS messaging_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL,
  conditions jsonb DEFAULT '{}',
  actions jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messaging_automations_user ON messaging_automations(user_id);

-- ─── Sequences 2.0 (multi-channel + branching) ──────────────────────────────
CREATE TABLE IF NOT EXISTS messaging_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messaging_sequences_user ON messaging_sequences(user_id);

CREATE TABLE IF NOT EXISTS messaging_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid REFERENCES messaging_sequences(id) ON DELETE CASCADE NOT NULL,
  step_key text NOT NULL,
  channel thread_channel NOT NULL,
  delay_minutes int NOT NULL DEFAULT 0,
  subject_template text,
  body_template text NOT NULL DEFAULT '',
  branch_on_reply_to text,
  branch_on_no_reply_to text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messaging_sequence_steps_seq ON messaging_sequence_steps(sequence_id);

DO $$ BEGIN
  CREATE TYPE messaging_sequence_enrollment_status AS ENUM ('active', 'paused', 'completed', 'stopped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS messaging_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid REFERENCES messaging_sequences(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES conversation_contacts(id) ON DELETE CASCADE NOT NULL,
  status messaging_sequence_enrollment_status NOT NULL DEFAULT 'active',
  current_step_key text,
  next_run_at timestamptz,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (sequence_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_messaging_seq_enrollments_next ON messaging_sequence_enrollments(next_run_at) WHERE status = 'active';

-- ─── Message send queue (reliability + idempotency) ─────────────────────────
DO $$ BEGIN
  CREATE TYPE message_send_queue_status AS ENUM ('queued', 'processing', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS message_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES conversation_contacts(id) ON DELETE CASCADE NOT NULL,
  thread_id uuid REFERENCES conversation_threads(id) ON DELETE SET NULL,
  channel thread_channel NOT NULL,
  to_address text,
  to_phone text,
  payload jsonb NOT NULL DEFAULT '{}',
  idempotency_key text UNIQUE,
  status message_send_queue_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  last_error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_send_queue_ready ON message_send_queue(next_attempt_at) WHERE status = 'queued';
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_send_queue_idempotency ON message_send_queue(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ─── AI insights (thread + contact) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messaging_ai_thread_insights (
  thread_id uuid PRIMARY KEY REFERENCES conversation_threads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  model_version text,
  prompt_version text,
  summary text,
  intent text,
  sentiment text,
  urgency_score int,
  next_best_action text,
  suggested_drafts jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS messaging_ai_contact_insights (
  contact_id uuid PRIMARY KEY REFERENCES conversation_contacts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  engagement_score int,
  lead_temperature text,
  objections text[] DEFAULT '{}',
  preferences jsonb DEFAULT '{}',
  recommended_cadence text,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ─── Touches (pipeline integration) ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE touch_channel AS ENUM ('email', 'sms', 'call', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS messaging_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES conversation_contacts(id) ON DELETE CASCADE NOT NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  channel touch_channel NOT NULL,
  message_id uuid REFERENCES conversation_messages(id) ON DELETE SET NULL,
  occurred_at timestamptz DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_messaging_touches_contact ON messaging_touches(contact_id);
CREATE INDEX IF NOT EXISTS idx_messaging_touches_deal ON messaging_touches(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messaging_touches_occurred ON messaging_touches(occurred_at DESC);

-- ─── Consent events (audit) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messaging_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES conversation_contacts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  previous_consent text,
  new_consent text NOT NULL,
  source text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messaging_consent_events_contact ON messaging_consent_events(contact_id);

-- ─── updated_at triggers ──────────────────────────────────────────────────
CREATE TRIGGER update_messaging_organizations_updated_at BEFORE UPDATE ON messaging_organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messaging_org_members_updated_at BEFORE UPDATE ON messaging_organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messaging_templates_updated_at BEFORE UPDATE ON messaging_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messaging_automations_updated_at BEFORE UPDATE ON messaging_automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messaging_sequences_updated_at BEFORE UPDATE ON messaging_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messaging_sequence_enrollments_updated_at BEFORE UPDATE ON messaging_sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_message_send_queue_updated_at BEFORE UPDATE ON message_send_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messaging_ai_thread_insights_updated_at BEFORE UPDATE ON messaging_ai_thread_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messaging_ai_contact_insights_updated_at BEFORE UPDATE ON messaging_ai_contact_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE messaging_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_ai_thread_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_ai_contact_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_consent_events ENABLE ROW LEVEL SECURITY;

-- Organizations: members can view their org
CREATE POLICY "Members can view own orgs"
  ON messaging_organizations FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Owners can update org"
  ON messaging_organizations FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()) AND role = 'owner'));

-- Org members: members can view same org
CREATE POLICY "Users can view org members of own orgs"
  ON messaging_organization_members FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Admins can manage org members"
  ON messaging_organization_members FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')));

-- Templates: own or org-scoped
CREATE POLICY "Users can view own or org templates"
  ON messaging_templates FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (org_id IS NOT NULL AND org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())))
  );
CREATE POLICY "Users can insert own templates"
  ON messaging_templates FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own templates"
  ON messaging_templates FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Admins can insert org templates"
  ON messaging_templates FOR INSERT TO authenticated
  WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')));
CREATE POLICY "Admins can update org templates"
  ON messaging_templates FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')));

-- Events: own only
CREATE POLICY "Users can view own events"
  ON messaging_events FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role can insert events"
  ON messaging_events FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update events"
  ON messaging_events FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Automations: own or org
CREATE POLICY "Users can manage own automations"
  ON messaging_automations FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can view org automations"
  ON messaging_automations FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())));

-- Sequences: own or org
CREATE POLICY "Users can manage own sequences"
  ON messaging_sequences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can view org sequences"
  ON messaging_sequences FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())));

-- Sequence steps: via sequence ownership
CREATE POLICY "Users can view sequence steps"
  ON messaging_sequence_steps FOR SELECT TO authenticated
  USING (sequence_id IN (SELECT id FROM messaging_sequences WHERE user_id = (SELECT auth.uid()) OR org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()))));
CREATE POLICY "Users can manage steps of own sequences"
  ON messaging_sequence_steps FOR ALL TO authenticated
  USING (sequence_id IN (SELECT id FROM messaging_sequences WHERE user_id = (SELECT auth.uid())));

-- Sequence enrollments: own
CREATE POLICY "Users can manage own enrollments"
  ON messaging_sequence_enrollments FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Send queue: own only
CREATE POLICY "Users can view own queue"
  ON message_send_queue FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users and service can insert queue"
  ON message_send_queue FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Service can update queue"
  ON message_send_queue FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- AI insights: own
CREATE POLICY "Users can view own thread insights"
  ON messaging_ai_thread_insights FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service can manage thread insights"
  ON messaging_ai_thread_insights FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own contact insights"
  ON messaging_ai_contact_insights FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service can manage contact insights"
  ON messaging_ai_contact_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Touches: own
CREATE POLICY "Users can manage own touches"
  ON messaging_touches FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Consent events: own
CREATE POLICY "Users can view own consent events"
  ON messaging_consent_events FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert consent events"
  ON messaging_consent_events FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

COMMENT ON TABLE messaging_organizations IS 'Phase 2: Messaging teams/broker orgs for shared templates and sequences';
COMMENT ON TABLE messaging_templates IS 'Phase 2: Email/SMS templates, personal or org-shared';
COMMENT ON TABLE messaging_events IS 'Phase 2: Event log for automation engine';
COMMENT ON TABLE messaging_automations IS 'Phase 2: Trigger-based automation rules';
COMMENT ON TABLE messaging_sequences IS 'Phase 2: Multi-channel sequences with branching';
COMMENT ON TABLE message_send_queue IS 'Phase 2: Queue for reliable sending with retries';
COMMENT ON TABLE messaging_ai_thread_insights IS 'Phase 2: Luma AI thread summary, intent, next action';
COMMENT ON TABLE messaging_ai_contact_insights IS 'Phase 2: Luma AI contact engagement and temperature';
COMMENT ON TABLE messaging_touches IS 'Phase 2: Touch timeline linked to deals';
