import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  TrendingUp, DollarSign, CheckCircle, Calendar, AlertCircle,
  Users, Sparkles, Target, Clock, Activity,
  ChevronRight, FileText, GripVertical, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  formatCurrency,
  formatPercent,
  getGreeting,
  getTodayFormatted,
  getDateRange,
  calculateGCI,
  isStalled,
  getDaysInStage,
  type DateRange
} from '../lib/dashboard-utils';
import { getColorValue } from '../lib/colors';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import type { Database } from '../lib/database.types';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { STATUS_LABELS } from '../constants/statusLabels';
import { getVisibleUserIds } from '../lib/rbac';

type DealRow = Database['public']['Tables']['deals']['Row'];
type LeadSourceRow = Database['public']['Tables']['lead_sources']['Row'];

interface DashboardStats {
  ytdGCI: number;
  ytdDeals: number;
  ytdVolume: number;
  avgCommission: number;
  closingThisMonth: number;
  conversionRate: number;
}

interface PipelineStatusSummary {
  id: string;
  name: string;
  color: string | null;
  count: number;
  expectedGCI: number;
  stalledCount: number;
}

type Deal = DealRow & {
  // loaded with lead_sources(*) only in lead-source performance query
  lead_sources?: LeadSourceRow | null;
};

interface MonthlyData {
  month: string;
  gci: number;
  deals: number;
}

interface LeadSourcePerformance {
  name: string;
  deals: number;
  gci: number;
}

interface DealTypeBreakdown {
  dealType: DealRow['deal_type'];
  count: number;
  gci: number;
  percentage: number;
  statusCounts: Record<DealRow['status'], number>;
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
  color?: string | null;
  sortOrder?: number | null;
}

// This file uses DB status values, not UI labels
const ACTIVE_CLOSING_STATUSES = ['under_contract', 'pending'] as const;
const NON_ACTIVE_STATUSES = ['closed', 'dead'] as const;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const DEAL_TYPE_LABELS: Record<DealRow['deal_type'], string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_and_seller: 'Buyer & Seller',
  renter: 'Renter',
  landlord: 'Landlord'
};

const INSIGHTS_REFRESH_MS = 30 * 60 * 1000;
const GREETING_CHECK_INTERVAL_MS = 60 * 1000;

const DEFAULT_WIDGETS = [
  'luma-insights',
  'pipeline-health',
  'alerts-actions',
  'monthly-momentum',
  'deal-type-mix',
  'lead-source',
  'upcoming-deals'
] as const;

const normalizeWidgetOrder = (order: string[]) => {
  const mapped = order.map((id) => (id === 'monthly-gci' ? 'monthly-momentum' : id));
  const unique = mapped.filter((id, index) => mapped.indexOf(id) === index);
  const allowedSet = new Set<string>(DEFAULT_WIDGETS);
  const filtered = unique.filter((id) => allowedSet.has(id));
  const missing = DEFAULT_WIDGETS.filter((id) => !filtered.includes(id));
  return [...filtered, ...missing];
};

interface ParsedDateParts {
  year: number;
  month: number;
  date: Date;
}

const parseDateValue = (value?: string | null): ParsedDateParts | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
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
    date: parsed
  };
};

const buildCloseDateFilter = (startISO: string, endISO: string) => {
  const startDateOnly = startISO.split('T')[0];
  const endDateOnly = endISO.split('T')[0];
  const clauses = [
    `and(close_date.gte.${startDateOnly},close_date.lte.${endDateOnly})`,
    `and(close_date.is.null,closed_at.gte.${startISO},closed_at.lte.${endISO})`
  ];
  return clauses.join(',');
};

const isDealClosedWithinRange = (deal: DealRow, start: Date, end: Date) => {
  const closedParts =
    parseDateValue(deal.close_date) ||
    parseDateValue(deal.closed_at);
  if (!closedParts) return false;
  const closedTime = closedParts.date.getTime();
  return closedTime >= start.getTime() && closedTime <= end.getTime();
};

interface SortableWidgetProps {
  id: string;
  children: React.ReactNode;
}

function SortableWidget({ id, children }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-white rounded-lg shadow-lg p-2"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { user, roleInfo } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    ytdGCI: 0,
    ytdDeals: 0,
    ytdVolume: 0,
    avgCommission: 0,
    closingThisMonth: 0,
    conversionRate: 0
  });
  const [pipelineHealth, setPipelineHealth] = useState<PipelineStatusSummary[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [leadSourceData, setLeadSourceData] = useState<LeadSourcePerformance[]>([]);
  const [upcomingDeals, setUpcomingDeals] = useState<Deal[]>([]);
  const [stalledDeals, setStalledDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [lockedAiInsights, setLockedAiInsights] = useState<string[] | null>(null);
  const [lockedGeneratedInsights, setLockedGeneratedInsights] = useState<string[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const insightsLockedRef = useRef(false);
  const [lastInsightsUpdatedAt, setLastInsightsUpdatedAt] = useState<number>(0);
  const [greetingText, setGreetingText] = useState<string>('');
  const greetingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [dealTypeStats, setDealTypeStats] = useState<DealTypeBreakdown[]>([]);
  const [widgetOrder, setWidgetOrder] = useState<string[]>([...DEFAULT_WIDGETS]);
  const [activeWidget, setActiveWidget] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [availableLeadSources, setAvailableLeadSources] = useState<{ id: string; name: string }[]>([]);
  const [availableStages, setAvailableStages] = useState<StageOption[]>([]);
  const [availableDealTypes, setAvailableDealTypes] = useState<DealRow['deal_type'][]>([]);
  const [selectedLeadSources, setSelectedLeadSources] = useState<string[]>([]);
  const [selectedPipelineStages, setSelectedPipelineStages] = useState<string[]>([]);
  const [selectedDealTypes, setSelectedDealTypes] = useState<DealRow['deal_type'][]>([]);
  const [dateRangePreset, setDateRangePreset] = useState<DateRange>('ytd');
  const range = useMemo(() => getDateRange(dateRangePreset), [dateRangePreset]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  const timeRangeOptions: { value: DateRange; label: string }[] = [
    { value: 'this_month', label: 'MTD' },
    { value: 'last_30_days', label: '30D' },
    { value: 'this_quarter', label: 'QTD' },
    { value: 'ytd', label: 'YTD' }
  ];

  useEffect(() => {
    if (!user) return;

    const bootstrapAgents = async () => {
      const fallback: AgentOption = {
        id: user.id,
        label: user.user_metadata?.name || user.email || 'You',
        email: user.email || ''
      };

      const resolveTeamUserIds = async () => {
        if (!roleInfo?.teamId) return [] as string[];
        const { data, error } = await supabase
          .from('user_teams')
          .select('user_id')
          .eq('team_id', roleInfo.teamId);
        if (error) {
          console.error('Unable to load team members', error);
          return [];
        }
        return (data || []).map(member => member.user_id);
      };

      const resolveVisibleAgentIds = async () => {
        if (!roleInfo) return [user.id];
        switch (roleInfo.globalRole) {
          case 'admin': {
            return await getVisibleUserIds(roleInfo);
          }
          case 'sales_manager': {
            const teamIds = await resolveTeamUserIds();
            if (teamIds.length) return teamIds;
            return await getVisibleUserIds(roleInfo);
          }
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
        const adminIds = new Set(rows.filter((row) => row.global_role === 'admin').map((row) => row.user_id));
        const normalized: AgentOption[] = rows
          .filter((agent) => agent.global_role !== 'admin')
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
        // remove admins from the selection list as well
        if (adminIds.size) {
          for (const id of adminIds) {
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
      const initialIds = agentIds.length ? agentIds : agentOptions.map(a => a.id);
      setSelectedAgentIds(initialIds.length ? initialIds : [user.id]);
    };

    bootstrapAgents();
  }, [user, roleInfo?.globalRole, roleInfo?.teamId]);

  // Derived metrics (memoized)
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
  const isFocusOnMeActive = showFocusOnMe && selectedAgentIds.length === 1 && selectedAgentIds[0] === user.id;
  const isAllAgentsSelected = selectedAgentIds.length > 0 && selectedAgentIds.length === availableAgents.length;
  const scopeDescription = useMemo(() => {
    const agentPart = (() => {
      if (!selectedAgentIds.length) return 'No agents selected';
      if (isAllAgentsSelected) return 'all agents';
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
    selectedPipelineStages
  ]);

  const selectMyData = () => {
    if (user) {
      setSelectedAgentIds([user.id]);
    }
  };

  const resetAgents = () => {
    if (availableAgents.length) {
      setSelectedAgentIds(availableAgents.map((agent) => agent.id));
    }
  };

  const handleAgentSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    if (values.length === 0) return;
    setSelectedAgentIds(values);
  };

  useEffect(() => {
    if (!availableDealTypes.length) return;
    setSelectedDealTypes((current) => current.filter((type) => availableDealTypes.includes(type)));
  }, [availableDealTypes]);

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
  const canShowFilterPanel = (roleInfo && roleInfo.globalRole !== 'agent') || availableAgents.length > 1;

  const totalActiveDeals = useMemo(
    () => pipelineHealth.reduce((sum, s) => sum + s.count, 0),
    [pipelineHealth]
  );

  const pipelineValue = useMemo(
    () => pipelineHealth.reduce((sum, s) => sum + s.expectedGCI, 0),
    [pipelineHealth]
  );

  const totalStalledCount = useMemo(
    () => pipelineHealth.reduce((sum, s) => sum + s.stalledCount, 0),
    [pipelineHealth]
  );

  const projectedGCI = useMemo(
    () => upcomingDeals.reduce((sum, deal) => sum + calculateGCI(deal), 0),
    [upcomingDeals]
  );

  useEffect(() => {
    if (!user || !agentScopeKey) return;
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, agentScopeKey, leadFilterKey, stageFilterKey, dealTypeFilterKey, dateRangePreset]);

  useEffect(() => {
    if (!user) return;
    loadWidgetLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedAgentIds.length) return;
    loadFilterContext(selectedAgentIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentIds]);

  useEffect(() => {
    if (loading) return;
    if (insightsLockedRef.current) return;
    loadAIInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lastInsightsUpdatedAt]);

  useEffect(() => {
    if (!user) return;

    const updateGreeting = () => {
      const now = Date.now();
      const isStale =
        lastInsightsUpdatedAt === 0 || now - lastInsightsUpdatedAt >= INSIGHTS_REFRESH_MS || !greetingText;
      if (isStale) {
        setGreetingText(getGreeting(user.user_metadata?.name));
        setLastInsightsUpdatedAt(now);
      }
    };

    updateGreeting();

    if (greetingTimerRef.current) {
      clearInterval(greetingTimerRef.current);
    }
    greetingTimerRef.current = setInterval(updateGreeting, GREETING_CHECK_INTERVAL_MS);

    return () => {
      if (greetingTimerRef.current) {
        clearInterval(greetingTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_metadata?.name]);

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
      const filteredStages = selectedPipelineStages.filter(Boolean);
      if (filteredStages.length) {
        query = query.in('pipeline_status_id', filteredStages);
      }
    }

    if (selectedDealTypes.length) {
      query = query.in('deal_type', selectedDealTypes);
    }

    return query;
  };

  const loadFilterContext = async (agentIds: string[]) => {
    if (!agentIds.length) return;

    let contextQuery = supabase
      .from('deals')
      .select(`
        id,
        user_id,
        deal_type,
        lead_source_id,
        lead_sources (id, name),
        pipeline_status_id,
        pipeline_statuses (id, name, color, sort_order)
      `)
      .order('created_at', { ascending: false })
      .limit(1000);

    contextQuery = withUserScope(contextQuery, agentIds);

    const { data, error } = await contextQuery;
    if (error) {
      console.error('Unable to load filter context', error);
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
          color: deal.pipeline_statuses.color,
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
      const labelA = DEAL_TYPE_LABELS[a] ?? a;
      const labelB = DEAL_TYPE_LABELS[b] ?? b;
      return labelA.localeCompare(labelB);
    });
    setAvailableDealTypes(sortedDealTypes.length ? sortedDealTypes : (Object.keys(DEAL_TYPE_LABELS) as DealRow['deal_type'][]));
  };

  const loadDashboardData = async () => {
    if (!user || !selectedAgentIds.length) return;

    const isInitialLoad = loading;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const startDate = range.start.toISOString();
    const endDate = range.end.toISOString();

    try {
      await Promise.all([
        loadStats(selectedAgentIds, startDate, endDate),
        loadPipelineHealth(selectedAgentIds),
        loadMonthlyTrends(selectedAgentIds),
        loadLeadSourcePerformance(selectedAgentIds, startDate, endDate),
        loadUpcomingDeals(selectedAgentIds),
        loadStalledDeals(selectedAgentIds)
      ]);
    } catch (err) {
      console.error('Error loading dashboard data', err);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  const loadAIInsights = async () => {
    if (insightsLockedRef.current) return;

    if (!user) return;

    setInsightsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/luma-insights`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stats,
          pipelineHealth: pipelineHealth.map(p => ({
            id: p.id,
            name: p.name,
            count: p.count,
            expectedGCI: p.expectedGCI,
            stalledCount: p.stalledCount
          })),
          leadSourceData,
          monthlyData,
          upcomingDealsCount: upcomingDeals.length,
          projectedGCI
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch AI insights:', errorText);
        return;
      }

      const data = await response.json();
      const insights = data.insights || [];
      setAiInsights(insights);
      if (!lockedAiInsights && insights.length) {
        setLockedAiInsights(insights);
        insightsLockedRef.current = true;
      }
    } catch (error) {
      console.error('Error loading AI insights:', error);
    } finally {
      setInsightsLoading(false);
    }
  };

  const loadStats = async (userIds: string[], startDate: string, endDate: string) => {
    // Closed deals for this range (based on closed_at) drive GCI and volume
    const closeDateFilter = buildCloseDateFilter(startDate, endDate);

    let closedQuery = supabase
      .from('deals')
      .select('*')
      .eq('status', 'closed')
      .or(closeDateFilter);
    closedQuery = applyDealFilters(closedQuery, userIds);

    const { data: closedDealsData, error: closedError } = await closedQuery;

    if (closedError) {
      console.error('loadStats closedDeals error', closedError);
    }

    // All deals created in this range used as "leads" for conversion rate
    let allDealsQuery = supabase
      .from('deals')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);
    allDealsQuery = applyDealFilters(allDealsQuery, userIds);

    const { data: allDeals, error: allDealsError } = await allDealsQuery;

    if (allDealsError) {
      console.error('loadStats allDeals error', allDealsError);
    }

    // "Closing this month" uses close_date + active closing statuses
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

    let closingQuery = supabase
      .from('deals')
      .select('id')
      .in('status', ACTIVE_CLOSING_STATUSES)
      .gte('close_date', startOfMonth)
      .lte('close_date', endOfMonth);
    closingQuery = applyDealFilters(closingQuery, userIds);

    const { data: closingThisMonth, error: ctError } = await closingQuery;

    if (ctError) {
      console.error('loadStats closingThisMonth error', ctError);
    }

    let totalVolume = 0;
    let totalGCI = 0;

    const filteredClosedDeals = (closedDealsData || []).filter((deal) =>
      isDealClosedWithinRange(deal, range.start, range.end)
    );

    filteredClosedDeals.forEach(deal => {
      const salePrice = deal.actual_sale_price || 0;
      totalVolume += salePrice;
      totalGCI += calculateGCI(deal);
    });

    const ytdDeals = filteredClosedDeals.length;
    const avgCommission = ytdDeals > 0 ? totalGCI / ytdDeals : 0;
    const totalLeads = allDeals?.length || 0;
    const conversionRate = totalLeads > 0 ? ytdDeals / totalLeads : 0;

    setStats({
      ytdGCI: totalGCI,
      ytdDeals,
      ytdVolume: totalVolume,
      avgCommission,
      closingThisMonth: closingThisMonth?.length || 0,
      conversionRate
    });
  };

  const loadPipelineHealth = async (userIds: string[]) => {
    let dealsQuery = supabase
      .from('deals')
      .select(`
        *,
        pipeline_statuses (id, name, color, sort_order),
        lead_sources (id, name)
      `)
      .not('status', 'in', `(${NON_ACTIVE_STATUSES.join(',')})`);

    dealsQuery = applyDealFilters(dealsQuery, userIds);

    const { data: deals, error: dealsError } = await dealsQuery;

    if (dealsError) {
      console.error('loadPipelineHealth deals error', dealsError);
      return;
    }

    if (!deals) {
      setPipelineHealth([]);
      setDealTypeStats([]);
      return;
    }

    type StageAccumulator = {
      id: string;
      name: string;
      color: string | null;
      sortOrder: number | null;
      count: number;
      expectedGCI: number;
      stalledCount: number;
    };

    const stageMap = new Map<string, StageAccumulator>();

    deals.forEach((deal) => {
      const stageId = deal.pipeline_statuses?.id || deal.pipeline_status_id || `status:${deal.status}`;
      const stageName = deal.pipeline_statuses?.name || STATUS_LABELS[deal.status] || deal.status;
      const stageColor = deal.pipeline_statuses?.color || null;
      const sortOrder = deal.pipeline_statuses?.sort_order ?? null;
      const existing = stageMap.get(stageId) || {
        id: stageId,
        name: stageName,
        color: stageColor,
        sortOrder,
        count: 0,
        expectedGCI: 0,
        stalledCount: 0
      };
      existing.count += 1;
      existing.expectedGCI += calculateGCI(deal);
      if (isStalled(deal.stage_entered_at, 30)) {
        existing.stalledCount += 1;
      }
      stageMap.set(stageId, existing);
    });

    const sortedStages = Array.from(stageMap.values()).sort((a, b) => {
      const orderA = a.sortOrder ?? 999;
      const orderB = b.sortOrder ?? 999;
      if (orderA === orderB) {
        return a.name.localeCompare(b.name);
      }
      return orderA - orderB;
    });

    const summary: PipelineStatusSummary[] = sortedStages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      count: stage.count,
      expectedGCI: stage.expectedGCI,
      stalledCount: stage.stalledCount
    }));

    setPipelineHealth(summary);

    const typeMap = new Map<
      DealRow['deal_type'],
      { count: number; gci: number; statusCounts: Record<DealRow['status'], number> }
    >();

    deals.forEach((deal) => {
      const existing = typeMap.get(deal.deal_type) ?? { count: 0, gci: 0, statusCounts: {} };
      existing.count += 1;
      existing.gci += calculateGCI(deal);
      const statusCount = existing.statusCounts[deal.status] || 0;
      existing.statusCounts[deal.status] = statusCount + 1;
      typeMap.set(deal.deal_type, existing);
    });

    const totalDeals = deals.length;
    const breakdown = Array.from(typeMap.entries())
      .map(([dealType, data]) => ({
        dealType,
        count: data.count,
        gci: data.gci,
        percentage: totalDeals > 0 ? data.count / totalDeals : 0,
        statusCounts: data.statusCounts
      }))
      .sort((a, b) => b.count - a.count);

    setDealTypeStats(breakdown);
  };

  const loadMonthlyTrends = async (userIds: string[]) => {
    const closeDateFilter = buildCloseDateFilter(range.start.toISOString(), range.end.toISOString());

    let dealsQuery = supabase
      .from('deals')
      .select('*')
      .eq('status', 'closed')
      .or(closeDateFilter);

    dealsQuery = applyDealFilters(dealsQuery, userIds);

    const { data: deals, error } = await dealsQuery;

    if (error) {
      console.error('loadMonthlyTrends error', error);
      return;
    }

    if (!deals) {
      setMonthlyData([]);
      return;
    }

    const buckets = MONTH_LABELS.map((month) => ({
      month,
      gci: 0,
      deals: 0
    }));

    (deals as DealRow[]).forEach((deal) => {
      const closedParts = parseDateValue(deal.close_date) || parseDateValue(deal.closed_at);
      if (!closedParts || closedParts.year !== currentYear) return;
      const monthIndex = closedParts.month;
      const bucket = buckets[monthIndex];
      bucket.gci += calculateGCI(deal);
      bucket.deals += 1;
    });

    setMonthlyData(
      buckets.map((bucket) => ({
        month: bucket.month,
        gci: Math.round(bucket.gci),
        deals: bucket.deals
      }))
    );
  };

  const loadLeadSourcePerformance = async (userIds: string[], startDate: string, endDate: string) => {
    const closeDateFilter = buildCloseDateFilter(startDate, endDate);

    let leadSourceQuery = supabase
      .from('deals')
      .select('*, lead_sources(*)')
      .eq('status', 'closed')
      .or(closeDateFilter);

    leadSourceQuery = applyDealFilters(leadSourceQuery, userIds);

    const { data, error } = await leadSourceQuery;

    if (error) {
      console.error('loadLeadSourcePerformance error', error);
      return;
    }

    if (!data) {
      setLeadSourceData([]);
      return;
    }

    const deals = (data as Deal[]).filter((deal) =>
      isDealClosedWithinRange(deal, range.start, range.end)
    );

    const sourceMap = new Map<string, { deals: number; gci: number }>();

    deals.forEach(deal => {
      const sourceName = deal.lead_sources?.name || 'Unknown';
      const current = sourceMap.get(sourceName) || { deals: 0, gci: 0 };
      current.deals += 1;
      current.gci += calculateGCI(deal);
      sourceMap.set(sourceName, current);
    });

    const result: LeadSourcePerformance[] = Array.from(sourceMap.entries())
      .map(([name, values]) => ({
        name,
        deals: values.deals,
        gci: Math.round(values.gci)
      }))
      .sort((a, b) => b.gci - a.gci)
      .slice(0, 5);

    setLeadSourceData(result);
  };

  const loadUpcomingDeals = async (userIds: string[]) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    let upcomingQuery = supabase
      .from('deals')
      .select('*')
      .in('status', ACTIVE_CLOSING_STATUSES)
      .gte('close_date', now.toISOString())
      .lte('close_date', thirtyDaysFromNow.toISOString())
      .order('close_date', { ascending: true })
      .limit(5);

    upcomingQuery = applyDealFilters(upcomingQuery, userIds);

    const { data, error } = await upcomingQuery;

    if (error) {
      console.error('loadUpcomingDeals error', error);
      setUpcomingDeals([]);
      return;
    }

    setUpcomingDeals((data || []) as Deal[]);
  };

  const loadStalledDeals = async (userIds: string[]) => {
    let stalledQuery = supabase
      .from('deals')
      .select('*')
      .neq('status', 'closed')
      .neq('status', 'dead')
      .order('stage_entered_at', { ascending: true });

    stalledQuery = applyDealFilters(stalledQuery, userIds);

    const { data, error } = await stalledQuery;

    if (error) {
      console.error('loadStalledDeals error', error);
      setStalledDeals([]);
      return;
    }

    const stalled = (data || []).filter(d => isStalled(d.stage_entered_at, 30)).slice(0, 5) as Deal[];
    setStalledDeals(stalled);
  };

  // Widget layout functions
  const loadWidgetLayout = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .select('widget_order')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading widget layout:', error);
        return;
      }

      if (data && data.widget_order) {
        setWidgetOrder(normalizeWidgetOrder(data.widget_order as string[]));
      } else {
        setWidgetOrder([...DEFAULT_WIDGETS]);
      }
    } catch (err) {
      console.error('Error loading widget layout:', err);
    }
  };

  const saveWidgetLayout = async (order: string[]) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('dashboard_layouts')
        .upsert({
          user_id: user.id,
          widget_order: order,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error saving widget layout:', error);
      }
    } catch (err) {
      console.error('Error saving widget layout:', err);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveWidget(null);
      return;
    }

    const oldIndex = widgetOrder.indexOf(active.id as string);
    const newIndex = widgetOrder.indexOf(over.id as string);

    const newOrder = [...widgetOrder];
    const [moved] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, moved);

    setWidgetOrder(newOrder);
    saveWidgetLayout(newOrder);
    setActiveWidget(null);
  };

  // Quick action handlers
  const handleAddClient = () => {
    window.location.href = '/pipeline';
  };

  const handleAddTask = () => {
    window.location.href = '/pipeline';
  };

  const handleOpenLuma = () => {
    window.location.href = '/luma';
  };

  const generateInsights = useMemo(() => {
    const insights: string[] = [];

    if (monthlyData.length >= 2) {
      const lastTwoMonths = monthlyData.slice(-2);
      if (lastTwoMonths.length === 2) {
        const [prevMonth, currentMonth] = lastTwoMonths;
        if (currentMonth.gci > prevMonth.gci) {
          const increase = ((currentMonth.gci - prevMonth.gci) / prevMonth.gci) * 100;
          insights.push(`You're on track to beat last month by ${increase.toFixed(0)}% in GCI.`);
        } else if (currentMonth.gci < prevMonth.gci && prevMonth.gci > 0) {
          const decrease = ((prevMonth.gci - currentMonth.gci) / prevMonth.gci) * 100;
          insights.push(`GCI is down ${decrease.toFixed(0)}% compared to last month.`);
        }
      }
    }

    const stalledByStatus = new Map<string, number>();
    pipelineHealth.forEach(status => {
      if (status.stalledCount > 0) {
        stalledByStatus.set(status.name, status.stalledCount);
      }
    });

    if (stalledByStatus.size > 0) {
      const topStalled = Array.from(stalledByStatus.entries())
        .sort((a, b) => b[1] - a[1])[0];
      insights.push(`${topStalled[1]} deal${topStalled[1] > 1 ? 's have' : ' has'} been stalled in '${topStalled[0]}' for 30+ days.`);
    }

    if (leadSourceData.length > 0) {
      const topSource = leadSourceData[0];
      insights.push(`${topSource.name} is your top performing lead source with ${formatCurrency(topSource.gci)} in closed deals.`);
    }

    if (stats.conversionRate > 0) {
      if (stats.conversionRate >= 0.3) {
        insights.push(`Strong ${formatPercent(stats.conversionRate)} conversion rate - keep up the momentum!`);
      } else if (stats.conversionRate < 0.15) {
        insights.push(`Conversion rate at ${formatPercent(stats.conversionRate)} - consider focusing on lead quality.`);
      }
    }

    if (upcomingDeals.length > 0 && projectedGCI > 0) {
      insights.push(`${upcomingDeals.length} deals projected to close soon with ${formatCurrency(projectedGCI)} potential GCI.`);
    }

    if (insights.length === 0) {
      insights.push('Keep adding deals to your pipeline to get personalized insights.');
    }

    return insights;
  }, [stats, pipelineHealth, leadSourceData, monthlyData, upcomingDeals, projectedGCI]);

  useEffect(() => {
    if (loading) return;
    const now = Date.now();
    const isStale =
      lastInsightsUpdatedAt === 0 || now - lastInsightsUpdatedAt >= INSIGHTS_REFRESH_MS;

    if (!isStale && lockedGeneratedInsights) return;

    setLockedGeneratedInsights(generateInsights);
    setLastInsightsUpdatedAt(now);
    setLockedAiInsights(null);
    insightsLockedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateInsights, loading, lastInsightsUpdatedAt]);

  // Widget render functions
  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'luma-insights':
        return renderLumaInsights();
      case 'pipeline-health':
        return renderPipelineHealth();
      case 'alerts-actions':
        return renderAlertsActions();
      case 'monthly-momentum':
        return renderMonthlyMomentum();
      case 'deal-type-mix':
        return renderDealTypeMix();
      case 'lead-source':
        return renderLeadSource();
      case 'upcoming-deals':
        return upcomingDeals.length > 0 ? renderUpcomingDeals() : null;
      default:
        return null;
    }
  };

  const renderLumaInsights = () => (
    <div className="hig-card p-6 bg-gradient-to-br from-blue-50 to-white border-blue-200/60">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-[rgb(0,122,255)] flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white" strokeWidth={2} />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="hig-text-heading">Luma Insights</h2>
            {insightsLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[rgb(0,122,255)]"></div>
            )}
          </div>
          {(lockedAiInsights || aiInsights).length > 0 ? (
            <div className="space-y-3">
              {(lockedAiInsights || aiInsights).slice(0, 3).map((insight, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[rgb(0,122,255)] mt-2 flex-shrink-0"></div>
                  <p className="text-[15px] text-gray-700 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(lockedGeneratedInsights || generateInsights).slice(0, 3).map((insight, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[rgb(0,122,255)] mt-2 flex-shrink-0"></div>
                  <p className="text-[15px] text-gray-700 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPipelineHealth = () => (
    <div className="hig-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="hig-text-heading">Pipeline Health</h2>
        <div className="text-right">
          <div className="text-2xl font-semibold text-gray-900">
            {totalActiveDeals}
          </div>
          <div className="text-xs text-gray-500">Active Deals</div>
        </div>
      </div>

      {pipelineHealth.length === 0 ? (
        <div className="text-sm text-gray-500">
          No active deals in your pipeline yet. Add a deal to see health metrics here.
        </div>
      ) : (
        <>
          <div className="mb-6 p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Pipeline Value</span>
              <span className="text-lg font-semibold text-[rgb(0,122,255)]">
                {formatCurrency(pipelineValue)}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {pipelineHealth.map(status => {
              if (status.count === 0) return null;
              const percentage = totalActiveDeals > 0 ? (status.count / totalActiveDeals) * 100 : 0;

              return (
                <div
                  key={status.id}
                  className="group p-4 rounded-xl border border-gray-200/60 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getColorValue(status.color) }}
                      />
                      <span className="font-medium text-gray-900">
                        {status.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {status.stalledCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-orange-50 rounded-full">
                          <Clock className="w-3.5 h-3.5 text-orange-600" strokeWidth={2} />
                          <span className="text-xs font-medium text-orange-700">
                            {status.stalledCount} stalled
                          </span>
                        </div>
                      )}
                      <span className="text-lg font-semibold text-gray-900">
                        {status.count}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-[rgb(0,122,255)] font-medium">
                      {formatCurrency(status.expectedGCI)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {percentage.toFixed(0)}% of pipeline
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalStalledCount > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200/60">
              <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 rounded-xl border border-orange-200/60">
                <AlertCircle className="w-4 h-4 text-orange-600" strokeWidth={2} />
                <span className="text-sm font-medium text-orange-700">
                  {totalStalledCount} deals need attention (30+ days)
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderAlertsActions = () => (
    <div className="hig-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="hig-text-heading">Alerts & Actions</h2>
      </div>

      {stalledDeals.length > 0 ? (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-orange-600 mb-3">
            <AlertCircle className="w-4 h-4" strokeWidth={2} />
            <span className="text-sm font-medium">Stalled Deals Requiring Attention</span>
          </div>
          <div className="space-y-2">
            {stalledDeals.slice(0, 3).map(deal => (
              <div
                key={deal.id}
                className="p-3 bg-orange-50 rounded-xl border border-orange-200/60 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 text-sm">
                      {deal.client_name}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {deal.property_address}
                    </div>
                  </div>
                  <div className="ml-3 px-2 py-1 bg-orange-100 rounded-lg">
                    <div className="text-xs text-orange-700 font-semibold">
                      {getDaysInStage(deal.stage_entered_at)}d
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200/60">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" strokeWidth={2} />
            <span className="text-sm text-green-700">All deals are moving smoothly!</span>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-gray-200/60">
        <div className="text-sm font-medium text-gray-700 mb-3">Quick Actions</div>
        <div className="grid grid-cols-2 gap-3">
          <button className="hig-btn-secondary py-3 text-sm flex items-center justify-center gap-2" onClick={handleAddClient}>
            <Users className="w-4 h-4" strokeWidth={2} />
            <span>New Client</span>
          </button>
          <button className="hig-btn-secondary py-3 text-sm flex items-center justify-center gap-2" onClick={handleAddTask}>
            <FileText className="w-4 h-4" strokeWidth={2} />
            <span>New Task</span>
          </button>
          <button className="hig-btn-primary py-3 text-sm flex items-center justify-center gap-2" onClick={handleOpenLuma}>
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            <span>Ask Luma</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderMonthlyMomentum = () => {
    const hasData = monthlyData.some((d) => d.gci > 0 || d.deals > 0);
    const productiveMonths = monthlyData.filter((d) => d.gci > 0 || d.deals > 0);
    const lastMonth = productiveMonths.length > 0 ? productiveMonths[productiveMonths.length - 1] : null;
    const prevMonth = productiveMonths.length >= 2 ? productiveMonths[productiveMonths.length - 2] : null;
    const change =
      lastMonth && prevMonth && prevMonth.gci > 0
        ? ((lastMonth.gci - prevMonth.gci) / prevMonth.gci) * 100
        : null;
    const bestMonth = productiveMonths.reduce<MonthlyData | null>(
      (best, current) => (current.gci > (best?.gci ?? 0) ? current : best),
      null
    );

    const trendValues = monthlyData.map((entry, idx, arr) => {
      const start = Math.max(0, idx - 2);
      const window = arr.slice(start, idx + 1);
      const sum = window.reduce((total, item) => total + item.gci, 0);
      return window.length ? sum / window.length : entry.gci;
    });

    const chartData = monthlyData.map((entry, idx) => ({
      ...entry,
      trend: trendValues[idx] ?? entry.gci
    }));

    return (
      <div className="hig-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="hig-text-heading">Monthly Momentum</h2>
            <p className="text-xs text-gray-500">
              Track production pace and deal count across recent months.
            </p>
          </div>
          {change !== null && (
            <div
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}
            >
              {change >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {change >= 0 ? '+' : ''}
              {change.toFixed(1)}% vs prev. month
            </div>
          )}
        </div>
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  formatter={(value: any) => formatCurrency(value)}
                  labelFormatter={(label) => `Month: ${label}`}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="gci"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0ea5e9' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="trend"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 flex flex-col items-center gap-2 text-xs text-gray-600">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-6 rounded-full bg-[#0ea5e9]"></span>
                  <span>Monthly GCI</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-6 rounded-full bg-[#ef4444]"></span>
                  <span>3-month trailing mean</span>
                </div>
              </div>
              {bestMonth && (
                <div className="text-[11px] uppercase tracking-wide text-gray-400">
                  Top month: {bestMonth.month} · {formatCurrency(bestMonth.gci)}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500">
            No closed deals yet in this period. Close your first deal to surface momentum insights.
          </div>
        )}
      </div>
    );
  };

  const renderDealTypeMix = () => (
    <div className="hig-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="hig-text-heading">Deal Type Mix</h2>
        <div className="text-xs text-gray-500">
          Share of active deals by type & status
        </div>
      </div>
      {dealTypeStats.length > 0 ? (
        <div className="space-y-4">
          {dealTypeStats.map((stat) => (
            <div key={stat.dealType} className="rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-gray-900">
                    {DEAL_TYPE_LABELS[stat.dealType]}
                  </p>
                  <p className="text-sm text-gray-500">
                    {stat.count} active {stat.count === 1 ? 'deal' : 'deals'}
                  </p>
                  <p className="text-sm text-gray-500">{formatCurrency(stat.gci)} expected GCI</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatPercent(stat.percentage)}
                  </p>
                  <p className="text-xs text-gray-500">of pipeline</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(stat.statusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                      {STATUS_LABELS[status as DealRow['status']] ?? status.replace(/_/g, ' ')}
                      <span className="text-gray-500">({count})</span>
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          No active deals in your pipeline. Add a deal to see the deal-type mix.
        </div>
      )}
    </div>
  );

  const renderLeadSource = () => (
    <div className="hig-card p-6">
      <h2 className="hig-text-heading mb-6">Lead Source Performance</h2>
      {leadSourceData.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={leadSourceData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              type="number"
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              width={100}
            />
            <Tooltip
              formatter={(value: any) => formatCurrency(value)}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Bar dataKey="gci" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-sm text-gray-500">
          No closed deals in this period, so lead source performance is not available yet.
        </div>
      )}
    </div>
  );

  const renderUpcomingDeals = () => (
    <div className="hig-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="hig-text-heading">Forecasted Closings (Next 30 Days)</h2>
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">
            {formatCurrency(projectedGCI)}
          </span>{' '}
          projected GCI
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {upcomingDeals.map(deal => (
          <div
            key={deal.id}
            className="p-4 border border-gray-200/60 rounded-xl hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
          >
            <div className="font-medium text-gray-900">{deal.client_name}</div>
            <div className="text-sm text-gray-600 mt-1">
              {deal.property_address}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm font-semibold text-[rgb(0,122,255)]">
                {formatCurrency(calculateGCI(deal))}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" strokeWidth={2} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[rgb(0,122,255)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_10px_40px_rgba(15,23,42,0.08)] p-6 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.25em]">
              {getTodayFormatted()}
            </p>
            <h1 className="text-3xl font-semibold text-gray-900 mt-1">
              {greetingText || getGreeting(user?.user_metadata?.name)}
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              {stats.closingThisMonth} deal{stats.closingThisMonth === 1 ? '' : 's'} closing soon ·{' '}
              {formatCurrency(projectedGCI)} projected GCI over the next 30 days.
            </p>
          </div>
          {refreshing && (
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 lg:ml-auto">
              <span className="h-2 w-2 rounded-full bg-[var(--app-accent)] animate-pulse" />
              Updating…
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-blue-100/70 bg-blue-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Pipeline Value</p>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{formatCurrency(pipelineValue)}</p>
            <p className="text-xs text-gray-600 mt-1">Active stages only</p>
          </div>
          <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Projected GCI</p>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{formatCurrency(projectedGCI)}</p>
            <p className="text-xs text-gray-600 mt-1">Next 30 days</p>
          </div>
          <div className="rounded-2xl border border-purple-100/70 bg-purple-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">Active Deals</p>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{totalActiveDeals}</p>
            <p className="text-xs text-gray-600 mt-1">Across pipeline</p>
          </div>
        </div>
      </div>
      {canShowFilterPanel && (
        <div className="rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_6px_30px_rgba(15,23,42,0.08)] p-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">Scope</p>
              <p className="text-sm text-gray-700">{scopeDescription}</p>
            </div>
            <SegmentedControl
              options={timeRangeOptions}
              value={dateRangePreset}
              onChange={(value) => setDateRangePreset(value as DateRange)}
            />
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
        </div>
      )}

      {/* KPI cards - not draggable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="hig-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-blue-50">
              <DollarSign className="w-5 h-5 text-[rgb(0,122,255)]" strokeWidth={2} />
            </div>
            <span className="text-sm text-gray-600">Total GCI</span>
          </div>
          <div className="text-3xl font-semibold text-gray-900">{formatCurrency(stats.ytdGCI)}</div>
        </div>

        <div className="hig-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-green-50">
              <CheckCircle className="w-5 h-5 text-green-600" strokeWidth={2} />
            </div>
            <span className="text-sm text-gray-600">Closed Deals</span>
          </div>
          <div className="text-3xl font-semibold text-gray-900">{stats.ytdDeals}</div>
        </div>

        <div className="hig-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-orange-50">
              <Calendar className="w-5 h-5 text-orange-600" strokeWidth={2} />
            </div>
            <span className="text-sm text-gray-600">Closing Soon</span>
          </div>
          <div className="text-3xl font-semibold text-gray-900">{stats.closingThisMonth}</div>
        </div>

        <div className="hig-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-gray-50">
              <Activity className="w-5 h-5 text-gray-600" strokeWidth={2} />
            </div>
            <span className="text-sm text-gray-600">Conv. Rate</span>
          </div>
          <div className="text-3xl font-semibold text-gray-900">{formatPercent(stats.conversionRate)}</div>
        </div>
      </div>

      {/* Draggable Widgets */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragStart={(event) => setActiveWidget(event.active.id as string)}
      >
        <SortableContext items={widgetOrder} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {widgetOrder.map((widgetId) => {
              const content = renderWidget(widgetId);
              if (!content) return null;

              return (
                <SortableWidget key={widgetId} id={widgetId}>
                  {content}
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

    </div>
  );
}
