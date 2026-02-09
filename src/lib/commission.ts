import type { TieredSplit, CustomDeduction } from './database.types';

export type CommissionInput = {
  actual_sale_price?: number | null;
  expected_sale_price?: number | null;
  gross_commission_rate?: number | null;
  brokerage_split_rate?: number | null;
  referral_out_rate?: number | null;
  referral_in_rate?: number | null;
  transaction_fee?: number | null;
  // New fields for tiered splits and custom deductions
  tiered_splits?: TieredSplit[] | null;
  custom_deductions?: CustomDeduction[] | null;
  partnership_split_rate?: number | null;
  payout_structure?: 'standard' | 'partnership' | 'tiered' | null;
};

const n = (value: number | null | undefined) => (typeof value === 'number' && !Number.isNaN(value) ? value : 0);

/**
 * Get the brokerage split rate for a given sale price when using tiered splits.
 * Returns the rate from the matching tier, or the default brokerage_split_rate if no match.
 */
export function getTieredSplitRate(
  salePrice: number,
  tieredSplits: TieredSplit[] | null | undefined,
  defaultRate: number
): number {
  if (!tieredSplits || tieredSplits.length === 0) {
    return defaultRate;
  }

  // Sort tiers by min_amount ascending
  const sortedTiers = [...tieredSplits].sort((a, b) => a.min_amount - b.min_amount);

  for (const tier of sortedTiers) {
    const minMatch = salePrice >= tier.min_amount;
    const maxMatch = tier.max_amount === null || salePrice <= tier.max_amount;
    if (minMatch && maxMatch) {
      return tier.split_rate;
    }
  }

  // If no tier matches, return the last tier's rate (highest tier)
  return sortedTiers[sortedTiers.length - 1].split_rate;
}

/**
 * Apply custom deductions to a commission amount.
 * Deductions are applied in order based on apply_order.
 */
export function applyCustomDeductions(
  amount: number,
  deductions: CustomDeduction[] | null | undefined
): { finalAmount: number; totalDeductions: number; deductionDetails: Array<{ name: string; amount: number }> } {
  if (!deductions || deductions.length === 0) {
    return { finalAmount: amount, totalDeductions: 0, deductionDetails: [] };
  }

  // Sort by apply_order
  const sortedDeductions = [...deductions].sort((a, b) => a.apply_order - b.apply_order);
  
  let remaining = amount;
  let totalDeductions = 0;
  const deductionDetails: Array<{ name: string; amount: number }> = [];

  for (const deduction of sortedDeductions) {
    let deductionAmount = 0;
    if (deduction.type === 'flat') {
      deductionAmount = Math.min(deduction.value, remaining);
    } else {
      // Percentage deduction
      deductionAmount = remaining * deduction.value;
    }
    
    remaining -= deductionAmount;
    totalDeductions += deductionAmount;
    deductionDetails.push({ name: deduction.name, amount: deductionAmount });
  }

  return {
    finalAmount: Math.max(0, remaining),
    totalDeductions,
    deductionDetails
  };
}

export function calculateCommissionBreakdown(
  input: CommissionInput,
  opts?: { preferActual?: boolean; includeReferralIn?: boolean }
) {
  const preferActual = opts?.preferActual ?? true;
  const includeReferralIn = opts?.includeReferralIn ?? false;

  const salePrice =
    n(preferActual ? input.actual_sale_price : input.expected_sale_price) ||
    n(preferActual ? input.expected_sale_price : input.actual_sale_price);

  const grossRate = n(input.gross_commission_rate);
  const referralOut = n(input.referral_out_rate);
  const referralIn = n(input.referral_in_rate);
  const transactionFee = n(input.transaction_fee);
  
  // Determine brokerage split based on payout structure
  let brokerageSplit: number;
  if (input.payout_structure === 'tiered' && input.tiered_splits?.length) {
    brokerageSplit = getTieredSplitRate(salePrice, input.tiered_splits, n(input.brokerage_split_rate));
  } else {
    brokerageSplit = n(input.brokerage_split_rate);
  }

  const gross = salePrice * grossRate;
  
  // Apply partnership split first if applicable
  let afterPartnership = gross;
  if (input.payout_structure === 'partnership' && input.partnership_split_rate) {
    afterPartnership = gross * (1 - n(input.partnership_split_rate));
  }
  
  const afterBrokerage = afterPartnership * (1 - brokerageSplit);
  const afterReferralOut = referralOut > 0 ? afterBrokerage * (1 - referralOut) : afterBrokerage;
  const afterReferralIn = includeReferralIn && referralIn > 0 ? afterReferralOut * (1 + referralIn) : afterReferralOut;
  
  // Apply transaction fee
  const afterTransactionFee = Math.max(0, afterReferralIn - transactionFee);
  
  // Apply custom deductions
  const { finalAmount: net, totalDeductions, deductionDetails } = applyCustomDeductions(
    afterTransactionFee,
    input.custom_deductions
  );

  return {
    salePrice,
    gross,
    afterPartnership,
    afterBrokerage,
    afterReferralOut,
    afterReferralIn,
    transactionFee,
    customDeductions: totalDeductions,
    deductionDetails,
    net
  };
}

export function calculateNetCommission(
  input: CommissionInput,
  opts?: { preferActual?: boolean; includeReferralIn?: boolean }
) {
  return calculateCommissionBreakdown(input, opts).net;
}

export function calculateActualGCI(input: CommissionInput) {
  return calculateNetCommission(input, { preferActual: true });
}

export function calculateExpectedGCI(input: CommissionInput) {
  return calculateNetCommission(input, { preferActual: false });
}

export function calculateGrossCommission(input: CommissionInput, opts?: { preferActual?: boolean }) {
  return calculateCommissionBreakdown(input, opts).gross;
}
