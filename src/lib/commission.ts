export type CommissionInput = {
  actual_sale_price?: number | null;
  expected_sale_price?: number | null;
  gross_commission_rate?: number | null;
  brokerage_split_rate?: number | null;
  referral_out_rate?: number | null;
  referral_in_rate?: number | null;
  transaction_fee?: number | null;
};

const n = (value: number | null | undefined) => (typeof value === 'number' && !Number.isNaN(value) ? value : 0);

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
  const brokerageSplit = n(input.brokerage_split_rate);
  const referralOut = n(input.referral_out_rate);
  const referralIn = n(input.referral_in_rate);
  const transactionFee = n(input.transaction_fee);

  const gross = salePrice * grossRate;
  const afterBrokerage = gross * (1 - brokerageSplit);
  const afterReferralOut = referralOut > 0 ? afterBrokerage * (1 - referralOut) : afterBrokerage;
  const afterReferralIn = includeReferralIn && referralIn > 0 ? afterReferralOut * (1 + referralIn) : afterReferralOut;
  const net = Math.max(0, afterReferralIn - transactionFee);

  return {
    salePrice,
    gross,
    afterBrokerage,
    afterReferralOut,
    afterReferralIn,
    transactionFee,
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
