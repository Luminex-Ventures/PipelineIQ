/**
 * Luma-IQ Intelligent Marketing Engine – Phase 1.
 * Wallet, funding, allocations, spend, performance, insights.
 */

import { supabase } from '../lib/supabase';
import type {
  MarketingChannel,
  MarketingWallet,
  MarketingFunding,
  MarketingTransaction,
  MarketingAllocation,
  MarketingSpend,
  MarketingPerformance,
  ChannelPerformance,
  MarketingInsight,
} from '../types/marketing';

const WALLETS = 'marketing_wallets';
const FUNDING = 'marketing_funding';
const TRANSACTIONS = 'marketing_transactions';
const CHANNELS = 'marketing_channels';
const ALLOCATIONS = 'marketing_allocations';
const SPEND = 'marketing_spend';

export async function getOrCreateWallet(userId: string): Promise<MarketingWallet> {
  const { data: existing, error: fetchError } = await supabase
    .from(WALLETS)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (existing) return existing as MarketingWallet;

  const { data: created, error: insertError } = await supabase
    .from(WALLETS)
    .insert({ user_id: userId })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);
  return created as MarketingWallet;
}

export async function addFunding(
  walletId: string,
  amountCents: number,
  type: 'one_time' | 'recurring' = 'one_time'
): Promise<{ funding: MarketingFunding; wallet: MarketingWallet }> {
  if (amountCents <= 0) throw new Error('Amount must be positive');

  const { data: wallet, error: walletErr } = await supabase
    .from(WALLETS)
    .select('*')
    .eq('id', walletId)
    .single();
  if (walletErr || !wallet) throw new Error(walletErr?.message ?? 'Wallet not found');

  const newBalance = (wallet.balance_cents as number) + amountCents;
  const newFunded = (wallet.total_funded_cents as number) + amountCents;

  const { data: funding, error: fundErr } = await supabase
    .from(FUNDING)
    .insert({
      wallet_id: walletId,
      amount_cents: amountCents,
      type,
      status: 'completed',
    })
    .select()
    .single();
  if (fundErr) throw new Error(fundErr.message);

  const { error: updateErr } = await supabase
    .from(WALLETS)
    .update({
      balance_cents: newBalance,
      total_funded_cents: newFunded,
    })
    .eq('id', walletId);
  if (updateErr) throw new Error(updateErr.message);

  await supabase.from(TRANSACTIONS).insert({
    wallet_id: walletId,
    type: 'credit',
    amount_cents: amountCents,
    balance_after_cents: newBalance,
    description: type === 'recurring' ? 'Recurring funding' : 'One-time funding',
    reference_type: 'funding',
    reference_id: funding.id,
  });

  return {
    funding: funding as MarketingFunding,
    wallet: { ...wallet, balance_cents: newBalance, total_funded_cents: newFunded } as MarketingWallet,
  };
}

export async function getTransactions(
  walletId: string,
  limit = 50
): Promise<MarketingTransaction[]> {
  const { data, error } = await supabase
    .from(TRANSACTIONS)
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketingTransaction[];
}

export async function getChannels(): Promise<MarketingChannel[]> {
  const { data, error } = await supabase.from(CHANNELS).select('*').order('slug');
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketingChannel[];
}

export async function getAllocations(walletId: string): Promise<MarketingAllocation[]> {
  const { data, error } = await supabase
    .from(ALLOCATIONS)
    .select('*, channel:marketing_channels(*)')
    .eq('wallet_id', walletId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (MarketingAllocation & { channel: MarketingChannel | MarketingChannel[] })[];
  return rows.map((r) => ({
    ...r,
    channel: Array.isArray(r.channel) ? r.channel[0] : r.channel,
  })) as MarketingAllocation[];
}

export async function setAllocation(
  walletId: string,
  channelId: string,
  monthlyBudgetCents: number,
  isPaused: boolean
): Promise<MarketingAllocation> {
  if (monthlyBudgetCents < 0) throw new Error('Budget cannot be negative');

  const { data, error } = await supabase
    .from(ALLOCATIONS)
    .upsert(
      {
        wallet_id: walletId,
        channel_id: channelId,
        monthly_budget_cents: monthlyBudgetCents,
        is_paused: isPaused,
      },
      { onConflict: 'wallet_id,channel_id' }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MarketingAllocation;
}

export interface ChannelAllocationRecommendation {
  channel_id: string;
  recommended_monthly_budget_cents: number;
  reason: string;
}

/**
 * Luma recommendation for monthly budget per channel using the agent's data:
 * performance (spend, leads, ROI), current allocations, and wallet balance.
 * User can accept or override each suggestion.
 */
export async function getChannelAllocationRecommendations(
  userId: string
): Promise<ChannelAllocationRecommendation[]> {
  const wallet = await getOrCreateWallet(userId);
  const performance = await getPerformance(userId);
  const allocations = await getAllocations(wallet.id);
  const allocationByChannel = allocations.reduce(
    (acc, a) => {
      acc[a.channel_id] = a.monthly_budget_cents;
      return acc;
    },
    {} as Record<string, number>
  );

  const balanceCents = wallet.balance_cents as number;
  const byChannel = performance.by_channel;

  const raw: ChannelAllocationRecommendation[] = byChannel.map((ch) => {
    const spend = ch.spend_cents;
    const roi = ch.roi_percent;
    const currentAlloc = allocationByChannel[ch.channel_id] ?? 0;
    let recommendedCents: number;
    let reason: string;

    if (spend > 0) {
      if (roi != null && roi > 0) {
        recommendedCents = Math.round(spend * 1.15);
        reason = 'Strong ROI; Luma suggests increasing budget.';
      } else if (roi != null && roi < 0) {
        recommendedCents = Math.round(spend * 0.9);
        reason = 'Based on recent spend; consider reallocating to higher-ROI channels.';
      } else {
        recommendedCents = Math.round(spend * 1.05);
        reason = 'Based on your recent spend.';
      }
    } else {
      recommendedCents = currentAlloc > 0 ? currentAlloc : 0;
      reason = currentAlloc > 0
        ? 'No recent spend; Luma suggests keeping current allocation.'
        : 'Set a budget when you\'re ready to run campaigns.';
    }

    return {
      channel_id: ch.channel_id,
      recommended_monthly_budget_cents: Math.max(0, recommendedCents),
      reason,
    };
  });

  const totalRecommended = raw.reduce((s, r) => s + r.recommended_monthly_budget_cents, 0);
  if (totalRecommended <= 0 || totalRecommended <= balanceCents) {
    return raw;
  }
  const scale = balanceCents / totalRecommended;
  return raw.map((r) => ({
    ...r,
    recommended_monthly_budget_cents: Math.round(r.recommended_monthly_budget_cents * scale),
  }));
}

export async function getSpend(
  walletId: string,
  options?: { periodStart?: string; periodEnd?: string }
): Promise<MarketingSpend[]> {
  let q = supabase
    .from(SPEND)
    .select('*, channel:marketing_channels(*)')
    .eq('wallet_id', walletId)
    .order('period_start', { ascending: false })
    .limit(100);
  if (options?.periodStart) q = q.gte('period_start', options.periodStart);
  if (options?.periodEnd) q = q.lte('period_end', options.periodEnd);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (MarketingSpend & { channel: MarketingChannel | MarketingChannel[] })[];
  return rows.map((r) => ({
    ...r,
    channel: Array.isArray(r.channel) ? r.channel[0] : r.channel,
  })) as MarketingSpend[];
}

export async function recordSpend(
  walletId: string,
  channelId: string,
  amountCents: number,
  periodStart: string,
  periodEnd: string,
  campaignName?: string | null
): Promise<MarketingSpend> {
  if (amountCents <= 0) throw new Error('Amount must be positive');

  const { data: wallet, error: walletErr } = await supabase
    .from(WALLETS)
    .select('balance_cents, total_spent_cents')
    .eq('id', walletId)
    .single();
  if (walletErr || !wallet) throw new Error(walletErr?.message ?? 'Wallet not found');
  const balance = wallet.balance_cents as number;
  if (balance < amountCents) throw new Error('Insufficient wallet balance');

  const newBalance = balance - amountCents;
  const newSpent = (wallet.total_spent_cents as number) + amountCents;

  const { data: spend, error: spendErr } = await supabase
    .from(SPEND)
    .insert({
      wallet_id: walletId,
      channel_id: channelId,
      amount_cents: amountCents,
      period_start: periodStart,
      period_end: periodEnd,
      campaign_name: campaignName ?? null,
    })
    .select()
    .single();
  if (spendErr) throw new Error(spendErr.message);

  await supabase
    .from(WALLETS)
    .update({ balance_cents: newBalance, total_spent_cents: newSpent })
    .eq('id', walletId);

  await supabase.from(TRANSACTIONS).insert({
    wallet_id: walletId,
    type: 'debit',
    amount_cents: amountCents,
    balance_after_cents: newBalance,
    description: 'Marketing spend',
    reference_type: 'spend',
    reference_id: spend.id,
  });

  return spend as MarketingSpend;
}

/**
 * Aggregate performance: spend by channel, leads by channel (via lead_sources.marketing_channel_id), CPL, ROI.
 */
export async function getPerformance(userId: string): Promise<MarketingPerformance> {
  const wallet = await getOrCreateWallet(userId);
  const channels = await getChannels();
  const now = new Date();
  const thisYearStart = `${now.getFullYear()}-01-01`;
  const periodEnd = now.toISOString().slice(0, 10);

  const { data: spendRows } = await supabase
    .from(SPEND)
    .select('channel_id, amount_cents')
    .eq('wallet_id', wallet.id)
    .gte('period_start', thisYearStart)
    .lte('period_end', periodEnd);

  const spendByChannel = (spendRows ?? []).reduce((acc, r) => {
    const id = r.channel_id as string;
    acc[id] = (acc[id] ?? 0) + Number(r.amount_cents);
    return acc;
  }, {} as Record<string, number>);

  const { data: leadSourceRows } = await supabase
    .from('lead_sources')
    .select('id, marketing_channel_id')
    .eq('user_id', userId)
    .not('marketing_channel_id', 'is', null);

  const leadSourceToChannel = (leadSourceRows ?? []).reduce(
    (acc, r) => {
      acc[r.id] = r.marketing_channel_id as string;
      return acc;
    },
    {} as Record<string, string>
  );
  const sourceIds = Object.keys(leadSourceToChannel);
  if (sourceIds.length === 0) {
    const byChannel: ChannelPerformance[] = channels.map((c) => ({
      channel_id: c.id,
      channel_slug: c.slug,
      channel_name: c.name,
      spend_cents: spendByChannel[c.id] ?? 0,
      leads_count: 0,
      cost_per_lead_cents: null,
      closed_count: 0,
      pipeline_value_cents: 0,
      roi_percent: null,
    }));
    const totalSpend = Object.values(spendByChannel).reduce((a, b) => a + b, 0);
    const monthlyTrend = await getMonthlySpendTrend(wallet.id, now.getFullYear());
    return {
      total_spend_cents: totalSpend,
      total_leads: 0,
      cost_per_lead_cents: null,
      closed_leads: 0,
      pipeline_value_cents: 0,
      roi_percent: null,
      by_channel: byChannel,
      monthly_trend: monthlyTrend,
    };
  }

  const { data: deals } = await supabase
    .from('deals')
    .select('id, lead_source_id, status, expected_sale_price, actual_sale_price')
    .eq('user_id', userId)
    .in('lead_source_id', sourceIds)
    .gte('created_at', `${thisYearStart}T00:00:00.000Z`);

  const dealsByChannel = (deals ?? []).reduce(
    (acc, d) => {
      const ch = d.lead_source_id ? leadSourceToChannel[d.lead_source_id] : null;
      if (!ch) return acc;
      if (!acc[ch]) acc[ch] = { leads: 0, closed: 0, value: 0 };
      acc[ch].leads += 1;
      if (d.status === 'closed') {
        acc[ch].closed += 1;
        acc[ch].value += Number(d.actual_sale_price ?? 0) * 100;
      } else {
        acc[ch].value += Number(d.expected_sale_price ?? 0) * 100;
      }
      return acc;
    },
    {} as Record<string, { leads: number; closed: number; value: number }>
  );

  const byChannel: ChannelPerformance[] = channels.map((c) => {
    const spend = spendByChannel[c.id] ?? 0;
    const dc = dealsByChannel[c.id] ?? { leads: 0, closed: 0, value: 0 };
    const cpl = dc.leads > 0 ? Math.round(spend / dc.leads) : null;
    const roi = spend > 0 ? Math.round((dc.value / 100 - spend / 100) / (spend / 100) * 100) : null;
    return {
      channel_id: c.id,
      channel_slug: c.slug,
      channel_name: c.name,
      spend_cents: spend,
      leads_count: dc.leads,
      cost_per_lead_cents: cpl,
      closed_count: dc.closed,
      pipeline_value_cents: dc.value,
      roi_percent: roi,
    };
  });

  const totalSpend = Object.values(spendByChannel).reduce((a, b) => a + b, 0);
  const totalLeads = Object.values(dealsByChannel).reduce((a, d) => a + d.leads, 0);
  const totalClosed = Object.values(dealsByChannel).reduce((a, d) => a + d.closed, 0);
  const totalValue = Object.values(dealsByChannel).reduce((a, d) => a + d.value, 0);
  const monthlyTrend = await getMonthlySpendTrend(wallet.id, now.getFullYear());

  return {
    total_spend_cents: totalSpend,
    total_leads: totalLeads,
    cost_per_lead_cents: totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null,
    closed_leads: totalClosed,
    pipeline_value_cents: totalValue,
    roi_percent: totalSpend > 0 ? Math.round((totalValue / 100 - totalSpend / 100) / (totalSpend / 100) * 100) : null,
    by_channel: byChannel,
    monthly_trend: monthlyTrend,
  };
}

async function getMonthlySpendTrend(
  walletId: string,
  year: number
): Promise<{ month: string; spend_cents: number; leads: number }[]> {
  const { data: spendRows } = await supabase
    .from(SPEND)
    .select('period_start, period_end, amount_cents')
    .eq('wallet_id', walletId);
  const byMonth: Record<string, number> = {};
  for (let m = 1; m <= 12; m++) {
    byMonth[`${year}-${String(m).padStart(2, '0')}`] = 0;
  }
  for (const r of spendRows ?? []) {
    const start = (r.period_start as string).slice(0, 7);
    if (start.startsWith(String(year))) {
      byMonth[start] = (byMonth[start] ?? 0) + Number(r.amount_cents);
    }
  }
  return Object.entries(byMonth).map(([month, spend_cents]) => ({
    month,
    spend_cents,
    leads: 0,
  }));
}

/**
 * Rule-based insights (Phase 1, no AI).
 */
export async function getInsights(userId: string): Promise<MarketingInsight[]> {
  const wallet = await getOrCreateWallet(userId);
  const perf = await getPerformance(userId);
  const allocations = await getAllocations(wallet.id);
  const insights: MarketingInsight[] = [];
  const now = Date.now();

  if (perf.by_channel.length >= 2) {
    const [a, b] = perf.by_channel;
    const aLeads = a.leads_count;
    const bLeads = b.leads_count;
    if (aLeads > bLeads && aLeads > 0) {
      insights.push({
        id: 'channel-outperform',
        type: 'success',
        title: `${a.channel_name} is outperforming ${b.channel_name} this period`,
        message: `${a.channel_name} generated ${aLeads} leads vs ${bLeads} from ${b.channel_name}.`,
        created_at: new Date(now).toISOString(),
      });
    }
  }

  const lastMonthCpl = perf.cost_per_lead_cents;
  if (lastMonthCpl != null && lastMonthCpl > 0 && perf.total_leads >= 3) {
    insights.push({
      id: 'cpl-context',
      type: 'info',
      title: 'Cost per lead',
      message: `Your average cost per lead is $${(lastMonthCpl / 100).toFixed(2)} (${perf.total_leads} leads, $${(perf.total_spend_cents / 100).toFixed(2)} spend).`,
      created_at: new Date(now).toISOString(),
    });
  }

  const burnRate = allocations
    .filter((a) => !a.is_paused && a.monthly_budget_cents > 0)
    .reduce((s, a) => s + a.monthly_budget_cents, 0);
  if (burnRate > 0 && wallet.balance_cents > 0) {
    const daysLeft = Math.floor((wallet.balance_cents / burnRate) * 30);
    if (daysLeft <= 14) {
      insights.push({
        id: 'budget-low',
        type: 'warning',
        title: 'You may run out of budget soon',
        message: `At current burn rate, wallet balance could be depleted in about ${daysLeft} days. Consider adding funds or pausing an allocation.`,
        created_at: new Date(now).toISOString(),
      });
    }
  }

  if (perf.roi_percent != null && perf.roi_percent > 0) {
    insights.push({
      id: 'roi-positive',
      type: 'success',
      title: 'Positive ROI',
      message: `Marketing ROI is estimated at ${perf.roi_percent}% (pipeline value vs spend).`,
      created_at: new Date(now).toISOString(),
    });
  }

  return insights;
}

// ─── Phase 2: Integrations ───────────────────────────────────────────────────
const INTEGRATIONS = 'marketing_integrations';
const CAMPAIGNS = 'marketing_campaigns';
const ACTIONS = 'marketing_actions';
const TOUCHPOINTS = 'lead_attribution_touchpoints';
const ATTRIBUTION_SETTINGS = 'marketing_attribution_settings';
const TRACKING_EVENTS = 'marketing_tracking_events';
const RECOMMENDATIONS = 'marketing_recommendations';
const AUTOMATION_RULES = 'marketing_automation_rules';

export async function listIntegrations(userId: string): Promise<import('../types/marketing').MarketingIntegration[]> {
  const { data, error } = await supabase
    .from(INTEGRATIONS)
    .select('*')
    .eq('user_id', userId)
    .in('status', ['connected', 'error'])
    .order('provider');
  if (error) throw new Error(error.message);
  return (data ?? []) as import('../types/marketing').MarketingIntegration[];
}

export async function disconnectIntegration(
  userId: string,
  integrationId: string
): Promise<void> {
  const { error } = await supabase
    .from(INTEGRATIONS)
    .update({ status: 'disconnected' })
    .eq('id', integrationId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function createIntegration(
  userId: string,
  params: {
    provider: import('../types/marketing').MarketingIntegrationProvider;
    external_account_name?: string | null;
  }
): Promise<import('../types/marketing').MarketingIntegration> {
  const external_account_id = `manual-${crypto.randomUUID()}`;
  const { data, error } = await supabase
    .from(INTEGRATIONS)
    .insert({
      user_id: userId,
      provider: params.provider,
      external_account_id,
      external_account_name: params.external_account_name ?? null,
      status: 'connected',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as import('../types/marketing').MarketingIntegration;
}

export interface MarketingOAuthStartResult {
  auth_url: string;
  state: string;
}

export async function startMarketingOAuth(
  provider: 'google_ads' | 'meta_ads'
): Promise<MarketingOAuthStartResult> {
  const { data, error } = await supabase.functions.invoke<MarketingOAuthStartResult>(
    'marketing-oauth-start',
    { body: { provider } }
  );
  if (error) throw new Error(error.message ?? 'Failed to start marketing OAuth');
  if (!data?.auth_url) throw new Error('Invalid marketing OAuth start response');
  return data;
}

export async function listCampaigns(walletId: string): Promise<import('../types/marketing').MarketingCampaign[]> {
  const { data, error } = await supabase
    .from(CAMPAIGNS)
    .select('*')
    .eq('wallet_id', walletId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as import('../types/marketing').MarketingCampaign[];
}

export async function getOrCreateAttributionSettings(
  userId: string
): Promise<import('../types/marketing').MarketingAttributionSettings> {
  const { data: existing, error: fetchErr } = await supabase
    .from(ATTRIBUTION_SETTINGS)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (existing) return existing as import('../types/marketing').MarketingAttributionSettings;
  const { data: created, error: insertErr } = await supabase
    .from(ATTRIBUTION_SETTINGS)
    .insert({ user_id: userId, attribution_model: 'last_touch' })
    .select()
    .single();
  if (insertErr) throw new Error(insertErr.message);
  return created as import('../types/marketing').MarketingAttributionSettings;
}

export async function updateAttributionModel(
  userId: string,
  model: 'first_touch' | 'last_touch' | 'linear'
): Promise<void> {
  const { error } = await supabase
    .from(ATTRIBUTION_SETTINGS)
    .update({ attribution_model: model })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listRecommendations(
  userId: string,
  options?: { status?: 'pending' | 'applied' | 'dismissed' }
): Promise<import('../types/marketing').MarketingRecommendation[]> {
  let q = supabase.from(RECOMMENDATIONS).select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (options?.status) q = q.eq('status', options.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as import('../types/marketing').MarketingRecommendation[];
}

export async function applyRecommendation(
  recommendationId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from(RECOMMENDATIONS)
    .update({ status: 'applied', applied_at: new Date().toISOString() })
    .eq('id', recommendationId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function dismissRecommendation(
  recommendationId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from(RECOMMENDATIONS)
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', recommendationId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listAutomationRules(userId: string): Promise<import('../types/marketing').MarketingAutomationRule[]> {
  const { data, error } = await supabase
    .from(AUTOMATION_RULES)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as import('../types/marketing').MarketingAutomationRule[];
}

export async function createAutomationRule(
  userId: string,
  params: {
    name: string;
    rule_type: import('../types/marketing').MarketingAutomationRuleType;
    config: Record<string, unknown>;
    is_active?: boolean;
  }
): Promise<import('../types/marketing').MarketingAutomationRule> {
  const { data, error } = await supabase
    .from(AUTOMATION_RULES)
    .insert({
      user_id: userId,
      name: params.name,
      rule_type: params.rule_type,
      config: params.config,
      is_active: params.is_active ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as import('../types/marketing').MarketingAutomationRule;
}

export async function logTrackingEvent(
  userId: string,
  params: {
    event_type: string;
    gclid?: string | null;
    fbclid?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    landing_url?: string | null;
    deal_id?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from(TRACKING_EVENTS).insert({
    user_id: userId,
    event_type: params.event_type,
    gclid: params.gclid ?? null,
    fbclid: params.fbclid ?? null,
    utm_source: params.utm_source ?? null,
    utm_medium: params.utm_medium ?? null,
    utm_campaign: params.utm_campaign ?? null,
    landing_url: params.landing_url ?? null,
    deal_id: params.deal_id ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}
