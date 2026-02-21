/**
 * Luma-IQ Intelligent Marketing Engine – Phase 1 types.
 */

export type MarketingFundingType = 'one_time' | 'recurring';
export type MarketingFundingStatus = 'completed' | 'scheduled' | 'failed' | 'canceled';
export type MarketingTransactionType = 'credit' | 'debit';

export interface MarketingChannel {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

export interface MarketingWallet {
  id: string;
  user_id: string;
  team_id: string | null;
  workspace_id: string | null;
  balance_cents: number;
  total_funded_cents: number;
  total_spent_cents: number;
  created_at: string;
  updated_at: string;
}

export interface MarketingFunding {
  id: string;
  wallet_id: string;
  amount_cents: number;
  type: MarketingFundingType;
  status: MarketingFundingStatus;
  scheduled_at: string | null;
  created_at: string;
}

export interface MarketingTransaction {
  id: string;
  wallet_id: string;
  type: MarketingTransactionType;
  amount_cents: number;
  balance_after_cents: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface MarketingAllocation {
  id: string;
  wallet_id: string;
  channel_id: string;
  monthly_budget_cents: number;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
  channel?: MarketingChannel;
  /** Phase 2 */
  budget_cap_daily_cents?: number | null;
  budget_cap_monthly_cents?: number | null;
  last_budget_push_at?: string | null;
  last_status_push_at?: string | null;
}

export interface MarketingSpend {
  id: string;
  wallet_id: string;
  channel_id: string;
  allocation_id: string | null;
  amount_cents: number;
  period_start: string;
  period_end: string;
  campaign_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  channel?: MarketingChannel;
  /** Phase 2: 'manual' | 'api' */
  source?: string;
  /** Phase 2: idempotency for platform ingestion */
  platform_event_id?: string | null;
  /** Phase 2: raw platform payload for audit */
  raw_payload?: Record<string, unknown> | null;
}

export interface ChannelPerformance {
  channel_id: string;
  channel_slug: string;
  channel_name: string;
  spend_cents: number;
  leads_count: number;
  cost_per_lead_cents: number | null;
  closed_count: number;
  pipeline_value_cents: number;
  roi_percent: number | null;
}

export interface MarketingPerformance {
  total_spend_cents: number;
  total_leads: number;
  cost_per_lead_cents: number | null;
  closed_leads: number;
  pipeline_value_cents: number;
  roi_percent: number | null;
  by_channel: ChannelPerformance[];
  monthly_trend: { month: string; spend_cents: number; leads: number }[];
}

export interface MarketingInsight {
  id: string;
  type: 'info' | 'warning' | 'success';
  title: string;
  message: string;
  created_at: string;
}

// ─── Phase 2: Integrations & campaigns ───────────────────────────────────────
export type MarketingIntegrationProvider =
  | 'google_ads'
  | 'meta_ads'
  | 'zillow'
  | 'realtor_com'
  | 'homes_com'
  | 'redfin';
export type MarketingIntegrationStatus = 'connected' | 'disconnected' | 'error' | 'expired';

export interface MarketingIntegration {
  id: string;
  user_id: string;
  team_id: string | null;
  workspace_id: string | null;
  provider: MarketingIntegrationProvider;
  external_account_id: string;
  external_account_name: string | null;
  status: MarketingIntegrationStatus;
  last_sync_at: string | null;
  last_sync_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type MarketingCampaignStatus = 'active' | 'paused' | 'removed' | 'pending';

export interface MarketingCampaign {
  id: string;
  integration_id: string;
  wallet_id: string;
  channel_id: string;
  allocation_id: string | null;
  platform_campaign_id: string;
  platform_campaign_name: string | null;
  status: MarketingCampaignStatus;
  budget_cents_daily: number | null;
  budget_cents_monthly: number | null;
  last_budget_push_at: string | null;
  last_status_push_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type MarketingActionType = 'pause_campaign' | 'resume_campaign' | 'update_budget' | 'sync_campaigns';

export interface MarketingAction {
  id: string;
  wallet_id: string;
  user_id: string;
  action_type: MarketingActionType;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  platform_response: Record<string, unknown> | null;
  created_at: string;
}

// ─── Phase 2: Attribution ───────────────────────────────────────────────────
export type AttributionTouchType =
  | 'ad_click'
  | 'form_submit'
  | 'call'
  | 'email_response'
  | 'sms_response'
  | 'appointment_set'
  | 'deal_created'
  | 'deal_closed';

export interface LeadAttributionTouchpoint {
  id: string;
  deal_id: string;
  touch_type: AttributionTouchType;
  occurred_at: string;
  channel_id: string | null;
  campaign_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type AttributionModelType = 'first_touch' | 'last_touch' | 'linear';

export interface MarketingAttributionSettings {
  id: string;
  user_id: string;
  workspace_id: string | null;
  attribution_model: AttributionModelType;
  created_at: string;
  updated_at: string;
}

// ─── Phase 2: Tracking ──────────────────────────────────────────────────────
export interface MarketingTrackingEvent {
  id: string;
  user_id: string;
  event_type: string;
  gclid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_url: string | null;
  deal_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Phase 2: Recommendations & automation ──────────────────────────────────
export type MarketingRecommendationStatus = 'pending' | 'applied' | 'dismissed';

export interface MarketingRecommendation {
  id: string;
  user_id: string;
  wallet_id: string | null;
  recommendation_type: string;
  title: string;
  description: string | null;
  suggested_action: Record<string, unknown>;
  confidence: number | null;
  status: MarketingRecommendationStatus;
  metric_snapshot: Record<string, unknown> | null;
  applied_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export type MarketingAutomationRuleType =
  | 'reinvest_percent_of_commission'
  | 'min_wallet_balance'
  | 'cpl_below_increase_budget';

export interface MarketingAutomationRule {
  id: string;
  user_id: string;
  team_id: string | null;
  workspace_id: string | null;
  name: string;
  is_active: boolean;
  rule_type: MarketingAutomationRuleType;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
