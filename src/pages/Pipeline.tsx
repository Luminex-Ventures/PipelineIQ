import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
import { MultiSelectCombobox } from '../components/ui/MultiSelectCombobox';
import { Skeleton } from '../components/ui/Skeleton';
import { usePipelineStatuses } from '../hooks/usePipelineStatuses';
import { getVisibleUserIds } from '../lib/rbac';
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

const surfaceClass = 'rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.08)]';
const pillClass =
  'inline-flex items-center rounded-full border border-gray-200/70 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition';
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
  { label: string; accentClass: string; matches: Deal['deal_type'][] }
> = {
  buyer: {
    label: 'Buyer',
    accentClass: 'bg-blue-50 text-blue-700 border-blue-200',
    matches: ['buyer', 'buyer_and_seller']
  },
  seller: {
    label: 'Seller',
    accentClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    matches: ['seller', 'buyer_and_seller']
  },
  buyer_and_seller: {
    label: 'Buyer & Seller',
    accentClass: 'bg-purple-50 text-purple-700 border-purple-200',
    matches: ['buyer_and_seller']
  },
  renter: {
    label: 'Renter',
    accentClass: 'bg-orange-50 text-orange-700 border-orange-200',
    matches: ['renter']
  },
  landlord: {
    label: 'Landlord',
    accentClass: 'bg-teal-50 text-teal-700 border-teal-200',
    matches: ['landlord']
  }
};

export default function Pipeline() {
  const { user, roleInfo } = useAuth();
  const { statuses, loading: statusesLoading, applyTemplate, createCustomWorkflow } = usePipelineStatuses();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const loadRequestIdRef = useRef(0);
  const pendingNewDeal = searchParams.get('newDeal');
  const isSalesManager = roleInfo?.globalRole === 'sales_manager';
  const formatAgentLabel = (agent: AccessibleAgentRow) =>
    agent.display_name || agent.email || `Agent ${agent.user_id.slice(0, 8)}`;
  const combinedStatuses = useMemo(() => {
    const statusMap = new Map<string, PipelineStatus>();

    statuses.forEach(status => {
      statusMap.set(status.id, status);
    });

    deals.forEach(deal => {
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
  }, [statuses, deals]);

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

  const openDealById = useCallback(
    async (dealId: string) => {
      const existing = deals.find((d) => d.id === dealId);
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
    [deals]
  );

  useEffect(() => {
    const dealId = searchParams.get('dealId');
    if (dealId) {
      openDealById(dealId);
    }
  }, [searchParams, deals, openDealById]);

  useEffect(() => {
    // Show template selection if user has no statuses
    if (!statusesLoading && combinedStatuses.length === 0) {
      setShowTemplateModal(true);
    }
  }, [statusesLoading, combinedStatuses]);

  const loadFilterOptions = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('lead_sources')
      .select('id,name')
      .order('name', { ascending: true });

    if (!error) {
      setAvailableLeadSources((data || []) as { id: string; name: string }[]);
    }

    setAvailableDealTypeFilters(Object.keys(DEAL_TYPE_FILTER_META) as Deal['deal_type'][]);
  }, [user]);

  const loadDeals = useCallback(async () => {
    if (!user || !roleInfo) return;

    const requestId = ++loadRequestIdRef.current;
    setLoading(true);

    try {
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

      let visibleUserIds: string[] = [];

      switch (roleInfo.globalRole) {
        case 'admin': {
          visibleUserIds = await getVisibleUserIds(roleInfo);
          break;
        }
        case 'sales_manager': {
          const teamIds = await resolveTeamUserIds();
          visibleUserIds = teamIds.length ? teamIds : await getVisibleUserIds(roleInfo);
          break;
        }
        case 'team_lead': {
          const teamIds = await resolveTeamUserIds();
          visibleUserIds = teamIds.length ? teamIds : [roleInfo.userId];
          break;
        }
        default: {
          visibleUserIds = [roleInfo.userId];
        }
      }

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
        .order('created_at', { ascending: false })
        .or(closedInRangeOrClause);

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      const { data, error } = await query;

      if (requestId !== loadRequestIdRef.current) return;

      if (error) {
        console.error('Error loading deals', error);
        setDeals([]);
      } else {
        setDeals(data || []);
      }
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error('Error resolving visible users', err);
      setDeals([]);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [roleInfo, user]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find(d => d.id === event.active.id);
    setActiveDeal(deal || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over) {
      return;
    }

    const dealId = active.id as string;
    const currentDeal = deals.find(d => d.id === dealId);
    if (!currentDeal) {
      return;
    }

    const overDeal = deals.find(d => d.id === over.id);
    const potentialStatusId = overDeal ? overDeal.pipeline_status_id : (over.id as string);
    if (!potentialStatusId) {
      return;
    }

    if (potentialStatusId === currentDeal.pipeline_status_id) {
      if (overDeal && overDeal.id !== currentDeal.id && overDeal.deal_type === currentDeal.deal_type) {
        setDeals(prev => {
          const fromIndex = prev.findIndex(d => d.id === currentDeal.id);
          const toIndex = prev.findIndex(d => d.id === overDeal.id);
          if (fromIndex === -1 || toIndex === -1) {
            return prev;
          }
          return arrayMove(prev, fromIndex, toIndex);
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
    setDeals(prev =>
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

    const { data, error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', dealId)
      .select(DEALS_SELECT)
      .maybeSingle();

    if (error) {
      console.error('Error updating deal status', error);
      setDeals(prev => prev.map(deal => (deal.id === dealId ? previousDeal : deal)));
      loadDeals();
      return;
    }

    if (data) {
      setDeals(prev => prev.map(deal => (deal.id === dealId ? (data as Deal) : deal)));
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
    setDeals(prev => {
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
    setDeals(prev => prev.filter(deal => deal.id !== deletedId));
  }, []);

  const shouldApplyPipelineFilters = viewMode === 'table' || (isSalesManager && viewMode === 'kanban');
  const filteredDeals = deals
    .filter(deal => deal.status !== 'dead')
    .filter(deal => {
      if (shouldApplyPipelineFilters) {
        if (selectedAgentIds.length && !selectedAgentIds.includes(deal.user_id)) {
          return false;
        }
        if (selectedLeadSourceIds.length) {
          if (!deal.lead_source_id || !selectedLeadSourceIds.includes(deal.lead_source_id)) {
            return false;
          }
        }
        if (selectedDealTypeIds.length && !selectedDealTypeIds.includes(deal.deal_type)) {
          return false;
        }
        if (viewMode === 'table' && selectedStageIds.length) {
          const stageId = deal.pipeline_status_id || `status:${deal.status}`;
          if (!selectedStageIds.includes(stageId)) {
            return false;
          }
        }
      }

      if (viewMode === 'table') {
        if (dashboardAgentFilters.length && !dashboardAgentFilters.includes(deal.user_id)) {
          return false;
        }
        if (dashboardLeadSourceFilters.length) {
          if (!deal.lead_source_id || !dashboardLeadSourceFilters.includes(deal.lead_source_id)) {
            return false;
          }
        }
        if (dashboardDealTypeFilters.length && !dashboardDealTypeFilters.includes(deal.deal_type)) {
          return false;
        }
        if (dashboardStageFilters.length) {
          const stageId = deal.pipeline_status_id || `status:${deal.status}`;
          if (!dashboardStageFilters.includes(stageId)) {
            return false;
          }
        }
        if (statusFilter !== 'all') {
          const stageId = deal.pipeline_status_id || `status:${deal.status}`;
          return stageId === statusFilter;
        }
      }

      return true;
    });

  const getDealsByStatusId = (statusId: string) => {
    return filteredDeals.filter(deal => deal.pipeline_status_id === statusId);
  };


  const calculateNetCommission = (deal: Deal) => {
    const salePrice = deal.actual_sale_price || deal.expected_sale_price;
    const grossCommission = salePrice * deal.gross_commission_rate;
    const afterBrokerageSplit = grossCommission * (1 - deal.brokerage_split_rate);
    const afterReferral = deal.referral_out_rate
      ? afterBrokerageSplit * (1 - deal.referral_out_rate)
      : afterBrokerageSplit;
    return afterReferral - deal.transaction_fee;
  };

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
      loadDeals();
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
      loadDeals();
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

  const metrics = getSummaryMetrics(filteredDeals);
  const summaryPills = [
    { label: 'Buyers', value: metrics.buyers, display: metrics.buyers.toString() },
    { label: 'Sellers', value: metrics.sellers, display: metrics.sellers.toString() },
    { label: 'Renters', value: metrics.renters, display: metrics.renters.toString() },
    { label: 'Landlords', value: metrics.landlords, display: metrics.landlords.toString() },
    { label: 'Net Commission', value: metrics.totalCommission, display: formatCurrency(metrics.totalCommission) }
  ].filter(pill => pill.value > 0);

  const clearAllFilters = () => {
    setSelectedAgentIds([]);
    setSelectedLeadSourceIds([]);
    setSelectedStageIds([]);
    setSelectedDealTypeIds([]);
  };

  const showFilterPanel = viewMode === 'table' || (isSalesManager && viewMode === 'kanban');
  const showStageFilter = viewMode === 'table';
  // NEW: make this explicitly boolean so React never sees a naked 0
  const hasDashboardFilters =
    dashboardAgentFilters.length > 0 ||
    dashboardLeadSourceFilters.length > 0 ||
    dashboardDealTypeFilters.length > 0 ||
    dashboardStageFilters.length > 0;
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

  const isInitialLoading = loading || statusesLoading;

  return (
    <div className="space-y-6 min-h-full">
      <div className={`${surfaceClass} p-6 space-y-5`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.25em]">
              Pipeline
            </p>
            <h1 className="text-3xl font-semibold text-gray-900 mt-1">Active deals workspace</h1>
            <p className="text-sm text-gray-600 mt-2">
              Monitor every opportunity, shift deals between stages, and launch new work without leaving this view.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex items-center rounded-full border border-gray-200/80 bg-white/80 p-1 shadow-inner">
              <button
                onClick={() => setViewMode('kanban')}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'kanban'
                    ? 'bg-[var(--app-accent)] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'table'
                    ? 'bg-[var(--app-accent)] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <List className="w-4 h-4" />
                <span>Table</span>
              </button>
            </div>
            <button
              onClick={() => {
                setSelectedDeal(null);
                setShowModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/50 bg-[var(--app-accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(15,23,42,0.12)] transition hover:bg-[var(--app-accent-dark,#0052cc)]"
            >
              <Plus className="w-4 h-4" />
              <span>New Deal</span>
            </button>
          </div>
        </div>

        {isInitialLoading ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`pill-skeleton-${index}`} className="h-8 w-28" />
            ))}
          </div>
        ) : summaryPills.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {summaryPills.map(pill => (
              <div key={pill.label} className={`${pillClass} gap-2`}>
                <span className="text-[11px] uppercase tracking-wide text-gray-400">{pill.label}</span>
                <span className="font-semibold text-gray-900">{pill.display}</span>
              </div>
            ))}
          </div>
        )}

        {showFilterPanel && (
          <section
            className="rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.08)] p-5 space-y-5"
            aria-label="Scope filters"
          >
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                  Scope
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {scopeDescription}
                </p>
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
                    onClick={clearAllFilters}
                    className="text-xs font-semibold text-[var(--app-accent)]"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            <div className={`grid grid-cols-1 gap-4 ${showStageFilter ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
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

              {showStageFilter && (
                <div className="space-y-2">
                  <MultiSelectCombobox
                    label="Pipeline Stage"
                    options={stageOptions}
                    value={selectedStageIds}
                    onChange={setSelectedStageIds}
                    placeholder="Search stages..."
                    disabled={stageOptions.length === 0}
                  />
                </div>
              )}

              <div className="space-y-2">
                <MultiSelectCombobox
                  label="Deal Type"
                  options={dealTypeOptions}
                  value={selectedDealTypeIds}
                  onChange={(next) => setSelectedDealTypeIds(next as Deal['deal_type'][])}
                  placeholder="Search deal types..."
                  disabled={dealTypeOptions.length === 0}
                />
              </div>

              <div className="space-y-2">
                <MultiSelectCombobox
                  label="Lead Source"
                  options={leadSourceOptions}
                  value={selectedLeadSourceIds}
                  onChange={setSelectedLeadSourceIds}
                  placeholder="Search lead sources..."
                  disabled={leadSourceOptions.length === 0}
                />
              </div>
            </div>
          </section>
        )}

        {hasDashboardFilters && (
          <div className="text-xs text-gray-600">
            Dashboard filters applied:&nbsp;
            <span className="font-medium text-gray-900">
              {[
                dashboardAgentFilters.length ? `${dashboardAgentFilters.length} agent${dashboardAgentFilters.length === 1 ? '' : 's'}` : null,
                dashboardLeadSourceFilters.length ? `${dashboardLeadSourceFilters.length} lead source${dashboardLeadSourceFilters.length === 1 ? '' : 's'}` : null,
                dashboardDealTypeFilters.length ? `${dashboardDealTypeFilters.length} deal type${dashboardDealTypeFilters.length === 1 ? '' : 's'}` : null,
                dashboardStageFilters.length ? `${dashboardStageFilters.length} stage filter${dashboardStageFilters.length === 1 ? '' : 's'}` : null
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
      </div>

      {isInitialLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`pipeline-skeleton-${index}`} className={`${surfaceClass} p-4 space-y-3`}>
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 4 }).map((__, cardIndex) => (
                <Skeleton key={`pipeline-skeleton-${index}-${cardIndex}`} className="h-20 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : combinedStatuses.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Settings className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Configure Your Pipeline</h3>
            <p className="text-gray-600 mb-6">Choose a template to get started with your pipeline workflow</p>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
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
          <div className="pb-2 overflow-x-auto">
            <div className="flex gap-3 sm:gap-4 pb-4 px-2 sm:px-6 min-w-max">
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
            deals={filteredDeals}
            statuses={combinedStatuses}
            onDealClick={handleDealClick}
            calculateNetCommission={calculateNetCommission}
            getDaysInStage={getDaysInStage}
            onBulkDelete={handleBulkDelete}
            onBulkEdit={handleBulkEdit}
            onImportSuccess={loadDeals}
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
    </div>
  );
}
