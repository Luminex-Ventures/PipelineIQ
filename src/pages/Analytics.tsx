import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, DollarSign, Target } from 'lucide-react';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { getVisibleUserIds } from '../lib/rbac';
import type { Database } from '../lib/database.types';
type DealRow = Database['public']['Tables']['deals']['Row'];

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

const CLOSING_STATUSES: DealRow['status'][] = ['under_contract', 'pending', 'closed'];

const DEAL_TYPE_LABELS: Record<DealRow['deal_type'], string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_and_seller: 'Buyer & Seller',
  renter: 'Renter',
  landlord: 'Landlord'
};

export default function Analytics() {
  const { user, roleInfo } = useAuth();
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
  const scopeDescription = useMemo(() => {
    const agentPart = (() => {
      if (!selectedAgentIds.length || isAllAgentsSelected) return 'all agents';
      if (selectedAgentIds.length === 1) {
        const agent = availableAgents.find((item) => item.id === selectedAgentIds[0]);
        return agent?.label || 'a single agent';
      }
      return `${selectedAgentIds.length} agents`;
    })();

    const stagePart =
      selectedPipelineStages.length && availableStages.length
        ? ` in ${availableStages
            .filter((stage) => selectedPipelineStages.includes(stage.id))
            .map((stage) => stage.label)
            .join(', ')}`
        : '';

    const dealTypePart =
      selectedDealTypes.length && availableDealTypes.length
        ? ` for ${selectedDealTypes
            .map((dealType) => DEAL_TYPE_LABELS[dealType] ?? dealType.replace(/_/g, ' '))
            .join(', ')} deals`
        : '';

    const leadSourcePart =
      selectedLeadSources.length && availableLeadSources.length
        ? ` from ${availableLeadSources
            .filter((source) => selectedLeadSources.includes(source.id))
            .map((source) => source.name)
            .join(', ')}`
        : '';

    return `Viewing ${agentPart}${stagePart}${dealTypePart}${leadSourcePart}`.trim();
  }, [
    availableAgents,
    availableDealTypes,
    availableLeadSources,
    availableStages,
    isAllAgentsSelected,
    selectedAgentIds,
    selectedDealTypes,
    selectedLeadSources,
    selectedPipelineStages,
    user?.id
  ]);

  const selectAllAgents = () => {
    if (availableAgents.length) {
      setSelectedAgentIds(availableAgents.map((agent) => agent.id));
    }
  };

  const selectMyData = () => {
    if (user) {
      setSelectedAgentIds([user.id]);
    }
  };

  const resetAgents = () => {
    setSelectedAgentIds([]);
  };

  const handleAgentSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setSelectedAgentIds(values);
  };

  const handlePipelineFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setSelectedPipelineStages(values);
  };

  const handleLeadSourceFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setSelectedLeadSources(values);
  };

  const handleDealTypeFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map(
      (option) => option.value as DealRow['deal_type']
    );
    setSelectedDealTypes(values);
  };

  useEffect(() => {
    if (!availableDealTypes.length) return;
    setSelectedDealTypes((current) => current.filter((type) => availableDealTypes.includes(type)));
  }, [availableDealTypes]);

  const withUserScope = (query: any, userIds: string[]) => {
    if (!userIds.length) {
      return query;
    }
    if (userIds.length === 1) {
      return query.eq('user_id', userIds[0]);
    }
    return query.in('user_id', userIds);
  };

  const applyDealFilters = (query: any, userIds: string[]) => {
    query = withUserScope(query, userIds);
    if (selectedLeadSources.length) {
      query = query.in('lead_source_id', selectedLeadSources);
    }
    if (selectedPipelineStages.length) {
      const stages = selectedPipelineStages.filter(Boolean);
      if (stages.length) {
        query = query.in('pipeline_status_id', stages);
      }
    }
    if (selectedDealTypes.length) {
      query = query.in('deal_type', selectedDealTypes);
    }
    return query;
  };

  const canShowFilterPanel =
    (roleInfo && roleInfo.globalRole !== 'agent') || availableAgents.length > 1;

  const loadFilterContext = async (agentIds: string[], year: number) => {
    const ids = agentIds.length ? agentIds : availableAgents.map(a => a.id);
    if (!ids.length) return;
    const startOfYearISO = new Date(year, 0, 1).toISOString();
    const endOfYearISO = new Date(year, 11, 31, 23, 59, 59).toISOString();

    let contextQuery = supabase
      .from('deals')
      .select(`
        id,
        deal_type,
        lead_source_id,
        lead_sources (id, name),
        pipeline_status_id,
        pipeline_statuses (id, name, sort_order)
      `)
      .gte('created_at', startOfYearISO)
      .lte('created_at', endOfYearISO);

    contextQuery = withUserScope(contextQuery, ids);

    const { data, error } = await contextQuery;
    if (error) {
      console.error('Unable to load analytics filter context', error);
      return;
    }

    const leadMap = new Map<string, { id: string; name: string }>();
    const stageMap = new Map<string, StageOption>();
    const dealTypeSet = new Set<DealRow['deal_type']>();

    (data || []).forEach((deal: any) => {
      if (deal.lead_sources?.id) {
        leadMap.set(deal.lead_sources.id, {
          id: deal.lead_sources.id,
          name: deal.lead_sources.name || 'Unknown'
        });
      }
      if (deal.pipeline_statuses?.id) {
        stageMap.set(deal.pipeline_statuses.id, {
          id: deal.pipeline_statuses.id,
          label: deal.pipeline_statuses.name,
          sortOrder: deal.pipeline_statuses.sort_order
        });
      }

      if (deal.deal_type) {
        dealTypeSet.add(deal.deal_type as DealRow['deal_type']);
      }
    });

    setAvailableLeadSources(Array.from(leadMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    setAvailableStages(
      Array.from(stageMap.values()).sort((a, b) => {
        const orderA = a.sortOrder ?? 999;
        const orderB = b.sortOrder ?? 999;
        if (orderA === orderB) {
          return a.label.localeCompare(b.label);
        }
        return orderA - orderB;
      })
    );
    const sortedDealTypes = Array.from(dealTypeSet).sort((a, b) => {
      const labelA = DEAL_TYPE_LABELS[a as DealRow['deal_type']] ?? a;
      const labelB = DEAL_TYPE_LABELS[b as DealRow['deal_type']] ?? b;
      return labelA.localeCompare(labelB);
    });
    setAvailableDealTypes(
      sortedDealTypes.length ? sortedDealTypes : (Object.keys(DEAL_TYPE_LABELS) as DealRow['deal_type'][])
    );
  };

type DateParts = {
  year: number;
  month: number; // 0-based
  date: Date;
};

const parseDateValue = (value?: string | null): DateParts | null => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      Number.isNaN(day) ||
      month < 0 ||
      month > 11 ||
      day < 1 ||
      day > 31
    ) {
      return null;
    }
    const date = new Date(Date.UTC(year, month, day));
    return { year, month, date };
  }

  const sanitized = trimmed
    .replace(' ', 'T')
    .replace(/(\+\d{2})(\d{2})$/, '$1:$2')
    .replace(/(-\d{2})(\d{2})$/, '$1:$2');

  const parsed = new Date(sanitized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth(),
    date: parsed,
  };
};

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
      setSelectedAgentIds(initialIds.length ? [] : [user.id]);
    };

    bootstrapAgents();
  }, [user, roleInfo?.globalRole, roleInfo?.teamId]);

  useEffect(() => {
    if (!user) return;
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedYear, agentScopeKey, leadFilterKey, stageFilterKey, dealTypeFilterKey]);

  useEffect(() => {
    const ids = selectedAgentIds.length ? selectedAgentIds : availableAgents.map(a => a.id);
    if (!user || ids.length === 0) return;
    loadFilterContext(ids, selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentIds, selectedYear, availableAgents]);

  const loadAnalytics = async () => {
    if (!user) return;
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

    const startOfYear = new Date(selectedYear, 0, 1).toISOString();
    const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59).toISOString();

    const { data: settings } = await supabase
      .from('user_settings')
      .select('annual_gci_goal')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settings) setGciGoal(settings.annual_gci_goal || 0);

    let closedQuery = supabase
      .from('deals')
      .select(
        `
        *,
        lead_sources (name),
        pipeline_statuses (id, name, sort_order)
      `
      )
      .eq('status', 'closed');
    closedQuery = applyDealFilters(closedQuery, ids);

    const { data: closedDeals } = await closedQuery;

    let allDealsQuery = supabase
      .from('deals')
      .select(
        `
        *,
        lead_sources (name),
        pipeline_statuses (id, name, sort_order)
      `
      )
      .gte('created_at', startOfYear)
      .lte('created_at', endOfYear);
    allDealsQuery = applyDealFilters(allDealsQuery, ids);

    const { data: allDeals } = await allDealsQuery;

    if (closedDeals) {
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      let totalVolume = 0;
      let totalGCI = 0;
      let buyerCount = 0;
      let sellerCount = 0;
      let totalDaysToClose = 0;
      let dealsWithDuration = 0;
      let countedClosedDeals = 0;

      const monthlyGCI: { [key: string]: number } = {};
      const monthlyDeals: { [key: string]: number } = {};

      const now = new Date();
      const currentMonthIndex = now.getMonth();
      const isCurrentYear = now.getFullYear() === selectedYear;

      closedDeals.forEach((deal: any) => {
        const closedParts =
          parseDateValue(deal.close_date) ||
          parseDateValue(deal.closed_at);

        if (!closedParts) return;
        if (closedParts.year !== selectedYear) return;

        countedClosedDeals += 1;

        const salePrice = deal.actual_sale_price || deal.expected_sale_price || 0;
        totalVolume += salePrice;

        const grossCommission = salePrice * (deal.gross_commission_rate || 0);
        const afterBrokerageSplit = grossCommission * (1 - (deal.brokerage_split_rate || 0));
        const afterReferral = deal.referral_out_rate
          ? afterBrokerageSplit * (1 - deal.referral_out_rate)
          : afterBrokerageSplit;
        const netCommission = afterReferral - (deal.transaction_fee || 0);
        totalGCI += netCommission;

        if (deal.deal_type === 'buyer') buyerCount++;
        if (deal.deal_type === 'seller') sellerCount++;
        if (deal.deal_type === 'buyer_and_seller') {
          buyerCount++;
          sellerCount++;
        }

        const createdAtDate = parseDateValue(deal.created_at);
        if (createdAtDate) {
          const diffMs = closedParts.date.getTime() - createdAtDate.date.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (!Number.isNaN(diffDays) && diffDays >= 0) {
            totalDaysToClose += diffDays;
            dealsWithDuration++;
          }
        }

        const monthIndex = closedParts.month;
        const monthShort = monthNames[monthIndex];
        monthlyGCI[monthShort] = (monthlyGCI[monthShort] || 0) + netCommission;
        monthlyDeals[monthShort] = (monthlyDeals[monthShort] || 0) + 1;
      });

      const avgDaysToClose =
        dealsWithDuration > 0 ? totalDaysToClose / dealsWithDuration : 0;

      setYearlyStats({
        closedDeals: countedClosedDeals,
        totalVolume,
        totalGCI,
        avgSalePrice: countedClosedDeals > 0 ? totalVolume / countedClosedDeals : 0,
        avgCommission: countedClosedDeals > 0 ? totalGCI / countedClosedDeals : 0,
        buyerDeals: buyerCount,
        sellerDeals: sellerCount,
        avgDaysToClose,
      });

      const monthlyDataArray = monthNames.map((month) => ({
        month,
        gci: monthlyGCI[month] || 0,
        deals: monthlyDeals[month] || 0,
      }));
      setMonthlyData(monthlyDataArray);
    } else {
      setYearlyStats((prev) => ({
        ...prev,
        closedDeals: 0,
        totalVolume: 0,
        totalGCI: 0,
        avgSalePrice: 0,
        avgCommission: 0,
        buyerDeals: 0,
        sellerDeals: 0,
        avgDaysToClose: 0,
      }));
      setMonthlyData([]);
      setClosingThisMonthStats({ count: 0, gci: 0 });
    }

    const now = new Date();
    const isCurrentYear = now.getFullYear() === selectedYear;
    const closingThisMonth: ClosingThisMonthStats = { count: 0, gci: 0 };

    if (allDeals) {
      if (isCurrentYear) {
        allDeals.forEach((deal: any) => {
          const closeParts =
            parseDateValue(deal.close_date) ||
            parseDateValue(deal.closed_at);

          if (!closeParts) return;
          const sameMonth = closeParts.year === now.getFullYear() && closeParts.month === now.getMonth();
          if (!sameMonth) return;

          if (!CLOSING_STATUSES.includes(deal.status)) return;

          const salePrice = deal.actual_sale_price || deal.expected_sale_price || 0;
          const grossCommission = salePrice * (deal.gross_commission_rate || 0);
          const afterBrokerageSplit = grossCommission * (1 - (deal.brokerage_split_rate || 0));
          const afterReferral = deal.referral_out_rate
            ? afterBrokerageSplit * (1 - deal.referral_out_rate)
            : afterBrokerageSplit;
          const netCommission = afterReferral - (deal.transaction_fee || 0);

          closingThisMonth.count += 1;
          closingThisMonth.gci += netCommission;
        });
      }

      const sourceMap: {
        [key: string]: { total: number; closed: number; commission: number };
      } = {};

      allDeals.forEach((deal: any) => {
        const sourceName = deal.lead_sources?.name || 'Unknown';
        if (!sourceMap[sourceName]) {
          sourceMap[sourceName] = { total: 0, closed: 0, commission: 0 };
        }
        sourceMap[sourceName].total++;

        if (deal.status === 'closed') {
          sourceMap[sourceName].closed++;
          const salePrice = deal.actual_sale_price || deal.expected_sale_price || 0;
          const grossCommission = salePrice * (deal.gross_commission_rate || 0);
          const afterBrokerageSplit = grossCommission * (1 - (deal.brokerage_split_rate || 0));
          const afterReferral = deal.referral_out_rate
            ? afterBrokerageSplit * (1 - deal.referral_out_rate)
            : afterBrokerageSplit;
          const netCommission = afterReferral - (deal.transaction_fee || 0);
          sourceMap[sourceName].commission += netCommission;
        }
      });

      const sourceStats: LeadSourceStat[] = Object.entries(sourceMap).map(
        ([name, stats]) => ({
          name,
          totalDeals: stats.total,
          closedDeals: stats.closed,
          conversionRate: stats.total > 0 ? (stats.closed / stats.total) * 100 : 0,
          totalCommission: stats.commission,
        })
      );

      setLeadSourceStats(
        sourceStats.sort((a, b) => b.totalCommission - a.totalCommission)
      );
    } else {
      setClosingThisMonthStats({ count: 0, gci: 0 });
      setLeadSourceStats([]);
    }

    setClosingThisMonthStats(closingThisMonth);

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

  // Goal & pace calculations
  const goalProgress = gciGoal > 0 ? (yearlyStats.totalGCI / gciGoal) * 100 : 0;
  const goalColor =
    goalProgress < 75 ? 'bg-green-500' : goalProgress < 90 ? 'bg-yellow-500' : 'bg-red-500';

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
  const remainingMonths =
    isCurrentYear && now.getFullYear() === selectedYear
      ? 12 - now.getMonth()
      : 0;
  const neededPerMonth =
    gciGoal > 0 && remainingMonths > 0 ? remainingGciToGoal / remainingMonths : 0;

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

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const yearOptions = years.map((year) => ({ value: year.toString(), label: year.toString() }));
  const timeframeDescription = `Jan 1 – Dec 31, ${selectedYear}${isCurrentYear ? ' · In progress' : ''}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

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
          <div className="flex items-center gap-3 text-left sm:text-right">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 min-h-[20px]">
              {refreshing ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-[var(--app-accent)] animate-pulse" />
                  Updating…
                </>
              ) : (
                <span className="invisible">Updating…</span>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                Timeframe
              </p>
              <p className="text-sm text-gray-500">{timeframeDescription}</p>
            </div>
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
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">Scope</p>
              <p className="text-sm text-gray-700">{scopeDescription}</p>
            </div>
          </div>
          {availableAgents.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Agents</p>
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
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isAllAgentsSelected && (
                      <button
                        type="button"
                        className="text-xs text-[var(--app-accent)]"
                        onClick={resetAgents}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <select
                  multiple
                  value={selectedAgentIds}
                  onChange={handleAgentSelectionChange}
                  className="hig-input min-h-[72px] rounded-2xl border-gray-200 bg-white/90 text-sm"
                >
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Pipeline Stage</p>
                  {selectedPipelineStages.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--app-accent)]"
                      onClick={() => setSelectedPipelineStages([])}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <select
                  multiple
                  value={selectedPipelineStages}
                  onChange={handlePipelineFilterChange}
                  className="hig-input min-h-[64px] mt-2"
                >
                  {availableStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Deal Type</p>
                  {selectedDealTypes.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--app-accent)]"
                      onClick={() => setSelectedDealTypes([])}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <select
                  multiple
                  value={selectedDealTypes}
                  onChange={handleDealTypeFilterChange}
                  className="hig-input min-h-[64px] mt-2"
                >
                  {availableDealTypes.map((dealType) => (
                    <option key={dealType} value={dealType}>
                      {DEAL_TYPE_LABELS[dealType] ?? dealType.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">Lead Source</p>
                  {selectedLeadSources.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--app-accent)]"
                      onClick={() => setSelectedLeadSources([])}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <select
                  multiple
                  value={selectedLeadSources}
                  onChange={handleLeadSourceFilterChange}
                  className="hig-input min-h-[64px] mt-2"
                >
                  {availableLeadSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">Monthly Ledger</h4>
              <span className="text-xs text-gray-500">
                Peak GCI: {peakMonthlyGci ? formatCurrency(peakMonthlyGci) : '—'} • Peak deals:{' '}
                {peakMonthlyDeals || '—'}
              </span>
            </div>
            <div className="overflow-x-auto">
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
                  <p className="text-sm text-gray-500">Pace needed</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(projectedGciAtCurrentPace)}
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
        </div>
      </section>

      <section className={`${surfaceClass} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Lead Source Performance</h3>
            <p className="text-xs text-gray-500 mt-1">
              Compare volume, conversion, and commissions by source.
            </p>
          </div>
        </div>
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
                    {stat.name}
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
      </section>

      <section className={`${surfaceClass} p-6`}>
        <h3 className="font-semibold text-gray-900 mb-2">Suggested Focus Areas</h3>
        <p className="text-xs text-gray-500 mb-4">
          Practical follow-ups informed by what the data is highlighting this year.
        </p>
        <ul className="space-y-3 text-sm text-gray-700">
          {gciGoal > 0 && remainingGciToGoal > 0 && (
            <li className="leading-relaxed">
              You need approximately{' '}
              <span className="font-semibold">
                {formatCurrency(remainingGciToGoal)}
              </span>{' '}
              more GCI to hit your annual goal.
              {neededPerMonth > 0 && (
                <>
                  {' '}
                  That&apos;s about{' '}
                  <span className="font-semibold">
                    {formatCurrency(neededPerMonth)} per month
                  </span>{' '}
                  for the rest of the year.
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
      </section>
    </div>
  );
}
