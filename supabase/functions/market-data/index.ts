/**
 * Market Intelligence data endpoint.
 *
 * ATTOM (when ATTOM_API_KEY is set):
 *   - Snapshot: resolves area to geoIdV4 via /v4/location/lookup, then fetches
 *     /v4/transaction/salestrend for median/avg price and sale count. Metrics
 *     ATTOM doesn't provide (e.g. DOM, active listings) are filled with mock.
 *   - Estimate: calls /propertyapi/v1.0.0/attomavm/detail by address and maps
 *     AVM value + confidence to our PriceEstimate shape.
 *
 * REAL_ESTATE_API_URL (alternative): proxy to your backend; see comment block below.
 *
 * MOCK (default): if neither ATTOM nor REAL_ESTATE_API_URL is set, returns mock data.
 *
 * Env: ATTOM_API_KEY, REAL_ESTATE_API_URL, REAL_ESTATE_API_KEY
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ATTOM_API_KEY = Deno.env.get('ATTOM_API_KEY');
const REAL_ESTATE_API_URL = Deno.env.get('REAL_ESTATE_API_URL');
const REAL_ESTATE_API_KEY = Deno.env.get('REAL_ESTATE_API_KEY');

const ATTOM_GATEWAY = 'https://api.gateway.attomdata.com';
const ATTOM_PROPERTY_API = `${ATTOM_GATEWAY}/propertyapi/v1.0.0`;

// ----- Inline types matching frontend -----
type AreaType = 'zip' | 'city' | 'county' | 'state';
interface AreaSelection {
  type: AreaType;
  value: string;
  label: string;
  timestamp?: number;
}
interface MarketMetric {
  key: string;
  label: string;
  value: number;
  formattedValue: string;
  trendPercent: number;
  trendDirection: 'up' | 'down' | 'flat';
  timeWindow: string;
}
interface MarketSnapshot {
  area: AreaSelection;
  metrics: MarketMetric[];
  lastUpdated: string;
}
interface HomeEstimateInput {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  condition: string;
  renovations: string[];
}
interface ValuationComp {
  address: string;
  salePrice: number;
  saleDate: string;
  beds: number;
  baths: number;
  sqft: number;
  distance?: number;
}
interface PriceEstimate {
  low: number;
  mid: number;
  high: number;
  confidence: number;
  strategies: { conservative: number; market: number; aggressive: number };
  comps?: ValuationComp[];
}

interface PropertyDetailResponse {
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  prefilled: true;
}

type RequestBody =
  | { type: 'snapshot'; area: AreaSelection }
  | { type: 'estimate'; input: HomeEstimateInput }
  | { type: 'property_detail'; address: string };

function attomHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    apikey: ATTOM_API_KEY!,
  };
}

const GEO_TYPE: Record<AreaType, string> = {
  zip: 'ZI',
  city: 'CI',
  county: 'CO',
  state: 'ST',
};

/** Resolve area to ATTOM geoIdV4 via v4 location lookup. */
async function attomResolveGeoIdV4(area: AreaSelection): Promise<string | null> {
  const geoType = GEO_TYPE[area.type];
  const name = area.type === 'zip' ? area.value : area.label;
  const url = `${ATTOM_GATEWAY}/v4/location/lookup?name=${encodeURIComponent(name)}&geographyTypeAbbreviation=${geoType}`;
  const res = await fetch(url, { headers: attomHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data?.property ?? data?.data ?? data?.result?.package?.item ?? (Array.isArray(data) ? data : []);
  const first = Array.isArray(items) ? items[0] : items;
  const geoIdV4 =
    first?.geoIdV4 ?? first?.geoidv4 ?? first?.geography?.geoIdV4 ?? first?.id ?? null;
  return typeof geoIdV4 === 'string' ? geoIdV4 : null;
}

/** Fetch sales trend from ATTOM v4 transaction/salestrend. */
async function attomSalesTrend(geoIdV4: string): Promise<{
  medSalePrice?: number;
  avgSalePrice?: number;
  homeSaleCount?: number;
  prevMedSalePrice?: number;
} | null> {
  const endYear = new Date().getFullYear();
  const startYear = endYear - 1;
  const url = `${ATTOM_GATEWAY}/v4/transaction/salestrend?geoIdV4=${encodeURIComponent(geoIdV4)}&interval=quarterly&startyear=${startYear}&endyear=${endYear}`;
  const res = await fetch(url, { headers: attomHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const trends = data?.salesTrends ?? data?.property ?? (Array.isArray(data) ? data : []);
  const arr = Array.isArray(trends) ? trends : [trends];
  const latest = arr[arr.length - 1];
  const prev = arr.length >= 2 ? arr[arr.length - 2] : null;
  const trend = latest?.salesTrend ?? latest?.SalesTrend ?? latest;
  const prevTrend = prev?.salesTrend ?? prev?.SalesTrend ?? prev;
  return {
    medSalePrice: trend?.medSalePrice ?? trend?.medsaleprice ?? trend?.MEDIAN_PRICE,
    avgSalePrice: trend?.avgSalePrice ?? trend?.avgsaleprice ?? trend?.AVERAGE_PRICE,
    homeSaleCount: trend?.homeSaleCount ?? trend?.homesalecount ?? trend?.homeSaleCount,
    prevMedSalePrice: prevTrend?.medSalePrice ?? prevTrend?.medsaleprice ?? prevTrend?.MEDIAN_PRICE,
  };
}

function metric(
  key: string,
  label: string,
  value: number,
  formattedValue: string,
  timeWindow: string,
  trendPercent = 0,
  trendDirection: 'up' | 'down' | 'flat' = 'flat'
): MarketMetric {
  return {
    key,
    label,
    value,
    formattedValue,
    trendPercent: Math.abs(trendPercent),
    trendDirection,
    timeWindow,
  };
}

function fmtPrice(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Number(n).toLocaleString()}`;
}

/** Build market snapshot from ATTOM sales trend + mock for missing metrics. */
function buildSnapshotFromAttom(
  area: AreaSelection,
  trend: { medSalePrice?: number; avgSalePrice?: number; homeSaleCount?: number; prevMedSalePrice?: number } | null
): MarketSnapshot {
  const med = trend?.medSalePrice ?? 0;
  const avg = trend?.avgSalePrice ?? med;
  const closedSales = Math.round(trend?.homeSaleCount ?? 0);
  const prevMed = trend?.prevMedSalePrice;
  const trendPct = med && prevMed ? ((med - prevMed) / prevMed) * 100 : 0;
  const trendDir: 'up' | 'down' | 'flat' = trendPct > 1 ? 'up' : trendPct < -1 ? 'down' : 'flat';

  const metrics: MarketMetric[] = [
    metric('median_price', 'Median Home Price', med, med ? fmtPrice(med) : '—', 'Last 90 days', trendPct, trendDir),
    metric('avg_price', 'Average Home Price', avg, avg ? fmtPrice(avg) : '—', 'Last 90 days', trendPct, trendDir),
    metric('dom', 'Days on Market', 0, '—', 'Avg last 30 days'),
    metric('active_listings', 'Active Listings', 0, '—', 'Current'),
    metric('new_listings', 'New Listings', 0, '—', 'Last 30 days'),
    metric('closed_sales', 'Closed Sales', closedSales, closedSales.toLocaleString(), 'Last 30 days'),
    metric('price_reductions', 'Price Reductions', 0, '—', 'Last 30 days'),
    metric('list_to_sale', 'List-to-Sale Ratio', 0, '—', 'Last 90 days'),
    metric('months_supply', 'Months of Supply', 0, '—', 'Current'),
    metric('pending_active', 'Pending vs Active', 0, '—', 'Current'),
  ];

  return {
    area: { ...area, timestamp: area.timestamp ?? Date.now() },
    metrics,
    lastUpdated: new Date().toISOString(),
  };
}

/** Fetch AVM by address and map to PriceEstimate. */
async function attomAVMByAddress(address: string): Promise<PriceEstimate | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const params = new URLSearchParams();
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((s) => s.trim());
    params.set('address1', parts[0] ?? '');
    params.set('address2', parts.slice(1).join(', ') || '');
  } else {
    params.set('address', trimmed);
  }
  const url = `${ATTOM_PROPERTY_API}/attomavm/detail?${params.toString()}`;
  const res = await fetch(url, { headers: attomHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const props = data?.property ?? data?.attomavm ?? (Array.isArray(data) ? data : [data]);
  const first = Array.isArray(props) ? props[0] : props;
  const amount = first?.amount ?? first?.avm?.amount ?? first?.avm ?? first;
  const value = amount?.value ?? amount?.avmValue ?? amount?.amount ?? first?.avmValue;
  const scr = amount?.scr ?? first?.scr ?? 0;
  if (value == null || typeof value !== 'number') return null;
  const mid = Math.round(value);
  const spread = 0.05;
  const low = Math.round(mid * (1 - spread));
  const high = Math.round(mid * (1 + spread));
  const confidence = typeof scr === 'number' ? Math.min(99, Math.max(1, Math.round(scr))) : 75;
  const estimate: PriceEstimate = {
    low,
    mid,
    high,
    confidence,
    strategies: {
      conservative: Math.round(mid * 0.96),
      market: mid,
      aggressive: Math.round(mid * 1.04),
    },
  };
  estimate.comps = buildMockComps(mid, trimmed);
  return estimate;
}

/** Fetch property detail (beds, baths, sqft, year built) by address for pre-fill. */
async function attomPropertyDetail(address: string): Promise<PropertyDetailResponse | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const params = new URLSearchParams();
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((s) => s.trim());
    params.set('address1', parts[0] ?? '');
    params.set('address2', parts.slice(1).join(', ') || '');
  } else {
    params.set('address', trimmed);
  }
  const url = `${ATTOM_PROPERTY_API}/property/detail?${params.toString()}`;
  const res = await fetch(url, { headers: attomHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  const props = data?.property ?? (Array.isArray(data) ? data : [data]);
  const first = Array.isArray(props) ? props[0] : props;
  const building = first?.building ?? first;
  const rooms = building?.rooms ?? building;
  const size = building?.size ?? building;
  const summary = first?.summary ?? building?.summary ?? first;
  const beds = rooms?.beds ?? first?.beds;
  const baths = rooms?.bathstotal ?? rooms?.bathsTotal ?? first?.baths;
  const sqft = size?.universalsize ?? size?.livingsize ?? size?.grosssize ?? first?.universalSize ?? first?.sqft;
  const yearBuilt = summary?.yearbuilt ?? summary?.yearbuilteffective ?? building?.yearBuilt ?? first?.yearBuilt;
  const out: PropertyDetailResponse = { prefilled: true };
  if (typeof beds === 'number' && beds >= 0) out.beds = Math.round(beds);
  if (typeof baths === 'number' && baths >= 0) out.baths = Math.round(baths * 10) / 10;
  if (typeof sqft === 'number' && sqft > 0) out.sqft = Math.round(sqft);
  if (typeof yearBuilt === 'number' && yearBuilt > 1800 && yearBuilt <= new Date().getFullYear() + 1) out.yearBuilt = Math.round(yearBuilt);
  if (out.beds === undefined && out.baths === undefined && out.sqft === undefined && out.yearBuilt === undefined) return null;
  return out;
}

// ----- Mock helpers (fallback when ATTOM unavailable or for missing metrics) -----
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}
function mockMetrics(area: AreaSelection): MarketMetric[] {
  const rand = seededRandom(hashCode(`${area.type}:${area.value}`));
  const r = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const pct = () => Math.round((rand() * 20 - 10) * 10) / 10;
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${n.toLocaleString()}`;
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
  const pendingActiveRatio = Math.round((pending / Math.max(active, 1)) * 100) / 100;
  const m = (
    key: string,
    label: string,
    value: number,
    formattedValue: string,
    timeWindow: string
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
    m('median_price', 'Median Home Price', medianPrice, fmt(medianPrice), 'Last 90 days'),
    m('avg_price', 'Average Home Price', avgPrice, fmt(avgPrice), 'Last 90 days'),
    m('dom', 'Days on Market', dom, `${dom}`, 'Avg last 30 days'),
    m('active_listings', 'Active Listings', active, active.toLocaleString(), 'Current'),
    m('new_listings', 'New Listings', newListings, newListings.toLocaleString(), 'Last 30 days'),
    m('closed_sales', 'Closed Sales', closedSales, closedSales.toLocaleString(), 'Last 30 days'),
    m('price_reductions', 'Price Reductions', priceReductions, priceReductions.toLocaleString(), 'Last 30 days'),
    m('list_to_sale', 'List-to-Sale Ratio', listToSale, `${listToSale}%`, 'Last 90 days'),
    m('months_supply', 'Months of Supply', monthsSupply, `${monthsSupply}`, 'Current'),
    m('pending_active', 'Pending vs Active', pendingActiveRatio, `${pendingActiveRatio}`, 'Current'),
  ];
}
const CONDITION_MULT: Record<string, number> = {
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
function mockEstimate(input: HomeEstimateInput): PriceEstimate {
  const basePSF = 180 + (hashCode(input.address) % 120);
  let base = basePSF * input.sqft;
  base *= CONDITION_MULT[input.condition] ?? 1;
  const age = new Date().getFullYear() - input.yearBuilt;
  base *= age < 5 ? 1.08 : age < 15 ? 1.0 : age < 30 ? 0.95 : 0.88;
  base += (input.beds - 3) * 15_000;
  base += (input.baths - 2) * 12_000;
  let renovationBoost = 0;
  for (const r of input.renovations) renovationBoost += RENOVATION_BUMP[r] ?? 0;
  base *= 1 + renovationBoost;
  const mid = Math.round(base / 1000) * 1000;
  const spread = 0.06 + Math.random() * 0.04;
  const low = Math.round(mid * (1 - spread));
  const high = Math.round(mid * (1 + spread));
  const confidence = Math.min(
    95,
    65 + input.renovations.length * 3 + (input.sqft > 0 ? 5 : 0) + (input.yearBuilt > 1900 ? 5 : 0)
  );
  const estimate: PriceEstimate = {
    low,
    mid,
    high,
    confidence,
    strategies: {
      conservative: Math.round(mid * 0.96),
      market: mid,
      aggressive: Math.round(mid * 1.04),
    },
  };
  estimate.comps = buildMockComps(mid, input.address);
  return estimate;
}

/** Generate mock comparable sales for the valuation report (replace with real comps when available). */
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

async function callRealApi(body: RequestBody): Promise<MarketSnapshot | PriceEstimate> {
  const url = REAL_ESTATE_API_URL!.replace(/\/$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (REAL_ESTATE_API_KEY) {
    headers['Authorization'] = `Bearer ${REAL_ESTATE_API_KEY}`;
    headers['X-API-Key'] = REAL_ESTATE_API_KEY;
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Real estate API error: ${res.status} ${text}`);
  }
  return (await res.json()) as MarketSnapshot | PriceEstimate;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = (await req.json()) as RequestBody;
    if (!body || (body.type !== 'snapshot' && body.type !== 'estimate' && body.type !== 'property_detail')) {
      return jsonResponse({ error: 'Body must be { type: "snapshot", area }, { type: "estimate", input }, or { type: "property_detail", address }' }, 400);
    }

    // Optional: proxy to custom backend (snapshot and estimate only)
    if (REAL_ESTATE_API_URL && body.type !== 'property_detail') {
      try {
        const data = await callRealApi(body);
        return jsonResponse(data);
      } catch (proxyErr) {
        console.warn('Real estate proxy failed, trying ATTOM or mock:', proxyErr);
      }
    }

    // Property detail (pre-fill for Property Valuation)
    if (body.type === 'property_detail') {
      const address = typeof (body as { address?: string }).address === 'string' ? (body as { address: string }).address : '';
      if (!address.trim()) {
        return jsonResponse({ error: 'address required for property_detail' }, 400);
      }
      if (ATTOM_API_KEY) {
        try {
          const detail = await attomPropertyDetail(address);
          return jsonResponse(detail ?? { prefilled: false });
        } catch (attomErr) {
          console.warn('ATTOM property detail failed:', attomErr);
          return jsonResponse({ prefilled: false });
        }
      }
      return jsonResponse({ prefilled: false });
    }

    // ATTOM: snapshot
    if (body.type === 'snapshot') {
      const area = body.area as AreaSelection;
      if (!area?.type || !area?.value) {
        return jsonResponse({ error: 'area.type and area.value required' }, 400);
      }

      if (ATTOM_API_KEY) {
        try {
          const geoIdV4 = await attomResolveGeoIdV4(area);
          if (geoIdV4) {
            const trend = await attomSalesTrend(geoIdV4);
            const snapshot = buildSnapshotFromAttom(area, trend);
            return jsonResponse(snapshot);
          }
        } catch (attomErr) {
          console.warn('ATTOM snapshot failed, using mock:', attomErr);
        }
      }

      const snapshot: MarketSnapshot = {
        area: { ...area, timestamp: area.timestamp ?? Date.now() },
        metrics: mockMetrics(area),
        lastUpdated: new Date().toISOString(),
      };
      return jsonResponse(snapshot);
    }

    // ATTOM: estimate
    const input = body.input as HomeEstimateInput;
    if (!input?.address) {
      return jsonResponse({ error: 'input.address required' }, 400);
    }

    if (ATTOM_API_KEY) {
      try {
        const estimate = await attomAVMByAddress(input.address);
        if (estimate) return jsonResponse(estimate);
      } catch (attomErr) {
        console.warn('ATTOM AVM failed, using mock:', attomErr);
      }
    }

    return jsonResponse(mockEstimate(input));
  } catch (err) {
    console.error('market-data error:', err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    );
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
