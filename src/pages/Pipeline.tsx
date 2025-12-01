import { useEffect, useMemo, useState, useCallback } from 'react';
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
import { usePipelineStatuses } from '../hooks/usePipelineStatuses';
import { getVisibleUserIds } from '../lib/rbac';
import type { Database } from '../lib/database.types';

type Deal = Database['public']['Tables']['deals']['Row'] & {
  lead_sources?: Database['public']['Tables']['lead_sources']['Row'] | null;
  pipeline_statuses?: Database['public']['Tables']['pipeline_statuses']['Row'] | null;
};

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];

type ViewMode = 'kanban' | 'table';

const surfaceClass = 'rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.08)]';
const pillClass =
  'inline-flex items-center rounded-full border border-gray-200/70 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition';
const filterPillBaseClass =
  'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition';
const DEAL_TYPE_FILTER_ORDER: Deal['deal_type'][] = ['buyer', 'seller', 'buyer_and_seller', 'renter', 'landlord'];
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
  const [dealTypeFilter, setDealTypeFilter] = useState<'all' | Deal['deal_type']>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingNewDeal = searchParams.get('newDeal');
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
    loadDeals();
  }, [user, roleInfo]);

  useEffect(() => {
    if (pendingNewDeal) {
      setSelectedDeal(null);
      setShowModal(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('newDeal');
      setSearchParams(nextParams, { replace: true });
    }
  }, [pendingNewDeal, searchParams, setSearchParams]);

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
        .select('*')
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

  const loadDeals = async () => {
    if (!user || !roleInfo) return;

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
        return (data || []).map(member => member.user_id);
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

      let query = supabase
        .from('deals')
        .select(`
          *,
          lead_sources (*),
          pipeline_statuses (*)
        `)
        .order('created_at', { ascending: false });

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading deals', error);
        setDeals([]);
      } else {
        const currentYear = new Date().getFullYear();
        const filtered = (data || []).filter(deal => {
          if (deal.status !== 'closed') return true;
          const closedDate = deal.close_date || deal.closed_at;
          if (!closedDate) return false;
          const year = new Date(closedDate).getFullYear();
          return year >= currentYear; // keep current year and future closures; drop past years
        });
        setDeals(filtered);
      }
    } catch (err) {
      console.error('Error resolving visible users', err);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  };

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

    const updates: any = {
      pipeline_status_id: potentialStatusId,
      // fall back to name if slug is null
      status: (newStatus.slug || newStatus.name || '').toLowerCase() as any,
      stage_entered_at: new Date().toISOString()
    };

    // Check if new status is a "closed" type (robust to null slug)
    const closedMatchSource =
      typeof newStatus.slug === 'string' && newStatus.slug.length > 0
        ? newStatus.slug.toLowerCase()
        : (newStatus.name || '').toLowerCase();

    if (closedMatchSource.includes('closed')) {
      updates.closed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', dealId);

    if (!error) {
      loadDeals();
    }
  };

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedDeal(null);
    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.has('dealId')) {
      nextParams.delete('dealId');
      setSearchParams(nextParams, { replace: true });
    }
    loadDeals();
  };

  const filteredDeals = (
    dealTypeFilter === 'all'
      ? deals
      : deals.filter(deal => DEAL_TYPE_FILTER_META[dealTypeFilter].matches.includes(deal.deal_type))
  ).filter(deal => deal.status !== 'dead');

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
    const updateData: any = {};

    if (updates.pipeline_status_id) {
      updateData.pipeline_status_id = updates.pipeline_status_id;
      updateData.stage_entered_at = new Date().toISOString();

      const newStatus = combinedStatuses.find(s => s.id === updates.pipeline_status_id);
      if (newStatus?.name.toLowerCase() === 'closed') {
        updateData.status = 'closed';
        updateData.closed_at = new Date().toISOString();
      } else if (newStatus?.name.toLowerCase() === 'dead') {
        updateData.status = 'dead';
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

  if (loading || statusesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-full">
      <div className={`${surfaceClass} p-6 space-y-4`}>
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

        {summaryPills.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {summaryPills.map(pill => (
              <div key={pill.label} className={`${pillClass} gap-2`}>
                <span className="text-[11px] uppercase tracking-wide text-gray-400">{pill.label}</span>
                <span className="font-semibold text-gray-900">{pill.display}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
              Deal types
            </span>
            {dealTypeFilter !== 'all' && (
              <button
                onClick={() => setDealTypeFilter('all')}
                className="text-xs font-medium text-[var(--app-accent)] hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDealTypeFilter('all')}
              className={`${filterPillBaseClass} ${
                dealTypeFilter === 'all'
                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                  : 'border-gray-200/70 bg-white text-gray-600 hover:text-gray-900'
              }`}
            >
              All deals
            </button>
            {DEAL_TYPE_FILTER_ORDER.map(optionValue => {
              const meta = DEAL_TYPE_FILTER_META[optionValue];
              const isActive = dealTypeFilter === optionValue;
              return (
                <button
                  key={optionValue}
                  onClick={() => setDealTypeFilter(optionValue)}
                  className={`${filterPillBaseClass} ${
                    isActive
                      ? `${meta.accentClass} shadow-sm ring-1 ring-black/5`
                      : 'border-gray-200/70 bg-white text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {combinedStatuses.length === 0 ? (
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
          onClose={handleModalClose}
          onDelete={handleModalClose}
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
