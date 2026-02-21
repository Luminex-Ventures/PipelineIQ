export type AreaType = 'zip' | 'city' | 'county' | 'state';

export interface AreaSelection {
  type: AreaType;
  value: string;
  label: string;
  timestamp: number;
}

export interface MarketMetric {
  key: string;
  label: string;
  value: number;
  formattedValue: string;
  trendPercent: number;
  trendDirection: 'up' | 'down' | 'flat';
  timeWindow: string;
}

export interface MarketSnapshot {
  area: AreaSelection;
  metrics: MarketMetric[];
  lastUpdated: string;
}

export type PropertyCondition =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'needs_work'
  | 'fixer_upper';

export type Renovation =
  | 'kitchen'
  | 'bathrooms'
  | 'roof'
  | 'hvac'
  | 'windows'
  | 'flooring'
  | 'landscaping'
  | 'addition';

export interface HomeEstimateInput {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  condition: PropertyCondition;
  renovations: Renovation[];
}

export type PricingStrategy = 'conservative' | 'market' | 'aggressive';

/** A comparable sale used to support the valuation. */
export interface ValuationComp {
  address: string;
  salePrice: number;
  saleDate: string;
  beds: number;
  baths: number;
  sqft: number;
  distance?: number;
}

export interface PriceEstimate {
  low: number;
  mid: number;
  high: number;
  confidence: number;
  strategies: Record<PricingStrategy, number>;
  comps?: ValuationComp[];
}

export interface MarketInsight {
  id: string;
  text: string;
  type: 'bullish' | 'bearish' | 'neutral' | 'tip';
  timestamp: string;
}

/** Property detail from ATTOM for pre-filling Property Valuation. */
export interface PropertyDetailFromApi {
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  prefilled: boolean;
}
