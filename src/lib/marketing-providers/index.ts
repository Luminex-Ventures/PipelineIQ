/**
 * Phase 3: Marketing provider registry and factory.
 * Add real providers (Google, Meta, Zillow) here; they must implement IMarketingProvider.
 */

import type { IMarketingProvider } from './types';
import { StubMarketingProvider, STUB_PROVIDER_SLUG } from './stub-provider';

const providers = new Map<string, IMarketingProvider>([
  [STUB_PROVIDER_SLUG, new StubMarketingProvider()],
]);

export function registerProvider(provider: IMarketingProvider): void {
  providers.set(provider.slug, provider);
}

export function getProvider(slug: string): IMarketingProvider | undefined {
  return providers.get(slug);
}

export function getProviderOrThrow(slug: string): IMarketingProvider {
  const p = providers.get(slug);
  if (!p) throw new Error(`Unknown marketing provider: ${slug}`);
  return p;
}

export { StubMarketingProvider, STUB_PROVIDER_SLUG };
export type {
  IMarketingProvider,
  ProviderConfig,
  CreateCampaignParams,
  UpdateCampaignParams,
  CreateCampaignResult,
  CampaignSpendMetrics,
  LeadConversionResult,
} from './types';
