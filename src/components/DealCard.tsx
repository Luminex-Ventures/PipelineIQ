import { Home, TrendingUp, Clock } from 'lucide-react';
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

export default function DealCard({ deal, netCommission, daysInStage, onClick, isDragging = false }: DealCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div
      onClick={onClick}
      data-deal-id={deal.id}
      className={`rounded-xl border border-gray-200/70 bg-white p-3 shadow-[0_4px_10px_rgba(15,23,42,0.06)] cursor-move transition-transform duration-200 ${
        isDragging ? 'opacity-60' : 'hover:-translate-y-0.5'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h4 className="font-semibold text-gray-900 text-sm">{deal.client_name}</h4>
          <div className="flex items-center text-xs text-gray-500">
            <Home className="w-3.5 h-3.5 mr-1 text-gray-400" />
            <span className="truncate">{deal.property_address}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">Expected</span>
          <div className="text-sm font-semibold text-gray-900">
            {formatCurrency(deal.actual_sale_price || deal.expected_sale_price)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span className="truncate">
          {deal.deal_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          {daysInStage >= 70 && <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />}
          <Clock className="w-3.5 h-3.5 text-gray-300" />
          <span>{daysInStage}d in stage</span>
        </div>
        {deal.lead_sources ? (
          <div className="flex items-center gap-1 justify-end">
            <TrendingUp className="w-3.5 h-3.5 text-gray-300" />
            <span className="truncate">{deal.lead_sources.name}</span>
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Net Commission</div>
          <div className="text-sm font-semibold text-emerald-700">
            {formatCurrency(netCommission)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Close Date</div>
          <div className="text-sm font-medium text-gray-500">
            {deal.close_date
              ? (() => {
                  const [year, month, day] = deal.close_date.split('-').map(Number);
                  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  });
                })()
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
