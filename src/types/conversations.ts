/**
 * Luma Conversations – Phase 1 types.
 * Align with supabase/migrations/20260220120000_luma_conversations_schema.sql
 */

export type ConnectedAccountProvider = 'gmail' | 'microsoft' | 'twilio';
export type ConnectedAccountStatus = 'connected' | 'disconnected' | 'error';
export type ThreadChannel = 'email' | 'sms';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed';
export type CampaignEnrollmentStatus = 'active' | 'paused' | 'completed' | 'stopped';

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: ConnectedAccountProvider;
  status: ConnectedAccountStatus;
  external_account_id: string | null;
  token_ref: string | null;
  metadata: Record<string, unknown>;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CommunicationConsent = 'unknown' | 'consented' | 'declined';

export interface ConversationContact {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  unsubscribed_email: boolean;
  opted_out_sms: boolean;
  communication_consent?: CommunicationConsent;
  created_at: string;
  updated_at: string;
}

export interface ConversationThread {
  id: string;
  user_id: string;
  primary_contact_id: string | null;
  channel: ThreadChannel;
  subject: string | null;
  last_message_at: string | null;
  unread_count: number;
  metadata: Record<string, unknown>;
  deal_id?: string | null;
  stage_id?: string | null;
  opportunity_type?: string | null;
  created_at: string;
  updated_at: string;
  contact?: ConversationContact | null;
  last_snippet?: string | null;
}

export interface ConversationMessage {
  id: string;
  user_id: string;
  thread_id: string;
  direction: MessageDirection;
  channel: ThreadChannel;
  from_address: string | null;
  from_phone: string | null;
  to_address: string | null;
  to_phone: string | null;
  subject: string | null;
  body_text: string;
  body_html: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  received_at: string | null;
  status: MessageStatus;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConversationCampaign {
  id: string;
  user_id: string;
  name: string;
  channel: ThreadChannel;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  steps?: CampaignStep[];
}

export interface CampaignStep {
  id: string;
  campaign_id: string;
  step_order: number;
  delay_days: number;
  subject: string | null;
  body_template: string;
  created_at: string;
}

export interface CampaignEnrollment {
  id: string;
  campaign_id: string;
  user_id: string;
  contact_id: string;
  status: CampaignEnrollmentStatus;
  current_step: number;
  next_send_at: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
  contact?: ConversationContact | null;
  campaign?: ConversationCampaign | null;
}

export interface WebhookEvent {
  id: string;
  user_id: string | null;
  provider: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
}
