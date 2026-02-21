import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  AreaSelection,
  HomeEstimateInput,
  PriceEstimate,
  MarketInsight,
} from '../types/marketIntelligence';
import {
  fetchMarketSnapshot,
  estimateHomeValue,
  generateInsights,
  getLastSelectedArea,
  saveAreaSelection,
  searchAreas,
  type AreaOption,
} from '../services/marketIntelligence';

export function useMarketSnapshot(area: AreaSelection | null) {
  return useQuery({
    queryKey: ['market-snapshot', area?.type, area?.value],
    queryFn: () => fetchMarketSnapshot(area!),
    enabled: !!area,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useHomeEstimator() {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (input: HomeEstimateInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await estimateHomeValue(input);
      setEstimate(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Estimation failed';
      setError(message);
      console.error('[useHomeEstimator] Estimation error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setEstimate(null);
    setError(null);
  }, []);

  return { estimate, loading, error, run, reset };
}

export function useMarketInsights(
  metrics: import('../types/marketIntelligence').MarketMetric[] | undefined,
): MarketInsight[] {
  const [insights, setInsights] = useState<MarketInsight[]>([]);

  useEffect(() => {
    if (metrics && metrics.length > 0) {
      setInsights(generateInsights(metrics));
    } else {
      setInsights([]);
    }
  }, [metrics]);

  return insights;
}

export function useAreaSelection() {
  const [area, setAreaState] = useState<AreaSelection | null>(() =>
    getLastSelectedArea(),
  );

  const selectArea = useCallback((next: AreaSelection) => {
    setAreaState(next);
    saveAreaSelection(next);
  }, []);

  return { area, selectArea };
}

export function useAreaSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AreaOption[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchAreas(query);
        setResults(data);
      } catch (err) {
        console.error('[useAreaSearch] Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { query, setQuery, results, searching };
}
