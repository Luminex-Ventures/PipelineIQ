import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type AnalyticsFilterState = {
  year: number;
  agents: string[];
  stages: string[];
  sources: string[];
  types: string[];
};

type UseAnalyticsFilterPersistenceProps = {
  year: number;
  agents: string[];
  stages: string[];
  sources: string[];
  types: string[];
  setYear: (value: number) => void;
  setAgents: (value: string[]) => void;
  setStages: (value: string[]) => void;
  setSources: (value: string[]) => void;
  setTypes: (value: string[]) => void;
};

const STORAGE_KEY = 'analytics.filters.v1';

const parseCsv = (value: string | null) => {
  if (value === null) return null;
  if (value.trim() === '') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

const parseYear = (value: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readStoredFilters = (): Partial<AnalyticsFilterState> => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<AnalyticsFilterState>;
  } catch {
    return {};
  }
};

export const useAnalyticsFilterPersistence = ({
  year,
  agents,
  stages,
  sources,
  types,
  setYear,
  setAgents,
  setStages,
  setSources,
  setTypes,
}: UseAnalyticsFilterPersistenceProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;

    const stored = readStoredFilters();
    const urlYear = parseYear(searchParams.get('year'));
    const urlAgents = parseCsv(searchParams.get('agents'));
    const urlStages = parseCsv(searchParams.get('stages'));
    const urlSources = parseCsv(searchParams.get('sources'));
    const urlTypes = parseCsv(searchParams.get('types'));

    if (searchParams.has('year') && urlYear) {
      setYear(urlYear);
    } else if (!searchParams.has('year') && stored.year) {
      setYear(stored.year);
    }

    if (searchParams.has('agents') && urlAgents) {
      setAgents(urlAgents);
    } else if (!searchParams.has('agents') && stored.agents) {
      setAgents(stored.agents);
    }

    if (searchParams.has('stages') && urlStages) {
      setStages(urlStages);
    } else if (!searchParams.has('stages') && stored.stages) {
      setStages(stored.stages);
    }

    if (searchParams.has('sources') && urlSources) {
      setSources(urlSources);
    } else if (!searchParams.has('sources') && stored.sources) {
      setSources(stored.sources);
    }

    if (searchParams.has('types') && urlTypes) {
      setTypes(urlTypes);
    } else if (!searchParams.has('types') && stored.types) {
      setTypes(stored.types);
    }

    hydratedRef.current = true;
    setHydrated(true);
  }, [searchParams, setAgents, setSources, setStages, setTypes, setYear]);

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams();
    params.set('year', String(year));
    if (agents.length) params.set('agents', agents.slice().sort().join(','));
    if (stages.length) params.set('stages', stages.slice().sort().join(','));
    if (sources.length) params.set('sources', sources.slice().sort().join(','));
    if (types.length) params.set('types', types.slice().sort().join(','));
    setSearchParams(params, { replace: true });

    const payload: AnalyticsFilterState = {
      year,
      agents,
      stages,
      sources,
      types,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [agents, hydrated, setSearchParams, sources, stages, types, year]);

  return { hydrated };
};
