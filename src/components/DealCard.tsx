import { TrendingUp, Clock, Phone, Mail } from 'lucide-react';
import type { Database } from '../lib/database.types';

type Deal = Database['public']['Tables']['deals']['Row'] & {
  lead_sources?: Database['public']['Tables']['lead_sources']['Row'] | null;
};

interface DealCardProps {
  deal: Deal;
  netCommission: number;
  daysInStage: number;
  onClick: () => void;
  isDragging?: boolean;
}

const DEAL_TYPE_COLORS: Record<string, string> = {
  buyer: '#60a5fa',
  seller: '#34d399',
  buyer_and_seller: '#a78bfa',
  renter: '#fb923c',
  landlord: '#2dd4bf'
};

export default function DealCard({ deal, netCommission, daysInStage, onClick, isDragging = false }: DealCardProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);

  const dealTypeColor = DEAL_TYPE_COLORS[deal.deal_type] || '#94a3b8';

  return (
    <div
      onClick={onClick}
      data-deal-id={deal.id}
      className={`group rounded-[3px] bg-white cursor-pointer transition-all duration-100 ${
        isDragging
          ? 'opacity-60 rotate-[2deg] shadow-[0_8px_16px_rgba(9,30,66,0.25)]'
          : 'shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.13)] hover:bg-[#f4f5f7]'
      }`}
    >
      {/* Deal type left accent */}
      <div className="flex">
        <div
          className="w-[3px] flex-shrink-0 rounded-l-[3px]"
          style={{ backgroundColor: dealTypeColor }}
        />
        <div className="flex-1 min-w-0 p-2.5">
          {/* Name - Address */}
          <div className="flex items-center gap-1 text-[13px] leading-tight mb-1.5 min-w-0">
            <span className="font-medium text-[#172b4d] flex-shrink-0">{deal.client_name}</span>
            {deal.property_address && (
              <>
                <span className="text-[#a5adba] flex-shrink-0">–</span>
                <span className="text-[#6b778c] truncate">{deal.property_address}</span>
              </>
            )}
          </div>

          {/* Phone */}
          {deal.client_phone && (
            <a
              href={`tel:${deal.client_phone}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-[#6b778c] hover:text-[#172b4d] transition-colors mb-0.5"
            >
              <Phone className="w-2.5 h-2.5 text-[#a5adba] flex-shrink-0" />
              <span className="truncate">{deal.client_phone}</span>
            </a>
          )}

          {/* Email */}
          {deal.client_email && (
            <a
              href={`mailto:${deal.client_email}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-[#6b778c] hover:text-[#172b4d] transition-colors mb-0.5"
            >
              <Mail className="w-2.5 h-2.5 text-[#a5adba] flex-shrink-0" />
              <span className="truncate">{deal.client_email}</span>
            </a>
          )}

          {/* Spacer before price row */}
          <div className="mb-1" />

          {/* Price + Commission row */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold text-[#172b4d]">
              {formatCurrency(deal.actual_sale_price || deal.expected_sale_price)}
            </span>
            <span className="text-[12px] font-semibold text-emerald-600">
              {formatCurrency(netCommission)}
            </span>
          </div>

          {/* Bottom meta row */}
          <div className="flex items-center justify-between text-[11px] text-[#a5adba]">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{daysInStage}d</span>
              {daysInStage >= 70 && <span className="h-1.5 w-1.5 rounded-full bg-orange-400 ml-0.5" />}
            </div>

            <div className="flex items-center gap-2">
              {deal.lead_sources && (
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  <span className="truncate max-w-[80px]">{deal.lead_sources.name}</span>
                </div>
              )}
              {deal.close_date && (
                <span className="text-[#6b778c]">
                  {(() => {
                    const [year, month, day] = deal.close_date.split('-').map(Number);
                    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    });
                  })()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
