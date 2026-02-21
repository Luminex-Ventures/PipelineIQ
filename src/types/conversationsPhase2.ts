/**
 * Luma Conversations – Phase 2 types.
 * Events, automations, sequences 2.0, queue, AI insights, touches, templates, orgs.
 */

import type { ThreadChannel } from './conversations';

export type CommunicationConsent = 'unknown' | 'consented' | 'declined';
export type MessagingOrgRole = 'owner' | 'admin' | 'member';
export type MessageSendQueueStatus = 'queued' | 'processing' | 'sent' | 'failed';
export type SequenceEnrollmentStatus = 'active' | 'paused' | 'completed' | 'stopped';
export type TouchChannel = 'email' | 'sms' | 'call' | 'other';

// ─── Pipeline link (extends thread) ─────────────────────────────────────────
export interface ThreadPipelineLink {
  deal_id: string | null;
  stage_id: string | null;
  opportunity_type: string | null;
}

// ─── Organizations ───────────────────────────────────────────────────────
export interface MessagingOrganization {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface MessagingOrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: MessagingOrgRole;
  created_at: string;
  updated_at: string;
}

// ─── Templates ────────────────────────────────────────────────────────────
export interface MessagingTemplate {
  id: string;
  org_id: string | null;
  user_id: string | null;
  channel: ThreadChannel;
  name: string;
  subject: string | null;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── Events ───────────────────────────────────────────────────────────────
export type MessagingEventType =
  | 'contact_created'
  | 'deal_stage_changed'
  | 'inbound_reply'
  | 'no_reply_after_days'
  | 'appointment_scheduled'
  | 'market_signal';

export interface MessagingEvent {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

// ─── Automations ───────────────────────────────────────────────────────────
export interface MessagingAutomation {
  id: string;
  user_id: string;
  org_id: string | null;
  name: string;
  is_active: boolean;
  trigger_type: string;
  conditions: Record<string, unknown>;
  actions: unknown[];
  created_at: string;
  updated_at: string;
}

// ─── Sequences 2.0 ────────────────────────────────────────────────────────
export interface MessagingSequence {
  id: string;
  user_id: string;
  org_id: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  steps?: MessagingSequenceStep[];
}

export interface MessagingSequenceStep {
  id: string;
  sequence_id: string;
  step_key: string;
  channel: ThreadChannel;
  delay_minutes: number;
  subject_template: string | null;
  body_template: string;
  branch_on_reply_to: string | null;
  branch_on_no_reply_to: string | null;
  created_at: string;
}

export interface MessagingSequenceEnrollment {
  id: string;
  sequence_id: string;
  user_id: string;
  contact_id: string;
  status: SequenceEnrollmentStatus;
  current_step_key: string | null;
  next_run_at: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Send queue ───────────────────────────────────────────────────────────
export interface MessageSendQueueItem {
  id: string;
  user_id: string;
  contact_id: string;
  thread_id: string | null;
  channel: ThreadChannel;
  to_address: string | null;
  to_phone: string | null;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  status: MessageSendQueueStatus;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ─── AI insights ───────────────────────────────────────────────────────────
export interface MessagingAIThreadInsight {
  thread_id: string;
  user_id: string;
  model_version: string | null;
  prompt_version: string | null;
  summary: string | null;
  intent: string | null;
  sentiment: string | null;
  urgency_score: number | null;
  next_best_action: string | null;
  suggested_drafts: unknown[];
  updated_at: string;
}

export interface MessagingAIContactInsight {
  contact_id: string;
  user_id: string;
  engagement_score: number | null;
  lead_temperature: string | null;
  objections: string[];
  preferences: Record<string, unknown>;
  recommended_cadence: string | null;
  updated_at: string;
}

// ─── Touches ───────────────────────────────────────────────────────────────
export interface MessagingTouch {
  id: string;
  user_id: string;
  contact_id: string;
  deal_id: string | null;
  channel: TouchChannel;
  message_id: string | null;
  /** Phase 3: set when touch is from a call */
  call_id?: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
}
