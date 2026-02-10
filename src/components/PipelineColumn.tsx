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

const DEAL_TYPE_META: Record<Deal['deal_type'], { label: string; dot: string }> = {
  buyer: { label: 'Buyer', dot: '#60a5fa' },
  seller: { label: 'Seller', dot: '#34d399' },
  buyer_and_seller: { label: 'Buyer & Seller', dot: '#a78bfa' },
  renter: { label: 'Renter', dot: '#fb923c' },
  landlord: { label: 'Landlord', dot: '#2dd4bf' }
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
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const statusColor = getColorByName(color);
  const totalExpected = deals.reduce((sum, deal) => {
    const value = deal.actual_sale_price || deal.expected_sale_price || 0;
    return sum + value;
  }, 0);
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);

  const dealTypeGroups = DEAL_TYPE_ORDER
    .map(type => ({
      type,
      meta: DEAL_TYPE_META[type],
      deals: deals.filter(deal => deal.deal_type === type)
    }))
    .filter(group => group.deals.length > 0);

  return (
    <div className="flex flex-col rounded-lg overflow-hidden min-w-0">
      {/* Colored accent bar */}
      <div className="h-[3px] flex-shrink-0" style={{ backgroundColor: statusColor.bg }} />

      {/* Column header */}
      <div className="bg-[#f4f5f7] px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[13px] font-semibold text-[#42526e] uppercase tracking-wide truncate">{label}</h3>
          <span className="flex-shrink-0 bg-[#dfe1e6] text-[#42526e] text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
            {deals.length}
          </span>
        </div>
        <span className="text-[11px] text-[#6b778c] font-medium flex-shrink-0 ml-2">
          {formatCurrency(totalExpected)}
        </span>
      </div>

      {/* Card area */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[480px] bg-[#f4f5f7] px-1.5 pb-2 transition-colors duration-150 ${
          isOver ? 'bg-[#e4f0ff]' : ''
        }`}
      >
        {deals.length === 0 ? (
          <div className="h-full min-h-[480px] flex items-center justify-center">
            <div className="text-center text-[#b3bac5]">
              <div className="text-[13px] font-medium mb-0.5">Drop deals here</div>
              <div className="text-[11px]">Drag cards to this column</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {dealTypeGroups.map(group => (
              <div key={group.type}>
                {/* Deal type sub-label */}
                {dealTypeGroups.length > 1 && (
                  <div className="flex items-center gap-1.5 px-1 mb-1.5">
                    <span
                      className="h-2 w-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: group.meta.dot }}
                    />
                    <span className="text-[11px] font-semibold text-[#6b778c] uppercase tracking-wider">
                      {group.meta.label}
                    </span>
                    <span className="text-[11px] text-[#a5adba]">{group.deals.length}</span>
                  </div>
                )}
                <SortableContext items={group.deals.map(deal => deal.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
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
    data: { type: 'deal' }
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
