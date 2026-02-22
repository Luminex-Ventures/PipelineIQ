/**
 * Phase 3: Vendor-agnostic provider interface for marketing channels.
 * All channel integrations (Zillow, Google Ads, Meta, etc.) implement this.
 * Credentials are passed by the caller (from secure storage); never stored in provider code.
 */

export interface ProviderConfig {
  provider: string;
  externalAccountId: string;
  externalAccountName: string | null;
  /** Opaque credential for API calls (token, API key ref, etc.). From vault or env. */
  credential: unknown;
  metadata?: Record<string, unknown>;
}

export interface CreateCampaignParams {
  name: string;
  channelId: string;
  budgetCentsDaily: number | null;
  budgetCentsMonthly: number | null;
  targetGeography?: Record<string, unknown>;
  audienceKeywords?: Record<string, unknown>;
  landingPageUrl?: string | null;
  trackingFields?: Record<string, unknown>;
}

export interface UpdateCampaignParams {
  platformCampaignId: string;
  budgetCentsDaily?: number | null;
  budgetCentsMonthly?: number | null;
  status?: 'active' | 'paused';
}

export interface CampaignSpendMetrics {
  platformCampaignId: string;
  platformCampaignName: string | null;
  spendCents: number;
  periodStart: string;
  periodEnd: string;
  impressions?: number;
  clicks?: number;
  leadsCount?: number;
  raw?: Record<string, unknown>;
}

export interface LeadConversionResult {
  providerLeadId: string;
  platformCampaignId: string | null;
  occurredAt: string;
  status?: string;
  raw?: Record<string, unknown>;
}

export interface CreateCampaignResult {
  platformCampaignId: string;
  platformCampaignName: string | null;
  status: string;
  raw?: Record<string, unknown>;
}

/**
 * Implemented by each channel (Google Ads, Meta, Zillow, stub).
 * Caller is responsible for resolving credentials and passing them in config.
 */
export interface IMarketingProvider {
  readonly slug: string;

  /** Create a campaign; returns platform campaign id. */
  createCampaign(config: ProviderConfig, params: CreateCampaignParams): Promise<CreateCampaignResult>;

  /** Update budget or status. */
  updateCampaign(config: ProviderConfig, params: UpdateCampaignParams): Promise<{ success: boolean; raw?: Record<string, unknown> }>;

  /** Pause campaign. */
  pauseCampaign(config: ProviderConfig, platformCampaignId: string): Promise<{ success: boolean; raw?: Record<string, unknown> }>;

  /** Resume campaign. */
  resumeCampaign(config: ProviderConfig, platformCampaignId: string): Promise<{ success: boolean; raw?: Record<string, unknown> }>;

  /** Read spend and delivery metrics for a period (and optionally per campaign). */
  getSpendAndDeliveryMetrics(
    config: ProviderConfig,
    periodStart: string,
    periodEnd: string,
    platformCampaignIds?: string[]
  ): Promise<CampaignSpendMetrics[]>;

  /** Read leads/conversions where provider exposes (polling). Webhook ingestion is separate. */
  getLeadsConversions?(
    config: ProviderConfig,
    since: string,
    platformCampaignIds?: string[]
  ): Promise<LeadConversionResult[]>;
}
