import { useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Home, TrendingUp, Calendar, DollarSign, Clock, Trash2, Edit3, Search, Upload, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { getColorByName } from '../lib/colors';
import type { Database } from '../lib/database.types';
import ImportDealsModal from './ImportDealsModal';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const formatCurrencyValue = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return currencyFormatter.format(value);
};

const formatPercentValue = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatDateDisplay = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatStatusLabel = (value?: string | null) => {
  if (!value) return '—';
  return value
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

type Deal = Database['public']['Tables']['deals']['Row'] & {
  lead_sources?: Database['public']['Tables']['lead_sources']['Row'] | null;
  pipeline_statuses?: Database['public']['Tables']['pipeline_statuses']['Row'] | null;
};

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];

type ColumnId =
  | 'client'
  | 'clientEmail'
  | 'clientPhone'
  | 'property'
  | 'city'
  | 'state'
  | 'zip'
  | 'dealType'
  | 'pipelineStatus'
  | 'status'
  | 'leadSource'
  | 'expectedPrice'
  | 'actualPrice'
  | 'netCommission'
  | 'grossCommissionRate'
  | 'brokerageSplitRate'
  | 'referralOutRate'
  | 'referralInRate'
  | 'transactionFee'
  | 'daysInStage'
  | 'stageEnteredAt'
  | 'closeDate'
  | 'closedAt'
  | 'nextTaskDescription'
  | 'nextTaskDueDate'
  | 'createdAt'
  | 'updatedAt';

interface ColumnRenderProps {
  deal: Deal;
  onDealClick: (deal: Deal) => void;
  calculateNetCommission: (deal: Deal) => number;
  getDaysInStage: (stageEnteredAt: string) => number;
  getStatusForDeal: (deal: Deal) => PipelineStatus | undefined;
}

interface ColumnConfig {
  id: ColumnId;
  label: string;
  defaultVisible?: boolean;
  headerClassName?: string;
  cellClassName?: string;
  disableClick?: boolean;
  render: (props: ColumnRenderProps) => ReactNode;
}

const COLUMN_DEFINITIONS: ColumnConfig[] = [
  {
    id: 'client',
    label: 'Client',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 align-top whitespace-nowrap cursor-pointer',
    render: ({ deal }) => (
      <div>
        <div className="text-sm font-medium text-gray-900">{deal.client_name || '—'}</div>
        {deal.client_email && <div className="text-xs text-gray-500">{deal.client_email}</div>}
        {deal.client_phone && <div className="text-xs text-gray-500">{deal.client_phone}</div>}
      </div>
    )
  },
  {
    id: 'clientEmail',
    label: 'Client Email',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm cursor-pointer',
    render: ({ deal }) => (
      <span className={deal.client_email ? 'text-gray-700' : 'text-gray-400'}>
        {deal.client_email || '—'}
      </span>
    )
  },
  {
    id: 'clientPhone',
    label: 'Client Phone',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm cursor-pointer',
    render: ({ deal }) => (
      <span className={deal.client_phone ? 'text-gray-700' : 'text-gray-400'}>
        {deal.client_phone || '—'}
      </span>
    )
  },
  {
    id: 'property',
    label: 'Property',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 text-sm text-gray-900 cursor-pointer min-w-[220px]',
    render: ({ deal }) => (
      <div className="flex items-start gap-2">
        <Home className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <div>
          <div>{deal.property_address || '—'}</div>
          {(deal.city || deal.state) && (
            <div className="text-xs text-gray-500">
              {[deal.city, deal.state].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>
    )
  },
  {
    id: 'city',
    label: 'City',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm cursor-pointer',
    render: ({ deal }) => (
      <span className={deal.city ? 'text-gray-700' : 'text-gray-400'}>{deal.city || '—'}</span>
    )
  },
  {
    id: 'state',
    label: 'State',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm cursor-pointer',
    render: ({ deal }) => (
      <span className={deal.state ? 'text-gray-700' : 'text-gray-400'}>{deal.state || '—'}</span>
    )
  },
  {
    id: 'zip',
    label: 'ZIP',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm cursor-pointer',
    render: ({ deal }) => (
      <span className={deal.zip ? 'text-gray-700' : 'text-gray-400'}>{deal.zip || '—'}</span>
    )
  },
  {
    id: 'dealType',
    label: 'Deal Type',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 whitespace-nowrap cursor-pointer',
    render: ({ deal }) => {
      const badgeClasses =
        deal.deal_type === 'buyer'
          ? 'bg-blue-100 text-blue-700'
          : deal.deal_type === 'seller'
            ? 'bg-green-100 text-green-700'
            : deal.deal_type === 'buyer_and_seller'
              ? 'bg-purple-100 text-purple-700'
              : deal.deal_type === 'renter'
                ? 'bg-orange-100 text-orange-700'
                : deal.deal_type === 'landlord'
                  ? 'bg-teal-100 text-teal-700'
                  : 'bg-gray-100 text-gray-700';

      const label =
        deal.deal_type === 'buyer'
          ? 'Buyer'
          : deal.deal_type === 'seller'
            ? 'Seller'
            : deal.deal_type === 'buyer_and_seller'
              ? 'Both'
              : deal.deal_type === 'renter'
                ? 'Renter'
                : deal.deal_type === 'landlord'
                  ? 'Landlord'
                  : formatStatusLabel(deal.deal_type);

      return (
        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeClasses}`}>
          {label}
        </span>
      );
    }
  },
  {
    id: 'pipelineStatus',
    label: 'Pipeline Status',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 whitespace-nowrap cursor-pointer',
    render: ({ deal, getStatusForDeal }) => {
      const status = getStatusForDeal(deal);
      if (!status) {
        return (
          <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-700">
            No Status
          </span>
        );
      }
      const statusColor = getColorByName(status.color);
      return (
        <span
          className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
          style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
        >
          {status.name}
        </span>
      );
    }
  },
  {
    id: 'status',
    label: 'System Status',
    cellClassName: 'px-4 py-4 whitespace-nowrap cursor-pointer',
    render: ({ deal }) => (
      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-700">
        {formatStatusLabel(deal.status)}
      </span>
    )
  },
  {
    id: 'leadSource',
    label: 'Lead Source',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm cursor-pointer',
    render: ({ deal }) => (
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-gray-400" />
        <span className={deal.lead_sources?.name ? 'text-gray-900' : 'text-gray-400'}>
          {deal.lead_sources?.name || '—'}
        </span>
      </div>
    )
  },
  {
    id: 'expectedPrice',
    label: 'Expected Price',
    defaultVisible: true,
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer text-right',
    render: ({ deal }) => (
      <span>{formatCurrencyValue(deal.actual_sale_price || deal.expected_sale_price)}</span>
    )
  },
  {
    id: 'actualPrice',
    label: 'Actual Price',
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer text-right',
    render: ({ deal }) => <span>{formatCurrencyValue(deal.actual_sale_price)}</span>
  },
  {
    id: 'netCommission',
    label: 'Net Commission',
    defaultVisible: true,
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm font-semibold text-green-600 cursor-pointer text-right',
    render: ({ deal, calculateNetCommission }) => (
      <span>{formatCurrencyValue(calculateNetCommission(deal))}</span>
    )
  },
  {
    id: 'grossCommissionRate',
    label: 'Commission %',
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer text-right',
    render: ({ deal }) => <span>{formatPercentValue(deal.gross_commission_rate)}</span>
  },
  {
    id: 'brokerageSplitRate',
    label: 'Broker Split %',
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer text-right',
    render: ({ deal }) => <span>{formatPercentValue(deal.brokerage_split_rate)}</span>
  },
  {
    id: 'referralOutRate',
    label: 'Referral Out %',
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer text-right',
    render: ({ deal }) => <span>{formatPercentValue(deal.referral_out_rate)}</span>
  },
  {
    id: 'referralInRate',
    label: 'Referral In %',
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer text-right',
    render: ({ deal }) => <span>{formatPercentValue(deal.referral_in_rate)}</span>
  },
  {
    id: 'transactionFee',
    label: 'Transaction Fee',
    headerClassName: 'text-right',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-900 cursor-pointer text-right',
    render: ({ deal }) => <span>{formatCurrencyValue(deal.transaction_fee)}</span>
  },
  {
    id: 'daysInStage',
    label: 'Days in Stage',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer',
    render: ({ deal, getDaysInStage }) => (
      <div className="flex items-center justify-start gap-2">
        <Clock className="w-4 h-4 text-gray-400" />
        <span>{getDaysInStage(deal.stage_entered_at)} days</span>
      </div>
    )
  },
  {
    id: 'stageEnteredAt',
    label: 'Stage Entered',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer',
    render: ({ deal }) => <span>{formatDateDisplay(deal.stage_entered_at)}</span>
  },
  {
    id: 'closeDate',
    label: 'Close Date',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer',
    render: ({ deal }) => <span>{formatDateDisplay(deal.close_date)}</span>
  },
  {
    id: 'closedAt',
    label: 'Closed On',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer',
    render: ({ deal }) => <span>{formatDateDisplay(deal.closed_at)}</span>
  },
  {
    id: 'nextTaskDescription',
    label: 'Next Task',
    cellClassName: 'px-4 py-4 text-sm text-gray-700 cursor-pointer min-w-[200px]',
    render: ({ deal }) => (
      <span className={deal.next_task_description ? 'text-gray-700' : 'text-gray-400'}>
        {deal.next_task_description || '—'}
      </span>
    )
  },
  {
    id: 'nextTaskDueDate',
    label: 'Next Task Due',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer',
    render: ({ deal }) => <span>{formatDateDisplay(deal.next_task_due_date)}</span>
  },
  {
    id: 'createdAt',
    label: 'Created',
    defaultVisible: true,
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer',
    render: ({ deal }) => (
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400" />
        <span>{formatDateDisplay(deal.created_at)}</span>
      </div>
    )
  },
  {
    id: 'updatedAt',
    label: 'Updated',
    cellClassName: 'px-4 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer',
    render: ({ deal }) => <span>{formatDateDisplay(deal.updated_at)}</span>
  }
];

const COLUMN_STORAGE_KEY = 'pipeline-table-columns-v1';
const COLUMN_ID_SET = new Set<ColumnId>(COLUMN_DEFINITIONS.map(column => column.id));
const COLUMN_ORDER = new Map<ColumnId, number>(COLUMN_DEFINITIONS.map((column, index) => [column.id, index]));
const DEFAULT_VISIBLE_COLUMNS = COLUMN_DEFINITIONS
  .filter(column => column.defaultVisible)
  .map(column => column.id);

const sortColumns = (ids: ColumnId[]) =>
  [...ids].sort((a, b) => (COLUMN_ORDER.get(a) ?? 0) - (COLUMN_ORDER.get(b) ?? 0));

interface PipelineTableProps {
  deals: Deal[];
  statuses: PipelineStatus[];
  onDealClick: (deal: Deal) => void;
  calculateNetCommission: (deal: Deal) => number;
  getDaysInStage: (stageEnteredAt: string) => number;
  onBulkDelete?: (dealIds: string[]) => void;
  onBulkEdit?: (dealIds: string[], updates: Partial<Deal>) => void;
  onImportSuccess?: () => void;
}

export default function PipelineTable({
  deals,
  statuses,
  onDealClick,
  calculateNetCommission,
  getDaysInStage,
  onBulkDelete,
  onBulkEdit,
  onImportSuccess
}: PipelineTableProps) {
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkStatusId, setBulkStatusId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ column: ColumnId | 'pipelineOrder'; direction: 'asc' | 'desc' }>({
    column: 'pipelineOrder',
    direction: 'asc'
  });
  const [visibleColumnIds, setVisibleColumnIds] = useState<ColumnId[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
    try {
      const stored = window.localStorage.getItem(COLUMN_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnId[];
        const filtered = parsed.filter(id => COLUMN_ID_SET.has(id));
        if (filtered.length > 0) {
          return sortColumns(filtered as ColumnId[]);
        }
      }
    } catch {
      // ignore invalid storage values
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumnIds));
  }, [visibleColumnIds]);

  const toggleColumnVisibility = (columnId: ColumnId) => {
    setVisibleColumnIds(prev => {
      if (prev.includes(columnId)) {
        if (prev.length === 1) {
          return prev; // keep at least one column visible
        }
        return prev.filter(id => id !== columnId);
      }
      return sortColumns([...prev, columnId]);
    });
  };

  const selectAllColumns = () => setVisibleColumnIds(sortColumns(Array.from(COLUMN_ID_SET)));
  const resetColumns = () => setVisibleColumnIds(DEFAULT_VISIBLE_COLUMNS);

  const visibleColumns = COLUMN_DEFINITIONS.filter(column => visibleColumnIds.includes(column.id));
  const columnCount = visibleColumns.length + 1; // +1 for checkbox column

  const toggleDealSelection = (dealId: string) => {
    const newSelection = new Set(selectedDeals);
    if (newSelection.has(dealId)) {
      newSelection.delete(dealId);
    } else {
      newSelection.add(dealId);
    }
    setSelectedDeals(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedDeals.size === sortedDeals.length) {
      setSelectedDeals(new Set());
    } else {
      setSelectedDeals(new Set(sortedDeals.map(d => d.id)));
    }
  };

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedDeals.size > 0) {
      onBulkDelete(Array.from(selectedDeals));
      setSelectedDeals(new Set());
    }
  };

  const handleBulkStatusUpdate = () => {
    if (onBulkEdit && selectedDeals.size > 0 && bulkStatusId) {
      onBulkEdit(Array.from(selectedDeals), { pipeline_status_id: bulkStatusId });
      setSelectedDeals(new Set());
      setShowBulkActions(false);
      setBulkStatusId('');
    }
  };

  const statusOrderMap = useMemo(() => new Map(statuses.map((s, idx) => [s.id, idx])), [statuses]);

  const getStatusForDeal = (deal: Deal) => {
    return statuses.find(s => s.id === deal.pipeline_status_id);
  };

  const filteredAndSortedDeals = useMemo(() => {
    let filtered = deals;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matches = (value?: string | null) =>
        value ? value.toLowerCase().includes(query) : false;

      filtered = filtered.filter(deal =>
        matches(deal.client_name) ||
        matches(deal.property_address) ||
        matches(deal.city) ||
        matches(deal.state) ||
        matches(deal.client_email) ||
        matches(deal.client_phone) ||
        matches(deal.lead_sources?.name)
      );
    }

    const getDaysInStageValue = (deal: Deal) => {
      if (!deal.stage_entered_at) return null;
      const entered = new Date(deal.stage_entered_at).getTime();
      if (Number.isNaN(entered)) return null;
      return Date.now() - entered;
    };

    const getSortValue = (deal: Deal, column: ColumnId | 'pipelineOrder') => {
      const stringValue = (value?: string | null) => {
        if (!value) return null;
        return value.toLowerCase();
      };

      switch (column) {
        case 'pipelineOrder': {
          return statusOrderMap.get(deal.pipeline_status_id || '') ?? 9999;
        }
        case 'client':
          return stringValue(deal.client_name);
        case 'clientEmail':
          return stringValue(deal.client_email);
        case 'clientPhone':
          return stringValue(deal.client_phone);
        case 'property':
          return stringValue(deal.property_address);
        case 'city':
          return stringValue(deal.city);
        case 'state':
          return stringValue(deal.state);
        case 'zip':
          return stringValue(deal.zip);
        case 'dealType':
          return stringValue(deal.deal_type);
        case 'pipelineStatus':
          return statusOrderMap.get(deal.pipeline_status_id || '') ?? 9999;
        case 'status':
          return stringValue(deal.status);
        case 'leadSource':
          return stringValue(deal.lead_sources?.name || deal.lead_source_name);
        case 'expectedPrice':
          return deal.expected_sale_price ?? null;
        case 'actualPrice':
          return deal.actual_sale_price ?? null;
        case 'netCommission':
          return calculateNetCommission(deal);
        case 'grossCommissionRate':
          return deal.gross_commission_rate ?? null;
        case 'brokerageSplitRate':
          return deal.brokerage_split_rate ?? null;
        case 'referralOutRate':
          return deal.referral_out_rate ?? null;
        case 'referralInRate':
          return deal.referral_in_rate ?? null;
        case 'transactionFee':
          return deal.transaction_fee ?? null;
        case 'daysInStage':
          return getDaysInStageValue(deal);
        case 'stageEnteredAt':
          return deal.stage_entered_at ? new Date(deal.stage_entered_at).getTime() : null;
        case 'closeDate':
          return deal.close_date ? new Date(deal.close_date).getTime() : null;
        case 'closedAt':
          return deal.closed_at ? new Date(deal.closed_at).getTime() : null;
        case 'nextTaskDueDate':
          return deal.next_task_due_date ? new Date(deal.next_task_due_date).getTime() : null;
        case 'nextTaskDescription':
          return stringValue(deal.next_task_description);
        case 'createdAt':
          return deal.created_at ? new Date(deal.created_at).getTime() : null;
        case 'updatedAt':
          return deal.updated_at ? new Date(deal.updated_at).getTime() : null;
        default:
          return stringValue((deal as any)[column]);
      }
    };

    const compareValues = (aValue: any, bValue: any) => {
      if (aValue === null || aValue === undefined) {
        return bValue === null || bValue === undefined ? 0 : 1;
      }
      if (bValue === null || bValue === undefined) {
        return -1;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return aValue - bValue;
      }

      return String(aValue).localeCompare(String(bValue));
    };

    const sorter = [...filtered].sort((a, b) => {
      const column = sortConfig.column;
      const aValue = getSortValue(a, column);
      const bValue = getSortValue(b, column);
      const baseComparison = compareValues(aValue, bValue);

      if (baseComparison !== 0) {
        return baseComparison * (sortConfig.direction === 'asc' ? 1 : -1);
      }

      // fallback to created date (newest first)
      const fallback = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortConfig.direction === 'asc' ? fallback : -fallback;
    });

    return sorter;
  }, [deals, searchQuery, sortConfig, statusOrderMap, calculateNetCommission]);

  const sortedDeals = filteredAndSortedDeals;

  const resolvedSortColumnId = sortConfig.column === 'pipelineOrder' ? 'pipelineStatus' : sortConfig.column;

  const handleColumnSort = (columnId: ColumnId) => {
    const targetColumn = columnId === 'pipelineStatus' ? 'pipelineOrder' : columnId;
    setSortConfig(prev => {
      if (prev.column === targetColumn) {
        return {
          column: targetColumn,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        column: targetColumn,
        direction: 'asc'
      };
    });
  };

  const renderSortIndicator = (columnId: ColumnId) => {
    const isActive =
      resolvedSortColumnId === columnId ||
      (sortConfig.column === 'pipelineOrder' && columnId === 'pipelineStatus');
    if (!isActive) {
      return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    }
    return (
      <span className="text-[11px] font-semibold text-gray-500">
        {sortConfig.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client, property, city, or lead source..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowColumnManager(value => !value)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Columns</span>
              <span className="sm:hidden">Cols</span>
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[rgb(0,122,255)] hover:bg-[rgb(0,110,230)] text-white rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import Deals</span>
              <span className="sm:hidden">Import</span>
            </button>
          </div>
        </div>
        {showColumnManager && (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Visible Columns ({visibleColumnIds.length} of {COLUMN_DEFINITIONS.length})</p>
                <p className="text-xs text-gray-500">Choose which deal fields appear in the table.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllColumns}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-white"
                >
                  Select All
                </button>
                <button
                  onClick={resetColumns}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-white"
                >
                  Reset Defaults
                </button>
                <button
                  onClick={() => setShowColumnManager(false)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600"
                >
                  Done
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {COLUMN_DEFINITIONS.map(column => (
                <label
                  key={column.id}
                  className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumnIds.includes(column.id)}
                    onChange={() => toggleColumnVisibility(column.id)}
                    className="text-blue-600 rounded"
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedDeals.size > 0 && (
        <div className="bg-sky-50 border-b border-sky-200 px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-medium text-sky-900">
            {selectedDeals.size} deal{selectedDeals.size > 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkActions(!showBulkActions)}
              className="px-3 py-1.5 bg-white border border-sky-300 text-sky-700 rounded-lg hover:bg-sky-50 transition flex items-center gap-2 text-sm"
            >
              <Edit3 className="w-4 h-4" />
              Update Status
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      {showBulkActions && selectedDeals.size > 0 && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Update status to:</label>
          <select
            value={bulkStatusId}
            onChange={(e) => setBulkStatusId(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
          >
            <option value="">Select status...</option>
            {statuses.map(status => (
              <option key={status.id} value={status.id}>{status.name}</option>
            ))}
          </select>
          <button
            onClick={handleBulkStatusUpdate}
            disabled={!bulkStatusId}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setShowBulkActions(false);
              setBulkStatusId('');
            }}
            className="px-4 py-1.5 text-gray-600 hover:text-gray-800 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={sortedDeals.length > 0 && selectedDeals.size === sortedDeals.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer"
                />
              </th>
              {visibleColumns.map(column => (
                <th
                  key={column.id}
                  scope="col"
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${column.headerClassName || ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleColumnSort(column.id)}
                    className="flex items-center gap-1 text-left uppercase tracking-wider text-[11px]"
                  >
                    <span>{column.label}</span>
                    {renderSortIndicator(column.id)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedDeals.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-8 text-center text-sm text-gray-500">
                  No deals yet. Create your first deal to get started!
                </td>
              </tr>
            ) : (
              sortedDeals.map(deal => (
                <tr key={deal.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedDeals.has(deal.id)}
                      onChange={() => toggleDealSelection(deal.id)}
                      className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer"
                    />
                  </td>
                  {visibleColumns.map(column => (
                    <td
                      key={column.id}
                      className={column.cellClassName || 'px-4 py-4 text-sm text-gray-900 cursor-pointer'}
                      onClick={() => !column.disableClick && onDealClick(deal)}
                    >
                      {column.render({
                        deal,
                        onDealClick,
                        calculateNetCommission,
                        getDaysInStage,
                        getStatusForDeal
                      })}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showImportModal && (
        <ImportDealsModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            onImportSuccess?.();
          }}
        />
      )}
    </div>
  );
}
