import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateDashboardInsights } from '../lib/openai-insights';
import {
  TrendingUp, CheckCircle, Calendar, AlertCircle,
  Users, Sparkles, Target, Activity,
  ChevronRight, GripVertical, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  formatCurrency,
  formatPercent,
  getGreeting,
  getTodayFormatted,
  getDateRange,
  calculateActualGCI,
  calculateExpectedGCI,
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
import { ScopePanel } from '../components/ui/ScopePanel';
import { Skeleton } from '../components/ui/Skeleton';
import { Text } from '../ui/Text';
import { WidgetCard, WidgetHeader } from '../ui/Widget';
import { Card } from '../ui/Card';
import { MetricTile } from '../ui/MetricTile';
import { LastUpdatedStatus } from '../ui/LastUpdatedStatus';
import { PageShell } from '../ui/PageShell';
import { ui } from '../ui/tokens';
import { STATUS_LABELS } from '../constants/statusLabels';
import { getVisibleUserIds } from '../lib/rbac';
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';
import { useNavigate } from 'react-router-dom';

type DealRow = Database['public']['Tables']['deals']['Row'];
type LeadSourceRow = Database['public']['Tables']['lead_sources']['Row'];

interface DashboardStats {
  ytdGCI: number;
  ytdDeals: number;
  ytdVolume: number;
  avgCommission: number;
  closingNext7Days: number;
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
  pipeline_statuses?: {
    id: string;
    name: string;
    color: string | null;
    sort_order: number | null;
  } | null;
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

type AiInsightsState = {
  key: string;
  insights: string[];
  generatedAt: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
};

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

type DealQuery<T> = PostgrestFilterBuilder<Database['public'], T, T[]>;

type DashboardLayoutRow = Database['public']['Tables']['dashboard_layouts']['Row'];

// This file uses DB status values, not UI labels
const OPEN_STATUSES = ['new', 'in_progress'] as const;
const NON_ACTIVE_STATUSES = ['closed', 'dead'] as const;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const DEAL_TYPE_LABELS: Record<DealRow['deal_type'], string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_and_seller: 'Buyer & Seller',
  renter: 'Renter',
  landlord: 'Landlord'
};

const DEAL_BASE_COLUMNS = `
  id,
  user_id,
  status,
  created_at,
  close_date,
  closed_at,
  stage_entered_at,
  pipeline_status_id,
  deal_type,
  lead_source_id,
  expected_sale_price,
  actual_sale_price,
  gross_commission_rate,
  brokerage_split_rate,
  referral_out_rate,
  transaction_fee,
  client_name,
  property_address
`;

const DEAL_PIPELINE_COLUMNS = `
  ${DEAL_BASE_COLUMNS},
  pipeline_statuses (id, name, color, sort_order)
`;

const DEAL_LEAD_SOURCE_COLUMNS = `
  ${DEAL_BASE_COLUMNS},
  lead_sources (id, name)
`;

const OPEN_DEALS_SELECT = `
  ${DEAL_PIPELINE_COLUMNS}
`;

const CLOSED_DEALS_SELECT = `
  ${DEAL_LEAD_SOURCE_COLUMNS}
`;

const INSIGHTS_REFRESH_MS = 60 * 60 * 1000; // 1 hour
const AI_INSIGHTS_TTL_MS = 60 * 60 * 1000; // 1 hour
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

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toDateOnly = (iso: string) => iso.slice(0, 10);

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

const buildCloseTsFilter = (startISO: string, endISO: string) => {
  const startDateOnly = toDateOnly(startISO);
  const endDateOnly = toDateOnly(endISO);
  const clauses = [
    `and(close_date.not.is.null,close_date.gte.${startDateOnly},close_date.lte.${endDateOnly})`,
    `and(close_date.is.null,closed_at.not.is.null,closed_at.gte.${startISO},closed_at.lte.${endISO})`
  ];
  return clauses.join(',');
};

const getCloseDateTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = parseDateValue(value);
  if (!parsed) return null;

  const trimmed = value.trim();
  const isDateOnly = DATE_ONLY_REGEX.test(trimmed);

  if (isDateOnly) {
    return Date.UTC(parsed.year, parsed.month, parsed.date.getUTCDate(), 23, 59, 59, 999);
  }

  return parsed.date.getTime();
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
    position: 'relative' as const,
    height: 'fit-content' as const,
    minHeight: 0
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group h-fit min-h-0 self-start">
      <div
        {...attributes}
        {...listeners}
        className={[
          'absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-white',
          ui.radius.control,
          ui.shadow.card,
          ui.pad.cardTight
        ].join(' ')}
      >
        <GripVertical className={`w-4 h-4 ${ui.tone.faint}`} />
      </div>
      {children}
    </div>
  );
}

function RefreshOverlay({
  active,
  children,
  label = 'Updating…'
}: {
  active: boolean;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="relative">
      <div className={active ? 'opacity-70 transition-opacity duration-200' : 'opacity-100 transition-opacity duration-200'}>
        {children}
      </div>
      {active && (
        <div
          className={[
            'absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-start justify-end pointer-events-none',
            ui.radius.card,
            ui.pad.cardTight
          ].join(' ')}
        >
          <div
            className={[
              ui.radius.pill,
              ui.border.subtle,
              ui.shadow.card,
              ui.pad.cardTight,
              'bg-white/70'
            ].join(' ')}
          >
            <Text variant="micro" className={ui.tone.muted}>
              {label}
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}

function useStabilizedFlag(
  active: boolean,
  { delayMs = 0, minDurationMs = 300 }: { delayMs?: number; minDurationMs?: number } = {}
) {
  const [visible, setVisible] = useState(active);
  const shownAtRef = useRef<number | null>(active ? Date.now() : null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (hideRef.current) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }

    if (active) {
      if (delayMs === 0) {
        setVisible(true);
        shownAtRef.current = Date.now();
        return;
      }
      delayRef.current = setTimeout(() => {
        setVisible(true);
        shownAtRef.current = Date.now();
      }, delayMs);
      return;
    }

    if (!visible) return;
    const shownAt = shownAtRef.current ?? Date.now();
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(0, minDurationMs - elapsed);
    if (remaining === 0) {
      setVisible(false);
      shownAtRef.current = null;
      return;
    }
    hideRef.current = setTimeout(() => {
      setVisible(false);
      shownAtRef.current = null;
    }, remaining);
  }, [active, delayMs, minDurationMs, visible]);

  useEffect(() => () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
  }, []);

  return visible;
}

export default function Dashboard() {
  const { user, roleInfo } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats>({
    ytdGCI: 0,
    ytdDeals: 0,
    ytdVolume: 0,
    avgCommission: 0,
    closingNext7Days: 0,
    conversionRate: 0
  });
  const [pipelineHealth, setPipelineHealth] = useState<PipelineStatusSummary[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [leadSourceData, setLeadSourceData] = useState<LeadSourcePerformance[]>([]);
  const [upcomingDeals, setUpcomingDeals] = useState<Deal[]>([]);
  const [stalledDeals, setStalledDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(0);
  const [aiInsightsState, setAiInsightsState] = useState<AiInsightsState>({
    key: '',
    insights: [],
    generatedAt: 0,
    status: 'idle'
  });
  const [lastGreetingUpdatedAt, setLastGreetingUpdatedAt] = useState<number>(0);
  const [greetingText, setGreetingText] = useState<string>('');
  const greetingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const insightsReqRef = useRef(0);
  const [agentsReady, setAgentsReady] = useState(false);
  const showRefreshingOverlay = useStabilizedFlag(refreshing, { delayMs: 150, minDurationMs: 350 });
  const showInitialLoading = useStabilizedFlag(loading, { delayMs: 0, minDurationMs: 350 });
  const [dealTypeStats, setDealTypeStats] = useState<DealTypeBreakdown[]>([]);
  const [widgetOrder, setWidgetOrder] = useState<string[]>([...DEFAULT_WIDGETS]);
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [availableLeadSources, setAvailableLeadSources] = useState<{ id: string; name: string }[]>([]);
  const [availableStages, setAvailableStages] = useState<StageOption[]>([]);
  const [availableDealTypes, setAvailableDealTypes] = useState<DealRow['deal_type'][]>([]);
  const [selectedLeadSources, setSelectedLeadSources] = useState<string[]>([]);
  const [selectedPipelineStages, setSelectedPipelineStages] = useState<string[]>([]);
  const [selectedDealTypes, setSelectedDealTypes] = useState<DealRow['deal_type'][]>([]);
  const range = useMemo(() => getDateRange('ytd'), []);
  const stableJoin = (arr: string[]) => [...arr].filter(Boolean).sort().join('|');
  const resolvedAgentIds = useMemo(() => {
    if (!availableAgents.length) return [] as string[];
    return selectedAgentIds.length ? selectedAgentIds : availableAgents.map(a => a.id);
  }, [selectedAgentIds, availableAgents]);
  const queryState = useMemo(() => ({
    userId: user?.id ?? '',
    agentIds: resolvedAgentIds,
    dateRangePreset: 'ytd' as DateRange,
    startISO: range.start.toISOString(),
    endISO: range.end.toISOString(),
    leadSources: selectedLeadSources,
    pipelineStages: selectedPipelineStages,
    dealTypes: selectedDealTypes as string[]
  }), [
    user?.id,
    resolvedAgentIds,
    range.start,
    range.end,
    selectedLeadSources,
    selectedPipelineStages,
    selectedDealTypes
  ]);
  const queryKey = useMemo(() => ([
    queryState.userId,
    stableJoin(queryState.agentIds),
    queryState.dateRangePreset,
    `${queryState.startISO.slice(0, 10)}:${queryState.endISO.slice(0, 10)}`,
    stableJoin(queryState.leadSources),
    stableJoin(queryState.pipelineStages),
    stableJoin(queryState.dealTypes)
  ].join('::')), [queryState]);
  const scopeKey = useMemo(() => stableJoin(resolvedAgentIds), [resolvedAgentIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Agents query - cached to avoid refetching on every navigation
  const agentsQuery = useQuery({
    queryKey: ['dashboard', 'agents', user?.id, roleInfo?.globalRole, roleInfo?.teamId],
    queryFn: async () => {
      const fallback: AgentOption = {
        id: user!.id,
        label: user!.user_metadata?.name || user!.email || 'You',
        email: user!.email || ''
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
        return (data || []).map((member: { user_id: string }) => member.user_id);
      };

      const resolveVisibleAgentIds = async () => {
        if (!roleInfo) return [user!.id];
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
        return { agents: [fallback], selectedIds: [user!.id] };
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
        // remove excluded ids (admins/managers) from the selection list as well
        if (excludeIds.size) {
          for (const id of excludeIds) {
            const idx = agentIds.indexOf(id);
            if (idx !== -1) agentIds.splice(idx, 1);
          }
        }
      }

      const fallbackLabel = (id: string) =>
        id === user!.id
          ? (user!.user_metadata?.name || user!.email || 'You')
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

      return { agents: agentOptions, selectedIds: [] as string[] };
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Agent list is stable for 10 minutes
    gcTime: 30 * 60 * 1000, // Cache for 30 minutes
  });

  // Sync agents query to state
  useEffect(() => {
    if (agentsQuery.data) {
      setAvailableAgents(agentsQuery.data.agents);
      setSelectedAgentIds(agentsQuery.data.selectedIds);
      setAgentsReady(true);
    }
  }, [agentsQuery.data]);

  // Derived metrics (memoized)
  const showFocusOnMe = !!user && (roleInfo?.globalRole === 'team_lead' || roleInfo?.teamRole === 'team_lead');
  const isFocusOnMeActive = showFocusOnMe && selectedAgentIds.length === 1 && selectedAgentIds[0] === user.id;
  const isAllAgentsSelected =
    selectedAgentIds.length === 0 || selectedAgentIds.length === availableAgents.length;
  const insightsAudience = useMemo(() => {
    if (!user || !roleInfo) {
      return { label: 'you', mode: 'self' as const };
    }

    const isSelfView =
      roleInfo.globalRole === 'agent' ||
      (selectedAgentIds.length === 1 && selectedAgentIds[0] === user.id);
    if (isSelfView) {
      return { label: 'you', mode: 'self' as const };
    }

    const pool = isAllAgentsSelected ? availableAgents : availableAgents.filter((agent) => selectedAgentIds.includes(agent.id));
    const names = pool.map((agent) => agent.label || agent.email || 'Agent');

    if (names.length === 0) {
      return { label: 'the team', mode: 'group' as const };
    }
    if (names.length === 1) {
      return { label: names[0], mode: 'group' as const };
    }
    if (names.length === 2) {
      return { label: `${names[0]} and ${names[1]}`, mode: 'group' as const };
    }
    if (names.length === 3) {
      return { label: `${names[0]}, ${names[1]} and ${names[2]}`, mode: 'group' as const };
    }
    return { label: `the ${names.length} agents`, mode: 'group' as const };
  }, [availableAgents, isAllAgentsSelected, roleInfo, selectedAgentIds, user]);
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

  const clearAllFilters = () => {
    resetAgents();
    setSelectedPipelineStages([]);
    setSelectedLeadSources([]);
    setSelectedDealTypes([]);
  };

  useEffect(() => {
    if (!availableDealTypes.length) return;
    setSelectedDealTypes((current) => current.filter((type) => availableDealTypes.includes(type)));
  }, [availableDealTypes]);

  useEffect(() => {
    if (!availableLeadSources.length) return;
    const allowed = new Set(availableLeadSources.map((source) => source.id));
    setSelectedLeadSources((current) => current.filter((id) => allowed.has(id)));
  }, [availableLeadSources]);

  useEffect(() => {
    if (!availableStages.length) return;
    const allowed = new Set(availableStages.map((stage) => stage.id));
    setSelectedPipelineStages((current) => current.filter((id) => allowed.has(id)));
  }, [availableStages]);

  const agentOptions = useMemo(
    () =>
      availableAgents.map((agent) => ({
        value: agent.id,
        label: agent.label
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
  const canShowFilterPanel = true;

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

  const filteredUpcomingDeals = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfWindow = new Date(startOfToday);
    endOfWindow.setDate(endOfWindow.getDate() + 29);
    endOfWindow.setHours(23, 59, 59, 999);

    const windowStart = startOfToday.getTime();
    const windowEnd = endOfWindow.getTime();

    return upcomingDeals
      .map((deal) => {
        const closeTime = getCloseDateTimestamp(deal.close_date) ?? getCloseDateTimestamp(deal.closed_at);
        return closeTime === null ? null : { deal, closeTime };
      })
      .filter((entry): entry is { deal: Deal; closeTime: number } => {
        if (!entry) return false;
        return entry.closeTime >= windowStart && entry.closeTime <= windowEnd;
      })
      .sort((a, b) => a.closeTime - b.closeTime)
      .map(({ deal }) => deal);
  }, [upcomingDeals]);

  const projectedGCI = useMemo(
    () => filteredUpcomingDeals.reduce((sum, deal) => sum + calculateExpectedGCI(deal), 0),
    [filteredUpcomingDeals]
  );
  const formatLastUpdated = useCallback((timestamp: number) => {
    const elapsedMs = Date.now() - timestamp;
    if (elapsedMs < 60_000) return 'just now';
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, []);

  const insightsKey = useMemo(() => ([
    queryKey,
    stats.ytdGCI.toFixed(0),
    stats.ytdDeals,
    pipelineHealth.length,
    leadSourceData.length,
    monthlyData.length,
    projectedGCI.toFixed(0),
    upcomingDeals.length
  ].join('::')), [
    queryKey,
    stats.ytdGCI,
    stats.ytdDeals,
    pipelineHealth.length,
    leadSourceData.length,
    monthlyData.length,
    projectedGCI,
    upcomingDeals.length
  ]);

  useEffect(() => {
    if (!user) return;

    const updateGreeting = () => {
      const now = Date.now();
      const isStale =
        lastGreetingUpdatedAt === 0 || now - lastGreetingUpdatedAt >= INSIGHTS_REFRESH_MS || !greetingText;
      if (isStale) {
        setGreetingText(getGreeting(user.user_metadata?.name, roleInfo?.globalRole));
        setLastGreetingUpdatedAt(now);
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
  }, [user?.user_metadata?.name, roleInfo?.globalRole, lastGreetingUpdatedAt, greetingText]);

  const withUserScope = useCallback(<T,>(query: DealQuery<T>, userIds: string[]) => {
    if (!userIds.length) {
      return query;
    }

    if (userIds.length === 1) {
      return query.eq('user_id', userIds[0]);
    }

    return query.in('user_id', userIds);
  }, []);

  const applyDealFilters = useCallback(<T,>(
    query: DealQuery<T>,
    userIds: string[],
    filters: { leadSources: string[]; pipelineStages: string[]; dealTypes: DealRow['deal_type'][] }
  ) => {
    query = withUserScope(query, userIds);

    if (filters.leadSources.length) {
      query = query.in('lead_source_id', filters.leadSources);
    }

    if (filters.pipelineStages.length) {
      const filteredStages = filters.pipelineStages.filter(Boolean);
      if (filteredStages.length) {
        query = query.in('pipeline_status_id', filteredStages);
      }
    }

    if (filters.dealTypes.length) {
      query = query.in('deal_type', filters.dealTypes);
    }

    return query;
  }, [withUserScope]);

  const deriveStats = useCallback((
    closedDeals: Deal[],
    totalLeads: number,
    closingNext7Days: number
  ) => {
    let totalVolume = 0;
    let totalGCI = 0;

    closedDeals.forEach((deal) => {
      const salePrice = deal.actual_sale_price || 0;
      totalVolume += salePrice;
      totalGCI += calculateActualGCI(deal);
    });

    const ytdDeals = closedDeals.length;
    const avgCommission = ytdDeals > 0 ? totalGCI / ytdDeals : 0;
    const conversionRate = totalLeads > 0 ? ytdDeals / totalLeads : 0;

    setStats({
      ytdGCI: totalGCI,
      ytdDeals,
      ytdVolume: totalVolume,
      avgCommission,
      closingNext7Days,
      conversionRate
    });
  }, []);

  const deriveMonthlyData = useCallback((closedDeals: Deal[]) => {
    const buckets = MONTH_LABELS.map((month) => ({
      month,
      gci: 0,
      deals: 0
    }));

    closedDeals.forEach((deal) => {
      const closedParts = parseDateValue(deal.close_date) || parseDateValue(deal.closed_at);
      if (!closedParts) return;
      const bucket = buckets[closedParts.month];
      bucket.gci += calculateActualGCI(deal);
      bucket.deals += 1;
    });

    setMonthlyData(
      buckets.map((bucket) => ({
        month: bucket.month,
        gci: Math.round(bucket.gci),
        deals: bucket.deals
      }))
    );
  }, []);

  const deriveLeadSourceData = useCallback((closedDeals: Deal[]) => {
    const sourceMap = new Map<string, { deals: number; gci: number }>();

    closedDeals.forEach((deal) => {
      const sourceName = deal.lead_sources?.name || 'Unknown';
      const current = sourceMap.get(sourceName) || { deals: 0, gci: 0 };
      current.deals += 1;
      current.gci += calculateActualGCI(deal);
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
  }, []);

  const deriveUpcomingDeals = useCallback((activeDeals: Deal[]) => {
    const upcoming = activeDeals.filter((deal) => OPEN_STATUSES.includes(deal.status as typeof OPEN_STATUSES[number]));
    setUpcomingDeals(upcoming);
  }, []);

  const deriveStalledDeals = useCallback((activeDeals: Deal[]) => {
    const stalled = activeDeals.filter((deal) => isStalled(deal.stage_entered_at, 30)).slice(0, 5);
    setStalledDeals(stalled);
  }, []);

  const derivePipelineHealth = useCallback((activeDeals: Deal[]) => {
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

    activeDeals.forEach((deal) => {
      const stageId = deal.pipeline_statuses?.id || deal.pipeline_status_id || `status:${deal.status}`;
      const stageName =
        deal.pipeline_statuses?.name ||
        STATUS_LABELS[deal.status as keyof typeof STATUS_LABELS] ||
        deal.status;
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
      existing.expectedGCI += calculateExpectedGCI(deal);
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

    activeDeals.forEach((deal) => {
      const existing = typeMap.get(deal.deal_type) ?? {
        count: 0,
        gci: 0,
        statusCounts: {} as Record<DealRow['status'], number>
      };
      existing.count += 1;
      existing.gci += calculateExpectedGCI(deal);
      const statusCount = existing.statusCounts[deal.status] || 0;
      existing.statusCounts[deal.status] = statusCount + 1;
      typeMap.set(deal.deal_type, existing);
    });

    const totalDeals = activeDeals.length;
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
  }, []);

  const getClosingNext7DaysCount = useCallback((activeDeals: Deal[]) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfWindow = new Date(startOfToday);
    endOfWindow.setDate(endOfWindow.getDate() + 6);
    endOfWindow.setHours(23, 59, 59, 999);
    const startDateOnly = toDateOnly(startOfToday.toISOString());
    const endDateOnly = toDateOnly(endOfWindow.toISOString());

    return activeDeals.reduce((count, deal) => {
      if (!OPEN_STATUSES.includes(deal.status as typeof OPEN_STATUSES[number])) return count;
      const closeDateOnly = deal.close_date ? deal.close_date.slice(0, 10) : null;
      if (!closeDateOnly) return count;
      if (closeDateOnly >= startDateOnly && closeDateOnly <= endDateOnly) {
        return count + 1;
      }
      return count;
    }, 0);
  }, []);

  const loadAIInsights = useCallback(async () => {
    const reqId = ++insightsReqRef.current;
    if (!user) return;

    const statsPayload = {
      ...stats,
      // backward compatibility for downstream consumers expecting the old field name
      closingThisMonth: stats.closingNext7Days
    };

    setAiInsightsState((prev) => ({
      ...prev,
      key: queryKey,
      status: 'loading',
      error: undefined
    }));
    try {
      const insights = await generateDashboardInsights({
        stats: statsPayload,
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
        projectedGCI,
        audienceLabel: insightsAudience.label,
        audienceMode: insightsAudience.mode,
        filterSummary: scopeDescription
      });

      if (reqId !== insightsReqRef.current) return;
      setAiInsightsState({
        key: queryKey,
        insights: insights ?? [],
        generatedAt: Date.now(),
        status: 'ready'
      });
    } catch (error) {
      if (reqId !== insightsReqRef.current) return;
      setAiInsightsState({
        key: queryKey,
        insights: [],
        generatedAt: Date.now(),
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to load insights'
      });
    } finally {
      // no-op: loading state derived from aiInsightsState
    }
  }, [
    user,
    stats,
    pipelineHealth,
    leadSourceData,
    monthlyData,
    upcomingDeals.length,
    projectedGCI,
    queryKey,
    insightsAudience,
    scopeDescription
  ]);

  // React Query for cached filter context (pipeline stages, lead sources)
  // Load immediately when user is available - doesn't depend on agents
  const filterContextQuery = useQuery({
    queryKey: ['dashboard', 'filterContext', user?.id],
    queryFn: async () => {
      const [pipelineResponse, leadResponse] = await Promise.all([
        supabase
          .from('pipeline_statuses')
          .select('id, name, color, sort_order')
          .order('sort_order', { ascending: true }),
        supabase
          .from('lead_sources')
          .select('id, name')
          .order('name', { ascending: true })
      ]);

      if (pipelineResponse.error) {
        console.error('Unable to load pipeline statuses', pipelineResponse.error);
      }
      if (leadResponse.error) {
        console.error('Unable to load lead sources', leadResponse.error);
      }

      const stages = (pipelineResponse.data || []).map((stage) => ({
        id: stage.id,
        label: stage.name,
        color: stage.color,
        sortOrder: stage.sort_order
      }));

      const leadSources = (leadResponse.data || []).map((source) => ({
        id: source.id,
        name: source.name || 'Unknown'
      }));

      return { stages, leadSources };
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Filter context is stable for 10 minutes
    gcTime: 30 * 60 * 1000, // Cache for 30 minutes
  });

  // Sync filter context to state
  useEffect(() => {
    if (!filterContextQuery.data) return;
    const { stages, leadSources } = filterContextQuery.data;
    setAvailableStages(stages);
    setAvailableLeadSources(leadSources);
    setAvailableDealTypes(Object.keys(DEAL_TYPE_LABELS) as DealRow['deal_type'][]);
  }, [filterContextQuery.data]);

  // React Query for cached dashboard data fetching
  // This provides stale-while-revalidate behavior for instant page loads
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', queryKey],
    queryFn: async () => {
      const qs = queryState;
      if (!qs.userId || !qs.agentIds.length) return null;

      const ids = qs.agentIds;
      const startDate = qs.startISO;
      const endDate = qs.endISO;
      const closeDateFilter = buildCloseTsFilter(startDate, endDate);

      const dealFilters = {
        leadSources: qs.leadSources,
        pipelineStages: qs.pipelineStages,
        dealTypes: qs.dealTypes as DealRow['deal_type'][]
      };

      const [openResp, closedResp, leadsCountResp] = await Promise.all([
        applyDealFilters(
          supabase
            .from('deals')
            .select(OPEN_DEALS_SELECT)
            .not('status', 'in', `(${NON_ACTIVE_STATUSES.join(',')})`)
            .order('close_date', { ascending: true })
            .limit(2000),
          ids,
          dealFilters
        ),
        applyDealFilters(
          supabase
            .from('deals')
            .select(CLOSED_DEALS_SELECT)
            .eq('status', 'closed')
            .or(closeDateFilter),
          ids,
          dealFilters
        ),
        applyDealFilters(
          supabase
            .from('deals')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', startDate)
            .lte('created_at', endDate),
          ids,
          dealFilters
        )
      ]);

      if (openResp.error) console.error('open deals error', openResp.error);
      if (closedResp.error) console.error('closed deals error', closedResp.error);
      if (leadsCountResp.error) console.error('leads count error', leadsCountResp.error);

      return {
        activeDeals: (openResp.data ?? []) as Deal[],
        closedDeals: (closedResp.data ?? []) as Deal[],
        totalLeads: leadsCountResp.count ?? 0,
        timestamp: Date.now()
      };
    },
    enabled: !!user && agentsReady && resolvedAgentIds.length > 0,
    staleTime: 3 * 60 * 1000, // Data is fresh for 3 minutes
    gcTime: 15 * 60 * 1000, // Cache for 15 minutes
    refetchOnWindowFocus: false, // Don't refetch on every window focus
    refetchOnMount: 'always', // But do refetch when component mounts
  });

  // Process cached data when it changes
  useEffect(() => {
    if (!dashboardQuery.data) return;
    
    const { activeDeals, closedDeals, totalLeads, timestamp } = dashboardQuery.data;
    
    derivePipelineHealth(activeDeals);
    deriveMonthlyData(closedDeals);
    deriveLeadSourceData(closedDeals);
    deriveUpcomingDeals(activeDeals);
    deriveStalledDeals(activeDeals);
    const closingNext7Days = getClosingNext7DaysCount(activeDeals);
    deriveStats(closedDeals, totalLeads, closingNext7Days);
    setLastRefreshedAt(timestamp);
  }, [
    dashboardQuery.data,
    derivePipelineHealth,
    deriveMonthlyData,
    deriveLeadSourceData,
    deriveUpcomingDeals,
    deriveStalledDeals,
    getClosingNext7DaysCount,
    deriveStats
  ]);

  // Sync React Query loading states with existing state
  useEffect(() => {
    setLoading(dashboardQuery.isLoading);
  }, [dashboardQuery.isLoading]);

  useEffect(() => {
    setRefreshing(dashboardQuery.isFetching && !dashboardQuery.isLoading);
  }, [dashboardQuery.isFetching, dashboardQuery.isLoading]);

  useEffect(() => {
    if (loading) return;
    const now = Date.now();
    const isSameQuery = aiInsightsState.key === queryKey;
    const isFresh =
      isSameQuery && now - aiInsightsState.generatedAt < AI_INSIGHTS_TTL_MS;
    if (isFresh) return;
    if (aiInsightsState.status === 'loading') return;
    loadAIInsights();
  }, [loading, insightsKey, aiInsightsState, queryKey, loadAIInsights]);

  // Widget layout query - cached separately from dashboard data
  const widgetLayoutQuery = useQuery({
    queryKey: ['dashboard', 'widgetLayout', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_layouts')
        .select('widget_order')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading widget layout:', error);
        return [...DEFAULT_WIDGETS];
      }

      const layout = data as DashboardLayoutRow | null;
      if (layout?.widget_order) {
        return normalizeWidgetOrder(layout.widget_order as string[]);
      }
      return [...DEFAULT_WIDGETS];
    },
    enabled: !!user,
    staleTime: 30 * 60 * 1000, // Widget layout is very stable - 30 minutes
    gcTime: 60 * 60 * 1000, // Cache for 1 hour
  });

  // Sync widget layout to state
  useEffect(() => {
    if (widgetLayoutQuery.data) {
      setWidgetOrder(widgetLayoutQuery.data);
    }
  }, [widgetLayoutQuery.data]);

  const saveWidgetLayout = async (order: string[]) => {
    if (!user) return;

    try {
      const payload: Database['public']['Tables']['dashboard_layouts']['Insert'] = {
        user_id: user.id,
        widget_order: order,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('dashboard_layouts')
        .upsert(payload, {
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
      return;
    }

    const oldIndex = widgetOrder.indexOf(active.id as string);
    const newIndex = widgetOrder.indexOf(over.id as string);

    const newOrder = [...widgetOrder];
    const [moved] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, moved);

    setWidgetOrder(newOrder);
    saveWidgetLayout(newOrder);
  };

  // Quick action handlers
  const handleAddClient = () => {
    navigate('/pipeline');
  };

  const handleOpenLuma = () => {
    navigate('/luma');
  };

  const handlePipelineStatusClick = (status: PipelineStatusSummary) => {
    const serialize = (values: string[]) => values.join(',');
    const params = new URLSearchParams();
    params.set('view', 'table');
    params.set('statusId', status.id);
    params.set('statusName', status.name);
    if (selectedAgentIds.length) {
      params.set('agents', serialize(selectedAgentIds));
    }
    if (selectedLeadSources.length) {
      params.set('leadSources', serialize(selectedLeadSources));
    }
    if (selectedPipelineStages.length) {
      params.set('pipelineStages', serialize(selectedPipelineStages));
    }
    if (selectedDealTypes.length) {
      params.set('dealTypes', serialize(selectedDealTypes));
    }
    navigate(`/pipeline?${params.toString()}`);
  };

  const aiIsFresh = useMemo(() => {
    if (aiInsightsState.status !== 'ready') return false;
    if (aiInsightsState.key !== queryKey) return false;
    return (
      Date.now() - aiInsightsState.generatedAt < AI_INSIGHTS_TTL_MS &&
      aiInsightsState.insights.length > 0
    );
  }, [aiInsightsState, queryKey]);

  const isCurrentInsights = aiInsightsState.key === queryKey;
  const showInsightsSkeleton =
    aiInsightsState.status === 'idle' ||
    aiInsightsState.status === 'loading' ||
    !isCurrentInsights;
  const showInsightsError = aiInsightsState.status === 'error' && isCurrentInsights;
  const showInsightsList = aiIsFresh && isCurrentInsights;
  const showInsightsSpinner = aiInsightsState.status === 'loading' && !aiIsFresh;

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
    <WidgetCard
      className={[ui.border.card, 'bg-gradient-to-br from-blue-50 via-white to-sky-50'].join(' ')}
      style={{ borderColor: 'rgba(191,219,254,0.7)' }}
    >
      <div className="space-y-4">
        <WidgetHeader
          icon={<Sparkles className={`w-4 h-4 ${ui.tone.accent}`} strokeWidth={2} />}
          title="Luma Insights"
          subtitle="AI-generated highlights from your latest activity."
          rightSlot={
            showInsightsSpinner ? (
              <div
                className={['ml-auto animate-spin h-4 w-4', ui.radius.pill].join(' ')}
                style={{ borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'var(--app-accent)' }}
              />
            ) : null
          }
        />
        {showInsightsSkeleton ? (
          <div className="space-y-2">
            <div className={['h-4 w-5/6 bg-blue-100/70 animate-pulse', ui.radius.pill].join(' ')} />
            <div className={['h-4 w-4/5 bg-blue-100/70 animate-pulse', ui.radius.pill].join(' ')} />
            <div className={['h-4 w-3/4 bg-blue-100/70 animate-pulse', ui.radius.pill].join(' ')} />
          </div>
        ) : showInsightsError ? (
          <Text variant="muted">
            Luma insights are unavailable right now. Please try again in a moment.
          </Text>
        ) : showInsightsList ? (
          <div className="space-y-2">
            {aiInsightsState.insights.slice(0, 3).map((insight, index) => (
              <div key={index} className="flex items-start gap-2.5">
                <div className="w-4 flex justify-center">
                  <span
                    className={['block w-1.5 h-1.5 bg-[var(--app-accent)]', ui.radius.pill].join(' ')}
                    style={{ marginTop: '0.45em' }}
                  />
                </div>
                <Text variant="body" className="flex-1">
                  {insight}
                </Text>
              </div>
            ))}
          </div>
        ) : (
          <Text variant="muted">
            No Luma insights yet. Try adjusting filters or refreshing.
          </Text>
        )}
      </div>
    </WidgetCard>
  );

  const renderPipelineHealth = () => (
    <WidgetCard className={ui.pad.cardTight}>
      <div className="space-y-3">
        <WidgetHeader
          icon={<Target className={`w-4 h-4 ${ui.tone.accent}`} strokeWidth={2} />}
          title="Pipeline Distribution"
          rightSlot={
            <div className={ui.align.right}>
              <Text as="div" variant="h2">
                {totalActiveDeals}
              </Text>
              <Text as="div" variant="muted">
                Deals
              </Text>
            </div>
          }
        />

        {pipelineHealth.length === 0 ? (
          <Text variant="muted">No active deals in your pipeline yet.</Text>
        ) : (
          <>
            <div className="space-y-2">
              {pipelineHealth.map(status => {
                if (status.count === 0) return null;

                return (
                  <div
                    key={status.id}
                    className={[
                      ui.pad.cardTight,
                      ui.radius.control,
                      ui.border.subtle,
                      'transition-all cursor-pointer'
                    ].join(' ')}
                    role="button"
                    tabIndex={0}
                    onClick={() => handlePipelineStatusClick(status)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handlePipelineStatusClick(status);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={['w-2 h-2', ui.radius.pill].join(' ')}
                          style={{ backgroundColor: getColorValue(status.color) }}
                        />
                        <Text as="span" variant="body" className="font-medium">
                          {status.name}
                        </Text>
                      </div>
                      <Text as="span" variant="body" className="font-semibold">
                        {status.count} deals
                      </Text>
                    </div>
                    <div className="flex items-center justify-end">
                      <Text as="span" variant="muted">
                        {formatCurrency(status.expectedGCI)}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalStalledCount > 0 && (
              <div className="space-y-2">
                <div className="h-px bg-gray-200/60" />
                <div className={['flex items-center gap-2 bg-orange-50', ui.radius.control, ui.pad.cardTight].join(' ')}>
                  <AlertCircle className={`w-4 h-4 ${ui.tone.warning}`} strokeWidth={2} />
                  <Text as="span" variant="muted" className={ui.tone.warningStrong}>
                    {totalStalledCount} deals stalled 30+ days
                  </Text>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </WidgetCard>
  );

  const renderAlertsActions = () => (
    <div className="space-y-2">
      <WidgetCard className={ui.pad.cardTight}>
        <div className="space-y-3">
          <WidgetHeader
            icon={<AlertCircle className={`w-4 h-4 ${ui.tone.warning}`} strokeWidth={2} />}
            title="Alerts"
          />

          {stalledDeals.length > 0 ? (
            <div className="space-y-2">
              <Text variant="muted" className="font-medium">
                Stalled Deals
              </Text>
              <div className="space-y-2">
              {stalledDeals.slice(0, 3).map(deal => (
                <div
                  key={deal.id}
                  className={[
                    ui.pad.cardTight,
                    ui.radius.control,
                    'bg-orange-50 transition-all cursor-pointer'
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <Text as="div" variant="body" className="font-medium truncate">
                        {deal.client_name}
                      </Text>
                      <Text as="div" variant="muted" className="truncate">
                        {deal.property_address}
                      </Text>
                    </div>
                    <div className={[ui.radius.control, ui.pad.cardTight, 'bg-orange-100 flex-shrink-0'].join(' ')}>
                      <Text as="div" variant="body" className={`${ui.tone.warningStrong} font-semibold`}>
                        {getDaysInStage(deal.stage_entered_at)}d
                      </Text>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          ) : (
            <div className={[ui.pad.cardTight, ui.radius.control, 'bg-green-50'].join(' ')}>
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${ui.tone.success}`} strokeWidth={2} />
                <Text as="span" variant="muted" className={ui.tone.successStrong}>
                  All deals moving smoothly
                </Text>
              </div>
            </div>
          )}
        </div>
      </WidgetCard>

      <WidgetCard className={ui.pad.card}>
        <div className="space-y-4">
          <WidgetHeader
            icon={<Sparkles className="w-4 h-4" style={{ color: '#D4883A' }} strokeWidth={2} />}
            title="Quick Actions"
          />
          <div className="space-y-3">
            <button
              className="w-full py-3 px-4 rounded-lg border border-gray-200 flex items-center justify-center gap-2 transition-all"
              style={{ color: '#1e3a5f', backgroundColor: '#ffffff' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#D4883A';
                e.currentTarget.style.backgroundColor = 'rgba(212, 136, 58, 0.05)';
                e.currentTarget.style.color = '#D4883A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.color = '#1e3a5f';
              }}
              onClick={handleAddClient}
            >
              <Users className="w-4 h-4" strokeWidth={2} />
              <span className="font-medium text-[15px]" style={{ color: 'inherit' }}>
                New Client
              </span>
            </button>
            <button
              className="w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm"
              style={{ backgroundColor: '#1e3a5f', color: '#ffffff' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#D4883A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1e3a5f';
              }}
              onClick={handleOpenLuma}
            >
              <Sparkles className="w-4 h-4" strokeWidth={2} />
              <span className="font-medium text-[15px] text-white">
                Ask Luma
              </span>
            </button>
          </div>
        </div>
      </WidgetCard>
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
      <WidgetCard className={ui.pad.cardTight}>
        <div className="space-y-3">
        <WidgetHeader
          icon={<TrendingUp className={`w-4 h-4 ${ui.tone.success}`} strokeWidth={2} />}
          title="Monthly Momentum"
          rightSlot={
            change !== null ? (
              <div
                className={[
                  'flex items-center gap-1',
                  change >= 0 ? 'bg-emerald-50' : 'bg-rose-50',
                  ui.radius.control,
                  ui.pad.cardTight,
                  change >= 0 ? ui.tone.success : ui.tone.rose
                ].join(' ')}
              >
                {change >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                <Text as="span" variant="muted" className="font-semibold">
                  {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                </Text>
              </div>
            ) : null
          }
        />
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
                  formatter={(value: number) => formatCurrency(Number(value))}
                  labelFormatter={(label) => `Month: ${label}`}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="gci"
                  name="GCI"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0ea5e9' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="trend"
                  name="Trend"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 4"
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              <div className="h-px bg-gray-200/60" />
              <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className={['h-1 w-4 bg-[#0ea5e9]', ui.radius.pill].join(' ')} />
                <Text as="span" variant="muted">
                  Monthly GCI
                </Text>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={['h-1 w-4 bg-[#ef4444]', ui.radius.pill].join(' ')} />
                <Text as="span" variant="muted">
                  Trend
                </Text>
              </div>
              {bestMonth && (
                <Text as="span" variant="muted" className={ui.tone.faint}>
                  Best: {bestMonth.month}
                </Text>
              )}
            </div>
            </div>
          </>
        ) : (
          <Text variant="muted">No closed deals yet in this period.</Text>
        )}
        </div>
      </WidgetCard>
    );
  };

  const renderDealTypeMix = () => (
    <WidgetCard className={ui.pad.cardTight}>
      <div className="space-y-3">
        <WidgetHeader
          icon={<Activity className={`w-4 h-4 ${ui.tone.purple}`} strokeWidth={2} />}
          title="Deal Type Mix"
        />
        {dealTypeStats.length > 0 ? (
          <div className="space-y-2">
            {dealTypeStats.map((stat) => (
              <div
                key={stat.dealType}
                className={[
                  ui.pad.cardTight,
                  ui.radius.control,
                  ui.border.subtle,
                  'bg-gray-50/50 space-y-1'
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <Text as="span" variant="body" className="font-semibold">
                    {DEAL_TYPE_LABELS[stat.dealType]}
                  </Text>
                  <Text as="span" variant="body" className="font-semibold">
                    {formatPercent(stat.percentage)}
                  </Text>
                </div>
                <Text variant="muted">
                  {stat.count} {stat.count === 1 ? 'deal' : 'deals'} · {formatCurrency(stat.gci)}
                </Text>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stat.statusCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <Text
                        key={status}
                        as="span"
                        variant="muted"
                        className={[
                          'inline-flex items-center bg-white',
                          ui.radius.pill,
                          ui.pad.chip,
                          ui.tone.primary
                        ].join(' ')}
                      >
                        {STATUS_LABELS[status as DealRow['status']] ?? status.replace(/_/g, ' ')} ({count})
                      </Text>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Text variant="muted">No active deals in your pipeline.</Text>
        )}
      </div>
    </WidgetCard>
  );

  const renderLeadSource = () => (
    <WidgetCard className={ui.pad.cardTight}>
      <div className="space-y-3">
        <WidgetHeader
          icon={<Users className={`w-4 h-4 ${ui.tone.info}`} strokeWidth={2} />}
          title="Lead Source Performance"
        />
        {leadSourceData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={leadSourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                stroke="#6b7280"
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                stroke="#6b7280"
                width={100}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(Number(value))}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="gci" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Text variant="muted">No closed deals in this period.</Text>
        )}
      </div>
    </WidgetCard>
  );

  const renderUpcomingDeals = () => (
    <WidgetCard className={ui.pad.cardTight}>
      <div className="space-y-3">
        <WidgetHeader
          icon={<Calendar className={`w-4 h-4 ${ui.tone.infoStrong}`} strokeWidth={2} />}
          title="Forecasted Closings"
          rightSlot={
            <div className={ui.align.right}>
              <Text as="div" variant="body" className="font-semibold">
                {formatCurrency(projectedGCI)}
              </Text>
              <Text as="div" variant="muted">
                30-day
              </Text>
            </div>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredUpcomingDeals.map(deal => (
            <div
              key={deal.id}
              className={[
                ui.pad.cardTight,
                ui.radius.control,
                ui.border.subtle,
                'transition-all cursor-pointer space-y-2'
              ].join(' ')}
            >
              <Text as="div" variant="body" className="font-medium truncate">
                {deal.client_name}
              </Text>
              <Text as="div" variant="muted" className="truncate">
                {deal.property_address}
              </Text>
              <div className="flex items-center justify-between">
                <Text as="span" variant="body" className={`font-semibold ${ui.tone.accent}`}>
                  {formatCurrency(calculateExpectedGCI(deal))}
                </Text>
                <ChevronRight className={`w-4 h-4 ${ui.tone.faint}`} strokeWidth={2} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetCard>
  );

  const isInitialLoading = showInitialLoading;
  const headerTitle = isInitialLoading ? (
    <div className="space-y-2">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-72" />
    </div>
  ) : (
    <div className="space-y-2">
      <Text variant="micro" className={ui.tone.subtle}>
        {getTodayFormatted()}
      </Text>
      <Text as="h1" variant="h1">
        {greetingText || getGreeting(user?.user_metadata?.name)}
      </Text>
      <Text variant="muted">
        {stats.closingNext7Days} deal{stats.closingNext7Days === 1 ? '' : 's'} closing soon (next 7 days) ·{' '}
        {formatCurrency(projectedGCI)} projected GCI over the next 30 days.
      </Text>
    </div>
  );
  const headerActions = (refreshing || lastRefreshedAt > 0) && (
    <LastUpdatedStatus
      refreshing={refreshing}
      label={lastRefreshedAt > 0 ? `Last updated ${formatLastUpdated(lastRefreshedAt)}` : null}
    />
  );

  return (
    <PageShell title={headerTitle} actions={headerActions}>
      {isInitialLoading ? (
        <div className="space-y-4">
          <Text variant="micro" className={ui.tone.subtle}>PIPELINE (ACTIVE DEALS)</Text>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={`pipeline-kpi-skeleton-${index}`} padding="cardTight" className="bg-white/70">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </Card>
            ))}
          </div>
          <Text variant="micro" className={ui.tone.subtle}>PERFORMANCE (YTD RESULTS)</Text>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={`performance-kpi-skeleton-${index}`} padding="cardTight" className="bg-white/70">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-7 w-32" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <RefreshOverlay active={showRefreshingOverlay}>
          <div className="space-y-4">
            <Text variant="micro" className={ui.tone.subtle}>PIPELINE (ACTIVE DEALS)</Text>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricTile
                label="ACTIVE DEALS"
                value={totalActiveDeals}
                sublabel="Across pipeline"
                className="bg-purple-50/40"
              />
              <MetricTile
                label="PIPELINE VALUE"
                value={formatCurrency(pipelineValue)}
                sublabel="Active stages only"
                className="bg-blue-50/40"
              />
              <MetricTile
                label="CLOSING IN 7 DAYS"
                value={stats.closingNext7Days}
                sublabel="Active deals closing in 7 days"
                className="bg-blue-50/40"
              />
              <MetricTile
                label="PROJECTED GCI (30D)"
                value={formatCurrency(projectedGCI)}
                sublabel="Next 30 days"
                className="bg-emerald-50/40"
              />
            </div>

            <Text variant="micro" className={ui.tone.subtle}>PERFORMANCE (YTD RESULTS)</Text>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricTile
                label="TOTAL GCI"
                value={formatCurrency(stats.ytdGCI)}
                title="Gross commission income from closed deals in the selected date range."
              />
              <MetricTile
                label="CLOSED DEALS"
                value={stats.ytdDeals}
                title="Number of deals marked closed within the selected date range."
              />
              <MetricTile
                label="CONVERSION RATE"
                value={formatPercent(stats.conversionRate)}
                title="Closed deals divided by all deals created in the selected date range."
              />
            </div>
            <div className="h-px bg-gray-200/60" />
          </div>
        </RefreshOverlay>
      )}
      {canShowFilterPanel && (
        <ScopePanel
          scopeDescription={scopeDescription}
          availableAgents={availableAgents}
          availableStages={availableStages}
          availableDealTypes={availableDealTypes}
          availableLeadSources={availableLeadSources}
          agentOptions={agentOptions}
          stageOptions={stageOptions}
          dealTypeOptions={dealTypeOptions}
          leadSourceOptions={leadSourceOptions}
          selectedAgentIds={selectedAgentIds}
          selectedPipelineStages={selectedPipelineStages}
          selectedDealTypes={selectedDealTypes}
          selectedLeadSources={selectedLeadSources}
          onChangeAgents={setSelectedAgentIds}
          onChangePipelineStages={setSelectedPipelineStages}
          onChangeDealTypes={(next) => setSelectedDealTypes(next as DealRow['deal_type'][])}
          onChangeLeadSources={setSelectedLeadSources}
          activeFilterChips={activeFilterChips}
          showFocusOnMe={showFocusOnMe}
          isFocusOnMeActive={isFocusOnMeActive}
          onSelectMyData={selectMyData}
          onClearAllFilters={clearAllFilters}
          showAgentFilter={roleInfo?.globalRole !== 'agent'}
        />
      )}

      {/* Draggable Widgets */}
      <RefreshOverlay active={showRefreshingOverlay} label="Refreshing widgets…">
        {isInitialLoading ? (
          <div className="columns-1 lg:columns-2 gap-2 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`widget-skeleton-${index}`} className="break-inside-avoid">
                <Card padding="cardTight" className="space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-36 w-full" />
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
              <div className="columns-1 lg:columns-2 gap-2 space-y-2">
                {widgetOrder.map((widgetId) => {
                  const content = renderWidget(widgetId);
                  if (!content) return null;

                  return (
                    <div key={widgetId} className="break-inside-avoid">
                      <SortableWidget id={widgetId}>
                        {content}
                      </SortableWidget>
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </RefreshOverlay>
    </PageShell>
  );
}
