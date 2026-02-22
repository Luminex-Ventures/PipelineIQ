/**
 * Phase 3: Stub provider for development and testing.
 * Implements IMarketingProvider with no-op or mock responses.
 */

import type {
  IMarketingProvider,
  ProviderConfig,
  CreateCampaignParams,
  UpdateCampaignParams,
  CreateCampaignResult,
  CampaignSpendMetrics,
} from './types';

export const STUB_PROVIDER_SLUG = 'stub';

export class StubMarketingProvider implements IMarketingProvider {
  readonly slug = STUB_PROVIDER_SLUG;

  async createCampaign(
    _config: ProviderConfig,
    params: CreateCampaignParams
  ): Promise<CreateCampaignResult> {
    const id = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return {
      platformCampaignId: id,
      platformCampaignName: params.name || 'Stub Campaign',
      status: 'active',
      raw: { stub: true, params },
    };
  }

  async updateCampaign(
    _config: ProviderConfig,
    params: UpdateCampaignParams
  ): Promise<{ success: boolean; raw?: Record<string, unknown> }> {
    return { success: true, raw: { stub: true, params } };
  }

  async pauseCampaign(
    _config: ProviderConfig,
    platformCampaignId: string
  ): Promise<{ success: boolean; raw?: Record<string, unknown> }> {
    return { success: true, raw: { stub: true, platformCampaignId } };
  }

  async resumeCampaign(
    _config: ProviderConfig,
    platformCampaignId: string
  ): Promise<{ success: boolean; raw?: Record<string, unknown> }> {
    return { success: true, raw: { stub: true, platformCampaignId } };
  }

  async getSpendAndDeliveryMetrics(
    _config: ProviderConfig,
    periodStart: string,
    periodEnd: string,
    platformCampaignIds?: string[]
  ): Promise<CampaignSpendMetrics[]> {
    const ids = platformCampaignIds?.length ? platformCampaignIds : ['stub_default'];
    return ids.map((platformCampaignId) => ({
      platformCampaignId,
      platformCampaignName: 'Stub Campaign',
      spendCents: 0,
      periodStart,
      periodEnd,
      impressions: 0,
      clicks: 0,
      leadsCount: 0,
      raw: { stub: true },
    }));
  }
}
