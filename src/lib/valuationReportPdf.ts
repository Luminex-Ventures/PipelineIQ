/**
 * Premium Luma-IQ Property Valuation Report — client-ready PDF.
 *
 * Design: Apple HIG–inspired, fintech/SaaS, high-trust, print-optimized.
 *
 * Design system (DS):
 *   Colors: navy #1e3a5f, accent #D4883A, bg #FAFBFC, border #E6E8EB, muted gray, body gray.
 *   Type: Helvetica, scale 7–22pt (micro → hero). Spacing: margin 0.5in, section 0.35in.
 *   Cards: rounded rects, light fill, subtle border. Confidence: horizontal bar (accent fill).
 *
 * White-label: ValuationReportOptions.preparedFor, agentName, brokerage, agentEmail, agentPhone
 * allow agent/brokerage branding on Page 8. Omit for generic Luma-IQ report.
 *
 * Structure: 8 pages — 1 Hero + Summary, 2 Market, 3 Comps, 4 Strengths, 5 Scenarios,
 * 6 Seller Strategy, 7 Methodology, 8 Agent CTA.
 */

import { jsPDF } from 'jspdf';
import type {
  PriceEstimate,
  HomeEstimateInput,
  ValuationComp,
  PricingStrategy,
} from '../types/marketIntelligence';

// ─── Design system ─────────────────────────────────────────────────────────
const DS = {
  // Colors (RGB 0–255)
  navy: [30, 58, 95] as [number, number, number],
  accent: [212, 136, 58] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  bg: [250, 251, 252] as [number, number, number],
  border: [230, 232, 235] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  body: [55, 65, 81] as [number, number, number],
  success: [34, 197, 94] as [number, number, number],
  // Typography (pt)
  font: 'helvetica' as const,
  size: {
    micro: 7,
    caption: 8,
    body: 9,
    bodyL: 10,
    sub: 11,
    h3: 12,
    h2: 14,
    h1: 18,
    hero: 22,
  },
  // Spacing (in)
  margin: 0.5,
  gap: 0.2,
  section: 0.35,
  cardPad: 0.15,
} as const;

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1000).toFixed(0)}k`;

export interface ValuationReportOptions {
  preparedFor?: string;
  agentName?: string;
  brokerage?: string;
  agentEmail?: string;
  agentPhone?: string;
  /** Optional market snapshot for Page 2 (median price, DOM, etc.) */
  marketSnapshot?: {
    medianPrice?: number;
    daysOnMarket?: number;
    activeListings?: number;
    pricePerSqft?: number;
    monthsSupply?: number;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function setColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function text(
  doc: jsPDF,
  str: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number } = {},
) {
  doc.setFontSize(opts.size ?? DS.size.body);
  doc.setFont(DS.font, opts.bold ? 'bold' : 'normal');
  if (opts.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
  doc.text(str, x, y, { maxWidth: opts.maxWidth });
}

function blockText(doc: jsPDF, str: string, x: number, y: number, maxW: number, size: number, lineH: number) {
  const lines = doc.splitTextToSize(str, maxW);
  doc.setFontSize(size);
  doc.setFont(DS.font, 'normal');
  doc.setTextColor(...DS.body);
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, fill: [number, number, number]) {
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 0.02, 0.02, 'F');
}

function confidenceBar(doc: jsPDF, x: number, y: number, w: number, h: number, pct: number) {
  doc.setFillColor(...DS.border);
  doc.roundedRect(x, y, w, h, 0.01, 0.01, 'F');
  const fillW = Math.max(0, Math.min(1, pct / 100)) * w;
  if (fillW > 0) {
    doc.setFillColor(...DS.accent);
    doc.roundedRect(x, y, fillW, h, 0.01, 0.01, 'F');
  }
}

// ─── Page 1: Hero + Executive Summary ──────────────────────────────────────
function page1(
  doc: jsPDF,
  address: string,
  estimate: PriceEstimate,
  propertyInput: HomeEstimateInput,
  opts: ValuationReportOptions,
) {
  const M = DS.margin;
  let y = M;

  // Header bar
  doc.setFillColor(...DS.navy);
  doc.rect(0, 0, 8.5, 0.65, 'F');
  doc.setTextColor(...DS.white);
  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.text('Luma-IQ', M, 0.42);
  doc.setFont(DS.font, 'normal');
  doc.setFontSize(DS.size.caption);
  doc.text('Your Deals. In Focus.', M, 0.58);
  doc.setFontSize(DS.size.caption);
  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(reportDate, 8.5 - M - doc.getTextWidth(reportDate), 0.42);
  if (opts.preparedFor) {
    doc.text(`Prepared for ${opts.preparedFor}`, 8.5 - M - doc.getTextWidth(`Prepared for ${opts.preparedFor}`), 0.58);
  }
  doc.setTextColor(...DS.body);

  y = 0.95;

  // Property hero
  const cityState = address.split(',').slice(1).join(',').trim() || '';
  doc.setFontSize(DS.size.hero);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text(address.split(',')[0]?.trim() ?? address, M, y);
  y += 0.28;
  if (cityState) {
    doc.setFontSize(DS.size.h3);
    doc.setFont(DS.font, 'normal');
    doc.setTextColor(...DS.muted);
    doc.text(cityState, M, y);
    y += 0.22;
  }
  doc.setFontSize(DS.size.body);
  doc.setTextColor(...DS.body);
  const specs = `${propertyInput.beds} Beds  ·  ${propertyInput.baths} Baths  ·  ${propertyInput.sqft.toLocaleString()} Sq Ft  ·  ${propertyInput.yearBuilt}`;
  doc.text(specs, M, y);
  y += DS.section;

  // Estimated value (primary focus)
  doc.setFillColor(...DS.bg);
  doc.roundedRect(M, y, 7.5, 1.05, 0.04, 0.04, 'F');
  doc.setDrawColor(...DS.border);
  doc.roundedRect(M, y, 7.5, 1.05, 0.04, 0.04, 'S');
  y += 0.32;
  doc.setFontSize(DS.size.caption);
  doc.setTextColor(...DS.muted);
  doc.text('Estimated Value', M + 0.2, y);
  y += 0.22;
  doc.setFontSize(DS.size.h1);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text(fmt(estimate.mid), M + 0.2, y);
  y += 0.28;
  doc.setFontSize(DS.size.body);
  doc.setFont(DS.font, 'normal');
  doc.setTextColor(...DS.muted);
  doc.text(`Range: ${fmt(estimate.low)} – ${fmt(estimate.high)}  ·  Confidence: ${estimate.confidence}%`, M + 0.2, y);
  y += 0.2;
  confidenceBar(doc, M + 0.2, y, 4.5, 0.08, estimate.confidence);
  y += 0.45;

  // AI Market Insight
  doc.setFontSize(DS.size.sub);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Market positioning', M, y);
  y += 0.22;
  doc.setFontSize(DS.size.body);
  doc.setFont(DS.font, 'normal');
  doc.setTextColor(...DS.body);
  const insight =
    'This valuation reflects current market data and comparable sales. Pricing within the suggested range positions the property competitively while leaving room for negotiation. Demand indicators support a confident listing strategy.';
  y = blockText(doc, insight, M, y, 7.5, DS.size.body, 0.18) + DS.gap;

  // Visual pricing strategy (three bands)
  doc.setFontSize(DS.size.sub);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Pricing strategy', M, y);
  y += 0.28;

  const strategies: { key: PricingStrategy; label: string; sub: string; price: number }[] = [
    { key: 'conservative', label: 'Quick sale', sub: '~30–45 days', price: estimate.strategies.conservative },
    { key: 'market', label: 'Market', sub: '~45–60 days', price: estimate.strategies.market },
    { key: 'aggressive', label: 'Max return', sub: '~60+ days', price: estimate.strategies.aggressive },
  ];
  const cardW = 2.35;
  const cardH = 0.7;
  strategies.forEach((s, i) => {
    const x = M + i * (cardW + 0.08);
    doc.setFillColor(...DS.bg);
    doc.setDrawColor(...DS.border);
    doc.roundedRect(x, y, cardW, cardH, 0.03, 0.03, 'FD');
    doc.setFontSize(DS.size.caption);
    doc.setTextColor(...DS.muted);
    doc.text(s.label, x + 0.12, y + 0.2);
    doc.setFontSize(DS.size.body);
    doc.setFont(DS.font, 'bold');
    doc.setTextColor(...DS.navy);
    doc.text(fmt(s.price), x + 0.12, y + 0.45);
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(DS.size.micro);
    doc.setTextColor(...DS.muted);
    doc.text(s.sub, x + 0.12, y + 0.62);
  });
  y += cardH + DS.section;

  if (y > 10.5) return y;
  return y;
}

// ─── Page 2: Market Intelligence ───────────────────────────────────────────
function page2(doc: jsPDF, opts: ValuationReportOptions) {
  const M = DS.margin;
  let y = M + 0.3;

  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Market intelligence', M, y);
  y += 0.4;

  const snap = opts.marketSnapshot ?? {};
  const hasSnapshot =
    snap.medianPrice != null ||
    snap.daysOnMarket != null ||
    snap.activeListings != null ||
    snap.pricePerSqft != null ||
    snap.monthsSupply != null;

  if (hasSnapshot) {
    const cards = [
      { label: 'Median price', value: snap.medianPrice != null ? fmt(snap.medianPrice) : '—' },
      { label: 'Days on market', value: snap.daysOnMarket != null ? `${snap.daysOnMarket}` : '—' },
      { label: 'Active listings', value: snap.activeListings != null ? snap.activeListings.toLocaleString() : '—' },
      { label: 'Price / sq ft', value: snap.pricePerSqft != null ? fmt(snap.pricePerSqft) : '—' },
      { label: 'Months supply', value: snap.monthsSupply != null ? `${snap.monthsSupply}` : '—' },
    ];
    const cw = 1.38;
    const ch = 0.55;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const i = row * 3 + col;
        if (i >= cards.length) break;
        const x = M + col * (cw + 0.1);
        const cy = y + row * (ch + 0.1);
        doc.setFillColor(...DS.bg);
        doc.setDrawColor(...DS.border);
        doc.roundedRect(x, cy, cw, ch, 0.02, 0.02, 'FD');
        doc.setFontSize(DS.size.micro);
        doc.setTextColor(...DS.muted);
        doc.text(cards[i].label, x + 0.1, cy + 0.2);
        doc.setFontSize(DS.size.body);
        doc.setFont(DS.font, 'bold');
        doc.setTextColor(...DS.navy);
        doc.text(cards[i].value, x + 0.1, cy + 0.42);
      }
    }
    y += 2 * (ch + 0.1) + DS.section;
  } else {
    doc.setFillColor(...DS.bg);
    doc.setDrawColor(...DS.border);
    doc.roundedRect(M, y, 7.5, 0.7, 0.03, 0.03, 'FD');
    doc.setFontSize(DS.size.body);
    doc.setTextColor(...DS.muted);
    doc.text(
      'Market snapshot (median price, days on market, inventory) can be included when this report is run with market data for the property\'s area.',
      M + 0.2,
      y + 0.4,
      { maxWidth: 7.1 },
    );
    y += 0.9 + DS.section;
  }

  doc.setFontSize(DS.size.sub);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Market narrative', M, y);
  y += 0.22;
  doc.setFont(DS.font, 'normal');
  doc.setFontSize(DS.size.body);
  doc.setTextColor(...DS.body);
  const narrative =
    'Local market conditions and recent comparable sales inform this valuation. Supply and demand dynamics, seasonal trends, and neighborhood activity are factored into the confidence score and range.';
  y = blockText(doc, narrative, M, y, 7.5, DS.size.body, 0.18);
  return y + DS.section;
}

// ─── Page 3: Comparable Properties ────────────────────────────────────────
function page3(doc: jsPDF, address: string, estimate: PriceEstimate, propertyInput: HomeEstimateInput) {
  const M = DS.margin;
  let y = M + 0.3;

  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Comparable sales', M, y);
  y += 0.25;
  doc.setFont(DS.font, 'normal');
  doc.setFontSize(DS.size.body);
  doc.setTextColor(...DS.muted);
  doc.text('Recent sales used to support this valuation.', M, y);
  y += 0.35;

  const comps = estimate.comps ?? [];
  if (comps.length > 0) {
    const colW = [2.0, 1.05, 0.6, 0.4, 0.45, 0.55, 0.45];
    const headers = ['Address', 'Price', 'Date', 'Beds', 'Baths', 'Sq Ft', 'Dist'];
    doc.setFontSize(DS.size.micro);
    doc.setFont(DS.font, 'bold');
    doc.setTextColor(...DS.muted);
    let x = M;
    headers.forEach((h, i) => {
      doc.text(h, x, y);
      x += colW[i];
    });
    y += 0.2;
    doc.setFont(DS.font, 'normal');
    doc.setTextColor(...DS.body);
    for (const c of comps) {
      if (y > 10.3) break;
      x = M;
      doc.text(c.address.slice(0, 32), x, y);
      x += colW[0];
      doc.text(fmt(c.salePrice), x, y);
      x += colW[1];
      doc.text(c.saleDate, x, y);
      x += colW[2];
      doc.text(String(c.beds), x, y);
      x += colW[3];
      doc.text(String(c.baths), x, y);
      x += colW[4];
      doc.text(String(c.sqft), x, y);
      x += colW[5];
      doc.text(c.distance != null ? `${c.distance} mi` : '—', x, y);
      y += 0.2;
    }
    y += 0.25;
  }

  // Subject vs comps (price vs sqft idea)
  doc.setFontSize(DS.size.sub);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('How this property compares', M, y);
  y += 0.22;
  doc.setFont(DS.font, 'normal');
  doc.setFontSize(DS.size.body);
  doc.setTextColor(...DS.body);
  const subjPpsf = propertyInput.sqft > 0 ? Math.round(estimate.mid / propertyInput.sqft) : 0;
  const compPpsf =
    comps.length > 0
      ? Math.round(comps.reduce((s, c) => s + c.salePrice / c.sqft, 0) / comps.length)
      : 0;
  const compareText =
    comps.length > 0
      ? `Subject value per sq ft (est.): ${fmt(subjPpsf)}. Comparable sales avg. ~${fmt(compPpsf)}/sq ft. This positioning reflects condition, location, and recent improvements.`
      : 'Comparable sales support the estimated range above.';
  y = blockText(doc, compareText, M, y, 7.5, DS.size.body, 0.18);
  return y + DS.section;
}

// ─── Page 4: Strengths & Opportunities ────────────────────────────────────
function page4(doc: jsPDF, propertyInput: HomeEstimateInput) {
  const M = DS.margin;
  let y = M + 0.3;

  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Property strengths', M, y);
  y += 0.35;

  const strengths = [
    `Layout: ${propertyInput.beds} bed, ${propertyInput.baths} bath configuration`,
    `Size: ${propertyInput.sqft.toLocaleString()} sq ft`,
    `Condition: ${propertyInput.condition.replace(/_/g, ' ')}`,
    ...(propertyInput.renovations.length > 0
      ? [`Updates: ${propertyInput.renovations.map((r) => r.replace(/_/g, ' ')).join(', ')}`]
      : []),
  ];
  doc.setFontSize(DS.size.body);
  doc.setFont(DS.font, 'normal');
  doc.setTextColor(...DS.body);
  strengths.forEach((s) => {
    doc.text(`• ${s}`, M + 0.1, y);
    y += 0.2;
  });
  y += DS.section;

  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Value opportunities', M, y);
  y += 0.28;
  doc.setFont(DS.font, 'normal');
  doc.setFontSize(DS.size.body);
  doc.setTextColor(...DS.body);
  const opps = [
    'Paint & lighting — low cost, high impact (est. 1–3% value uplift)',
    'Landscaping & curb appeal — strong first impression (est. 2–4%)',
    'Kitchen refresh — cabinetry or counters (est. 4–8%)',
    'Bathroom updates — fixtures and finishes (est. 3–6%)',
  ];
  opps.forEach((o) => {
    doc.text(`• ${o}`, M + 0.1, y);
    y += 0.2;
  });
  return y + DS.section;
}

// ─── Page 5: Forecast & Scenarios ───────────────────────────────────────────
function page5(doc: jsPDF, estimate: PriceEstimate) {
  const M = DS.margin;
  let y = M + 0.3;

  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Scenario modeling', M, y);
  y += 0.35;

  const scenarios = [
    { label: 'Quick sale', price: estimate.strategies.conservative, timeline: '30–45 days', risk: 'Low' },
    { label: 'Balanced', price: estimate.strategies.market, timeline: '45–60 days', risk: 'Medium' },
    { label: 'Max return', price: estimate.strategies.aggressive, timeline: '60+ days', risk: 'Higher' },
  ];
  const cardW = 2.35;
  const cardH = 0.85;
  scenarios.forEach((s, i) => {
    const x = M + i * (cardW + 0.08);
    doc.setFillColor(...DS.bg);
    doc.setDrawColor(...DS.border);
    doc.roundedRect(x, y, cardW, cardH, 0.03, 0.03, 'FD');
    doc.setFontSize(DS.size.body);
    doc.setFont(DS.font, 'bold');
    doc.setTextColor(...DS.navy);
    doc.text(s.label, x + 0.12, y + 0.22);
    doc.setFontSize(DS.size.sub);
    doc.text(fmt(s.price), x + 0.12, y + 0.48);
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(DS.size.micro);
    doc.setTextColor(...DS.muted);
    doc.text(`Timeline: ${s.timeline}  ·  Risk: ${s.risk}`, x + 0.12, y + 0.72);
  });
  return y + cardH + DS.section;
}

// ─── Page 6: Seller Strategy ───────────────────────────────────────────────
function page6(doc: jsPDF) {
  const M = DS.margin;
  let y = M + 0.3;

  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Seller strategy', M, y);
  y += 0.32;
  doc.setFont(DS.font, 'normal');
  doc.setFontSize(DS.size.body);
  doc.setTextColor(...DS.muted);
  doc.text('Strategic guidance to support your listing conversation.', M, y);
  y += 0.4;

  const items = [
    {
      title: 'Listing timing',
      text: 'Align with seasonal demand when possible. Spring and early fall typically see strong buyer activity. We can refine timing based on local trends.',
    },
    {
      title: 'Pricing psychology',
      text: 'Listing within the suggested range signals credibility. Pricing at or slightly below the market strategy can drive showings and multiple offers.',
    },
    {
      title: 'Negotiation leverage',
      text: 'The comps and range in this report give you a clear reference for counteroffers and appraisal support. Confidence in the number strengthens your position.',
    },
    {
      title: 'Marketing positioning',
      text: 'Lead with the estimated value and key differentiators (size, condition, updates). Use the strengths and opportunities section to tell the story.',
    },
  ];

  doc.setFontSize(DS.size.sub);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  items.forEach((item) => {
    doc.text(item.title, M, y);
    y += 0.2;
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(DS.size.body);
    doc.setTextColor(...DS.body);
    y = blockText(doc, item.text, M + 0.1, y, 7.4, DS.size.body, 0.18) + 0.18;
    doc.setFont(DS.font, 'bold');
    doc.setFontSize(DS.size.sub);
    doc.setTextColor(...DS.navy);
  });
  return y;
}

// ─── Page 7: Methodology & Trust ───────────────────────────────────────────
function page7(doc: jsPDF) {
  const M = DS.margin;
  let y = M + 0.3;

  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.navy);
  doc.text('Methodology & transparency', M, y);
  y += 0.4;

  doc.setFontSize(DS.size.body);
  doc.setFont(DS.font, 'normal');
  doc.setTextColor(...DS.body);
  const paragraphs = [
    'This valuation is produced by Luma-IQ using property details you provided, public record data, and comparable sales. Our model combines automated valuation approaches with local market intelligence to produce an estimated range and confidence score.',
    'Data sources may include recorded sales, tax assessments, listing activity, and geographic trends. The confidence score reflects the strength of comparable data and how closely the subject property matches recent sales.',
    'This report is an estimate for informational and marketing purposes. It is not an appraisal and should not be used as the sole basis for listing or purchase decisions. For legal or lending purposes, engage a licensed appraiser.',
  ];
  paragraphs.forEach((p) => {
    y = blockText(doc, p, M, y, 7.5, DS.size.body, 0.18) + 0.2;
  });
  y += 0.15;
  doc.setFontSize(DS.size.micro);
  doc.setTextColor(...DS.muted);
  doc.text('© Luma-IQ. Your Deals. In Focus.', M, y);
  return y;
}

// ─── Page 8: Agent Branding + CTA ───────────────────────────────────────────
function page8(doc: jsPDF, opts: ValuationReportOptions) {
  const M = DS.margin;
  let y = M + 0.5;

  doc.setFillColor(...DS.navy);
  doc.roundedRect(M, y, 7.5, 1.8, 0.06, 0.06, 'F');
  y += 0.5;
  doc.setTextColor(...DS.white);
  doc.setFontSize(DS.size.h2);
  doc.setFont(DS.font, 'bold');
  doc.text('Ready to list?', M + 0.3, y);
  y += 0.3;
  doc.setFont(DS.font, 'normal');
  doc.setFontSize(DS.size.body);
  doc.text('Let\'s discuss pricing, timing, and how to position this property.', M + 0.3, y);
  y += 0.5;

  if (opts.agentName || opts.brokerage) {
    doc.setFont(DS.font, 'bold');
    doc.setFontSize(DS.size.sub);
    if (opts.agentName) doc.text(opts.agentName, M + 0.3, y);
    if (opts.brokerage) doc.text(opts.brokerage, M + 0.3, y + 0.22);
    y += 0.5;
  }
  if (opts.agentPhone) {
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(DS.size.body);
    doc.text(opts.agentPhone, M + 0.3, y);
    y += 0.2;
  }
  if (opts.agentEmail) {
    doc.text(opts.agentEmail, M + 0.3, y);
  }

  y = 2.8;
  doc.setTextColor(...DS.body);
  doc.setFontSize(DS.size.caption);
  doc.text('Thank you for choosing Luma-IQ. This report is prepared for your listing conversation.', M, y);
  y += 0.25;
  doc.setFont(DS.font, 'bold');
  doc.setTextColor(...DS.accent);
  doc.text('Schedule a call · Get your home sold', M, y);
  return y;
}

// ─── Main entry ────────────────────────────────────────────────────────────
export function generateValuationReportPdf(
  address: string,
  estimate: PriceEstimate,
  propertyInput: HomeEstimateInput,
  options?: ValuationReportOptions,
): void {
  const doc = new jsPDF({ format: 'letter', unit: 'in' });
  const opts: ValuationReportOptions = options ?? {};

  // Page 1 (default first page)
  page1(doc, address, estimate, propertyInput, opts);

  doc.addPage();
  page2(doc, opts);

  // Page 3
  doc.addPage();
  page3(doc, address, estimate, propertyInput);

  // Page 4
  doc.addPage();
  page4(doc, propertyInput);

  // Page 5
  doc.addPage();
  page5(doc, estimate);

  // Page 6
  doc.addPage();
  page6(doc);

  // Page 7
  doc.addPage();
  page7(doc);

  doc.addPage();
  page8(doc, opts);

  const filename = `Luma-IQ-Valuation-${address.slice(0, 25).replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;
  doc.save(filename);
}
