import { useState } from 'react';
import { Shield, Target, Flame, FileDown } from 'lucide-react';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { generateValuationReportPdf } from '../../lib/valuationReportPdf';
import { extractZipFromAddress } from '../../lib/addressUtils';
import { fetchMarketSnapshotFromApi } from '../../services/marketIntelligenceApi';
import type { PriceEstimate, PricingStrategy, HomeEstimateInput } from '../../types/marketIntelligence';

interface EstimateResultProps {
  estimate: PriceEstimate;
  address: string;
  propertyInput: HomeEstimateInput;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const STRATEGIES: {
  key: PricingStrategy;
  label: string;
  desc: string;
  icon: typeof Shield;
  color: string;
  bg: string;
}[] = [
  {
    key: 'conservative',
    label: 'Conservative',
    desc: 'Priced to sell quickly',
    icon: Shield,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
  },
  {
    key: 'market',
    label: 'Market Aligned',
    desc: 'Fair market value',
    icon: Target,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  {
    key: 'aggressive',
    label: 'Aggressive',
    desc: 'Maximize upside',
    icon: Flame,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
  },
];

export function EstimateResult({ estimate, address, propertyInput }: EstimateResultProps) {
  const [activeStrategy, setActiveStrategy] =
    useState<PricingStrategy>('market');
  const range = estimate.high - estimate.low;
  const midPosition = range > 0 ? ((estimate.mid - estimate.low) / range) * 100 : 50;
  const comps = estimate.comps ?? [];

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const zip = extractZipFromAddress(address);
      const pricePerSqft =
        propertyInput.sqft > 0 ? Math.round(estimate.mid / propertyInput.sqft) : undefined;
      let marketSnapshot: { medianPrice?: number; daysOnMarket?: number; activeListings?: number; pricePerSqft?: number; monthsSupply?: number } = { pricePerSqft };

      if (zip) {
        try {
          const snapshot = await fetchMarketSnapshotFromApi({
            type: 'zip',
            value: zip,
            label: zip,
            timestamp: Date.now(),
          });
          const byKey: Record<string, { value: number }> = {};
          snapshot.metrics.forEach((m) => {
            byKey[m.key] = { value: m.value };
          });
          marketSnapshot = {
            medianPrice: byKey['median_price']?.value,
            daysOnMarket: byKey['dom']?.value,
            activeListings: byKey['active_listings']?.value,
            pricePerSqft: byKey['price_per_sqft']?.value ?? pricePerSqft,
            monthsSupply: byKey['months_supply']?.value,
          };
        } catch {
          // Keep pricePerSqft from subject math
        }
      }
      generateValuationReportPdf(address, estimate, propertyInput, { marketSnapshot });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Card padding="card" className="space-y-5 animate-content-in">
      {/* Price range header */}
      <div className="space-y-1">
        <Text variant="micro">Estimated Value</Text>
        <Text
          as="div"
          variant="h1"
          className="!text-3xl font-bold tracking-tight"
        >
          {fmt(estimate.mid)}
        </Text>
        <Text variant="muted">
          {fmt(estimate.low)} — {fmt(estimate.high)}
        </Text>
      </div>

      {/* Visual range slider */}
      <div className="space-y-2">
        <div className="relative h-3 rounded-full bg-gradient-to-r from-blue-100 via-emerald-100 to-amber-100 overflow-hidden">
          <div
            className="absolute top-0 h-full w-1 bg-[#1e3a5f] rounded-full shadow-sm transition-all duration-500"
            style={{ left: `${midPosition}%` }}
          />
        </div>
        <div className="flex justify-between">
          <Text variant="muted" className="!text-[11px]">
            {fmt(estimate.low)}
          </Text>
          <Text variant="muted" className="!text-[11px]">
            {fmt(estimate.high)}
          </Text>
        </div>
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
        <div className="relative h-10 w-10 flex-shrink-0">
          <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="var(--app-accent)"
              strokeWidth="3"
              strokeDasharray={`${estimate.confidence * 0.88} 88`}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#1e3a5f]">
            {estimate.confidence}%
          </span>
        </div>
        <div>
          <Text as="span" variant="body" className="font-semibold !text-sm">
            Confidence Score
          </Text>
          <Text variant="muted" className="!text-[11px]">
            Based on property details provided
          </Text>
        </div>
      </div>

      {/* Pricing strategies */}
      <div className="space-y-2">
        <Text variant="micro">Suggested Pricing</Text>
        <div className="grid grid-cols-3 gap-2">
          {STRATEGIES.map((s) => {
            const Icon = s.icon;
            const active = activeStrategy === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveStrategy(s.key)}
                className={[
                  'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all duration-200',
                  active
                    ? `${s.bg} shadow-sm`
                    : 'bg-white border-gray-200 hover:border-gray-300',
                ].join(' ')}
              >
                <Icon
                  className={`h-4 w-4 ${active ? s.color : 'text-gray-400'}`}
                  strokeWidth={2}
                />
                <span
                  className={`text-xs font-semibold ${active ? s.color : 'text-[rgba(30,58,95,0.6)]'}`}
                >
                  {s.label}
                </span>
                <span
                  className={`text-base font-bold ${active ? 'text-[#1e3a5f]' : 'text-gray-400'}`}
                >
                  {fmt(estimate.strategies[s.key])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparable sales */}
      {comps.length > 0 && (
        <div className="space-y-2">
          <Text variant="micro">Comparable Sales</Text>
          <p className="text-xs text-[rgba(30,58,95,0.65)]">
            Recent sales used to support this valuation. Use the report for listings, buyer discussions, or appraisal support.
          </p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-3 font-semibold text-[rgba(30,58,95,0.8)]">Address</th>
                    <th className="text-right py-2 px-3 font-semibold text-[rgba(30,58,95,0.8)]">Sale Price</th>
                    <th className="text-left py-2 px-3 font-semibold text-[rgba(30,58,95,0.8)]">Date</th>
                    <th className="text-center py-2 px-2 font-semibold text-[rgba(30,58,95,0.8)]">Beds</th>
                    <th className="text-center py-2 px-2 font-semibold text-[rgba(30,58,95,0.8)]">Baths</th>
                    <th className="text-right py-2 px-3 font-semibold text-[rgba(30,58,95,0.8)]">Sq Ft</th>
                    {comps.some((c) => c.distance != null) && (
                      <th className="text-right py-2 px-3 font-semibold text-[rgba(30,58,95,0.8)]">Dist</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {comps.map((c, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2 px-3 text-[#1e3a5f]">{c.address}</td>
                      <td className="py-2 px-3 text-right font-medium">{fmt(c.salePrice)}</td>
                      <td className="py-2 px-3 text-gray-600">{c.saleDate}</td>
                      <td className="py-2 px-2 text-center">{c.beds}</td>
                      <td className="py-2 px-2 text-center">{c.baths}</td>
                      <td className="py-2 px-3 text-right">{c.sqft.toLocaleString()}</td>
                      {comps.some((co) => co.distance != null) && (
                        <td className="py-2 px-3 text-right text-gray-600">
                          {c.distance != null ? `${c.distance} mi` : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PDF report */}
      <div className="pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--app-accent)] text-[var(--app-accent)] font-semibold text-sm hover:bg-[var(--app-accent)]/5 transition-colors disabled:opacity-60"
        >
          {pdfLoading ? (
            <>
              <div className="h-4 w-4 border-2 border-[var(--app-accent)]/30 border-t-[var(--app-accent)] rounded-full animate-spin" />
              Loading market data…
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4" />
              Download PDF Report
            </>
          )}
        </button>
        <p className="text-[10px] text-gray-500 mt-1.5 text-center">
          Use for listing appointments, buyer expectations, or to support an appraisal.
        </p>
      </div>
    </Card>
  );
}
