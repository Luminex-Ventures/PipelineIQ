import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, RotateCcw, Lightbulb } from 'lucide-react';
import { ui } from '../../ui/tokens';
import { Text } from '../../ui/Text';
import type { MarketMetric } from '../../types/marketIntelligence';

interface MarketMetricCardProps {
  metric: MarketMetric;
  index: number;
}

/** Insight text shown on the back of each card when flipped. */
const METRIC_INSIGHTS: Record<string, string> = {
  median_price: 'Middle sale price in this area — half of homes sold for more, half for less. A key benchmark for pricing.',
  avg_price: 'Average sale price. Can be pulled up by a few very high-priced sales; median is often more representative.',
  dom: 'How long listings typically sit before selling. Lower means a faster-moving market.',
  active_listings: 'Homes currently for sale in the area. More listings usually means more choices and sometimes softer prices.',
  new_listings: 'New listings added in the last 30 days. Shows how much fresh inventory is coming onto the market.',
  closed_sales: 'Number of homes that sold in the last 30 days. Indicates sales velocity and buyer activity.',
  price_reductions: 'Listings that had a price cut. High numbers can signal overpricing or a cooling market.',
  list_to_sale: 'Final sale price as % of list price. Near 100% means sellers are getting close to asking.',
  months_supply: 'How long current inventory would last at recent sales pace. Under 6 often favors sellers; over 6 favors buyers.',
  pending_active: 'Ratio of pending sales to active listings. Higher means strong demand relative to supply.',
};

const TREND_STYLES = {
  up: {
    icon: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  down: {
    icon: TrendingDown,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
  },
  flat: {
    icon: Minus,
    color: 'text-gray-400',
    bg: 'bg-gray-50',
  },
} as const;

const AUTO_RETURN_MS = 5000;

export function MarketMetricCard({ metric, index }: MarketMetricCardProps) {
  const [flipped, setFlipped] = useState(false);
  const trend = TREND_STYLES[metric.trendDirection];
  const TrendIcon = trend.icon;
  const insight = METRIC_INSIGHTS[metric.key] ?? metric.label;

  useEffect(() => {
    if (!flipped) return;
    const t = window.setTimeout(() => setFlipped(false), AUTO_RETURN_MS);
    return () => clearTimeout(t);
  }, [flipped]);

  return (
    <div
      className={[
        'flip-card relative min-h-[120px] cursor-pointer select-none overflow-hidden',
        ui.radius.card,
        ui.border.card,
        ui.shadow.card,
        'hover:shadow-md hover:border-[rgba(var(--app-accent-rgb),0.2)]',
        'transition-[box-shadow,border-color] duration-200',
      ].join(' ')}
      style={{
        perspective: '800px',
        animationDelay: `${index * 40}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <div
        className="flip-card-inner relative w-full h-full min-h-[120px] transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        aria-label={flipped ? `Show ${metric.label} value` : `Show insight for ${metric.label}`}
      >
        {/* Front: metric */}
        <div
          className={`flip-card-front absolute inset-0 p-4 flex flex-col justify-between ${ui.radius.card} bg-white/90`}
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <div className="flex items-start justify-between gap-2">
            <Text
              as="span"
              variant="micro"
              className="!text-[10px] text-[rgba(30,58,95,0.55)] leading-tight"
            >
              {metric.label}
            </Text>
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${trend.bg} flex-shrink-0`}
            >
              <TrendIcon className={`h-3 w-3 ${trend.color}`} strokeWidth={2.5} />
              <span className={`text-[10px] font-semibold ${trend.color}`}>
                {metric.trendPercent}%
              </span>
            </div>
          </div>
          <Text
            as="div"
            variant="h2"
            className="!text-[22px] font-bold tracking-tight"
          >
            {metric.formattedValue}
          </Text>
          <div className="flex items-center justify-between">
            <Text as="span" variant="muted" className="!text-[11px]">
              {metric.timeWindow}
            </Text>
            <span className="flex items-center gap-1 text-[10px] text-[rgba(30,58,95,0.5)]">
              <Lightbulb className="h-3 w-3" /> Click for insight
            </span>
          </div>
        </div>

        {/* Back: insight */}
        <div
          className={`flip-card-back absolute inset-0 pt-0 px-3 pb-3 flex flex-col min-h-0 ${ui.radius.card} bg-[#1e3a5f] text-white`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div className="text-white/80 mb-0 shrink-0">
            <Text as="span" variant="micro" className="!text-[10px] uppercase tracking-wider font-semibold">
              {metric.label}
            </Text>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <Text as="p" className="!text-sm leading-snug text-white/95 pb-2">
              {insight}
            </Text>
          </div>
          <div className="flex justify-end mt-2 shrink-0">
            <span className="flex items-center gap-1 text-[10px] text-white/70">
              <RotateCcw className="h-3 w-3" /> Click to return
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div
      className={[
        ui.radius.card,
        ui.border.subtle,
        'bg-white/60 p-4 animate-pulse',
      ].join(' ')}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="h-3 w-24 bg-gray-100 rounded" />
          <div className="h-5 w-12 bg-gray-100 rounded-full" />
        </div>
        <div className="h-7 w-28 bg-gray-100 rounded-lg" />
        <div className="h-3 w-20 bg-gray-50 rounded" />
      </div>
    </div>
  );
}
