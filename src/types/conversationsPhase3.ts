/**
 * Luma Conversations – Phase 3 types.
 * Calls, transcripts, AI call insights, internal notes, approvals,
 * workflow runs, audit ledger, retention policies.
 */

// ─── Calls ─────────────────────────────────────────────────────────────────
export type CallDirection = 'inbound' | 'outbound';

export type CallDisposition =
  | 'completed'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'canceled'
  | 'left_voicemail'
  | 'spoke'
  | 'other';

export interface Call {
  id: string;
  user_id: string;
  org_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  thread_id: string | null;
  provider_call_id: string | null;
  direction: CallDirection;
  from_number: string;
  to_number: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  disposition: CallDisposition | null;
  recording_ref: string | null;
  transcript_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Call transcripts ──────────────────────────────────────────────────────
export interface CallTranscript {
  id: string;
  call_id: string;
  user_id: string;
  transcript_text: string;
  speaker_map: unknown[];
  provider: string | null;
  created_at: string;
}

// ─── AI call insights ─────────────────────────────────────────────────────
export interface AICallInsight {
  call_id: string;
  user_id: string;
  summary: string | null;
  action_items: unknown[];
  objections: string[];
  drafts: unknown[];
  updated_at: string;
}

// ─── Internal notes ────────────────────────────────────────────────────────
export interface InternalNote {
  id: string;
  org_id: string | null;
  user_id: string;
  thread_id: string;
  contact_id: string | null;
  deal_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
}

// ─── Approvals ─────────────────────────────────────────────────────────────
export type ApprovalObjectType = 'bulk_send' | 'template' | 'sequence_step';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  org_id: string;
  requested_by: string;
  approved_by: string | null;
  object_type: ApprovalObjectType;
  object_id: string;
  status: ApprovalStatus;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Workflow runs ─────────────────────────────────────────────────────────
export type WorkflowRunStatus = 'running' | 'completed' | 'failed';

export interface WorkflowRun {
  id: string;
  org_id: string | null;
  user_id: string;
  workflow_id: string | null;
  event_id: string | null;
  status: WorkflowRunStatus;
  started_at: string;
  ended_at: string | null;
  logs: unknown[];
  idempotency_key: string | null;
  created_at: string;
}

// ─── Audit ledger ──────────────────────────────────────────────────────────
export type AuditActorType = 'system' | 'user';

export interface AuditLedgerEntry {
  id: string;
  org_id: string | null;
  user_id: string | null;
  actor_type: AuditActorType;
  actor_id: string | null;
  action_type: string;
  object_type: string;
  object_id: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// ─── Retention policies ────────────────────────────────────────────────────
export interface RetentionPolicy {
  id: string;
  org_id: string | null;
  user_id: string | null;
  messages_days: number | null;
  calls_days: number | null;
  transcripts_days: number | null;
  created_at: string;
  updated_at: string;
}
