export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return formatCurrency(amount);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(date));
}

import type { GlobalRole } from './database.types';

export function getGreeting(userName?: string, role?: GlobalRole | null): string {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const salesMotivations = [
    "Let's close some deals",
    "Time to crush your goals",
    "Ready to dominate the market",
    "Another day, another opportunity",
    "Let's make it a winning day",
    "Time to turn leads into gold",
    "Your next closing is waiting",
    "Great things happen to closers",
    "Let's build your empire",
    "Success is calling your name",
    "Time to level up your game",
    "Let's make today count"
  ];

  const managerMotivations = [
    'Rally the team to a strong finish',
    'Spot the blockers and clear the way',
    'Guide the pipeline to momentum',
    'Coach for better follow-through today',
    'Keep your team sharp and focused',
    'Measure, adjust, and push the pace'
  ];

  const leadMotivations = [
    'Lead from the front—show them the way',
    'Tee up the right opportunities for the team',
    'Mentor and keep the cadence tight',
    'Keep your squad synced and confident',
    'Set the tone and celebrate small wins',
    'Align the team to the next milestones'
  ];

  const adminMotivations = [
    'Keep operations humming smoothly',
    'Check the pulse and anticipate needs',
    'Steady hands keep the flywheel spinning',
    'Align the org and let the teams run',
    'Remove friction and raise the bar',
    'Your oversight keeps momentum steady'
  ];

  const firstName = userName ? userName.split(' ')[0] : '';
  const capitalizedFirstName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : '';
  const name = capitalizedFirstName ? `, ${capitalizedFirstName}` : '';
  let pool = salesMotivations;
  if (role === 'sales_manager') pool = managerMotivations;
  else if (role === 'team_lead') pool = leadMotivations;
  else if (role === 'admin') pool = adminMotivations;
  const randomMotivation = pool[Math.floor(Math.random() * pool.length)];

  return `${timeGreeting}${name}. ${randomMotivation}!`;
}

export function getTodayFormatted(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());
}

export type DateRange = 'this_month' | 'last_30_days' | 'this_quarter' | 'ytd' | 'custom';

export interface DateRangeValue {
  start: Date;
  end: Date;
}

export function getDateRange(range: DateRange, customStart?: Date, customEnd?: Date): DateRangeValue {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3);

  switch (range) {
    case 'this_month':
      return {
        start: new Date(currentYear, currentMonth, 1),
        end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59)
      };
    case 'last_30_days': {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return {
        start: thirtyDaysAgo,
        end: now
      };
    }
    case 'this_quarter':
      return {
        start: new Date(currentYear, currentQuarter * 3, 1),
        end: new Date(currentYear, (currentQuarter + 1) * 3, 0, 23, 59, 59)
      };
    case 'ytd':
      return {
        start: new Date(currentYear, 0, 1),
        end: now
      };
    case 'custom':
      return {
        start: customStart || new Date(currentYear, 0, 1),
        end: customEnd || now
      };
    default:
      return {
        start: new Date(currentYear, 0, 1),
        end: now
      };
  }
}

export function calculateGCI(deal: {
  actual_sale_price: number | null;
  expected_sale_price: number;
  gross_commission_rate: number;
  brokerage_split_rate: number;
  referral_out_rate: number | null;
  transaction_fee: number;
}): number {
  const salePrice = deal.actual_sale_price || deal.expected_sale_price;
  const grossCommission = salePrice * deal.gross_commission_rate;
  const afterBrokerageSplit = grossCommission * (1 - deal.brokerage_split_rate);
  const afterReferral = deal.referral_out_rate
    ? afterBrokerageSplit * (1 - deal.referral_out_rate)
    : afterBrokerageSplit;
  return afterReferral - deal.transaction_fee;
}

export function getDaysInStage(stageEnteredAt: string): number {
  const entered = new Date(stageEnteredAt);
  const now = new Date();
  const diff = now.getTime() - entered.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function isStalled(stageEnteredAt: string, thresholdDays: number = 30): boolean {
  return getDaysInStage(stageEnteredAt) > thresholdDays;
}
