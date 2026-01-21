import { useEffect, useMemo, useState, useTransition } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { MultiSelectCombobox } from '../components/ui/MultiSelectCombobox';
import { getVisibleUserIds } from '../lib/rbac';
import type { Database } from '../lib/database.types';
import { runAnalyticsDateChecks } from '../lib/analyticsDateRules';
import { useAnalyticsFilterPersistence } from '../hooks/useAnalyticsFilterPersistence';
type DealRow = Database['public']['Tables']['deals']['Row'];

// Date basis rules:
// - Closed-year datasets (yearly stats, monthly rollup, avg days, closing-this-month) use close_ts.
// - Created-year datasets (lead source totals for created cohort, archive reasons, funnel) use created_at.
// - Lead source closed counts/commission are based on the created-year cohort, not closed-year.
// - UTC grouping is enforced to avoid timezone drift at month/year boundaries.
// Example: a deal created Dec 2024 and closed Jan 2025 counts in 2025 closed stats.

interface YearlyStats {
  closedDeals: number;
  totalVolume: number;
  totalGCI: number;
  avgSalePrice: number;
  avgCommission: number;
  buyerDeals: number;
  sellerDeals: number;
  avgDaysToClose: number;
}

interface LeadSourceStat {
  id: string | null;
  name: string;
  totalDeals: number;
  closedDeals: number;
  conversionRate: number;
  totalCommission: number;
}

interface MonthlyData {
  month: string;
  gci: number;
  deals: number;
}

interface ClosingThisMonthStats {
  count: number;
  gci: number;
}

interface AccessibleAgentRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  global_role?: string | null;
}

interface AgentOption {
  id: string;
  label: string;
  email: string;
}

interface StageOption {
  id: string;
  label: string;
  sortOrder?: number | null;
}

interface ArchiveStats {
  total: number;
  reasons: {
    reason: ArchiveReason;
    count: number;
    percentage: number;
  }[];
}

type FunnelStage = 'lead' | 'in_progress' | 'closed_won' | 'archived';

interface FunnelTransition {
  from: FunnelStage;
  to: FunnelStage;
  entered: number;
  advanced: number;
  rate: number;
}

interface AnalyticsSummaryResponse {
  yearly_stats: {
    closed_deals: number;
    total_volume: number;
    total_gci: number;
    avg_sale_price: number;
    avg_commission: number;
    buyer_deals: number;
    seller_deals: number;
    avg_days_to_close: number;
  };
  monthly_rollup: Array<{ month: string; gci: number; deals: number }>;
  lead_source_stats: Array<{
    id: string | null;
    name: string;
    total_deals: number;
    closed_deals: number;
    conversion_rate: number;
    total_commission: number;
  }>;
  archive_stats: {
    total: number;
    reasons: Array<{ reason: ArchiveReason; count: number; percentage: number }>;
  };
  closing_this_month: { count: number; gci: number };
  funnel_transitions?: FunnelTransition[];
  filter_context?: {
    lead_sources?: Array<{ id: string; name: string }>;
    pipeline_stages?: Array<{ id: string; name: string; sort_order?: number | null }>;
    deal_types?: DealRow['deal_type'][];
  };
  annual_gci_goal?: number;
}

const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />
);

const StatCardsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, index) => (
      <div key={`stat-skeleton-${index}`} className="rounded-2xl border border-gray-200/70 bg-white/90 p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-4 h-7 w-24" />
        <Skeleton className="mt-3 h-3 w-28" />
        <Skeleton className="mt-3 h-3 w-36" />
      </div>
    ))}
  </div>
);

const TileSkeleton = () => (
  <div className="rounded-xl border border-gray-100/80 bg-white px-4 py-3">
    <Skeleton className="h-3 w-20" />
    <Skeleton className="mt-3 h-5 w-24" />
    <Skeleton className="mt-2 h-3 w-28" />
  </div>
);

const TableSkeleton = ({ rows, cols }: { rows: number; cols: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={`row-${rowIndex}`} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((__, colIndex) => (
          <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-4 w-full" />
        ))}
      </div>
    ))}
  </div>
);

const ListSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton key={`line-${index}`} className="h-4 w-full" />
    ))}
  </div>
);

const DEAL_TYPE_LABELS: Record<DealRow['deal_type'], string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_and_seller: 'Buyer & Seller',
  renter: 'Renter',
  landlord: 'Landlord'
};

type ArchiveReason =
  | 'No Response / Ghosted'
  | 'Client Not Ready / Timeline Changed'
  | 'Chose Another Agent'
  | 'Financing Didn’t Work Out'
  | 'Deal Fell Through'
  | 'Other';

export default function Analytics() {
  const { user, roleInfo } = useAuth();
  const [, startTransition] = useTransition();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [yearlyStats, setYearlyStats] = useState<YearlyStats>({
    closedDeals: 0,
    totalVolume: 0,
    totalGCI: 0,
    avgSalePrice: 0,
    avgCommission: 0,
    buyerDeals: 0,
    sellerDeals: 0,
    avgDaysToClose: 0,
  });
  const [leadSourceStats, setLeadSourceStats] = useState<LeadSourceStat[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [closingThisMonthStats, setClosingThisMonthStats] =
    useState<ClosingThisMonthStats>({ count: 0, gci: 0 });
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [gciGoal, setGciGoal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [availableLeadSources, setAvailableLeadSources] = useState<{ id: string; name: string }[]>([]);
  const [availableStages, setAvailableStages] = useState<StageOption[]>([]);
  const [availableDealTypes, setAvailableDealTypes] = useState<DealRow['deal_type'][]>([]);
  const [selectedLeadSources, setSelectedLeadSources] = useState<string[]>([]);
  const [selectedPipelineStages, setSelectedPipelineStages] = useState<string[]>([]);
  const [selectedDealTypes, setSelectedDealTypes] = useState<DealRow['deal_type'][]>([]);
  const [archiveStats, setArchiveStats] = useState<ArchiveStats>({ total: 0, reasons: [] });
  const [funnelTransitions, setFunnelTransitions] = useState<FunnelTransition[]>([]);
  const { hydrated: filtersHydrated } = useAnalyticsFilterPersistence({
    year: selectedYear,
    agents: selectedAgentIds,
    stages: selectedPipelineStages,
    sources: selectedLeadSources,
    types: selectedDealTypes,
    setYear: setSelectedYear,
    setAgents: setSelectedAgentIds,
    setStages: setSelectedPipelineStages,
    setSources: setSelectedLeadSources,
    setTypes: setSelectedDealTypes,
  });
  const agentScopeKey = useMemo(
    () => (selectedAgentIds.length ? [...selectedAgentIds].sort().join('|') : ''),
    [selectedAgentIds]
  );
  const leadFilterKey = useMemo(
    () => (selectedLeadSources.length ? [...selectedLeadSources].sort().join('|') : ''),
    [selectedLeadSources]
  );
  const stageFilterKey = useMemo(
    () => (selectedPipelineStages.length ? [...selectedPipelineStages].sort().join('|') : ''),
    [selectedPipelineStages]
  );
  const dealTypeFilterKey = useMemo(
    () => (selectedDealTypes.length ? [...selectedDealTypes].sort().join('|') : ''),
    [selectedDealTypes]
  );
  const showFocusOnMe = !!user && (roleInfo?.globalRole === 'team_lead' || roleInfo?.teamRole === 'team_lead');
  const isAllAgentsSelected =
    selectedAgentIds.length === 0 || selectedAgentIds.length === availableAgents.length;
  const isFocusOnMeActive = showFocusOnMe && selectedAgentIds.length === 1 && selectedAgentIds[0] === user?.id;
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (selectedAgentIds.length > 0) {
      const agentLabel =
        selectedAgentIds.length === 1
          ? `Agent: ${
              availableAgents.find((agent) => agent.id === selectedAgentIds[0])?.label || 'Agent'
            }`
          : `Agents: ${selectedAgentIds.length}`;
      chips.push({ key: 'agents', label: agentLabel, onRemove: () => setSelectedAgentIds([]) });
    }

    if (selectedPipelineStages.length > 0) {
      const stageLabel =
        selectedPipelineStages.length === 1
          ? `Stage: ${
              availableStages.find((stage) => stage.id === selectedPipelineStages[0])?.label || 'Stage'
            }`
          : `Stages: ${selectedPipelineStages.length}`;
      chips.push({ key: 'stages', label: stageLabel, onRemove: () => setSelectedPipelineStages([]) });
    }

    if (selectedDealTypes.length > 0) {
      const typeLabel =
        selectedDealTypes.length === 1
          ? `Type: ${DEAL_TYPE_LABELS[selectedDealTypes[0]] ?? selectedDealTypes[0]}`
          : `Types: ${selectedDealTypes.length}`;
      chips.push({ key: 'types', label: typeLabel, onRemove: () => setSelectedDealTypes([]) });
    }

    if (selectedLeadSources.length > 0) {
      const sourceLabel =
        selectedLeadSources.length === 1
          ? `Source: ${
              availableLeadSources.find((source) => source.id === selectedLeadSources[0])?.name || 'Source'
            }`
          : `Sources: ${selectedLeadSources.length}`;
      chips.push({ key: 'sources', label: sourceLabel, onRemove: () => setSelectedLeadSources([]) });
    }

    return chips;
  }, [
    availableAgents,
    availableLeadSources,
    availableStages,
    selectedAgentIds,
    selectedDealTypes,
    selectedLeadSources,
    selectedPipelineStages,
  ]);
  const agentOptions = useMemo(
    () =>
      availableAgents.map((agent) => ({
        value: agent.id,
        label: agent.label,
        subLabel: agent.email || undefined
      })),
    [availableAgents]
  );
  const stageOptions = useMemo(
    () =>
      availableStages.map((stage) => ({
        value: stage.id,
        label: stage.label
      })),
    [availableStages]
  );
  const leadSourceOptions = useMemo(
    () =>
      availableLeadSources.map((source) => ({
        value: source.id,
        label: source.name
      })),
    [availableLeadSources]
  );
  const dealTypeOptions = useMemo(
    () =>
      availableDealTypes.map((dealType) => ({
        value: dealType,
        label: DEAL_TYPE_LABELS[dealType] ?? dealType.replace(/_/g, ' ')
      })),
    [availableDealTypes]
  );
  const scopeDescription = useMemo(() => {
    const formatList = (items: string[], fallbackLabel: string) => {
      if (items.length === 0) return fallbackLabel;
      if (items.length === 1) return items[0];
      if (items.length === 2) return `${items[0]} and ${items[1]}`;
      if (items.length === 3) return `${items[0]}, ${items[1]} and ${items[2]}`;
      return `multiple ${fallbackLabel}`;
    };

    const makePossessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

    const agentNames = availableAgents
      .filter((agent) => selectedAgentIds.includes(agent.id))
      .map((agent) => agent.label || agent.email || 'Agent');

    const agentsAreAll = isAllAgentsSelected || agentNames.length === 0;
    const singleAgentSelected = !agentsAreAll && agentNames.length === 1;
    const agentPossessive = singleAgentSelected ? makePossessive(agentNames[0]) : '';

    const allStagesSelected =
      selectedPipelineStages.length === 0 ||
      (availableStages.length > 0 && selectedPipelineStages.length === availableStages.length);
    const allDealTypesSelected =
      selectedDealTypes.length === 0 ||
      (availableDealTypes.length > 0 && selectedDealTypes.length === availableDealTypes.length);
    const allLeadSourcesSelected =
      selectedLeadSources.length === 0 ||
      (availableLeadSources.length > 0 && selectedLeadSources.length === availableLeadSources.length);

    const stageNames = availableStages
      .filter((stage) => selectedPipelineStages.includes(stage.id))
      .map((stage) => stage.label);
    const dealTypeNames = selectedDealTypes.map(
      (dealType) => DEAL_TYPE_LABELS[dealType] ?? dealType.replace(/_/g, ' ')
    );
    const leadSourceNames = availableLeadSources
      .filter((source) => selectedLeadSources.includes(source.id))
      .map((source) => source.name);

    const stagePhrase = allStagesSelected
      ? 'all pipeline stages'
      : formatList(stageNames, 'pipeline stages');
    const dealTypePhrase = allDealTypesSelected
      ? 'all deal types'
      : formatList(dealTypeNames, 'deal types');
    const leadSourcePhrase = allLeadSourcesSelected
      ? 'all lead sources'
      : formatList(leadSourceNames, 'lead sources');

    const allFiltersAreAll = allStagesSelected && allDealTypesSelected && allLeadSourcesSelected;

    if (allFiltersAreAll) {
      if (singleAgentSelected) {
        return `Viewing ${agentPossessive} deals across all pipeline stages, deal types, and lead sources.`;
      }
      if (agentsAreAll) {
        return 'Viewing all deals across all agents, pipeline stages, deal types, and lead sources.';
      }
      return 'Viewing deals for multiple agents across all pipeline stages, deal types, and lead sources.';
    }

    const agentPhrase = (() => {
      if (agentsAreAll) return 'all agents';
      if (singleAgentSelected) return agentPossessive;
      if (agentNames.length === 2) return `${agentNames[0]} and ${agentNames[1]}`;
      if (agentNames.length === 3) return `${agentNames[0]}, ${agentNames[1]} and ${agentNames[2]}`;
      return 'multiple agents';
    })();

    const segments: string[] = [];
    if (stagePhrase) segments.push(stagePhrase);

    if (dealTypePhrase) {
      const dealPhrase = allDealTypesSelected
        ? `across ${dealTypePhrase}`
        : `${dealTypePhrase} deals`;
      segments.push(dealPhrase);
    }

    if (leadSourcePhrase) {
      segments.push(`from ${leadSourcePhrase}`);
    }

    if (segments.length === 0) {
      segments.push('deals');
    }

    const joinedSegments = segments.join(', ');

    return `Viewing ${agentPhrase} ${joinedSegments}`.replace(/\s+/g, ' ').trim() + '.';
  }, [
    availableAgents,
    availableDealTypes,
    availableLeadSources,
    availableStages,
    isAllAgentsSelected,
    selectedAgentIds,
    selectedDealTypes,
    selectedLeadSources,
    selectedPipelineStages
  ]);

  const selectMyData = () => {
    if (user) {
      setSelectedAgentIds([user.id]);
    }
  };

  const resetAgents = () => {
    setSelectedAgentIds([]);
  };

  useEffect(() => {
    if (!availableDealTypes.length) return;
    setSelectedDealTypes((current) => current.filter((type) => availableDealTypes.includes(type)));
  }, [availableDealTypes]);

  const canShowFilterPanel =
    (roleInfo && roleInfo.globalRole !== 'agent') || availableAgents.length > 1;

  useEffect(() => {
    if (!user) return;

    const bootstrapAgents = async () => {
      const fallback: AgentOption = {
        id: user.id,
        label: user.user_metadata?.name || user.email || 'You',
        email: user.email || ''
      };

      const resolveVisibleAgentIds = async () => {
        if (!roleInfo) return [user.id];
        switch (roleInfo.globalRole) {
          case 'admin': {
            return await getVisibleUserIds(roleInfo);
          }
          case 'sales_manager':
          case 'team_lead': {
            return await getVisibleUserIds(roleInfo);
          }
          default:
            return [roleInfo.userId];
        }
      };

      if (!roleInfo || roleInfo.globalRole === 'agent') {
        setAvailableAgents([fallback]);
        setSelectedAgentIds([user.id]);
        return;
      }

      const agentIds = await resolveVisibleAgentIds();

      let agentOptions: AgentOption[] = [];

      const { data, error } = await supabase.rpc('get_accessible_agents');
      if (error) {
        console.error('Unable to load accessible agents', error);
      } else if (data) {
        const rows = data as AccessibleAgentRow[];
        const excludeIds = new Set(
          rows
            .filter((row) => row.global_role === 'admin' || row.global_role === 'sales_manager')
            .map((row) => row.user_id)
        );
        const normalized: AgentOption[] = rows
          .filter((agent) => agent.global_role !== 'admin' && agent.global_role !== 'sales_manager')
          .map((agent) => ({
            id: agent.user_id,
            label: agent.display_name || agent.email || 'Agent',
            email: agent.email || ''
          }));
        const filtered = agentIds.length
          ? normalized.filter(option => agentIds.includes(option.id))
          : normalized;
        agentOptions = filtered.filter(
          (option, index, arr) => arr.findIndex((candidate) => candidate.id === option.id) === index
        );
        if (excludeIds.size) {
          for (const id of excludeIds) {
            const idx = agentIds.indexOf(id);
            if (idx !== -1) agentIds.splice(idx, 1);
          }
        }
      }

      const fallbackLabel = (id: string) =>
        id === user.id
          ? (user.user_metadata?.name || user.email || 'You')
          : `Agent ${id.slice(0, 8)}`;

      if (!agentOptions.length) {
        agentOptions = agentIds.map(id => ({
          id,
          label: fallbackLabel(id),
          email: ''
        }));
      } else {
        // Ensure every visible id has a label even if the RPC omitted it
        const existingIds = new Set(agentOptions.map(a => a.id));
        const missing = agentIds.filter(id => !existingIds.has(id));
        if (missing.length) {
          agentOptions = [
            ...agentOptions,
            ...missing.map(id => ({
              id,
              label: fallbackLabel(id),
              email: ''
            }))
          ];
        }
      }

      setAvailableAgents(agentOptions);
      const initialIds = agentOptions.map(a => a.id);
      const defaultId = user?.id;
      if (defaultId && initialIds.includes(defaultId)) {
        setSelectedAgentIds([defaultId]);
      } else if (initialIds.length === 1) {
        setSelectedAgentIds([initialIds[0]]);
      } else {
        setSelectedAgentIds([]);
      }
    };

    bootstrapAgents();
  }, [user, roleInfo, roleInfo?.globalRole, roleInfo?.teamId]);

  useEffect(() => {
    if (!user) return;
    if (availableAgents.length === 0) return;
    if (!filtersHydrated) return;
    if (import.meta.env.DEV) {
      runAnalyticsDateChecks();
    }
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    selectedYear,
    agentScopeKey,
    leadFilterKey,
    stageFilterKey,
    dealTypeFilterKey,
    availableAgents,
    filtersHydrated
  ]);

  const loadAnalytics = async () => {
    if (!user || availableAgents.length === 0) return;
    const ids = selectedAgentIds.length ? selectedAgentIds : availableAgents.map(a => a.id);
    if (!ids.length) {
      startTransition(() => {
        setYearlyStats({
          closedDeals: 0,
          totalVolume: 0,
          totalGCI: 0,
          avgSalePrice: 0,
          avgCommission: 0,
          buyerDeals: 0,
          sellerDeals: 0,
          avgDaysToClose: 0,
        });
        setMonthlyData([]);
        setLeadSourceStats([]);
        setClosingThisMonthStats({ count: 0, gci: 0 });
      });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const isInitialLoad = loading;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const { data, error } = await supabase.rpc<AnalyticsSummaryResponse>('get_analytics_summary', {
      p_year: selectedYear,
      p_user_ids: ids,
      p_lead_source_ids: selectedLeadSources,
      p_pipeline_status_ids: selectedPipelineStages,
      p_deal_types: selectedDealTypes,
      p_requesting_user_id: user.id
    });

    if (error) {
      console.error('Unable to load analytics summary', error);
      setYearlyStats({
        closedDeals: 0,
        totalVolume: 0,
        totalGCI: 0,
        avgSalePrice: 0,
        avgCommission: 0,
        buyerDeals: 0,
        sellerDeals: 0,
        avgDaysToClose: 0,
      });
      setMonthlyData([]);
      setLeadSourceStats([]);
      setClosingThisMonthStats({ count: 0, gci: 0 });
      setArchiveStats({ total: 0, reasons: [] });
      setFunnelTransitions([]);
      setGciGoal(0);
    } else {
      const summary = data as AnalyticsSummaryResponse | null;
      if (summary) {
        setYearlyStats({
          closedDeals: summary.yearly_stats?.closed_deals ?? 0,
          totalVolume: summary.yearly_stats?.total_volume ?? 0,
          totalGCI: summary.yearly_stats?.total_gci ?? 0,
          avgSalePrice: summary.yearly_stats?.avg_sale_price ?? 0,
          avgCommission: summary.yearly_stats?.avg_commission ?? 0,
          buyerDeals: summary.yearly_stats?.buyer_deals ?? 0,
          sellerDeals: summary.yearly_stats?.seller_deals ?? 0,
          avgDaysToClose: summary.yearly_stats?.avg_days_to_close ?? 0,
        });
        setMonthlyData(summary.monthly_rollup ?? []);
        setLeadSourceStats(
          (summary.lead_source_stats ?? []).map((item) => ({
            id:
              item.id ??
              availableLeadSources.find((source) => source.name === item.name)?.id ??
              null,
            name: item.name,
            totalDeals: item.total_deals,
            closedDeals: item.closed_deals,
            conversionRate: item.conversion_rate,
            totalCommission: item.total_commission,
          }))
        );
        setArchiveStats(summary.archive_stats ?? { total: 0, reasons: [] });
        setClosingThisMonthStats(summary.closing_this_month ?? { count: 0, gci: 0 });
        setFunnelTransitions(summary.funnel_transitions ?? []);

        const filterLeadSources = summary.filter_context?.lead_sources ?? [];
        const filterStages = summary.filter_context?.pipeline_stages ?? [];
        const filterDealTypes = summary.filter_context?.deal_types ?? [];

        setAvailableLeadSources(
          filterLeadSources.map((source) => ({
            id: source.id,
            name: source.name || 'Unknown'
          }))
        );
        setAvailableStages(
          filterStages.map((stage) => ({
            id: stage.id,
            label: stage.name,
            sortOrder: stage.sort_order ?? null
          }))
        );
        setAvailableDealTypes(
          filterDealTypes.length
            ? filterDealTypes
            : (Object.keys(DEAL_TYPE_LABELS) as DealRow['deal_type'][])
        );

        setGciGoal(summary.annual_gci_goal ?? 0);
        setLastRefreshedAt(new Date());
      }
    }

    if (isInitialLoad) {
      setLoading(false);
    }
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (value: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);

  const formatLastUpdated = (value: Date | null) => {
    if (!value) return null;
    const nowLocal = new Date();
    const isToday = value.toDateString() === nowLocal.toDateString();
    return new Intl.DateTimeFormat('en-US', {
      month: isToday ? undefined : 'short',
      day: isToday ? undefined : 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(value);
  };

  const downloadCsv = (filename: string, rows: Array<Record<string, string | number>>) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (value: string | number) => {
      const stringValue = String(value ?? '');
      if (/["\\n,]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))
    ].join('\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleLeadSourceClick = (source: LeadSourceStat) => {
    if (source.id) {
      setSelectedLeadSources([source.id]);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handleMonthlyExport = () => {
    const rows = monthlyData.map((month) => ({
      Year: selectedYear,
      Month: month.month,
      Deals: month.deals,
      'GCI (USD)': month.gci,
      'Avg GCI / Deal (USD)': month.deals > 0 ? month.gci / month.deals : 0,
      'Share of Year GCI (%)': yearlyStats.totalGCI > 0 ? (month.gci / yearlyStats.totalGCI) * 100 : 0,
    }));
    downloadCsv(`monthly-ledger-${selectedYear}.csv`, rows);
  };

  const handleLeadSourceExport = () => {
    const rows = leadSourceStats.map((source) => ({
      Year: selectedYear,
      'Lead Source': source.name,
      'Total Deals': source.totalDeals,
      'Closed Deals': source.closedDeals,
      'Conversion Rate (%)': source.conversionRate,
      'Total Commission (USD)': source.totalCommission,
    }));
    downloadCsv(`lead-sources-${selectedYear}.csv`, rows);
  };

  const stageLabel: Record<FunnelStage, string> = {
    lead: 'Lead',
    in_progress: 'In Progress',
    closed_won: 'Closed Won',
    archived: 'Archived (Closed Lost)',
  };
  // Funnel transition definitions (event-based):
  // - Entered = deals that entered the "from" stage during the selected year.
  // - Advanced = those same deals that later entered the "to" stage.
  // - Conversion = advanced / entered for the selected-year entry cohort.

  // Goal & pace calculations
  const goalProgress = gciGoal > 0 ? (yearlyStats.totalGCI / gciGoal) * 100 : 0;

  const now = new Date();
  const isCurrentYear = selectedYear === now.getFullYear();

  const yearStart = new Date(selectedYear, 0, 1);
  const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59);
  const elapsedMs = isCurrentYear
    ? Math.max(0, Math.min(now.getTime(), yearEnd.getTime()) - yearStart.getTime())
    : yearEnd.getTime() - yearStart.getTime();
  const totalMs = yearEnd.getTime() - yearStart.getTime();
  const yearProgress = totalMs > 0 ? elapsedMs / totalMs : 1;

  const projectedGciAtCurrentPace =
    yearProgress > 0 ? (yearlyStats.totalGCI / yearProgress) : yearlyStats.totalGCI;

  const remainingGciToGoal = Math.max(0, gciGoal - yearlyStats.totalGCI);
  const remainingMonths = isCurrentYear ? 12 - now.getMonth() : 0;
  const neededMonthlyGciToHitGoal =
    gciGoal > 0 && remainingGciToGoal > 0 && remainingMonths > 0
      ? remainingGciToGoal / remainingMonths
      : 0;

  // Best / worst months
  const { bestMonth, worstMonth } = useMemo(() => {
    const nonZero = monthlyData.filter((m) => m.gci > 0);
    if (nonZero.length === 0) {
      return { bestMonth: null as MonthlyData | null, worstMonth: null as MonthlyData | null };
    }
    const best = nonZero.reduce((a, b) => (b.gci > a.gci ? b : a));
    const worst = nonZero.reduce((a, b) => (b.gci < a.gci ? b : a));
    return { bestMonth: best, worstMonth: worst };
  }, [monthlyData]);

  const monthsWithProduction = useMemo(() => monthlyData.filter((m) => m.gci > 0), [monthlyData]);
  const activeMonthsCount = monthsWithProduction.length;
  const avgMonthlyGci = activeMonthsCount > 0 ? yearlyStats.totalGCI / activeMonthsCount : 0;
  const totalActiveDeals = monthsWithProduction.reduce((sum, month) => sum + month.deals, 0);
  const avgDealsPerActiveMonth =
    activeMonthsCount > 0 ? totalActiveDeals / activeMonthsCount : 0;
  const lastActiveMonth =
    activeMonthsCount > 0 ? monthsWithProduction[activeMonthsCount - 1] : null;
  const prevActiveMonth =
    activeMonthsCount > 1 ? monthsWithProduction[activeMonthsCount - 2] : null;
  const momentumDelta =
    lastActiveMonth && prevActiveMonth ? lastActiveMonth.gci - prevActiveMonth.gci : null;
  const peakMonthlyGci = useMemo(
    () => monthlyData.reduce((max, month) => Math.max(max, month.gci), 0),
    [monthlyData]
  );
  const peakMonthlyDeals = useMemo(
    () => monthlyData.reduce((max, month) => Math.max(max, month.deals), 0),
    [monthlyData]
  );
  const bestMonthDetails = bestMonth
    ? monthlyData.find((month) => month.month === bestMonth.month)
    : null;
  const worstMonthDetails = worstMonth
    ? monthlyData.find((month) => month.month === worstMonth.month)
    : null;

  const surfaceClass =
    'rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.08)]';
  const pillClass =
    'inline-flex items-center rounded-full border border-gray-200/70 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-600';
  const tileClass =
    'rounded-xl border border-gray-100/80 bg-white px-4 py-3';

  // Lead source insights
  const topLeadSource = leadSourceStats[0] || null;
  const underperformingSource =
    leadSourceStats.length > 1
      ? [...leadSourceStats]
          .filter((s) => s.totalDeals >= 3)
          .sort((a, b) => a.conversionRate - b.conversionRate)[0]
      : null;
  const topArchiveReason = archiveStats.reasons[0] || null;
  const funnelBottleneck = useMemo(() => {
    if (!funnelTransitions.length) return null;
    return [...funnelTransitions].sort((a, b) => a.rate - b.rate)[0];
  }, [funnelTransitions]);
  const insights = useMemo(() => {
    const items: string[] = [];

    if (topLeadSource) {
      items.push(
        `Top source: ${topLeadSource.name} — ${topLeadSource.conversionRate.toFixed(1)}% conversion, ${formatCurrency(
          topLeadSource.totalCommission
        )} GCI. Recommendation: double down on follow-up + budget here.`
      );
    }

    if (underperformingSource) {
      items.push(
        `Underperformer: ${underperformingSource.name} — ${underperformingSource.conversionRate.toFixed(1)}% conversion on ${
          underperformingSource.totalDeals
        } deals. Recommendation: revise script or pause spend.`
      );
    }

    if (yearlyStats.avgDaysToClose >= 45) {
      items.push(
        `Avg days to close is ${yearlyStats.avgDaysToClose.toFixed(
          0
        )} days. Recommendation: tighten pre-qual and weekly follow-ups to reduce cycle time.`
      );
    }

    if (funnelBottleneck && funnelBottleneck.entered > 0) {
      items.push(
        `Largest drop-off is ${stageLabel[funnelBottleneck.from]} → ${stageLabel[funnelBottleneck.to]} (${
          funnelBottleneck.rate.toFixed(1)
        }%). Recommendation: focus on faster handoffs + tighter next-step commitments.`
      );
    }

    if (archiveStats.total >= 3 && topArchiveReason) {
      items.push(
        `Most common loss reason: ${topArchiveReason.reason} (${topArchiveReason.percentage.toFixed(
          1
        )}%). Recommendation: add a targeted countermeasure in your process.`
      );
    }

    return items.slice(0, 4);
  }, [
    archiveStats,
    funnelBottleneck,
    stageLabel,
    topArchiveReason,
    topLeadSource,
    underperformingSource,
    yearlyStats.avgDaysToClose
  ]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const yearOptions = years.map((year) => ({ value: year.toString(), label: year.toString() }));
  const timeframeDescription = `Jan 1 – Dec 31, ${selectedYear}${isCurrentYear ? ' · In progress' : ''}`;

  const isInitialLoading = loading;
  const isRefreshing = refreshing;

  return (
    <div className="space-y-8">
      <section className={`${surfaceClass} p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between relative`}>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.25em]">
            Analytics
          </p>
          <h1 className="text-3xl font-semibold text-gray-900 mt-1">Year in Review</h1>
          <p className="text-sm text-gray-600 mt-2">
            A cohesive digest of production, pace, and lead-source efficiency for your selected year.
          </p>
        </div>
        <div className="flex flex-col gap-3 items-start sm:items-end">
          <div className="min-h-[20px] flex flex-col items-end gap-1 text-xs font-semibold text-gray-500 sm:text-right">
            {isRefreshing ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--app-accent)] animate-pulse" />
                Updating…
              </span>
            ) : null}
            {!isRefreshing && lastRefreshedAt ? (
              <span>Last updated {formatLastUpdated(lastRefreshedAt)}</span>
            ) : null}
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
              Timeframe
            </p>
            <p className="text-sm text-gray-500">{timeframeDescription}</p>
          </div>
          <SegmentedControl
            options={yearOptions}
            value={String(selectedYear)}
            onChange={(value) => setSelectedYear(parseInt(value, 10))}
            className="self-start sm:self-end w-max"
          />
        </div>
      </section>
      {canShowFilterPanel && (
        <section className={`${surfaceClass} p-5 space-y-4`}>
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">Scope</p>
              <p className="text-sm text-gray-700">{scopeDescription}</p>
            </div>
          </div>
          {(activeFilterChips.length > 0 || showFocusOnMe) && (
            <div className="flex flex-wrap items-center gap-2 -mt-1">
              {showFocusOnMe && (
                <button
                  type="button"
                  onClick={selectMyData}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    isFocusOnMeActive
                      ? 'bg-[var(--app-accent)] text-white shadow-[0_8px_20px_rgba(0,122,255,0.25)]'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Focus On Me
                </button>
              )}
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600"
                >
                  {chip.label}
                  <span className="text-gray-400">x</span>
                </button>
              ))}
              {activeFilterChips.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    resetAgents();
                    setSelectedPipelineStages([]);
                    setSelectedLeadSources([]);
                    setSelectedDealTypes([]);
                  }}
                  className="text-xs font-semibold text-[var(--app-accent)]"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
          {availableAgents.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                {showFocusOnMe ? null : null}
                <MultiSelectCombobox
                  label="Agents"
                  options={agentOptions}
                  value={selectedAgentIds}
                  onChange={setSelectedAgentIds}
                  placeholder="Search agents..."
                  disabled={agentOptions.length === 0}
                />
              </div>
              <div>
                <MultiSelectCombobox
                  label="Pipeline Stage"
                  options={stageOptions}
                  value={selectedPipelineStages}
                  onChange={setSelectedPipelineStages}
                  placeholder="Search stages..."
                  disabled={stageOptions.length === 0}
                />
              </div>
              <div>
                <MultiSelectCombobox
                  label="Deal Type"
                  options={dealTypeOptions}
                  value={selectedDealTypes}
                  onChange={(next) => setSelectedDealTypes(next as DealRow['deal_type'][])}
                  placeholder="Search deal types..."
                  disabled={dealTypeOptions.length === 0}
                />
              </div>
              <div>
                <MultiSelectCombobox
                  label="Lead Source"
                  options={leadSourceOptions}
                  value={selectedLeadSources}
                  onChange={setSelectedLeadSources}
                  placeholder="Search lead sources..."
                  disabled={leadSourceOptions.length === 0}
                />
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        {isInitialLoading ? (
          <StatCardsSkeleton />
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
            <div className={`${surfaceClass} p-5`}>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Pipeline</p>
              <div className="text-2xl font-semibold text-gray-900 mt-2">
                {formatNumber(yearlyStats.closedDeals)}
              </div>
              <p className="text-sm text-gray-600 mt-1">Closed deals</p>
              <p className="text-xs text-gray-500 mt-3">
                {yearlyStats.buyerDeals} buyer • {yearlyStats.sellerDeals} seller
              </p>
            </div>
            <div className={`${surfaceClass} p-5`}>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Volume</p>
              <div className="text-2xl font-semibold text-gray-900 mt-2">
                {formatCurrency(yearlyStats.totalVolume)}
              </div>
              <p className="text-sm text-gray-600 mt-1">Total sales volume</p>
              <p className="text-xs text-gray-500 mt-3">
                Avg sale price • {formatCurrency(yearlyStats.avgSalePrice)}
              </p>
            </div>
            <div className={`${surfaceClass} p-5`}>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Net GCI</p>
              <div className="text-2xl font-semibold text-gray-900 mt-2">
                {formatCurrency(yearlyStats.totalGCI)}
              </div>
              <p className="text-sm text-gray-600 mt-1">Total earnings after splits</p>
              <p className="text-xs text-gray-500 mt-3">
                Avg commission • {formatCurrency(yearlyStats.avgCommission)}
              </p>
            </div>
            <div className={`${surfaceClass} p-5`}>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Pace</p>
              <div className="text-2xl font-semibold text-gray-900 mt-2">
                {formatNumber(closingThisMonthStats.count)}
              </div>
              <p className="text-sm text-gray-600 mt-1">Deals closing this month</p>
              <p className="text-xs text-gray-500 mt-3">
                GCI this month • {formatCurrency(closingThisMonthStats.gci)}
              </p>
              {yearlyStats.avgDaysToClose > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Avg time to close • {yearlyStats.avgDaysToClose.toFixed(0)} days
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
        <div className={`${surfaceClass} p-6`}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Monthly Performance</h3>
              <p className="text-xs text-gray-500 mt-1">
                How each producing month contributes to pace and income.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {activeMonthsCount > 0 ? (
                <span className={pillClass}>{activeMonthsCount} active months</span>
              ) : (
                <span className="text-gray-400">No closed months yet</span>
              )}
            </div>
          </div>

          {isInitialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <TileSkeleton key={`tile-skeleton-${index}`} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={tileClass}>
                <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  Top Month
                </p>
                {bestMonth ? (
                  <>
                    <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      {bestMonth.month}
                      <span className={pillClass}>{bestMonthDetails?.deals ?? 0} deals</span>
                    </p>
                    <p className="text-sm text-gray-600">{formatCurrency(bestMonth.gci)}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No producing months yet.</p>
                )}
              </div>
              <div className={tileClass}>
                <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  Slow Month
                </p>
                {worstMonth && bestMonth && worstMonth.month !== bestMonth.month ? (
                  <>
                    <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      {worstMonth.month}
                      <span className={pillClass}>{worstMonthDetails?.deals ?? 0} deals</span>
                    </p>
                    <p className="text-sm text-gray-600">{formatCurrency(worstMonth.gci)}</p>
                  </>
                ) : bestMonth ? (
                  <p className="text-sm text-gray-500">Only one producing month so far.</p>
                ) : (
                  <p className="text-sm text-gray-500">No data yet.</p>
                )}
              </div>
              <div className={tileClass}>
                <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  Avg Active Month
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(avgMonthlyGci || 0)}
                </p>
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  {activeMonthsCount || 0} active month{activeMonthsCount === 1 ? '' : 's'}
                  <span className={pillClass}>{avgDealsPerActiveMonth.toFixed(1)} deals/mo</span>
                </p>
              </div>
              <div className={tileClass}>
                <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  Momentum
                </p>
                {momentumDelta !== null && lastActiveMonth ? (
                  <>
                    <p
                      className={`text-lg font-semibold ${
                        momentumDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {momentumDelta >= 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(momentumDelta))}
                    </p>
                    <p className="text-sm text-gray-600">
                      Vs. {prevActiveMonth?.month ?? 'previous month'} GCI
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    Log at least two producing months to see momentum.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">Monthly Ledger</h4>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>
                  Peak GCI: {peakMonthlyGci ? formatCurrency(peakMonthlyGci) : '—'} • Peak deals:{' '}
                  {peakMonthlyDeals || '—'}
                </span>
                <button
                  type="button"
                  onClick={handleMonthlyExport}
                  disabled={isInitialLoading || monthlyData.length === 0}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {isInitialLoading ? (
                <TableSkeleton rows={6} cols={5} />
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="pb-2 pr-4">Month</th>
                      <th className="pb-2 pr-4">Deals</th>
                      <th className="pb-2 pr-4">GCI</th>
                      <th className="pb-2 pr-4">Avg / Deal</th>
                      <th className="pb-2 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((month) => {
                      const avgPerDeal = month.deals > 0 ? month.gci / month.deals : 0;
                      const share =
                        yearlyStats.totalGCI > 0 ? (month.gci / yearlyStats.totalGCI) * 100 : 0;
                      return (
                        <tr key={month.month} className="border-b border-gray-50">
                          <td className="py-2 pr-4 font-medium text-gray-900">{month.month}</td>
                          <td className="py-2 pr-4 text-gray-700">{month.deals}</td>
                          <td className="py-2 pr-4 text-gray-700">{formatCurrency(month.gci)}</td>
                          <td className="py-2 pr-4 text-gray-700">
                            {month.deals > 0 ? formatCurrency(avgPerDeal) : '—'}
                          </td>
                          <td className="py-2 text-right text-gray-700">
                            {yearlyStats.totalGCI > 0 ? `${share.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Commission by Lead Source */}
        <div className={`${surfaceClass} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Momentum & Pace</h3>
              <p className="text-xs text-gray-500 mt-1">
                Are you ahead or behind last year’s GCI at this point on the calendar?
              </p>
            </div>
          </div>
          {isInitialLoading ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-5">
                <Skeleton className="h-3 w-32" />
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div>
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-5 w-24" />
                    <Skeleton className="mt-3 h-3 w-28" />
                    <Skeleton className="mt-2 h-5 w-24" />
                  </div>
                </div>
                <Skeleton className="mt-4 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
              <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-5">
                <Skeleton className="h-3 w-40" />
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="mt-4 h-3 w-full" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-gray-100/80 bg-gradient-to-br from-white to-[var(--app-bg-start)] p-5 shadow-inner">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Year-over-year pace
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(yearlyStats.totalGCI)}
                    </p>
                    <p className="text-sm text-gray-600">Current GCI</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Projected at current pace</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatCurrency(projectedGciAtCurrentPace)}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">Needed pace to hit goal</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {gciGoal > 0 && remainingGciToGoal > 0 && remainingMonths > 0 ? (
                        <>
                          {formatCurrency(neededMonthlyGciToHitGoal)}{' '}
                          <span className="text-sm font-medium text-gray-500">/mo</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Current</span>
                    <span>Goal</span>
                  </div>
                  <div className="mt-1 h-3 rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
                      style={{ width: `${Math.min(100, (yearlyStats.totalGCI / (gciGoal || 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs font-semibold text-gray-600">
                    {goalProgress.toFixed(1)}% of goal • year is {(yearProgress * 100).toFixed(1)}% complete
                    {gciGoal > 0 && isCurrentYear
                      ? ` • ${remainingMonths} month${remainingMonths === 1 ? '' : 's'} remaining (incl. this month)`
                      : ''}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Active pipeline outlook
                </p>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatNumber(closingThisMonthStats.count)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Deals expected to close this month</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(closingThisMonthStats.gci)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Projected monthly GCI</p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-[var(--app-surface-muted)] p-4 text-sm text-gray-600">
                  {momentumDelta !== null && lastActiveMonth ? (
                    <>
                      <span className="font-semibold">
                        {momentumDelta >= 0 ? 'Ahead' : 'Trailing'} pace
                      </span>{' '}
                      by {formatCurrency(Math.abs(momentumDelta))} versus {prevActiveMonth?.month ?? 'previous'}.
                      Keep this cadence to end the year at{' '}
                      <span className="font-semibold">{formatCurrency(projectedGciAtCurrentPace)}</span>.
                    </>
                  ) : (
                    'Once two months close we’ll highlight whether you are accelerating or slowing down.'
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={`${surfaceClass} p-6 ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Stage Conversion (Transitions)</h3>
            <p className="text-xs text-gray-500 mt-1">
              Based on recorded pipeline stage transitions during {selectedYear}.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          {isInitialLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="pb-2 pr-4">From → To</th>
                  <th className="pb-2 pr-4">Entered</th>
                  <th className="pb-2 pr-4">Advanced</th>
                  <th className="pb-2 pr-4">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {funnelTransitions.map((row) => (
                  <tr key={`${row.from}-${row.to}`}>
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {stageLabel[row.from]} → {stageLabel[row.to]}
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{row.entered}</td>
                    <td className="py-3 pr-4 text-gray-700">{row.advanced}</td>
                    <td className="py-3 pr-4 text-gray-900 font-semibold">
                      {row.rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {funnelTransitions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-sm text-gray-500">
                      No transition data available for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Note: Counts are based on stage-change events. Deals that entered a stage before {selectedYear} are not counted as
          entered in that stage during this period.
        </p>
      </section>

      <section className={`${surfaceClass} p-6 ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Closed Lost Reasons</h3>
            <p className="text-xs text-gray-500 mt-1">
              Why archived deals fell out — fuel pipeline fixes, coaching, and source tuning.
            </p>
          </div>
          <div className="text-sm text-gray-600">
            <span className={pillClass}>
              {archiveStats.total} archived
            </span>
          </div>
        </div>

        {isInitialLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`archive-skeleton-${index}`} className="rounded-xl border border-gray-100/80 bg-white px-4 py-3 shadow-sm">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-20" />
              </div>
            ))}
          </div>
        ) : archiveStats.total === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-600 bg-gray-50/80">
            No archived deals in this period. When you archive with a reason, we’ll summarize them here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {archiveStats.reasons.map((item) => (
              <div key={item.reason} className="rounded-xl border border-gray-100/80 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{item.reason}</p>
                  <span className="text-xs font-semibold text-gray-500">{item.percentage.toFixed(1)}%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{item.count} deal{item.count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${surfaceClass} overflow-hidden ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Lead Source Performance</h3>
            <p className="text-xs text-gray-500 mt-1">
              Compare volume, conversion, and commissions by source.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLeadSourceExport}
            disabled={isInitialLoading || leadSourceStats.length === 0}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export CSV
          </button>
        </div>
        {isInitialLoading ? (
          <div className="px-6 py-6">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Deals
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Closed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conv. Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Commission
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Insight
                </th>
              </tr>
            </thead>
            <tbody className="bg-white/70 divide-y divide-gray-100">
              {leadSourceStats.map((stat) => {
                let label = 'Solid';
                if (stat.conversionRate >= 25 && stat.totalCommission > (yearlyStats.totalGCI || 0) / 4) {
                  label = 'Power Source';
                } else if (stat.conversionRate < 10 && stat.totalDeals >= 3) {
                  label = 'Underperformer';
                }

                return (
                  <tr key={stat.name} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <button
                      type="button"
                      onClick={() => handleLeadSourceClick(stat)}
                      disabled={!stat.id}
                      className="text-left text-[var(--app-accent)] hover:underline disabled:cursor-default disabled:text-gray-500 disabled:no-underline"
                    >
                      {stat.name}
                    </button>
                  </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {stat.totalDeals}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {stat.closedDeals}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {stat.conversionRate.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(stat.totalCommission)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      <span
                        className={
                          label === 'Power Source'
                            ? 'inline-flex px-2 py-1 rounded-full bg-green-50 text-green-700'
                            : label === 'Underperformer'
                            ? 'inline-flex px-2 py-1 rounded-full bg-amber-50 text-amber-700'
                            : 'inline-flex px-2 py-1 rounded-full bg-gray-50 text-gray-600'
                        }
                      >
                        {label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {leadSourceStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No data available for {selectedYear}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <section className={`${surfaceClass} p-6 ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
        <h3 className="font-semibold text-gray-900 mb-2">Suggested Focus Areas</h3>
        <p className="text-xs text-gray-500 mb-4">
          Practical follow-ups informed by what the data is highlighting this year.
        </p>
        {isInitialLoading ? (
          <ListSkeleton lines={4} />
        ) : (
          <>
            {insights.length > 0 && (
              <div className="mb-4 rounded-xl border border-gray-100/80 bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Insights</p>
                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                  {insights.map((item, index) => (
                    <li key={`insight-${index}`} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="space-y-3 text-sm text-gray-700">
            {gciGoal > 0 && remainingGciToGoal > 0 && (
              <li className="leading-relaxed">
                You need approximately{' '}
                <span className="font-semibold">
                  {formatCurrency(remainingGciToGoal)}
                </span>{' '}
                more GCI to hit your annual goal.
                {neededMonthlyGciToHitGoal > 0 && (
                  <>
                    {' '}
                    That&apos;s about{' '}
                    <span className="font-semibold">
                      {formatCurrency(neededMonthlyGciToHitGoal)} per month
                    </span>{' '}
                    including this month.
                  </>
                )}
              </li>
            )}

            {topLeadSource && (
              <li className="leading-relaxed">
                <span className="font-semibold">{topLeadSource.name}</span> continues to be your most
                profitable channel with{' '}
                <span className="font-semibold">
                  {formatCurrency(topLeadSource.totalCommission)}
                </span>{' '}
                in GCI. Consider increasing budget or nurture time here.
              </li>
            )}

            {underperformingSource && (
              <li className="leading-relaxed">
                <span className="font-semibold">{underperformingSource.name}</span> is converting at{' '}
                {underperformingSource.conversionRate.toFixed(1)}%. Revisit the script or pause the
                spend until it improves.
              </li>
            )}

            {yearlyStats.avgDaysToClose > 0 && (
              <li className="leading-relaxed">
                Average time from lead to close is{' '}
                <span className="font-semibold">
                  {yearlyStats.avgDaysToClose.toFixed(0)} days
                </span>
                . Tighten follow-up cadences or pre-qualification steps to reduce the cycle.
              </li>
            )}

            {(!topLeadSource || !underperformingSource) &&
              yearlyStats.closedDeals === 0 && (
                <li className="leading-relaxed">
                  Add a few deals to the pipeline this year to unlock richer insight. Once production
                  starts, this dashboard will reveal which channels earn the most.
                </li>
              )}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
