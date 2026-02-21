/*
  # Luma Conversations – Phase 3 schema

  Adds: calls, call_transcripts, ai_call_insights, internal_notes, approvals,
  workflow_runs, audit_ledger, retention_policies.
  Extends: messaging_touches (call_id), conversation_threads (owner_user_id),
  conversation_contacts (owner_user_id, lead_source_id).
*/

-- ─── Extend Phase 1/2 tables ───────────────────────────────────────────────
ALTER TABLE conversation_threads
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE conversation_contacts
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_source_id uuid REFERENCES lead_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_threads_owner ON conversation_threads(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_contacts_owner ON conversation_contacts(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_contacts_lead_source ON conversation_contacts(lead_source_id) WHERE lead_source_id IS NOT NULL;

-- ─── Calls ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE call_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE call_disposition AS ENUM (
    'completed', 'no_answer', 'busy', 'failed', 'canceled',
    'left_voicemail', 'spoke', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES conversation_contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES conversation_threads(id) ON DELETE SET NULL,
  provider_call_id text,
  direction call_direction NOT NULL,
  from_number text NOT NULL,
  to_number text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds int,
  disposition call_disposition,
  recording_ref text,
  transcript_ref text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_deal ON calls(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_provider_id ON calls(provider_call_id) WHERE provider_call_id IS NOT NULL;

-- Touches: add call_id (FK to calls)
ALTER TABLE messaging_touches
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES calls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messaging_touches_call ON messaging_touches(call_id) WHERE call_id IS NOT NULL;

-- ─── Call transcripts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES calls(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  transcript_text text NOT NULL DEFAULT '',
  speaker_map jsonb DEFAULT '[]',
  provider text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_call_transcripts_call ON call_transcripts(call_id);

-- ─── AI call insights ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_call_insights (
  call_id uuid PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  summary text,
  action_items jsonb DEFAULT '[]',
  objections text[] DEFAULT '{}',
  drafts jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ─── Internal notes (team; not sent to clients) ────────────────────────────
CREATE TABLE IF NOT EXISTS internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  thread_id uuid REFERENCES conversation_threads(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES conversation_contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  body text NOT NULL,
  mentions uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_internal_notes_thread ON internal_notes(thread_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_org ON internal_notes(org_id) WHERE org_id IS NOT NULL;

-- ─── Approvals (compliance MVP) ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE approval_object_type AS ENUM ('bulk_send', 'template', 'sequence_step');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE CASCADE NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  object_type approval_object_type NOT NULL,
  object_id text NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  reason text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(org_id, status) WHERE status = 'pending';

-- ─── Workflow runs (observability) ───────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE workflow_run_status AS ENUM ('running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workflow_id uuid REFERENCES messaging_automations(id) ON DELETE SET NULL,
  event_id uuid REFERENCES messaging_events(id) ON DELETE SET NULL,
  status workflow_run_status NOT NULL DEFAULT 'running',
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  logs jsonb DEFAULT '[]',
  idempotency_key text UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started ON workflow_runs(started_at DESC);

-- ─── Audit ledger (append-only; server-only writes) ───────────────────────
CREATE TABLE IF NOT EXISTS audit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'user')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  object_type text NOT NULL,
  object_id text,
  reason text,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_org ON audit_ledger(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_ledger_created ON audit_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_object ON audit_ledger(object_type, object_id);

-- ─── Retention policies ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES messaging_organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  messages_days int,
  calls_days int,
  transcripts_days int,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT retention_policies_owner CHECK (org_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policies_org ON retention_policies(org_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policies_user ON retention_policies(user_id) WHERE user_id IS NOT NULL;

-- ─── updated_at triggers ──────────────────────────────────────────────────
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_call_insights_updated_at BEFORE UPDATE ON ai_call_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_retention_policies_updated_at BEFORE UPDATE ON retention_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_call_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

-- Calls: own or org
CREATE POLICY "Users can view own calls"
  ON calls FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can insert own calls"
  ON calls FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update own calls"
  ON calls FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role can manage calls"
  ON calls FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Call transcripts: own
CREATE POLICY "Users can view own call transcripts"
  ON call_transcripts FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role can manage call transcripts"
  ON call_transcripts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI call insights: own
CREATE POLICY "Users can view own ai call insights"
  ON ai_call_insights FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Service role can manage ai call insights"
  ON ai_call_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Internal notes: org members only (or user if no org)
CREATE POLICY "Users can view internal notes in own org or own"
  ON internal_notes FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (org_id IS NOT NULL AND org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())))
  );
CREATE POLICY "Users can insert internal notes when org member or own"
  ON internal_notes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (org_id IS NULL OR org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())))
  );

-- Approvals: org admins
CREATE POLICY "Org members can view approvals"
  ON approvals FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Users can request approvals"
  ON approvals FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = (SELECT auth.uid())
    AND org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()))
  );
CREATE POLICY "Admins can update approvals"
  ON approvals FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')));

-- Workflow runs: own or org
CREATE POLICY "Users can view own workflow runs"
  ON workflow_runs FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can view org workflow runs"
  ON workflow_runs FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Service role can manage workflow runs"
  ON workflow_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit ledger: read-only for org members; insert only via service_role
CREATE POLICY "Org members can view audit ledger"
  ON audit_ledger FOR SELECT TO authenticated
  USING (
    (org_id IS NULL AND user_id = (SELECT auth.uid()))
    OR (org_id IS NOT NULL AND org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())))
  );
CREATE POLICY "Service role can insert audit ledger"
  ON audit_ledger FOR INSERT TO service_role WITH CHECK (true);

-- Retention policies: own or org
CREATE POLICY "Users can view own retention policy"
  ON retention_policies FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can manage own retention policy"
  ON retention_policies FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can view org retention policy"
  ON retention_policies FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Admins can manage org retention policy"
  ON retention_policies FOR ALL TO authenticated
  USING (org_id IN (SELECT org_id FROM messaging_organization_members WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')));

COMMENT ON TABLE calls IS 'Phase 3: Voice calls linked to contacts/deals/threads';
COMMENT ON TABLE call_transcripts IS 'Phase 3: Call transcription storage';
COMMENT ON TABLE ai_call_insights IS 'Phase 3: AI summary, action items, drafts per call';
COMMENT ON TABLE internal_notes IS 'Phase 3: Team-only notes with @mentions';
COMMENT ON TABLE approvals IS 'Phase 3: Approval workflow for bulk/template compliance';
COMMENT ON TABLE workflow_runs IS 'Phase 3: Workflow execution log';
COMMENT ON TABLE audit_ledger IS 'Phase 3: Immutable audit trail';
COMMENT ON TABLE retention_policies IS 'Phase 3: Data retention per user/org';
