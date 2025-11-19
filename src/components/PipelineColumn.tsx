import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DealCard from './DealCard';
import { getColorByName } from '../lib/colors';
import type { Database } from '../lib/database.types';

type Deal = Database['public']['Tables']['deals']['Row'] & {
  lead_sources?: Database['public']['Tables']['lead_sources']['Row'] | null;
};

const DEAL_TYPE_ORDER: Deal['deal_type'][] = ['buyer', 'seller', 'buyer_and_seller', 'renter', 'landlord'];

const DEAL_TYPE_META: Record<
  Deal['deal_type'],
  { label: string; accentDot: string; labelClass: string; panelBg: string; panelBorder: string }
> = {
  buyer: {
    label: 'Buyer',
    accentDot: 'bg-blue-400',
    labelClass: 'text-blue-900',
    panelBg: 'bg-blue-50/60',
    panelBorder: 'border-blue-100'
  },
  seller: {
    label: 'Seller',
    accentDot: 'bg-emerald-400',
    labelClass: 'text-emerald-900',
    panelBg: 'bg-emerald-50/60',
    panelBorder: 'border-emerald-100'
  },
  buyer_and_seller: {
    label: 'Buyer & Seller',
    accentDot: 'bg-purple-400',
    labelClass: 'text-purple-900',
    panelBg: 'bg-purple-50/60',
    panelBorder: 'border-purple-100'
  },
  renter: {
    label: 'Renter',
    accentDot: 'bg-orange-400',
    labelClass: 'text-orange-900',
    panelBg: 'bg-orange-50/60',
    panelBorder: 'border-orange-100'
  },
  landlord: {
    label: 'Landlord',
    accentDot: 'bg-teal-400',
    labelClass: 'text-teal-900',
    panelBg: 'bg-teal-50/60',
    panelBorder: 'border-teal-100'
  }
};

interface SortableDealCardProps {
  deal: Deal;
  onDealClick: (deal: Deal) => void;
  calculateNetCommission: (deal: Deal) => number;
  getDaysInStage: (stageEnteredAt: string) => number;
}

interface PipelineColumnProps {
  status: string;
  label: string;
  color: string | null;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
  calculateNetCommission: (deal: Deal) => number;
  getDaysInStage: (stageEnteredAt: string) => number;
}

export default function PipelineColumn({
  status,
  label,
  color,
  deals,
  onDealClick,
  calculateNetCommission,
  getDaysInStage
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status
  });

  const statusColor = getColorByName(color);
  const dealTypeGroups = DEAL_TYPE_ORDER
    .map(type => ({
      type,
      label: DEAL_TYPE_META[type].label,
      accentDot: DEAL_TYPE_META[type].accentDot,
      labelClass: DEAL_TYPE_META[type].labelClass,
      deals: deals.filter(deal => deal.deal_type === type),
      panelBg: DEAL_TYPE_META[type].panelBg,
      panelBorder: DEAL_TYPE_META[type].panelBorder
    }))
    .filter(group => group.deals.length > 0);

  return (
    <div className="flex-shrink-0 w-72 sm:w-80 flex flex-col">
      <div
        className="rounded-lg p-2.5 sm:p-3 mb-2 sm:mb-3 flex-shrink-0"
        style={{
          backgroundColor: statusColor.bg,
          color: statusColor.text
        }}
      >
        <h3 className="font-semibold text-sm sm:text-base">{label}</h3>
        <span className="text-xs sm:text-sm opacity-80">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[600px] rounded-lg p-3 transition overflow-y-auto ${
          isOver ? 'bg-blue-50 ring-2 ring-blue-400' : 'bg-gray-50'
        }`}
        style={{ minHeight: '600px' }}
      >
        {deals.length === 0 ? (
          <div className="h-full min-h-[560px] flex items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="text-sm font-medium mb-1">Drop deals here</div>
              <div className="text-xs">Drag cards to this column</div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {dealTypeGroups.map((group, index) => (
              <div
                key={group.type}
                className={`rounded-2xl border px-3 py-3 sm:px-4 sm:py-4 ${group.panelBg} ${group.panelBorder} ${
                  index > 0 ? 'mt-1' : ''
                }`}
              >
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${group.accentDot}`} />
                    <span className={`text-xs font-semibold ${group.labelClass}`}>
                      {group.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-gray-400">
                    {group.deals.length} deal{group.deals.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <SortableContext items={group.deals.map(deal => deal.id)} strategy={verticalListSortingStrategy}>
                  <div className="mt-3 space-y-2 sm:space-y-3">
                    {group.deals.map(deal => (
                      <SortableDealCard
                        key={deal.id}
                        deal={deal}
                        onDealClick={onDealClick}
                        calculateNetCommission={calculateNetCommission}
                        getDaysInStage={getDaysInStage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableDealCard({
  deal,
  onDealClick,
  calculateNetCommission,
  getDaysInStage
}: SortableDealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: {
      type: 'deal'
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DealCard
        deal={deal}
        netCommission={calculateNetCommission(deal)}
        daysInStage={getDaysInStage(deal.stage_entered_at)}
        onClick={() => onDealClick(deal)}
        isDragging={isDragging}
      />
    </div>
  );
}
