import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Plus, LayoutGrid, List, Settings } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PipelineColumn from '../components/PipelineColumn';
import PipelineTable from '../components/PipelineTable';
import DealCard from '../components/DealCard';
import DealModal from '../components/DealModal';
import TemplateSelectionModal from '../components/TemplateSelectionModal';
import { ScopePanel } from '../components/ui/ScopePanel';
import { Skeleton } from '../components/ui/Skeleton';
import { Card } from '../ui/Card';
import { MetricTile } from '../ui/MetricTile';
import { PageShell } from '../ui/PageShell';
import { PageHeader } from '../ui/PageHeader';
import { LastUpdatedStatus } from '../ui/LastUpdatedStatus';
import { Text } from '../ui/Text';
import { ui } from '../ui/tokens';
import { usePipelineStatuses } from '../hooks/usePipelineStatuses';
import { getVisibleUserIds } from '../lib/rbac';
import { calculateActualGCI, calculateExpectedGCI } from '../lib/commission';
import type { Database } from '../lib/database.types';

type Deal = Database['public']['Tables']['deals']['Row'] & {
  lead_sources?: Database['public']['Tables']['lead_sources']['Row'] | null;
  pipeline_statuses?: Database['public']['Tables']['pipeline_statuses']['Row'] | null;
};
type DealUpdate = Database['public']['Tables']['deals']['Update'];

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];
type AccessibleAgentRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  global_role?: string | null;
};

type ViewMode = 'kanban' | 'table';

type DealFilters = {
  agentIds: string[];
  leadSourceIds: string[];
  stageIds: string[];
  dealTypes: Deal['deal_type'][];
  statusStageId: string | null;
  source: 'dashboard' | 'ui' | 'mixed';
};
const DEAL_LIST_COLUMNS = `
  id,
  user_id,
  status,
  deal_type,
  created_at,
  updated_at,
  stage_entered_at,
  pipeline_status_id,
  lead_source_id,
  close_date,
  closed_at,
  client_name,
  client_phone,
  client_email,
  property_address,
  city,
  state,
  zip,
  expected_sale_price,
  actual_sale_price,
  gross_commission_rate,
  brokerage_split_rate,
  referral_out_rate,
  referral_in_rate,
  transaction_fee,
  next_task_description,
  next_task_due_date,
  archived_reason
`;
const PIPELINE_STATUS_COLUMNS = `
  pipeline_statuses (
    id,
    name,
    color,
    sort_order,
    lifecycle_stage
  )
`;
const LEAD_SOURCE_COLUMNS = `
  lead_sources (
    id,
    name
  )
`;
const DEALS_SELECT = `
  ${DEAL_LIST_COLUMNS},
  ${PIPELINE_STATUS_COLUMNS},
  ${LEAD_SOURCE_COLUMNS}
`;
const DEAL_TYPE_FILTER_META: Record<
  Deal['deal_type'],
  { label: string; matches: Deal['deal_type'][] }
> = {
  buyer: {
    label: 'Buyer',
    matches: ['buyer', 'buyer_and_seller']
  },
  seller: {
    label: 'Seller',
    matches: ['seller', 'buyer_and_seller']
  },
  buyer_and_seller: {
    label: 'Buyer & Seller',
    matches: ['buyer_and_seller']
  },
  renter: {
    label: 'Renter',
    matches: ['renter']
  },
  landlord: {
    label: 'Landlord',
    matches: ['landlord']
  }
};
const DEAL_TYPE_OPTIONS = Object.keys(DEAL_TYPE_FILTER_META) as Deal['deal_type'][];

const buildOrderByStatus = (
  deals: Deal[],
  statusIds: string[],
  prev?: Record<string, string[]>
) => {
  const byStatus = new Map<string, string[]>();
  deals.forEach(deal => {
    if (!deal.pipeline_status_id) return;
    const list = byStatus.get(deal.pipeline_status_id) ?? [];
    list.push(deal.id);
    byStatus.set(deal.pipeline_status_id, list);
  });

  return statusIds.reduce<Record<string, string[]>>((acc, statusId) => {
    const existing = prev?.[statusId] ?? [];
    const currentIds = new Set(byStatus.get(statusId) ?? []);
    const nextList = existing.filter(id => currentIds.has(id));
    const missing = (byStatus.get(statusId) ?? []).filter(id => !nextList.includes(id));
    acc[statusId] = [...nextList, ...missing];
    return acc;
  }, {});
};

export default function Pipeline() {
  const { user, roleInfo } = useAuth();
  const { statuses, loading: statusesLoading, applyTemplate, createCustomWorkflow } = usePipelineStatuses();
  const [kanbanDeals, setKanbanDeals] = useState<Deal[]>([]);
  const [tableRows, setTableRows] = useState<Deal[]>([]);
  const [summaryDeals, setSummaryDeals] = useState<Deal[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [kanbanLoading, setKanbanLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [orderByStatus, setOrderByStatus] = useState<Record<string, string[]>>({});
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dashboardAgentFilters, setDashboardAgentFilters] = useState<string[]>([]);
  const [dashboardLeadSourceFilters, setDashboardLeadSourceFilters] = useState<string[]>([]);
  const [dashboardStageFilters, setDashboardStageFilters] = useState<string[]>([]);
  const [dashboardDealTypeFilters, setDashboardDealTypeFilters] = useState<Deal['deal_type'][]>([]);
  const [availableAgents, setAvailableAgents] = useState<{ id: string; label: string }[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [availableLeadSources, setAvailableLeadSources] = useState<{ id: string; name: string }[]>([]);
  const [selectedLeadSourceIds, setSelectedLeadSourceIds] = useState<string[]>([]);
  const [availableStageFilters, setAvailableStageFilters] = useState<{ id: string; name: string }[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [availableDealTypeFilters, setAvailableDealTypeFilters] = useState<Deal['deal_type'][]>([]);
  const [selectedDealTypeIds, setSelectedDealTypeIds] = useState<Deal['deal_type'][]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const tableLoadRequestIdRef = useRef(0);
  const kanbanLoadRequestIdRef = useRef(0);
  const hasLoadedKanbanRef = useRef(false);
  const hasLoadedTableRef = useRef(false);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);
  const [tableSearch, setTableSearch] = useState('');
  const [tableSortConfig, setTableSortConfig] = useState<{
    column: 'pipelineOrder' | 'client' | 'clientEmail' | 'clientPhone' | 'property' | 'city' | 'state' | 'zip' | 'dealType' | 'pipelineStatus' | 'status' | 'leadSource' | 'expectedPrice' | 'actualPrice' | 'netCommission' | 'grossCommissionRate' | 'brokerageSplitRate' | 'referralOutRate' | 'referralInRate' | 'transactionFee' | 'daysInStage' | 'stageEnteredAt' | 'closeDate' | 'closedAt' | 'nextTaskDescription' | 'nextTaskDueDate' | 'createdAt' | 'updatedAt';
    direction: 'asc' | 'desc';
  }>({
    column: 'pipelineOrder',
    direction: 'asc'
  });
  const pendingNewDeal = searchParams.get('newDeal');
  const isSalesManager = roleInfo?.globalRole === 'sales_manager';
  const formatAgentLabel = (agent: AccessibleAgentRow) =>
    agent.display_name || agent.email || `Agent ${agent.user_id.slice(0, 8)}`;
  const combinedStatuses = useMemo(() => {
    const statusMap = new Map<string, PipelineStatus>();

    statuses.forEach(status => {
      statusMap.set(status.id, status);
    });

    const statusDeals = [...kanbanDeals, ...tableRows];
    statusDeals.forEach(deal => {
      if (deal.pipeline_statuses && !statusMap.has(deal.pipeline_statuses.id)) {
        statusMap.set(deal.pipeline_statuses.id, deal.pipeline_statuses as PipelineStatus);
      }
    });

    return Array.from(statusMap.values()).sort((a, b) => {
      const orderA = a.sort_order ?? 999;
      const orderB = b.sort_order ?? 999;
      if (orderA === orderB) {
        return a.name.localeCompare(b.name);
      }
      return orderA - orderB;
    });
  }, [statuses, kanbanDeals, tableRows]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    const loadAgents = async () => {
      if (!user || !roleInfo) return;
      try {
        const visibleIds = await getVisibleUserIds(roleInfo);
        const { data, error } = await supabase.rpc('get_accessible_agents');
        if (error) {
          console.error('Error loading agents', error);
          setAvailableAgents(
            visibleIds.map(id => ({
              id,
              label: id === user.id
                ? (user.user_metadata?.name || user.email || 'You')
                : `Agent ${id.slice(0, 8)}`
            }))
          );
          return;
        }
        const rows = (data || []) as AccessibleAgentRow[];
        const options = rows
          .filter(agent => visibleIds.includes(agent.user_id))
          .filter(agent => agent.global_role !== 'admin' && agent.global_role !== 'sales_manager')
          .map(agent => ({
            id: agent.user_id,
            label: agent.user_id === user.id
              ? (user.user_metadata?.name || user.email || 'You')
              : formatAgentLabel(agent)
          }));
        const deduped = options.filter(
          (opt, idx, arr) => arr.findIndex(candidate => candidate.id === opt.id) === idx
        );
        if (deduped.length) {
          setAvailableAgents(deduped);
        } else {
          setAvailableAgents(
            visibleIds.map(id => ({
              id,
              label: id === user.id
                ? (user.user_metadata?.name || user.email || 'You')
                : `Agent ${id.slice(0, 8)}`
            }))
          );
        }
      } catch (err) {
        console.error('Error loading agents', err);
      }
    };
    loadAgents();
  }, [user, roleInfo]);

  useEffect(() => {
    const statusParam = searchParams.get('statusId');
    const viewParam = searchParams.get('view');

    if (statusParam) {
      setStatusFilter(statusParam);
      setViewMode('table');
    } else {
      setStatusFilter('all');
    }

    if (viewParam === 'table' && !statusParam) {
      setViewMode('table');
    }

    const parseListParam = (value: string | null) =>
      value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];

    setDashboardAgentFilters(parseListParam(searchParams.get('agents')));
    setDashboardLeadSourceFilters(parseListParam(searchParams.get('leadSources')));
    setDashboardStageFilters(parseListParam(searchParams.get('pipelineStages')));

    const dealTypes = parseListParam(searchParams.get('dealTypes')) as Deal['deal_type'][];
    setDashboardDealTypeFilters(dealTypes);
  }, [searchParams]);

  useEffect(() => {
    if (pendingNewDeal) {
      setSelectedDeal(null);
      setShowModal(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('newDeal');
      setSearchParams(nextParams, { replace: true });
    }
  }, [pendingNewDeal, searchParams, setSearchParams]);

  useEffect(() => {
    if (!combinedStatuses.length) {
      setAvailableStageFilters([]);
      return;
    }
    setAvailableStageFilters(
      combinedStatuses.map(status => ({
        id: status.id,
        name: status.name
      }))
    );
  }, [combinedStatuses]);

  useEffect(() => {
    if (!combinedStatuses.length) return;
    const statusIds = combinedStatuses.map(status => status.id);
    setOrderByStatus(prev => buildOrderByStatus(kanbanDeals, statusIds, prev));
  }, [combinedStatuses, kanbanDeals]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  const openDealById = useCallback(
    async (dealId: string) => {
      const existing = kanbanDeals.find((d) => d.id === dealId) || tableRows.find((d) => d.id === dealId);
      if (existing) {
        setSelectedDeal(existing);
        setShowModal(true);
        return;
      }

      const { data, error } = await supabase
        .from('deals')
        .select(DEALS_SELECT)
        .eq('id', dealId)
        .maybeSingle();

      if (!error && data) {
        setSelectedDeal(data as Deal);
        setShowModal(true);
      }
    },
    [kanbanDeals, tableRows]
  );

  useEffect(() => {
    const dealId = searchParams.get('dealId');
    if (dealId) {
      openDealById(dealId);
    }
  }, [searchParams, kanbanDeals, tableRows, openDealById]);

  useEffect(() => {
    // Show template selection if user has no statuses
    if (!statusesLoading && combinedStatuses.length === 0) {
      setShowTemplateModal(true);
    }
  }, [statusesLoading, combinedStatuses]);

  const dashboardFilters = useMemo(
    () => ({
      agentIds: dashboardAgentFilters,
      leadSourceIds: dashboardLeadSourceFilters,
      stageIds: dashboardStageFilters,
      dealTypes: dashboardDealTypeFilters
    }),
    [dashboardAgentFilters, dashboardDealTypeFilters, dashboardLeadSourceFilters, dashboardStageFilters]
  );
  const uiFilters = useMemo(
    () => ({
      agentIds: selectedAgentIds,
      leadSourceIds: selectedLeadSourceIds,
      stageIds: selectedStageIds,
      dealTypes: selectedDealTypeIds
    }),
    [selectedAgentIds, selectedDealTypeIds, selectedLeadSourceIds, selectedStageIds]
  );
  const hasDashboardFilters =
    dashboardAgentFilters.length > 0 ||
    dashboardLeadSourceFilters.length > 0 ||
    dashboardDealTypeFilters.length > 0 ||
    dashboardStageFilters.length > 0;
  const dashboardFiltersActive = hasDashboardFilters && viewMode === 'table';
  const effectiveFilters = useMemo<DealFilters>(() => {
    const pick = <T,>(dashboardList: T[], uiList: T[]) => (dashboardList.length > 0 ? dashboardList : uiList);
    const activeDashboard = dashboardFiltersActive
      ? dashboardFilters
      : { agentIds: [], leadSourceIds: [], stageIds: [], dealTypes: [] };

    const agentIds = pick(activeDashboard.agentIds, uiFilters.agentIds);
    const leadSourceIds = pick(activeDashboard.leadSourceIds, uiFilters.leadSourceIds);
    const stageIds = pick(activeDashboard.stageIds, uiFilters.stageIds);
    const dealTypes = pick(activeDashboard.dealTypes, uiFilters.dealTypes);

    const anyDashboard =
      activeDashboard.agentIds.length ||
      activeDashboard.leadSourceIds.length ||
      activeDashboard.stageIds.length ||
      activeDashboard.dealTypes.length;
    const anyUi =
      uiFilters.agentIds.length ||
      uiFilters.leadSourceIds.length ||
      uiFilters.stageIds.length ||
      uiFilters.dealTypes.length;

    const source: DealFilters['source'] = anyDashboard && anyUi ? 'mixed' : anyDashboard ? 'dashboard' : 'ui';

    return {
      agentIds,
      leadSourceIds,
      stageIds,
      dealTypes,
      statusStageId: viewMode === 'table' && statusFilter !== 'all' ? statusFilter : null,
      source
    };
  }, [dashboardFilters, dashboardFiltersActive, statusFilter, uiFilters, viewMode]);

  const resolveVisibleUserIds = useCallback(async () => {
    if (!user || !roleInfo) return [] as string[];
    const resolveTeamUserIds = async () => {
      if (!roleInfo.teamId) return [] as string[];
      const { data, error } = await supabase
        .from('user_teams')
        .select('user_id')
        .eq('team_id', roleInfo.teamId);
      if (error) {
        console.error('Error loading team members', error);
        return [];
      }
      return (data || []).map((member: { user_id: string }) => member.user_id);
    };

    switch (roleInfo.globalRole) {
      case 'admin': {
        return getVisibleUserIds(roleInfo);
      }
      case 'sales_manager': {
        const teamIds = await resolveTeamUserIds();
        return teamIds.length ? teamIds : getVisibleUserIds(roleInfo);
      }
      case 'team_lead': {
        const teamIds = await resolveTeamUserIds();
        return teamIds.length ? teamIds : [roleInfo.userId];
      }
      default: {
        return [roleInfo.userId];
      }
    }
  }, [roleInfo, user]);

  const loadKanbanDeals = useCallback(async (): Promise<DealRow[]> => {
    if (!user || !roleInfo) return [];

    const requestId = ++kanbanLoadRequestIdRef.current;

    try {
      const visibleUserIds = await resolveVisibleUserIds();
      const currentYear = new Date().getFullYear();
      const yearStartDateOnly = `${currentYear}-01-01`;
      const yearStartTs = `${currentYear}-01-01T00:00:00.000Z`;
      const closedInRangeOrClause = [
        'status.neq.closed',
        `and(status.eq.closed,or(close_date.gte.${yearStartDateOnly},and(close_date.is.null,closed_at.gte.${yearStartTs})))`,
      ].join(',');

      let query = supabase
        .from('deals')
        .select(DEALS_SELECT)
        .neq('status', 'dead')
        .or(closedInRangeOrClause)
        .order('created_at', { ascending: false })
        .range(0, 499);

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      if (effectiveFilters.agentIds.length > 0) {
        query = query.in('user_id', effectiveFilters.agentIds);
      }
      if (effectiveFilters.leadSourceIds.length > 0) {
        query = query.in('lead_source_id', effectiveFilters.leadSourceIds);
      }
      if (effectiveFilters.dealTypes.length > 0) {
        query = query.in('deal_type', effectiveFilters.dealTypes);
      }
      if (effectiveFilters.stageIds.length > 0) {
        const pipelineStageIds = effectiveFilters.stageIds.filter(id => !id.startsWith('status:'));
        const statusStageIds = effectiveFilters.stageIds
          .filter(id => id.startsWith('status:'))
          .map(id => id.replace('status:', ''));
        if (pipelineStageIds.length > 0 && statusStageIds.length > 0) {
          query = query.or(
            `pipeline_status_id.in.(${pipelineStageIds.join(',')}),status.in.(${statusStageIds.join(',')})`
          );
        } else if (pipelineStageIds.length > 0) {
          query = query.in('pipeline_status_id', pipelineStageIds);
        } else if (statusStageIds.length > 0) {
          query = query.in('status', statusStageIds);
        }
      }

      const { data, error } = await query;
      if (requestId !== kanbanLoadRequestIdRef.current) return [];

      if (error) {
        console.error('Error loading kanban deals', error);
        return [];
      }
      
      const deals = (data || []) as DealRow[];
      setKanbanDeals(deals);
      setLastRefreshedAt(Date.now());
      hasLoadedKanbanRef.current = true;
      return deals;
    } catch (err) {
      if (requestId !== kanbanLoadRequestIdRef.current) return [];
      console.error('Error loading kanban deals', err);
      return [];
    }
  }, [effectiveFilters, resolveVisibleUserIds, roleInfo, user]);

  const loadTableDeals = useCallback(async (): Promise<{ rows: DealRow[]; total: number }> => {
    if (!user || !roleInfo) return { rows: [], total: 0 };

    const requestId = ++tableLoadRequestIdRef.current;

    try {
      const visibleUserIds = await resolveVisibleUserIds();
      const currentYear = new Date().getFullYear();
      const yearStartDateOnly = `${currentYear}-01-01`;
      const yearStartTs = `${currentYear}-01-01T00:00:00.000Z`;
      const closedInRangeOrClause = [
        'status.neq.closed',
        `and(status.eq.closed,or(close_date.gte.${yearStartDateOnly},and(close_date.is.null,closed_at.gte.${yearStartTs})))`,
      ].join(',');

      let query = supabase
        .from('deals')
        .select(DEALS_SELECT, { count: 'exact' })
        .neq('status', 'dead')
        .or(closedInRangeOrClause);

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      if (effectiveFilters.agentIds.length > 0) {
        query = query.in('user_id', effectiveFilters.agentIds);
      }
      if (effectiveFilters.leadSourceIds.length > 0) {
        query = query.in('lead_source_id', effectiveFilters.leadSourceIds);
      }
      if (effectiveFilters.dealTypes.length > 0) {
        query = query.in('deal_type', effectiveFilters.dealTypes);
      }
      if (effectiveFilters.stageIds.length > 0) {
        const pipelineStageIds = effectiveFilters.stageIds.filter(id => !id.startsWith('status:'));
        const statusStageIds = effectiveFilters.stageIds
          .filter(id => id.startsWith('status:'))
          .map(id => id.replace('status:', ''));
        if (pipelineStageIds.length > 0 && statusStageIds.length > 0) {
          query = query.or(
            `pipeline_status_id.in.(${pipelineStageIds.join(',')}),status.in.(${statusStageIds.join(',')})`
          );
        } else if (pipelineStageIds.length > 0) {
          query = query.in('pipeline_status_id', pipelineStageIds);
        } else if (statusStageIds.length > 0) {
          query = query.in('status', statusStageIds);
        }
      }
      if (effectiveFilters.statusStageId) {
        if (effectiveFilters.statusStageId.startsWith('status:')) {
          query = query.eq('status', effectiveFilters.statusStageId.replace('status:', ''));
        } else {
          query = query.eq('pipeline_status_id', effectiveFilters.statusStageId);
        }
      }

      if (tableSearch.trim()) {
        const searchTerm = tableSearch.trim().replace(/,/g, ' ');
        query = query.or(
          [
            `client_name.ilike.%${searchTerm}%`,
            `property_address.ilike.%${searchTerm}%`,
            `city.ilike.%${searchTerm}%`,
            `state.ilike.%${searchTerm}%`,
            `client_email.ilike.%${searchTerm}%`,
            `client_phone.ilike.%${searchTerm}%`,
            `lead_sources.name.ilike.%${searchTerm}%`
          ].join(',')
        );
      }

      const from = (tablePage - 1) * tablePageSize;
      const to = from + tablePageSize - 1;
      query = query.range(from, to);

      const sortDirection = tableSortConfig.direction === 'asc';
      switch (tableSortConfig.column) {
        case 'pipelineOrder':
        case 'pipelineStatus':
          query = query.order('sort_order', { ascending: sortDirection, foreignTable: 'pipeline_statuses' });
          break;
        case 'client':
          query = query.order('client_name', { ascending: sortDirection });
          break;
        case 'clientEmail':
          query = query.order('client_email', { ascending: sortDirection });
          break;
        case 'clientPhone':
          query = query.order('client_phone', { ascending: sortDirection });
          break;
        case 'property':
          query = query.order('property_address', { ascending: sortDirection });
          break;
        case 'city':
          query = query.order('city', { ascending: sortDirection });
          break;
        case 'state':
          query = query.order('state', { ascending: sortDirection });
          break;
        case 'zip':
          query = query.order('zip', { ascending: sortDirection });
          break;
        case 'dealType':
          query = query.order('deal_type', { ascending: sortDirection });
          break;
        case 'status':
          query = query.order('status', { ascending: sortDirection });
          break;
        case 'leadSource':
          query = query.order('name', { ascending: sortDirection, foreignTable: 'lead_sources' });
          break;
        case 'expectedPrice':
          query = query.order('expected_sale_price', { ascending: sortDirection });
          break;
        case 'actualPrice':
          query = query.order('actual_sale_price', { ascending: sortDirection });
          break;
        case 'grossCommissionRate':
          query = query.order('gross_commission_rate', { ascending: sortDirection });
          break;
        case 'brokerageSplitRate':
          query = query.order('brokerage_split_rate', { ascending: sortDirection });
          break;
        case 'referralOutRate':
          query = query.order('referral_out_rate', { ascending: sortDirection });
          break;
        case 'referralInRate':
          query = query.order('referral_in_rate', { ascending: sortDirection });
          break;
        case 'transactionFee':
          query = query.order('transaction_fee', { ascending: sortDirection });
          break;
        case 'stageEnteredAt':
          query = query.order('stage_entered_at', { ascending: sortDirection });
          break;
        case 'closeDate':
          query = query.order('close_date', { ascending: sortDirection });
          break;
        case 'closedAt':
          query = query.order('closed_at', { ascending: sortDirection });
          break;
        case 'nextTaskDueDate':
          query = query.order('next_task_due_date', { ascending: sortDirection });
          break;
        case 'nextTaskDescription':
          query = query.order('next_task_description', { ascending: sortDirection });
          break;
        case 'createdAt':
          query = query.order('created_at', { ascending: sortDirection });
          break;
        case 'updatedAt':
          query = query.order('updated_at', { ascending: sortDirection });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (requestId !== tableLoadRequestIdRef.current) return { rows: [], total: 0 };

      if (error) {
        console.error('Error loading table deals', error);
        return { rows: [], total: 0 };
      }
      
      const rows = (data || []) as DealRow[];
      const total = count ?? 0;
      setTableRows(rows);
      setTableTotal(total);
      setLastRefreshedAt(Date.now());
      hasLoadedTableRef.current = true;
      return { rows, total };
    } catch (err) {
      if (requestId !== tableLoadRequestIdRef.current) return { rows: [], total: 0 };
      console.error('Error loading table deals', err);
      return { rows: [], total: 0 };
    }
  }, [
    effectiveFilters,
    resolveVisibleUserIds,
    roleInfo,
    tablePage,
    tablePageSize,
    tableSearch,
    tableSortConfig,
    user
  ]);

  // Create a stable key for the kanban query
  const kanbanQueryKey = useMemo(() => {
    const filterKey = JSON.stringify({
      agents: effectiveFilters.agentIds.sort(),
      leadSources: effectiveFilters.leadSourceIds.sort(),
      stages: effectiveFilters.stageIds.sort(),
      dealTypes: effectiveFilters.dealTypes.sort(),
    });
    return ['pipeline', 'kanban', user?.id, roleInfo?.globalRole, filterKey];
  }, [user?.id, roleInfo?.globalRole, effectiveFilters]);

  // Create a stable key for the table query
  const tableQueryKey = useMemo(() => {
    const filterKey = JSON.stringify({
      agents: effectiveFilters.agentIds.sort(),
      leadSources: effectiveFilters.leadSourceIds.sort(),
      stages: effectiveFilters.stageIds.sort(),
      dealTypes: effectiveFilters.dealTypes.sort(),
      statusStageId: effectiveFilters.statusStageId,
      page: tablePage,
      pageSize: tablePageSize,
      search: tableSearch,
      sort: tableSortConfig,
    });
    return ['pipeline', 'table', user?.id, roleInfo?.globalRole, filterKey];
  }, [user?.id, roleInfo?.globalRole, effectiveFilters, tablePage, tablePageSize, tableSearch, tableSortConfig]);

  // React Query for cached kanban deals
  const kanbanQuery = useQuery({
    queryKey: kanbanQueryKey,
    queryFn: async () => {
      const result = await loadKanbanDeals();
      return result ?? []; // Ensure we never return undefined
    },
    enabled: viewMode === 'kanban' && !!user && !!roleInfo,
    staleTime: 1 * 60 * 1000, // 1 minute stale time for deals
    gcTime: 5 * 60 * 1000, // 5 minutes cache time
    refetchOnWindowFocus: true,
  });

  // React Query for cached table deals
  const tableQuery = useQuery({
    queryKey: tableQueryKey,
    queryFn: async () => {
      const result = await loadTableDeals();
      return result ?? { rows: [], total: 0 }; // Ensure we never return undefined
    },
    enabled: viewMode === 'table' && !!user && !!roleInfo,
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Sync React Query states with component states for loading indicators
  useEffect(() => {
    if (viewMode === 'kanban') {
      setKanbanLoading(kanbanQuery.isLoading);
      setRefreshing(kanbanQuery.isFetching && !kanbanQuery.isLoading);
    } else {
      setTableLoading(tableQuery.isLoading);
      setRefreshing(tableQuery.isFetching && !tableQuery.isLoading);
    }
  }, [viewMode, kanbanQuery.isLoading, kanbanQuery.isFetching, tableQuery.isLoading, tableQuery.isFetching]);

  useEffect(() => {
    if (viewMode === 'table' && tablePage !== 1) {
      setTablePage(1);
    }
  }, [effectiveFilters, tablePage, tablePageSize, tableSearch, tableSortConfig, viewMode]);

  const loadSummaryDeals = useCallback(async () => {
    if (!user || !roleInfo) return;

    try {
      const visibleUserIds = await resolveVisibleUserIds();
      const currentYear = new Date().getFullYear();
      const yearStartDateOnly = `${currentYear}-01-01`;
      const yearStartTs = `${currentYear}-01-01T00:00:00.000Z`;
      const closedInRangeOrClause = [
        'status.neq.closed',
        `and(status.eq.closed,or(close_date.gte.${yearStartDateOnly},and(close_date.is.null,closed_at.gte.${yearStartTs})))`,
      ].join(',');

      let query = supabase
        .from('deals')
        .select(DEALS_SELECT)
        .neq('status', 'dead')
        .or(closedInRangeOrClause);

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      if (effectiveFilters.agentIds.length > 0) {
        query = query.in('user_id', effectiveFilters.agentIds);
      }
      if (effectiveFilters.leadSourceIds.length > 0) {
        query = query.in('lead_source_id', effectiveFilters.leadSourceIds);
      }
      if (effectiveFilters.dealTypes.length > 0) {
        query = query.in('deal_type', effectiveFilters.dealTypes);
      }
      if (effectiveFilters.stageIds.length > 0) {
        const pipelineStageIds = effectiveFilters.stageIds.filter(id => !id.startsWith('status:'));
        const statusStageIds = effectiveFilters.stageIds
          .filter(id => id.startsWith('status:'))
          .map(id => id.replace('status:', ''));
        if (pipelineStageIds.length > 0 && statusStageIds.length > 0) {
          query = query.or(
            `pipeline_status_id.in.(${pipelineStageIds.join(',')}),status.in.(${statusStageIds.join(',')})`
          );
        } else if (pipelineStageIds.length > 0) {
          query = query.in('pipeline_status_id', pipelineStageIds);
        } else if (statusStageIds.length > 0) {
          query = query.in('status', statusStageIds);
        }
      }
      if (effectiveFilters.statusStageId) {
        if (effectiveFilters.statusStageId.startsWith('status:')) {
          query = query.eq('status', effectiveFilters.statusStageId.replace('status:', ''));
        } else {
          query = query.eq('pipeline_status_id', effectiveFilters.statusStageId);
        }
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading summary deals', error);
        setSummaryDeals([]);
        return;
      }
      setSummaryDeals(data || []);
    } catch (err) {
      console.error('Error loading summary deals', err);
      setSummaryDeals([]);
    }
  }, [effectiveFilters, resolveVisibleUserIds, roleInfo, user]);

  // React Query for cached lead sources
  const leadSourcesQuery = useQuery({
    queryKey: ['pipeline', 'leadSources', roleInfo?.teamId],
    queryFn: async () => {
      let query = supabase
        .from('lead_sources')
        .select('id,name')
        .order('name', { ascending: true });

      if (roleInfo?.teamId) {
        query = query.eq('team_id', roleInfo.teamId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading lead sources', error);
        return [];
      }
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Lead sources are stable
    gcTime: 15 * 60 * 1000,
  });

  // Sync lead sources to state
  useEffect(() => {
    if (leadSourcesQuery.data) {
      setAvailableLeadSources(leadSourcesQuery.data);
    }
  }, [leadSourcesQuery.data]);

  // React Query for cached summary deals
  // Load summary deals when filters change
  useEffect(() => {
    if (user && roleInfo) {
      loadSummaryDeals();
    }
  }, [user, roleInfo, loadSummaryDeals]);

  useEffect(() => {
    setAvailableDealTypeFilters(DEAL_TYPE_OPTIONS);
  }, []);

  useEffect(() => {
    setSelectedLeadSourceIds(prev =>
      prev.filter(id => availableLeadSources.some(source => source.id === id))
    );
  }, [availableLeadSources]);

  useEffect(() => {
    setSelectedDealTypeIds(prev => prev.filter(type => DEAL_TYPE_OPTIONS.includes(type)));
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const deal = kanbanDeals.find(d => d.id === event.active.id);
    setActiveDeal(deal || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over) {
      return;
    }

    const dealId = active.id as string;
    const currentDeal = kanbanDeals.find(d => d.id === dealId);
    if (!currentDeal) {
      return;
    }

    const overDeal = kanbanDeals.find(d => d.id === over.id);
    const potentialStatusId = overDeal ? overDeal.pipeline_status_id : (over.id as string);
    if (!potentialStatusId) {
      return;
    }

    if (potentialStatusId === currentDeal.pipeline_status_id) {
      if (overDeal && overDeal.id !== currentDeal.id && overDeal.deal_type === currentDeal.deal_type) {
        setOrderByStatus(prev => {
          const fallbackList = kanbanDeals
            .filter(deal => deal.pipeline_status_id === potentialStatusId)
            .map(deal => deal.id);
          const currentList = prev[potentialStatusId] ?? fallbackList;
          const fromIndex = currentList.indexOf(currentDeal.id);
          const toIndex = currentList.indexOf(overDeal.id);
          if (fromIndex === -1 || toIndex === -1) {
            return prev;
          }
          return {
            ...prev,
            [potentialStatusId]: arrayMove(currentList, fromIndex, toIndex)
          };
        });
      }
      return;
    }

    const newStatus = combinedStatuses.find(s => s.id === potentialStatusId);
    if (!newStatus) {
      return;
    }

    const lifecycleStage = newStatus.lifecycle_stage || 'in_progress';
    const nowIso = new Date().toISOString();
    const updates: DealUpdate = {
      pipeline_status_id: potentialStatusId,
      status: lifecycleStage,
      stage_entered_at: nowIso
    };

    if (lifecycleStage === 'closed') {
      updates.closed_at = nowIso;
    } else {
      updates.closed_at = null;
    }

    const previousDeal = currentDeal;
    setKanbanDeals(prev =>
      prev.map(deal =>
        deal.id === dealId
          ? {
              ...deal,
              pipeline_status_id: potentialStatusId,
              status: lifecycleStage,
              stage_entered_at: nowIso,
              closed_at: updates.closed_at ?? null,
              pipeline_statuses: newStatus ? { ...newStatus } : deal.pipeline_statuses
            }
          : deal
      )
    );
    setOrderByStatus(prev => {
      const next = { ...prev };
      const sourceStatusId = currentDeal.pipeline_status_id;
      if (sourceStatusId) {
        const sourceFallback = kanbanDeals
          .filter(deal => deal.pipeline_status_id === sourceStatusId)
          .map(deal => deal.id);
        const sourceList = next[sourceStatusId] ?? sourceFallback;
        next[sourceStatusId] = sourceList.filter(id => id !== dealId);
      }
      const destFallback = kanbanDeals
        .filter(deal => deal.pipeline_status_id === potentialStatusId)
        .map(deal => deal.id);
      const destList = [...(next[potentialStatusId] ?? destFallback)];
      if (overDeal && overDeal.pipeline_status_id === potentialStatusId) {
        const insertAt = destList.indexOf(overDeal.id);
        destList.splice(insertAt === -1 ? destList.length : insertAt, 0, dealId);
      } else {
        destList.push(dealId);
      }
      next[potentialStatusId] = destList;
      return next;
    });

    const { data, error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', dealId)
      .select(DEALS_SELECT)
      .maybeSingle();

    if (error) {
      console.error('Error updating deal status', error);
      setKanbanDeals(prev => prev.map(deal => (deal.id === dealId ? previousDeal : deal)));
      loadKanbanDeals();
      return;
    }

    if (data) {
      setKanbanDeals(prev => prev.map(deal => (deal.id === dealId ? (data as Deal) : deal)));
      setTableRows(prev => prev.map(deal => (deal.id === dealId ? (data as Deal) : deal)));
    }
  };

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setShowModal(true);
  };

  const clearDealIdParam = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.has('dealId')) {
      nextParams.delete('dealId');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleModalDismiss = useCallback(() => {
    setShowModal(false);
    setSelectedDeal(null);
    clearDealIdParam();
  }, [clearDealIdParam]);

  const handleDealSaved = useCallback((updatedDeal: Deal) => {
    setKanbanDeals(prev => {
      const existingIndex = prev.findIndex(deal => deal.id === updatedDeal.id);
      if (existingIndex === -1) {
        return [updatedDeal, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...updatedDeal };
      return next;
    });
    setTableRows(prev => {
      const existingIndex = prev.findIndex(deal => deal.id === updatedDeal.id);
      if (existingIndex === -1) {
        return [updatedDeal, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...updatedDeal };
      return next;
    });
  }, []);

  const handleDealDeleted = useCallback((deletedId: string) => {
    setKanbanDeals(prev => prev.filter(deal => deal.id !== deletedId));
    setTableRows(prev => prev.filter(deal => deal.id !== deletedId));
  }, []);

  const getDealsByStatusId = (statusId: string) => {
    const ids = orderByStatus[statusId] ?? [];
    const filteredDeals = debouncedSearch
      ? kanbanDeals.filter(deal => {
          const query = debouncedSearch.toLowerCase();
          return (
            (deal.client_name || '').toLowerCase().includes(query) ||
            (deal.property_address || '').toLowerCase().includes(query)
          );
        })
      : kanbanDeals;
    const dealMap = new Map(filteredDeals.map(deal => [deal.id, deal]));
    const ordered = ids.map(id => dealMap.get(id)).filter(Boolean) as Deal[];
    const remainder = filteredDeals.filter(
      deal => deal.pipeline_status_id === statusId && !ids.includes(deal.id)
    );
    return [...ordered, ...remainder];
  };

  const calculateNetCommission = (deal: Deal) =>
    deal.status === 'closed' ? calculateActualGCI(deal) : calculateExpectedGCI(deal);

  const filteredTableRows = useMemo(() => {
    if (!debouncedSearch) return tableRows;
    const query = debouncedSearch.toLowerCase();
    return tableRows.filter(deal =>
      (deal.client_name || '').toLowerCase().includes(query) ||
      (deal.property_address || '').toLowerCase().includes(query)
    );
  }, [debouncedSearch, tableRows]);

  const getDaysInStage = (stageEnteredAt: string) => {
    const entered = new Date(stageEnteredAt);
    const now = new Date();
    const diff = now.getTime() - entered.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const handleBulkDelete = async (dealIds: string[]) => {
    if (!confirm(`Are you sure you want to delete ${dealIds.length} deal${dealIds.length > 1 ? 's' : ''}?`)) {
      return;
    }

    const { error } = await supabase
      .from('deals')
      .delete()
      .in('id', dealIds);

    if (!error) {
      loadTableDeals();
    }
  };

  const handleBulkEdit = async (dealIds: string[], updates: Partial<Deal>) => {
    const updateData: DealUpdate = {};

    if (updates.pipeline_status_id) {
      updateData.pipeline_status_id = updates.pipeline_status_id;
      updateData.stage_entered_at = new Date().toISOString();

      const newStatus = combinedStatuses.find(s => s.id === updates.pipeline_status_id);
      const lifecycleStage = newStatus?.lifecycle_stage || 'in_progress';
      updateData.status = lifecycleStage;
      if (lifecycleStage === 'closed') {
        updateData.closed_at = new Date().toISOString();
      } else {
        updateData.closed_at = null;
      }
    }

    const { error } = await supabase
      .from('deals')
      .update(updateData)
      .in('id', dealIds);

    if (!error) {
      loadTableDeals();
    }
  };

  const getSummaryMetrics = (sourceDeals: Deal[]) => {
    const buyers = sourceDeals.filter(d => d.deal_type === 'buyer' || d.deal_type === 'buyer_and_seller').length;
    const sellers = sourceDeals.filter(d => d.deal_type === 'seller' || d.deal_type === 'buyer_and_seller').length;
    const renters = sourceDeals.filter(d => d.deal_type === 'renter').length;
    const landlords = sourceDeals.filter(d => d.deal_type === 'landlord').length;
    const totalCommission = sourceDeals.reduce((sum, deal) => sum + calculateNetCommission(deal), 0);

    return { buyers, sellers, renters, landlords, totalCommission };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const metrics = getSummaryMetrics(summaryDeals);
  const summaryPills = [
    { label: 'Buyers', value: metrics.buyers, display: metrics.buyers.toString() },
    { label: 'Sellers', value: metrics.sellers, display: metrics.sellers.toString() },
    { label: 'Renters', value: metrics.renters, display: metrics.renters.toString() },
    { label: 'Landlords', value: metrics.landlords, display: metrics.landlords.toString() },
    { label: 'Net Commission', value: metrics.totalCommission, display: formatCurrency(metrics.totalCommission) }
  ];

  const clearAllFilters = () => {
    setSelectedAgentIds([]);
    setSelectedLeadSourceIds([]);
    setSelectedStageIds([]);
    setSelectedDealTypeIds([]);
  };

  const showFilterPanel = viewMode === 'table' || viewMode === 'kanban';
  const showStageFilter = viewMode === 'table';
  const showFocusOnMe = !!user && (roleInfo?.globalRole === 'team_lead' || roleInfo?.teamRole === 'team_lead');
  const isFocusOnMeActive = showFocusOnMe && selectedAgentIds.length === 1 && selectedAgentIds[0] === user?.id;
  const selectMyData = () => {
    if (user) {
      setSelectedAgentIds([user.id]);
    }
  };
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
      availableStageFilters.map((stage) => ({
        value: stage.id,
        label: stage.name
      })),
    [availableStageFilters]
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
      availableDealTypeFilters.map((dealType) => ({
        value: dealType,
        label: DEAL_TYPE_FILTER_META[dealType]?.label || dealType.replace(/_/g, ' ')
      })),
    [availableDealTypeFilters]
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

    if (selectedStageIds.length > 0) {
      const stageLabel =
        selectedStageIds.length === 1
          ? `Stage: ${
              availableStageFilters.find((stage) => stage.id === selectedStageIds[0])?.name || 'Stage'
            }`
          : `Stages: ${selectedStageIds.length}`;
      chips.push({ key: 'stages', label: stageLabel, onRemove: () => setSelectedStageIds([]) });
    }

    if (selectedDealTypeIds.length > 0) {
      const typeLabel =
        selectedDealTypeIds.length === 1
          ? `Type: ${DEAL_TYPE_FILTER_META[selectedDealTypeIds[0]]?.label || selectedDealTypeIds[0]}`
          : `Types: ${selectedDealTypeIds.length}`;
      chips.push({ key: 'types', label: typeLabel, onRemove: () => setSelectedDealTypeIds([]) });
    }

    if (selectedLeadSourceIds.length > 0) {
      const sourceLabel =
        selectedLeadSourceIds.length === 1
          ? `Source: ${
              availableLeadSources.find((source) => source.id === selectedLeadSourceIds[0])?.name || 'Source'
            }`
          : `Sources: ${selectedLeadSourceIds.length}`;
      chips.push({ key: 'sources', label: sourceLabel, onRemove: () => setSelectedLeadSourceIds([]) });
    }

    return chips;
  }, [
    availableAgents,
    availableLeadSources,
    availableStageFilters,
    selectedAgentIds,
    selectedDealTypeIds,
    selectedLeadSourceIds,
    selectedStageIds,
  ]);

  const scopeDescription = useMemo(() => {
    const formatList = (items: string[], fallback: string) => {
      if (items.length === 0) return fallback;
      if (items.length === 1) return items[0];
      if (items.length === 2) return `${items[0]} and ${items[1]}`;
      if (items.length === 3) return `${items[0]}, ${items[1]} and ${items[2]}`;
      return `multiple ${fallback}`;
    };

    const agentNames = availableAgents
      .filter(agent => selectedAgentIds.includes(agent.id))
      .map(agent => agent.label);
    const leadSourceNames = availableLeadSources
      .filter(source => selectedLeadSourceIds.includes(source.id))
      .map(source => source.name);
    const dealTypeNames = selectedDealTypeIds.map(
      dealType => DEAL_TYPE_FILTER_META[dealType]?.label || dealType.replace(/_/g, ' ')
    );
    const stageNames = availableStageFilters
      .filter(stage => selectedStageIds.includes(stage.id))
      .map(stage => stage.name);

    const allAgents = selectedAgentIds.length === 0 || selectedAgentIds.length === availableAgents.length;
    const allLeads = selectedLeadSourceIds.length === 0 || selectedLeadSourceIds.length === availableLeadSources.length;
    const allDealTypes =
      selectedDealTypeIds.length === 0 || selectedDealTypeIds.length === availableDealTypeFilters.length;
    const allStages =
      selectedStageIds.length === 0 || selectedStageIds.length === availableStageFilters.length;

    const agentPhrase = allAgents ? 'all agents' : formatList(agentNames, 'agents');
    const leadPhrase = allLeads ? 'all lead sources' : formatList(leadSourceNames, 'lead sources');
    const dealPhrase = allDealTypes ? 'all deal types' : formatList(dealTypeNames, 'deal types');
    const stagePhrase = showStageFilter ? (allStages ? 'all stages' : formatList(stageNames, 'stages')) : null;

    const parts = [agentPhrase, dealPhrase, leadPhrase];
    if (stagePhrase) parts.push(stagePhrase);

    return `Viewing deals across ${parts.filter(Boolean).join(', ')}.`;
  }, [
    availableAgents,
    availableDealTypeFilters.length,
    availableLeadSources,
    availableStageFilters,
    selectedAgentIds,
    selectedDealTypeIds,
    selectedLeadSourceIds,
    selectedStageIds,
    showStageFilter
  ]);

  const isInitialLoading = (viewMode === 'table' ? tableLoading : kanbanLoading) || statusesLoading;
  const lastUpdatedLabel = lastRefreshedAt
    ? `Last updated ${new Date(lastRefreshedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : null;
  const dashboardStatusId = searchParams.get('statusId');
  const dashboardStatusName = searchParams.get('statusName');
  const isStageLockedFromDashboard = statusFilter !== 'all' && !!dashboardStatusId;
  const stageLabel =
    dashboardStatusName ||
    combinedStatuses.find(status => status.id === dashboardStatusId)?.name ||
    'Stage locked from Dashboard';
  const clearStageLock = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('statusId');
    nextParams.delete('statusName');
    if (searchParams.get('view') === 'table' && dashboardStatusId) {
      nextParams.delete('view');
    }
    setSearchParams(nextParams, { replace: true });
  };
  const clearDashboardFilters = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('agents');
    nextParams.delete('leadSources');
    nextParams.delete('pipelineStages');
    nextParams.delete('dealTypes');
    nextParams.delete('statusId');
    nextParams.delete('statusName');
    if (searchParams.get('view') === 'table' && dashboardStatusId) {
      nextParams.delete('view');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const scopeExtraChips = useMemo(() => {
    if (!isStageLockedFromDashboard) return [];
    return [
      {
        key: 'stage-lock',
        label: `Stage locked from Dashboard: ${stageLabel}`,
        onRemove: clearStageLock
      }
    ];
  }, [isStageLockedFromDashboard, stageLabel, clearStageLock]);

  const viewToggleWrap = [
    ui.radius.pill,
    ui.border.subtle,
    ui.pad.chipTight,
    'inline-flex items-center bg-white/80'
  ].join(' ');
  const viewToggleButton = [
    ui.radius.pill,
    ui.pad.chip,
    'inline-flex items-center gap-2 transition'
  ].join(' ');

  return (
    <PageShell
      className="min-h-full"
      title={(
        <PageHeader
          label="Pipeline"
          title="Active deals workspace"
          subtitle="Monitor every opportunity, shift deals between stages, and launch new work without leaving this view."
        />
      )}
      actions={(
        <div className={['flex flex-col gap-3 items-end', ui.align.right].join(' ')}>
          <LastUpdatedStatus refreshing={refreshing} label={lastUpdatedLabel} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Text as="span" variant="micro" className={ui.tone.faint}>
              View:
            </Text>
            <div className={viewToggleWrap}>
              <button
                onClick={() => setViewMode('kanban')}
                className={[
                  viewToggleButton,
                  viewMode === 'kanban' ? 'bg-[#1e3a5f] ring-1 ring-[#1e3a5f]/30' : ''
                ].join(' ')}
                style={{ 
                  color: viewMode === 'kanban' ? '#ffffff' : '#1e3a5f',
                  backgroundColor: viewMode === 'kanban' ? '#1e3a5f' : 'transparent'
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'kanban') {
                    e.currentTarget.style.backgroundColor = 'rgba(212, 136, 58, 0.1)';
                    e.currentTarget.style.color = '#D4883A';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'kanban') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#1e3a5f';
                  }
                }}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="font-medium text-[15px]" style={{ color: 'inherit' }}>
                  Kanban
                </span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={[
                  viewToggleButton,
                  viewMode === 'table' ? 'bg-[#1e3a5f] ring-1 ring-[#1e3a5f]/30' : ''
                ].join(' ')}
                style={{ 
                  color: viewMode === 'table' ? '#ffffff' : '#1e3a5f',
                  backgroundColor: viewMode === 'table' ? '#1e3a5f' : 'transparent'
                }}
                onMouseEnter={(e) => {
                  if (viewMode !== 'table') {
                    e.currentTarget.style.backgroundColor = 'rgba(212, 136, 58, 0.1)';
                    e.currentTarget.style.color = '#D4883A';
                  }
                }}
                onMouseLeave={(e) => {
                  if (viewMode !== 'table') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#1e3a5f';
                  }
                }}
              >
                <List className="w-4 h-4" />
                <span className="font-medium text-[15px]" style={{ color: 'inherit' }}>
                  Table
                </span>
              </button>
            </div>
            <div className="relative">
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search client or address…"
                className={['hig-input', ui.radius.pill, 'sm:w-56'].join(' ')}
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className={[ui.tone.faint, 'absolute right-3 top-1/2 -translate-y-1/2 transition hover:opacity-80'].join(' ')}
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedDeal(null);
                setShowModal(true);
              }}
              className={['hig-btn-primary', 'gap-2'].join(' ')}
            >
              <Plus className="w-4 h-4" />
              <span>New Deal</span>
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        <Text variant="micro" className="text-gray-500">PIPELINE (DEAL TYPE BREAKDOWN)</Text>
        {isInitialLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Card key={`kpi-skeleton-${index}`} padding="cardTight" className="bg-white/70">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {summaryPills.map((pill) => {
              const isNet = pill.label === 'Net Commission';
              return (
                <MetricTile
                  key={pill.label}
                  label={pill.label}
                  value={pill.display}
                  valueClassName={isNet ? 'text-emerald-700' : undefined}
                />
              );
            })}
          </div>
        )}

        {showFilterPanel && (
          <ScopePanel
            scopeDescription={scopeDescription}
            availableAgents={availableAgents}
            availableStages={availableStageFilters.map((stage) => ({ id: stage.id, label: stage.name }))}
            availableDealTypes={availableDealTypeFilters}
            availableLeadSources={availableLeadSources}
            agentOptions={agentOptions}
            stageOptions={stageOptions}
            dealTypeOptions={dealTypeOptions}
            leadSourceOptions={leadSourceOptions}
            selectedAgentIds={selectedAgentIds}
            selectedPipelineStages={selectedStageIds}
            selectedDealTypes={selectedDealTypeIds as string[]}
            selectedLeadSources={selectedLeadSourceIds}
            onChangeAgents={setSelectedAgentIds}
            onChangePipelineStages={setSelectedStageIds}
            onChangeDealTypes={(next) => setSelectedDealTypeIds(next as Deal['deal_type'][])}
            onChangeLeadSources={setSelectedLeadSourceIds}
            activeFilterChips={activeFilterChips}
            showFocusOnMe={showFocusOnMe}
            isFocusOnMeActive={isFocusOnMeActive}
            onSelectMyData={selectMyData}
            onClearAllFilters={clearAllFilters}
            showStageFilter={showStageFilter}
            extraFilterChips={scopeExtraChips}
            showAgentFilter={roleInfo?.globalRole !== 'agent'}
          />
        )}

        {dashboardFiltersActive && (
          <div className="flex flex-wrap items-center gap-3">
            <Text as="span" variant="muted">
              Dashboard filters applied (override local selections):
            </Text>
            <Text as="span" variant="body" className="font-semibold">
              {[
                dashboardAgentFilters.length ? `${dashboardAgentFilters.length} agent${dashboardAgentFilters.length === 1 ? '' : 's'}` : null,
                dashboardLeadSourceFilters.length ? `${dashboardLeadSourceFilters.length} lead source${dashboardLeadSourceFilters.length === 1 ? '' : 's'}` : null,
                dashboardDealTypeFilters.length ? `${dashboardDealTypeFilters.length} deal type${dashboardDealTypeFilters.length === 1 ? '' : 's'}` : null,
                dashboardStageFilters.length ? `${dashboardStageFilters.length} stage filter${dashboardStageFilters.length === 1 ? '' : 's'}` : null
              ].filter(Boolean).join(' · ')}
            </Text>
            <button
              type="button"
              onClick={clearDashboardFilters}
              className="inline-flex items-center"
            >
              <Text as="span" variant="muted" className={[ui.tone.accent, 'font-semibold'].join(' ')}>
                Clear dashboard filters
              </Text>
            </button>
          </div>
        )}
      </div>

      {isInitialLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={`pipeline-skeleton-${index}`} padding="cardTight" className="space-y-3">
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 4 }).map((__, cardIndex) => (
                <Skeleton key={`pipeline-skeleton-${index}-${cardIndex}`} className="h-20 w-full" />
              ))}
            </Card>
          ))}
        </div>
      ) : combinedStatuses.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className={[ui.align.center, 'max-w-md space-y-4'].join(' ')}>
            <Settings className={[ui.tone.faint, 'w-16 h-16 mx-auto'].join(' ')} />
            <div className="space-y-2">
              <Text as="h2" variant="h2">Configure Your Pipeline</Text>
              <Text variant="muted">Choose a template to get started with your pipeline workflow</Text>
            </div>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="hig-btn-primary"
            >
              Choose Pipeline Template
            </button>
          </div>
        </div>
      ) : viewMode === 'kanban' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto">
            <div className={[ui.pad.cardTight, 'flex gap-3 sm:gap-4 min-w-max'].join(' ')}>
              {combinedStatuses.map(status => (
                <PipelineColumn
                  key={status.id}
                  status={status.id}
                  label={status.name}
                  color={status.color}
                  deals={getDealsByStatusId(status.id)}
                  onDealClick={handleDealClick}
                  calculateNetCommission={calculateNetCommission}
                  getDaysInStage={getDaysInStage}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeDeal ? (
              <DealCard
                deal={activeDeal}
                netCommission={calculateNetCommission(activeDeal)}
                daysInStage={getDaysInStage(activeDeal.stage_entered_at)}
                onClick={() => {}}
                isDragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="overflow-x-auto">
          <PipelineTable
            deals={filteredTableRows}
            statuses={combinedStatuses}
            onDealClick={handleDealClick}
            calculateNetCommission={calculateNetCommission}
            getDaysInStage={getDaysInStage}
            onBulkDelete={handleBulkDelete}
            onBulkEdit={handleBulkEdit}
            onImportSuccess={loadTableDeals}
            serverMode
            searchQuery={tableSearch}
            onSearchChange={setTableSearch}
            sortConfig={tableSortConfig}
            onSortChange={setTableSortConfig}
            page={tablePage}
            pageSize={tablePageSize}
            totalCount={tableTotal}
            onPageChange={setTablePage}
            onPageSizeChange={setTablePageSize}
          />
        </div>
      )}

      {showModal && (
        <DealModal
          deal={selectedDeal}
          onClose={handleModalDismiss}
          onSaved={handleDealSaved}
          onDeleted={handleDealDeleted}
        />
      )}

      {showTemplateModal && (
        <TemplateSelectionModal
          onClose={() => setShowTemplateModal(false)}
          onSelect={applyTemplate}
          onCreateCustomWorkflow={createCustomWorkflow}
        />
      )}
    </PageShell>
  );
}
