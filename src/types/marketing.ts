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
