/**
 * Address suggestions for Property Valuation.
 * Calls the address-suggestions Edge Function, which proxies the US Census
 * Bureau Geocoder (no API key). Deploy with: supabase functions deploy address-suggestions
 */

import { supabase } from '../lib/supabase';

export interface AddressSuggestion {
  address: string;
}

interface EdgeFunctionResponse {
  suggestions?: AddressSuggestion[];
}

export async function fetchAddressSuggestions(
  query: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  try {
    const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
      'address-suggestions',
      { body: { q: trimmed } },
    );

    if (error) {
      console.warn('[addressSuggestions] Edge Function error:', error);
      return [];
    }

    return data?.suggestions ?? [];
  } catch (err) {
    console.warn('[addressSuggestions] Failed:', err);
    return [];
  }
}
