import { Sparkles, TrendingUp, TrendingDown, Minus, Lightbulb } from 'lucide-react';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import type { MarketInsight } from '../../types/marketIntelligence';

interface LumaInsightsPanelProps {
  insights: MarketInsight[];
  loading: boolean;
}

const INSIGHT_STYLES = {
  bullish: {
    icon: TrendingUp,
    accent: 'border-l-emerald-400',
    iconColor: 'text-emerald-500',
    bg: 'bg-emerald-50/50',
  },
  bearish: {
    icon: TrendingDown,
    accent: 'border-l-rose-400',
    iconColor: 'text-rose-400',
    bg: 'bg-rose-50/50',
  },
  neutral: {
    icon: Minus,
    accent: 'border-l-gray-300',
    iconColor: 'text-gray-400',
    bg: 'bg-gray-50/50',
  },
  tip: {
    icon: Lightbulb,
    accent: 'border-l-amber-400',
    iconColor: 'text-amber-500',
    bg: 'bg-amber-50/50',
  },
} as const;

function InsightCard({
  insight,
  index,
}: {
  insight: MarketInsight;
  index: number;
}) {
  const style = INSIGHT_STYLES[insight.type];
  const Icon = style.icon;

  return (
    <div
      className={[
        'flex gap-3 p-4 rounded-xl border border-gray-100',
        style.bg,
        'border-l-[3px]',
        style.accent,
        'animate-content-in',
      ].join(' ')}
      style={{
        animationDelay: `${index * 80}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <div className="flex-shrink-0 pt-0.5">
        <Icon className={`h-4 w-4 ${style.iconColor}`} strokeWidth={2} />
      </div>
      <Text as="p" variant="body" className="!text-[14px] leading-relaxed text-[rgba(30,58,95,0.85)]">
        {insight.text}
      </Text>
    </div>
  );
}

function InsightSkeleton() {
  return (
    <div className="flex gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50/30 animate-pulse">
      <div className="h-4 w-4 rounded bg-gray-100 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-full bg-gray-100 rounded" />
        <div className="h-3.5 w-3/4 bg-gray-100/70 rounded" />
      </div>
    </div>
  );
}

export function LumaInsightsPanel({ insights, loading }: LumaInsightsPanelProps) {
  return (
    <div
      className={[
          ui.radius.card,
          ui.border.card,
          ui.shadow.card,
          'bg-white/90 p-5',
      ].join(' ')}
    >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <InsightSkeleton key={i} />
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="h-8 w-8 text-[rgba(30,58,95,0.2)] mx-auto mb-3" />
            <Text variant="muted">
              Select an area to generate market insights
            </Text>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <InsightCard key={insight.id} insight={insight} index={i} />
            ))}
          </div>
        )}
    </div>
  );
}
