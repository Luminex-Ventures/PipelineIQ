import { useEffect, useMemo, useState, useTransition } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { MultiSelectCombobox } from '../components/ui/MultiSelectCombobox';
import { getVisibleUserIds } from '../lib/rbac';
import type { Database } from '../lib/database.types';
import { runAnalyticsDateChecks } from '../lib/analyticsDateRules';
import { useAnalyticsFilterPersistence } from '../hooks/useAnalyticsFilterPersistence';
import { LastUpdatedStatus } from '../ui/LastUpdatedStatus';
import { Card } from '../ui/Card';
import { PageShell } from '../ui/PageShell';
import { Text } from '../ui/Text';
import { ui } from '../ui/tokens';
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
  <div className={['analytics-skeleton', className].filter(Boolean).join(' ')} />
);

const StatCardsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, index) => (
      <Card key={`stat-skeleton-${index}`}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="analytics-mt-4 h-7 w-24" />
        <Skeleton className="analytics-mt-3 h-3 w-28" />
        <Skeleton className="analytics-mt-3 h-3 w-36" />
      </Card>
    ))}
  </div>
);

const TileSkeleton = () => (
  <Card padding="cardTight">
    <Skeleton className="h-3 w-20" />
    <Skeleton className="analytics-mt-3 h-5 w-24" />
    <Skeleton className="analytics-mt-2 h-3 w-28" />
  </Card>
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

  const pillBase = [ui.radius.pill, ui.border.subtle, ui.pad.chipTight, 'inline-flex items-center bg-white'].join(' ');
  const tileClass = 'analytics-tile';

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

  const focusAreas = useMemo(() => {
    const items: Array<{ title: string; detail: string }> = [];

    if (gciGoal > 0 && remainingGciToGoal > 0) {
      let detail = `You need about ${formatCurrency(remainingGciToGoal)} more GCI to hit your annual goal.`;
      if (neededMonthlyGciToHitGoal > 0) {
        detail += ` That is roughly ${formatCurrency(neededMonthlyGciToHitGoal)} per month.`;
      }
      items.push({ title: 'Close the GCI gap', detail });
    }

    if (topLeadSource) {
      items.push({
        title: 'Scale your top channel',
        detail: `${topLeadSource.name} is the most profitable source with ${formatCurrency(
          topLeadSource.totalCommission
        )} GCI. Increase nurture or budget here.`
      });
    }

    if (underperformingSource) {
      items.push({
        title: 'Fix low conversion',
        detail: `${underperformingSource.name} converts at ${underperformingSource.conversionRate.toFixed(
          1
        )}%. Adjust messaging or pause spend until it improves.`
      });
    }

    if (yearlyStats.avgDaysToClose > 0) {
      items.push({
        title: 'Shorten time-to-close',
        detail: `Average lead-to-close is ${yearlyStats.avgDaysToClose.toFixed(
          0
        )} days. Tighten follow-up cadence to reduce cycle time.`
      });
    }

    if ((!topLeadSource || !underperformingSource) && yearlyStats.closedDeals === 0) {
      items.push({
        title: 'Build initial signal',
        detail:
          'Add a few deals to the pipeline this year to unlock clearer channel and cycle insights.'
      });
    }

    return items.slice(0, 4);
  }, [
    gciGoal,
    neededMonthlyGciToHitGoal,
    remainingGciToGoal,
    topLeadSource,
    underperformingSource,
    yearlyStats.avgDaysToClose,
    yearlyStats.closedDeals
  ]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const yearOptions = years.map((year) => ({ value: year.toString(), label: year.toString() }));
  const timeframeDescription = `Jan 1 – Dec 31, ${selectedYear}${isCurrentYear ? ' · In progress' : ''}`;

  const isInitialLoading = loading;
  const isRefreshing = refreshing;

  const headerTitle = (
    <div className="space-y-2">
      <Text variant="micro">Analytics</Text>
      <Text as="h1" variant="h1">Year in Review</Text>
      <Text variant="muted">
        A cohesive digest of production, pace, and lead-source efficiency for your selected year.
      </Text>
    </div>
  );
  const headerActions = (
    <div className="flex flex-col gap-3 items-start sm:items-end">
      <LastUpdatedStatus
        refreshing={isRefreshing}
        label={lastRefreshedAt ? `Last updated ${formatLastUpdated(lastRefreshedAt)}` : null}
        className="min-h-[20px]"
      />
      <div className={['space-y-1', ui.align.right].join(' ')}>
        <Text as="span" variant="micro" className={ui.tone.faint}>
          Timeframe
        </Text>
        <Text variant="muted">{timeframeDescription}</Text>
      </div>
      <SegmentedControl
        options={yearOptions}
        value={String(selectedYear)}
        onChange={(value) => setSelectedYear(parseInt(value, 10))}
        className="self-start sm:self-end w-max"
      />
    </div>
  );

  return (
    <PageShell title={headerTitle} actions={headerActions}>
      <div className="space-y-8">
      {canShowFilterPanel && (
        <Card className="space-y-4">
          <div className="space-y-2">
            <Text as="span" variant="micro">Scope</Text>
            <Text variant="muted">{scopeDescription}</Text>
          </div>
          {(activeFilterChips.length > 0 || showFocusOnMe) && (
            <div className="flex flex-wrap items-center gap-2">
              {showFocusOnMe && (
                <button
                  type="button"
                  onClick={selectMyData}
                  className={[
                    pillBase,
                    isFocusOnMeActive ? 'bg-[var(--app-accent)]' : 'bg-gray-100 hover:bg-gray-200',
                    isFocusOnMeActive ? ui.tone.inverse : ui.tone.primary,
                    'transition'
                  ].join(' ')}
                >
                  <Text as="span" variant="body" className="font-semibold">
                    Focus On Me
                  </Text>
                </button>
              )}
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className={[pillBase, 'gap-2'].join(' ')}
                >
                  <Text as="span" variant="body" className={[ui.tone.subtle, 'font-semibold'].join(' ')}>
                    {chip.label}
                  </Text>
                  <Text as="span" variant="body" className={ui.tone.faint}>
                    x
                  </Text>
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
                  className="inline-flex items-center"
                >
                  <Text as="span" variant="muted" className={[ui.tone.accent, 'font-semibold'].join(' ')}>
                    Clear all filters
                  </Text>
                </button>
              )}
            </div>
          )}
          {availableAgents.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                <MultiSelectCombobox
                  label="Agents"
                  options={agentOptions}
                  value={selectedAgentIds}
                  onChange={setSelectedAgentIds}
                  placeholder="Search agents..."
                  disabled={agentOptions.length === 0}
                />
              </div>
              <div className="space-y-2">
                <MultiSelectCombobox
                  label="Pipeline Stage"
                  options={stageOptions}
                  value={selectedPipelineStages}
                  onChange={setSelectedPipelineStages}
                  placeholder="Search stages..."
                  disabled={stageOptions.length === 0}
                />
              </div>
              <div className="space-y-2">
                <MultiSelectCombobox
                  label="Deal Type"
                  options={dealTypeOptions}
                  value={selectedDealTypes}
                  onChange={(next) => setSelectedDealTypes(next as DealRow['deal_type'][])}
                  placeholder="Search deal types..."
                  disabled={dealTypeOptions.length === 0}
                />
              </div>
              <div className="space-y-2">
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
        </Card>
      )}

      <section>
        {isInitialLoading ? (
          <StatCardsSkeleton />
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
            <Card>
              <Text as="span" variant="micro" className={ui.tone.blue}>Pipeline</Text>
              <Text as="div" variant="h2" className="analytics-mt-2">
                {formatNumber(yearlyStats.closedDeals)}
              </Text>
              <Text variant="muted" className="analytics-mt-1">Closed deals</Text>
              <Text variant="muted" className="analytics-mt-3">
                {yearlyStats.buyerDeals} buyer • {yearlyStats.sellerDeals} seller
              </Text>
            </Card>
            <Card>
              <Text as="span" variant="micro" className={ui.tone.success}>Volume</Text>
              <Text as="div" variant="h2" className="analytics-mt-2">
                {formatCurrency(yearlyStats.totalVolume)}
              </Text>
              <Text variant="muted" className="analytics-mt-1">Total sales volume</Text>
              <Text variant="muted" className="analytics-mt-3">
                Avg sale price • {formatCurrency(yearlyStats.avgSalePrice)}
              </Text>
            </Card>
            <Card>
              <Text as="span" variant="micro" className={ui.tone.warningStrong}>Net GCI</Text>
              <Text as="div" variant="h2" className="analytics-mt-2">
                {formatCurrency(yearlyStats.totalGCI)}
              </Text>
              <Text variant="muted" className="analytics-mt-1">Total earnings after splits</Text>
              <Text variant="muted" className="analytics-mt-3">
                Avg commission • {formatCurrency(yearlyStats.avgCommission)}
              </Text>
            </Card>
            <Card>
              <Text as="span" variant="micro" className={ui.tone.infoStrong}>Pace</Text>
              <Text as="div" variant="h2" className="analytics-mt-2">
                {formatNumber(closingThisMonthStats.count)}
              </Text>
              <Text variant="muted" className="analytics-mt-1">Deals closing this month</Text>
              <Text variant="muted" className="analytics-mt-3">
                GCI this month • {formatCurrency(closingThisMonthStats.gci)}
              </Text>
              {yearlyStats.avgDaysToClose > 0 && (
                <Text variant="muted" className="analytics-mt-1">
                  Avg time to close • {yearlyStats.avgDaysToClose.toFixed(0)} days
                </Text>
              )}
            </Card>
          </div>
        )}
      </section>

      <section className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isRefreshing ? 'opacity-80 transition-opacity' : ''}`}>
        <Card className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Text as="h3" variant="h2">Monthly Performance</Text>
              <Text variant="muted">
                How each producing month contributes to pace and income.
              </Text>
            </div>
            <div>
              {activeMonthsCount > 0 ? (
                <span className={pillBase}>
                  <Text as="span" variant="micro" className={ui.tone.subtle}>
                    {activeMonthsCount} active months
                  </Text>
                </span>
              ) : (
                <Text as="span" variant="muted" className={ui.tone.faint}>
                  No closed months yet
                </Text>
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
                <Text as="span" variant="micro">Top Month</Text>
                {bestMonth ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Text as="span" variant="h2">{bestMonth.month}</Text>
                      <span className={pillBase}>
                        <Text as="span" variant="micro" className={ui.tone.subtle}>
                          {bestMonthDetails?.deals ?? 0} deals
                        </Text>
                      </span>
                    </div>
                    <Text variant="muted">{formatCurrency(bestMonth.gci)}</Text>
                  </>
                ) : (
                  <Text variant="muted">No producing months yet.</Text>
                )}
              </div>
              <div className={tileClass}>
                <Text as="span" variant="micro">Slow Month</Text>
                {worstMonth && bestMonth && worstMonth.month !== bestMonth.month ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Text as="span" variant="h2">{worstMonth.month}</Text>
                      <span className={pillBase}>
                        <Text as="span" variant="micro" className={ui.tone.subtle}>
                          {worstMonthDetails?.deals ?? 0} deals
                        </Text>
                      </span>
                    </div>
                    <Text variant="muted">{formatCurrency(worstMonth.gci)}</Text>
                  </>
                ) : bestMonth ? (
                  <Text variant="muted">Only one producing month so far.</Text>
                ) : (
                  <Text variant="muted">No data yet.</Text>
                )}
              </div>
              <div className={tileClass}>
                <Text as="span" variant="micro">Avg Active Month</Text>
                <Text as="div" variant="h2">
                  {formatCurrency(avgMonthlyGci || 0)}
                </Text>
                <div className="flex items-center gap-2">
                  <Text variant="muted">
                    {activeMonthsCount || 0} active month{activeMonthsCount === 1 ? '' : 's'}
                  </Text>
                  <span className={pillBase}>
                    <Text as="span" variant="micro" className={ui.tone.subtle}>
                      {avgDealsPerActiveMonth.toFixed(1)} deals/mo
                    </Text>
                  </span>
                </div>
              </div>
              <div className={tileClass}>
                <Text as="span" variant="micro">Momentum</Text>
                {momentumDelta !== null && lastActiveMonth ? (
                  <>
                    <Text
                      as="div"
                      variant="h2"
                      className={momentumDelta >= 0 ? ui.tone.successStrong : ui.tone.rose}
                    >
                      {momentumDelta >= 0 ? '+' : '-'}
                      {formatCurrency(Math.abs(momentumDelta))}
                    </Text>
                    <Text variant="muted">
                      Vs. {prevActiveMonth?.month ?? 'previous month'} GCI
                    </Text>
                  </>
                ) : (
                  <Text variant="muted">
                    Log at least two producing months to see momentum.
                  </Text>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Text as="h4" variant="body" className="font-semibold">Monthly Ledger</Text>
              <div className="flex items-center gap-3">
                <Text as="span" variant="muted">
                  Peak GCI: {peakMonthlyGci ? formatCurrency(peakMonthlyGci) : '—'} • Peak deals:{' '}
                  {peakMonthlyDeals || '—'}
                </Text>
                <button
                  type="button"
                  onClick={handleMonthlyExport}
                  disabled={isInitialLoading || monthlyData.length === 0}
                  className="hig-btn-secondary"
                >
                  Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {isInitialLoading ? (
                <TableSkeleton rows={6} cols={5} />
              ) : (
                <table className="analytics-table">
                  <thead>
                    <tr className="analytics-table-head-row">
                      <th className="analytics-table-head-cell">Month</th>
                      <th className="analytics-table-head-cell">Deals</th>
                      <th className="analytics-table-head-cell">GCI</th>
                      <th className="analytics-table-head-cell">Avg / Deal</th>
                      <th className="analytics-table-head-cell analytics-table-head-cell--right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((month) => {
                      const avgPerDeal = month.deals > 0 ? month.gci / month.deals : 0;
                      const share =
                        yearlyStats.totalGCI > 0 ? (month.gci / yearlyStats.totalGCI) * 100 : 0;
                      return (
                        <tr key={month.month} className="analytics-table-row">
                          <td className="analytics-table-cell analytics-table-cell--strong">{month.month}</td>
                          <td className="analytics-table-cell">{month.deals}</td>
                          <td className="analytics-table-cell">{formatCurrency(month.gci)}</td>
                          <td className="analytics-table-cell">
                            {month.deals > 0 ? formatCurrency(avgPerDeal) : '—'}
                          </td>
                          <td className="analytics-table-cell analytics-table-cell--right">
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
        </Card>

        {/* Commission by Lead Source */}
        <Card className="space-y-4">
          <div className="space-y-2">
            <Text as="h3" variant="h2">Momentum & Pace</Text>
            <Text variant="muted">
              Are you ahead or behind last year’s GCI at this point on the calendar?
            </Text>
          </div>
          {isInitialLoading ? (
            <div className="grid grid-cols-1 gap-4">
              <Card className="space-y-4">
                <Skeleton className="h-3 w-32" />
                <div className="analytics-mt-4 flex items-center justify-between gap-4">
                  <div>
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="analytics-mt-2 h-3 w-20" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="analytics-mt-2 h-5 w-24" />
                    <Skeleton className="analytics-mt-3 h-3 w-28" />
                    <Skeleton className="analytics-mt-2 h-5 w-24" />
                  </div>
                </div>
                <Skeleton className="analytics-mt-4 h-3 w-full" />
                <Skeleton className="analytics-mt-2 h-3 w-2/3" />
              </Card>
              <Card className="space-y-4">
                <Skeleton className="h-3 w-40" />
                <div className="analytics-mt-4 grid grid-cols-2 gap-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="analytics-mt-4 h-3 w-full" />
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <Card className="analytics-card-gradient space-y-4">
                <Text as="span" variant="micro">Year-over-year pace</Text>
                <div className="analytics-mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <Text as="div" variant="h2">
                      {formatCurrency(yearlyStats.totalGCI)}
                    </Text>
                    <Text variant="muted">Current GCI</Text>
                  </div>
                  <div className={ui.align.right}>
                    <Text variant="muted">Projected at current pace</Text>
                    <Text as="div" variant="h2">
                      {formatCurrency(projectedGciAtCurrentPace)}
                    </Text>
                    <Text variant="muted" className="analytics-mt-2">Needed pace to hit goal</Text>
                    <Text as="div" variant="h2">
                      {gciGoal > 0 && remainingGciToGoal > 0 && remainingMonths > 0 ? (
                        <>
                          {formatCurrency(neededMonthlyGciToHitGoal)}{' '}
                          <Text as="span" variant="muted">/mo</Text>
                        </>
                      ) : (
                        '—'
                      )}
                    </Text>
                  </div>
                </div>
                <div className="analytics-mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Text as="span" variant="muted">Current</Text>
                    <Text as="span" variant="muted">Goal</Text>
                  </div>
                  <div className="analytics-progress">
                    <div
                      className="analytics-progress-fill"
                      style={{ width: `${Math.min(100, (yearlyStats.totalGCI / (gciGoal || 1)) * 100)}%` }}
                    />
                  </div>
                  <Text variant="muted">
                    {goalProgress.toFixed(1)}% of goal • year is {(yearProgress * 100).toFixed(1)}% complete
                    {gciGoal > 0 && isCurrentYear
                      ? ` • ${remainingMonths} month${remainingMonths === 1 ? '' : 's'} remaining (incl. this month)`
                      : ''}
                  </Text>
                </div>
              </Card>

              <Card className="space-y-4">
                <Text as="span" variant="micro">Active pipeline outlook</Text>
                <div className="analytics-mt-3 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Text as="div" variant="h2">
                      {formatNumber(closingThisMonthStats.count)}
                    </Text>
                    <Text variant="muted">Deals expected to close this month</Text>
                  </div>
                  <div className="space-y-1">
                    <Text as="div" variant="h2">
                      {formatCurrency(closingThisMonthStats.gci)}
                    </Text>
                    <Text variant="muted">Projected monthly GCI</Text>
                  </div>
                </div>
                <div className="analytics-callout">
                  {momentumDelta !== null && lastActiveMonth ? (
                    <>
                      <Text as="span" variant="body" className="font-semibold">
                        {momentumDelta >= 0 ? 'Ahead' : 'Trailing'} pace
                      </Text>{' '}
                      by {formatCurrency(Math.abs(momentumDelta))} versus {prevActiveMonth?.month ?? 'previous'}.
                      Keep this cadence to end the year at{' '}
                      <Text as="span" variant="body" className="font-semibold">
                        {formatCurrency(projectedGciAtCurrentPace)}
                      </Text>.
                    </>
                  ) : (
                    'Once two months close we’ll highlight whether you are accelerating or slowing down.'
                  )}
                </div>
              </Card>
            </div>
          )}
        </Card>
      </section>

      <Card className={isRefreshing ? 'opacity-80 transition-opacity' : ''}>
        <div className="space-y-2">
          <Text as="h3" variant="h2">Stage Conversion (Transitions)</Text>
          <Text variant="muted">
            Based on recorded pipeline stage transitions during {selectedYear}.
          </Text>
        </div>
        <div className="overflow-x-auto analytics-mt-4">
          {isInitialLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : (
            <table className="analytics-table">
              <thead>
                <tr className="analytics-table-head-row analytics-table-head-row--bordered">
                  <th className="analytics-table-head-cell">From → To</th>
                  <th className="analytics-table-head-cell">Entered</th>
                  <th className="analytics-table-head-cell">Advanced</th>
                  <th className="analytics-table-head-cell">Conversion</th>
                </tr>
              </thead>
              <tbody className="analytics-table-body">
                {funnelTransitions.map((row) => (
                  <tr key={`${row.from}-${row.to}`}>
                    <td className="analytics-table-cell analytics-table-cell--strong">
                      {stageLabel[row.from]} → {stageLabel[row.to]}
                    </td>
                    <td className="analytics-table-cell">{row.entered}</td>
                    <td className="analytics-table-cell">{row.advanced}</td>
                    <td className="analytics-table-cell analytics-table-cell--strong">
                      {row.rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {funnelTransitions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="analytics-table-empty">
                      No transition data available for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <Text variant="muted" className="analytics-mt-3">
          Note: Counts are based on stage-change events. Deals that entered a stage before {selectedYear} are not counted as
          entered in that stage during this period.
        </Text>
      </Card>

      <Card className={isRefreshing ? 'opacity-80 transition-opacity' : ''}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Text as="h3" variant="h2">Closed Lost Reasons</Text>
            <Text variant="muted">
              Why archived deals fell out — fuel pipeline fixes, coaching, and source tuning.
            </Text>
          </div>
          <div>
            <span className={pillBase}>
              <Text as="span" variant="micro" className={ui.tone.subtle}>
                {archiveStats.total} archived
              </Text>
            </span>
          </div>
        </div>

        {isInitialLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 analytics-mt-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={`archive-skeleton-${index}`} padding="cardTight">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="analytics-mt-2 h-3 w-20" />
              </Card>
            ))}
          </div>
        ) : archiveStats.total === 0 ? (
          <div className="analytics-empty-card analytics-mt-4">
            <Text variant="muted">
              No archived deals in this period. When you archive with a reason, we’ll summarize them here.
            </Text>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 analytics-mt-4">
            {archiveStats.reasons.map((item) => (
              <Card key={item.reason} padding="cardTight">
                <div className="flex items-center justify-between">
                  <Text as="p" variant="body" className="font-semibold">
                    {item.reason}
                  </Text>
                  <Text as="span" variant="muted" className="font-semibold">
                    {item.percentage.toFixed(1)}%
                  </Text>
                </div>
                <Text variant="muted" className="analytics-mt-1">
                  {item.count} deal{item.count === 1 ? '' : 's'}
                </Text>
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Card className={['overflow-hidden', isRefreshing ? 'opacity-80 transition-opacity' : ''].join(' ')}>
        <div className="analytics-section-header">
          <div className="space-y-2">
            <Text as="h3" variant="h2">Lead Source Performance</Text>
            <Text variant="muted">
              Compare volume, conversion, and commissions by source.
            </Text>
          </div>
          <button
            type="button"
            onClick={handleLeadSourceExport}
            disabled={isInitialLoading || leadSourceStats.length === 0}
            className="hig-btn-secondary"
          >
            Export CSV
          </button>
        </div>
        {isInitialLoading ? (
          <div className="analytics-section-body">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : (
          <table className="analytics-table analytics-table-divider">
            <thead className="analytics-table-head">
              <tr className="analytics-table-head-row">
                <th className="analytics-table-head-cell">Source</th>
                <th className="analytics-table-head-cell">Total Deals</th>
                <th className="analytics-table-head-cell">Closed</th>
                <th className="analytics-table-head-cell">Conv. Rate</th>
                <th className="analytics-table-head-cell">Total Commission</th>
                <th className="analytics-table-head-cell">Insight</th>
              </tr>
            </thead>
            <tbody className="analytics-table-body">
              {leadSourceStats.map((stat) => {
                let label = 'Solid';
                if (stat.conversionRate >= 25 && stat.totalCommission > (yearlyStats.totalGCI || 0) / 4) {
                  label = 'Power Source';
                } else if (stat.conversionRate < 10 && stat.totalDeals >= 3) {
                  label = 'Underperformer';
                }

                return (
                  <tr key={stat.name} className="analytics-table-row">
                    <td className="analytics-table-cell analytics-table-cell--strong">
                      <button
                        type="button"
                        onClick={() => handleLeadSourceClick(stat)}
                        disabled={!stat.id}
                        className="analytics-link"
                      >
                        {stat.name}
                      </button>
                    </td>
                    <td className="analytics-table-cell">{stat.totalDeals}</td>
                    <td className="analytics-table-cell">{stat.closedDeals}</td>
                    <td className="analytics-table-cell">{stat.conversionRate.toFixed(1)}%</td>
                    <td className="analytics-table-cell analytics-table-cell--accent">
                      {formatCurrency(stat.totalCommission)}
                    </td>
                    <td className="analytics-table-cell">
                      <span
                        className={
                          label === 'Power Source'
                            ? 'analytics-pill analytics-pill--success'
                            : label === 'Underperformer'
                            ? 'analytics-pill analytics-pill--warning'
                            : 'analytics-pill analytics-pill--neutral'
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
                  <td colSpan={6} className="analytics-table-empty">
                    No data available for {selectedYear}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Card className={isRefreshing ? 'opacity-80 transition-opacity' : ''}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Text as="h3" variant="h2">Suggested Focus Areas</Text>
            <Text variant="muted">
              Focused next steps pulled from your strongest signals this year.
            </Text>
          </div>
          <span className="analytics-pill analytics-pill--info">Actionable</span>
        </div>
        {isInitialLoading ? (
          <div className="analytics-mt-4">
            <ListSkeleton lines={4} />
          </div>
        ) : (
          <>
            {focusAreas.length > 0 ? (
              <ol className="space-y-3 analytics-mt-4">
                {focusAreas.map((item, index) => (
                  <li key={`${item.title}-${index}`} className="analytics-focus-item">
                    <div className="flex items-start gap-3">
                      <div className="analytics-focus-index">
                        {index + 1}
                      </div>
                      <div className="space-y-1">
                        <Text as="p" variant="body" className="font-semibold">
                          {item.title}
                        </Text>
                        <Text variant="muted">{item.detail}</Text>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Text variant="muted" className="analytics-mt-4">
                Add a few deals to surface more specific focus recommendations.
              </Text>
            )}
          </>
        )}
      </Card>
      </div>
    </PageShell>
  );
}
