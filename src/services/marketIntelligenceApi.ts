/**
 * Client for the market-data Supabase Edge Function.
 * Use this when real data is provided by your backend (REAL_ESTATE_API_URL).
 * The service layer falls back to local mock if the function fails or is not deployed.
 */

import { supabase } from '../lib/supabase';
import type {
  AreaSelection,
  MarketSnapshot,
  HomeEstimateInput,
  PriceEstimate,
  PropertyDetailFromApi,
} from '../types/marketIntelligence';

export async function fetchMarketSnapshotFromApi(
  area: AreaSelection,
): Promise<MarketSnapshot> {
  const { data, error } = await supabase.functions.invoke<MarketSnapshot>(
    'market-data',
    {
      body: { type: 'snapshot', area },
    },
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch market snapshot');
  }

  if (!data || !Array.isArray((data as MarketSnapshot).metrics)) {
    throw new Error('Invalid market snapshot response');
  }

  return data as MarketSnapshot;
}

export async function estimateHomeValueFromApi(
  input: HomeEstimateInput,
): Promise<PriceEstimate> {
  const { data, error } = await supabase.functions.invoke<PriceEstimate>(
    'market-data',
    {
      body: { type: 'estimate', input },
    },
  );

  if (error) {
    throw new Error(error.message || 'Failed to get estimate');
  }

  if (!data || typeof (data as PriceEstimate).mid !== 'number') {
    throw new Error('Invalid estimate response');
  }

  return data as PriceEstimate;
}

export async function fetchPropertyDetailFromApi(
  address: string,
): Promise<PropertyDetailFromApi> {
  const { data, error } = await supabase.functions.invoke<PropertyDetailFromApi>(
    'market-data',
    {
      body: { type: 'property_detail', address: address.trim() },
    },
  );

  if (error) {
    throw new Error(error.message ?? 'Failed to fetch property detail');
  }

  if (!data || typeof (data as PropertyDetailFromApi).prefilled !== 'boolean') {
    return { prefilled: false };
  }

  return data as PropertyDetailFromApi;
}
