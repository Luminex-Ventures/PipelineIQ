import { MarketMetricCard, MetricCardSkeleton } from './MarketMetricCard';
import type { MarketMetric } from '../../types/marketIntelligence';
import { Text } from '../../ui/Text';

interface MarketSnapshotGridProps {
  metrics: MarketMetric[] | undefined;
  loading: boolean;
  lastUpdated?: string;
}

export function MarketSnapshotGrid({
  metrics,
  loading,
  lastUpdated,
}: MarketSnapshotGridProps) {
  return (
    <div className="space-y-4">
      {lastUpdated && (
        <div className="flex justify-end">
          <Text variant="muted" className="!text-sm">
            Updated {new Date(lastUpdated).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </div>
      )}

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 transition-opacity duration-300 ${
          loading ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {loading && !metrics
          ? Array.from({ length: 10 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))
          : metrics?.map((metric, i) => (
              <MarketMetricCard key={metric.key} metric={metric} index={i} />
            ))}
      </div>
    </div>
  );
}
