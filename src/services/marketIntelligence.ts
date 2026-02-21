import type {
  AreaSelection,
  MarketSnapshot,
  MarketMetric,
  HomeEstimateInput,
  PriceEstimate,
  ValuationComp,
  MarketInsight,
} from '../types/marketIntelligence';
import {
  fetchMarketSnapshotFromApi,
  estimateHomeValueFromApi,
} from './marketIntelligenceApi';

const STORAGE_KEY = 'luma-iq-recent-areas';
const MAX_RECENT = 8;

// ---------------------------------------------------------------------------
// Area persistence (localStorage for MVP)
// ---------------------------------------------------------------------------

export function getRecentAreas(): AreaSelection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AreaSelection[]) : [];
  } catch {
    return [];
  }
}

export function saveAreaSelection(area: AreaSelection): void {
  const existing = getRecentAreas().filter(
    (a) => !(a.type === area.type && a.value === area.value),
  );
  const updated = [{ ...area, timestamp: Date.now() }, ...existing].slice(
    0,
    MAX_RECENT,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getLastSelectedArea(): AreaSelection | null {
  const recent = getRecentAreas();
  return recent.length > 0 ? recent[0] : null;
}

// ---------------------------------------------------------------------------
// Deterministic seed from area to keep numbers stable per region
// ---------------------------------------------------------------------------

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// ---------------------------------------------------------------------------
// Mock market data generator
// ---------------------------------------------------------------------------

function generateMetrics(area: AreaSelection): MarketMetric[] {
  const rand = seededRandom(hashCode(`${area.type}:${area.value}`));
  const r = (min: number, max: number) =>
    Math.round(min + rand() * (max - min));
  const pct = () => Math.round((rand() * 20 - 10) * 10) / 10;

  const fmt = (n: number, prefix = '$') =>
    n >= 1_000_000
      ? `${prefix}${(n / 1_000_000).toFixed(2)}M`
      : `${prefix}${n.toLocaleString()}`;

  const medianPrice = r(280_000, 850_000);
  const avgPrice = Math.round(medianPrice * (0.95 + rand() * 0.15));
  const dom = r(14, 90);
  const active = r(120, 1_800);
  const newListings = r(30, 400);
  const closedSales = r(25, 350);
  const priceReductions = r(5, Math.round(active * 0.35));
  const listToSale = Math.round((94 + rand() * 6) * 100) / 100;
  const monthsSupply = Math.round((active / Math.max(closedSales, 1)) * 10) / 10;
  const pending = r(40, 600);
  const pendingActiveRatio =
    Math.round((pending / Math.max(active, 1)) * 100) / 100;

  const metric = (
    key: string,
    label: string,
    value: number,
    formattedValue: string,
    timeWindow: string,
  ): MarketMetric => {
    const tp = pct();
    return {
      key,
      label,
      value,
      formattedValue,
      trendPercent: Math.abs(tp),
      trendDirection: tp > 1 ? 'up' : tp < -1 ? 'down' : 'flat',
      timeWindow,
    };
  };

  return [
    metric('median_price', 'Median Home Price', medianPrice, fmt(medianPrice), 'Last 90 days'),
    metric('avg_price', 'Average Home Price', avgPrice, fmt(avgPrice), 'Last 90 days'),
    metric('dom', 'Days on Market', dom, `${dom}`, 'Avg last 30 days'),
    metric('active_listings', 'Active Listings', active, active.toLocaleString(), 'Current'),
    metric('new_listings', 'New Listings', newListings, newListings.toLocaleString(), 'Last 30 days'),
    metric('closed_sales', 'Closed Sales', closedSales, closedSales.toLocaleString(), 'Last 30 days'),
    metric('price_reductions', 'Price Reductions', priceReductions, priceReductions.toLocaleString(), 'Last 30 days'),
    metric('list_to_sale', 'List-to-Sale Ratio', listToSale, `${listToSale}%`, 'Last 90 days'),
    metric('months_supply', 'Months of Supply', monthsSupply, `${monthsSupply}`, 'Current'),
    metric('pending_active', 'Pending vs Active', pendingActiveRatio, `${pendingActiveRatio}`, 'Current'),
  ];
}

export async function fetchMarketSnapshot(
  area: AreaSelection,
): Promise<MarketSnapshot> {
  try {
    return await fetchMarketSnapshotFromApi(area);
  } catch (err) {
    console.warn('[marketIntelligence] Edge Function unavailable, using mock:', err);
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
    return {
      area,
      metrics: generateMetrics(area),
      lastUpdated: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Home value estimator (synthetic pricing logic)
// ---------------------------------------------------------------------------

const CONDITION_MULTIPLIER: Record<string, number> = {
  excellent: 1.12,
  good: 1.0,
  fair: 0.92,
  needs_work: 0.82,
  fixer_upper: 0.7,
};

const RENOVATION_BUMP: Record<string, number> = {
  kitchen: 0.06,
  bathrooms: 0.04,
  roof: 0.03,
  hvac: 0.02,
  windows: 0.02,
  flooring: 0.02,
  landscaping: 0.015,
  addition: 0.08,
};

/** Mock comparable sales for fallback estimate (when API is unavailable). */
function buildMockComps(midPrice: number, subjectAddress: string): ValuationComp[] {
  const streetNum = (hashCode(subjectAddress) % 4000) + 100;
  const baseStreet = subjectAddress.split(',')[0]?.trim().replace(/^\d+\s*/, '') || 'Main St';
  const pct = (n: number) => Math.round(midPrice * n);
  const monthsAgo = (m: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    return d.toISOString().slice(0, 10);
  };
  return [
    { address: `${streetNum + 2} ${baseStreet}`, salePrice: pct(0.97), saleDate: monthsAgo(1), beds: 3, baths: 2, sqft: 1750, distance: 0.2 },
    { address: `${streetNum + 4} ${baseStreet}`, salePrice: pct(1.02), saleDate: monthsAgo(2), beds: 4, baths: 2.5, sqft: 1900, distance: 0.3 },
    { address: `${streetNum - 2} ${baseStreet}`, salePrice: pct(0.94), saleDate: monthsAgo(3), beds: 3, baths: 2, sqft: 1680, distance: 0.15 },
    { address: `${streetNum + 10} ${baseStreet}`, salePrice: pct(1.05), saleDate: monthsAgo(1), beds: 4, baths: 3, sqft: 2100, distance: 0.5 },
    { address: `${streetNum - 6} ${baseStreet}`, salePrice: pct(0.99), saleDate: monthsAgo(4), beds: 3, baths: 2, sqft: 1820, distance: 0.35 },
  ];
}

export async function estimateHomeValue(
  input: HomeEstimateInput,
): Promise<PriceEstimate> {
  try {
    return await estimateHomeValueFromApi(input);
  } catch (err) {
    console.warn('[marketIntelligence] Edge Function unavailable, using mock:', err);
  }

  await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

  const basePSF = 180 + hashCode(input.address) % 120;
  let base = basePSF * input.sqft;

  base *= CONDITION_MULTIPLIER[input.condition] ?? 1;
  const age = new Date().getFullYear() - input.yearBuilt;
  base *= age < 5 ? 1.08 : age < 15 ? 1.0 : age < 30 ? 0.95 : 0.88;
  base += (input.beds - 3) * 15_000;
  base += (input.baths - 2) * 12_000;

  let renovationBoost = 0;
  for (const r of input.renovations) {
    renovationBoost += RENOVATION_BUMP[r] ?? 0;
  }
  base *= 1 + renovationBoost;

  const mid = Math.round(base / 1000) * 1000;
  const spread = 0.06 + Math.random() * 0.04;
  const low = Math.round(mid * (1 - spread));
  const high = Math.round(mid * (1 + spread));

  const renovationCount = input.renovations.length;
  const confidence = Math.min(
    95,
    65 + renovationCount * 3 + (input.sqft > 0 ? 5 : 0) + (input.yearBuilt > 1900 ? 5 : 0),
  );

  return {
    low,
    mid,
    high,
    confidence,
    strategies: {
      conservative: Math.round(mid * 0.96),
      market: mid,
      aggressive: Math.round(mid * 1.04),
    },
    comps: buildMockComps(mid, input.address),
  };
}

// ---------------------------------------------------------------------------
// Luma Market Insights (rule-based from mock metrics)
// ---------------------------------------------------------------------------

export function generateInsights(metrics: MarketMetric[]): MarketInsight[] {
  const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]));
  const insights: MarketInsight[] = [];
  let id = 0;
  const push = (text: string, type: MarketInsight['type']) =>
    insights.push({ id: String(++id), text, type, timestamp: new Date().toISOString() });

  const dom = byKey['dom'];
  if (dom) {
    if (dom.value < 30) {
      push(
        `Properties are moving fast with an average of ${dom.value} days on market. This signals strong buyer demand.`,
        'bullish',
      );
    } else if (dom.value > 60) {
      push(
        `Homes are sitting for ${dom.value} days on average. Buyers may have increased leverage in negotiations.`,
        'bearish',
      );
    }
  }

  const monthsSupply = byKey['months_supply'];
  if (monthsSupply) {
    if (monthsSupply.value < 3) {
      push(
        `With only ${monthsSupply.value} months of supply, this is a strong seller's market. Low inventory favors listing now.`,
        'bullish',
      );
    } else if (monthsSupply.value > 6) {
      push(
        `At ${monthsSupply.value} months of supply, buyers have options. Consider competitive pricing strategies.`,
        'bearish',
      );
    } else {
      push(
        `The market is balanced at ${monthsSupply.value} months of supply. Both buyers and sellers have fair footing.`,
        'neutral',
      );
    }
  }

  const listToSale = byKey['list_to_sale'];
  if (listToSale && listToSale.value >= 98) {
    push(
      `Sellers are getting ${listToSale.formattedValue} of asking price on average — a sign of strong demand.`,
      'bullish',
    );
  } else if (listToSale && listToSale.value < 95) {
    push(
      `List-to-sale ratio is ${listToSale.formattedValue}. Price reductions may be necessary to attract offers.`,
      'bearish',
    );
  }

  const newListings = byKey['new_listings'];
  const closedSales = byKey['closed_sales'];
  if (newListings && closedSales) {
    if (newListings.value > closedSales.value * 1.3) {
      push(
        `New listings outpace closed sales. Inventory is building — great time for buyers to explore.`,
        'bearish',
      );
    } else if (closedSales.value > newListings.value) {
      push(
        'Closings are outpacing new listings, shrinking inventory. This is a strong time to list.',
        'bullish',
      );
    }
  }

  const priceReductions = byKey['price_reductions'];
  const active = byKey['active_listings'];
  if (priceReductions && active && active.value > 0) {
    const reductionRate = priceReductions.value / active.value;
    if (reductionRate > 0.25) {
      push(
        `${Math.round(reductionRate * 100)}% of active listings have had price reductions. Sellers may be overpricing initially.`,
        'tip',
      );
    }
  }

  const medianPrice = byKey['median_price'];
  if (medianPrice && medianPrice.trendDirection === 'up' && medianPrice.trendPercent > 3) {
    push(
      `Median prices are trending up ${medianPrice.trendPercent}%. Appreciation is working in sellers' favor.`,
      'bullish',
    );
  }

  if (insights.length < 3) {
    push(
      'Market conditions look stable. Keep monitoring for shifts in inventory and demand.',
      'neutral',
    );
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Area search options (mock catalog)
// ---------------------------------------------------------------------------

export interface AreaOption {
  type: AreaSelection['type'];
  value: string;
  label: string;
}

const MOCK_AREAS: AreaOption[] = [
  { type: 'zip', value: '90210', label: '90210 — Beverly Hills, CA' },
  { type: 'zip', value: '10001', label: '10001 — New York, NY' },
  { type: 'zip', value: '33139', label: '33139 — Miami Beach, FL' },
  { type: 'zip', value: '78701', label: '78701 — Austin, TX' },
  { type: 'zip', value: '85001', label: '85001 — Phoenix, AZ' },
  { type: 'zip', value: '30301', label: '30301 — Atlanta, GA' },
  { type: 'zip', value: '94102', label: '94102 — San Francisco, CA' },
  { type: 'zip', value: '60601', label: '60601 — Chicago, IL' },
  { type: 'zip', value: '98101', label: '98101 — Seattle, WA' },
  { type: 'zip', value: '80202', label: '80202 — Denver, CO' },
  { type: 'city', value: 'beverly-hills-ca', label: 'Beverly Hills, CA' },
  { type: 'city', value: 'miami-fl', label: 'Miami, FL' },
  { type: 'city', value: 'austin-tx', label: 'Austin, TX' },
  { type: 'city', value: 'phoenix-az', label: 'Phoenix, AZ' },
  { type: 'city', value: 'nashville-tn', label: 'Nashville, TN' },
  { type: 'city', value: 'denver-co', label: 'Denver, CO' },
  { type: 'city', value: 'seattle-wa', label: 'Seattle, WA' },
  { type: 'city', value: 'portland-or', label: 'Portland, OR' },
  { type: 'county', value: 'los-angeles-ca', label: 'Los Angeles County, CA' },
  { type: 'county', value: 'miami-dade-fl', label: 'Miami-Dade County, FL' },
  { type: 'county', value: 'travis-tx', label: 'Travis County, TX' },
  { type: 'county', value: 'maricopa-az', label: 'Maricopa County, AZ' },
  { type: 'county', value: 'king-wa', label: 'King County, WA' },
  { type: 'state', value: 'CA', label: 'California' },
  { type: 'state', value: 'FL', label: 'Florida' },
  { type: 'state', value: 'TX', label: 'Texas' },
  { type: 'state', value: 'AZ', label: 'Arizona' },
  { type: 'state', value: 'NY', label: 'New York' },
  { type: 'state', value: 'CO', label: 'Colorado' },
  { type: 'state', value: 'WA', label: 'Washington' },
];

const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const US_STATE_ABBREV = /^[A-Za-z]{2}$/;

/** Parse "City, ST" or "City  ST" into { city, state } for ATTOM lookup. */
function parseCityState(input: string): { city: string; state: string } | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 4) return null;
  const parts = trimmed.split(/[,]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const state = parts[parts.length - 1].toUpperCase();
    const city = parts.slice(0, -1).join(', ');
    if (US_STATE_ABBREV.test(state) && city.length >= 2) {
      return { city, state };
    }
  }
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 2 && US_STATE_ABBREV.test(tokens[tokens.length - 1])) {
    const state = tokens[tokens.length - 1].toUpperCase();
    const city = tokens.slice(0, -1).join(' ');
    return { city, state };
  }
  return null;
}

function slugifyCityState(city: string, state: string): string {
  const c = city.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `${c}-${state.toLowerCase()}`;
}

function labelCityState(city: string, state: string): string {
  const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  return `${cap(city)}, ${state.toUpperCase()}`;
}

export async function searchAreas(query: string): Promise<AreaOption[]> {
  await new Promise((r) => setTimeout(r, 120));
  const trimmed = query.trim();
  if (!trimmed) return MOCK_AREAS.slice(0, 10);

  const q = trimmed.toLowerCase();
  const matches = MOCK_AREAS.filter(
    (a) =>
      a.label.toLowerCase().includes(q) || a.value.toLowerCase().includes(q),
  ).slice(0, 12);

  // Zip: if user typed a 5-digit (or 9-digit) zip not in the list, offer it for ATTOM
  const zipOnly = trimmed.replace(/\s/g, '');
  if (US_ZIP_REGEX.test(zipOnly)) {
    const inList = matches.some((a) => a.type === 'zip' && a.value === zipOnly.slice(0, 5));
    if (!inList) {
      return [{ type: 'zip', value: zipOnly.slice(0, 5), label: zipOnly.slice(0, 5) }, ...matches];
    }
    return matches;
  }

  // City and state: e.g. "Springfield, VA" or "Austin TX" — offer as one option for ATTOM
  const parsed = parseCityState(trimmed);
  if (parsed) {
    const value = slugifyCityState(parsed.city, parsed.state);
    const label = labelCityState(parsed.city, parsed.state);
    const inList = matches.some(
      (a) => a.type === 'city' && (a.value === value || a.label.toLowerCase() === label.toLowerCase()),
    );
    if (!inList) {
      return [{ type: 'city', value, label }, ...matches];
    }
  }

  return matches;
}
