import { PageShell } from '../ui/PageShell';
import { PageHeader } from '../ui/PageHeader';
import { Text } from '../ui/Text';
import { ui } from '../ui/tokens';
import { AreaSelector } from '../components/market-intelligence/AreaSelector';
import { AreaMap } from '../components/market-intelligence/AreaMap';
import { MarketSnapshotGrid } from '../components/market-intelligence/MarketSnapshotGrid';
import { LumaInsightsPanel } from '../components/market-intelligence/LumaInsightsPanel';
import {
  useAreaSelection,
  useMarketSnapshot,
  useMarketInsights,
} from '../hooks/useMarketIntelligence';

export default function MarketIntelligence() {
  const { area, selectArea } = useAreaSelection();
  const { data: snapshot, isLoading } = useMarketSnapshot(area);
  const insights = useMarketInsights(snapshot?.metrics);

  const headerTitle = (
    <PageHeader
      label="Market Intelligence"
      title="Understand market conditions in your area"
      subtitle="Select an area for a market snapshot and Luma insights."
    />
  );

  return (
    <PageShell title={headerTitle} actions={<AreaSelector selected={area} onSelect={selectArea} />}>
      <div className="space-y-6 animate-fade-in">
        <section>
          <Text as="span" variant="micro" className={ui.tone.subtle}>
            MARKET SNAPSHOT
          </Text>
          <div className="mt-2">
            <MarketSnapshotGrid
              metrics={snapshot?.metrics}
              loading={isLoading}
              lastUpdated={snapshot?.lastUpdated}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Text as="span" variant="micro" className={ui.tone.subtle}>
              LUMA INSIGHTS
            </Text>
            <div className="mt-2">
              <LumaInsightsPanel insights={insights} loading={isLoading} />
            </div>
          </div>
          <div className="lg:col-span-1 min-w-0">
            <Text as="span" variant="micro" className={ui.tone.subtle}>
              AREA MAP
            </Text>
            <div className="mt-2">
              <AreaMap area={area} className="w-full max-w-[280px]" />
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
