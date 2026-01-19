export type CloseableDeal = {
  close_date?: string | null;
  closed_at?: string | null;
};

// Date basis rules:
// - Closed-year datasets use close_ts (close_date at UTC midnight, else closed_at).
// - Created-year datasets use created_at.
// - All grouping uses UTC year/month to avoid timezone drift.
export const toDateOnlyUtc = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const toDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const toCloseDateUtc = (deal: CloseableDeal): Date | null => {
  return toDateOnlyUtc(deal.close_date) ?? toDate(deal.closed_at);
};

export const getYearMonthUtc = (date: Date) => ({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth()
});

export const inYearUtc = (date: Date | null, year: number) => {
  if (!date) return false;
  return date.getUTCFullYear() === year;
};

export const runAnalyticsDateChecks = () => {
  const dateOnly = toDateOnlyUtc('2025-01-01');
  console.assert(dateOnly?.toISOString() === '2025-01-01T00:00:00.000Z', 'Date-only parsing uses UTC midnight.');

  const iso = toDate('2025-12-31T23:30:00Z');
  const isoParts = iso ? getYearMonthUtc(iso) : null;
  console.assert(isoParts?.year === 2025 && isoParts?.month === 11, 'ISO timestamps group in UTC.');

  const closeDate = toCloseDateUtc({ close_date: '2024-12-31', closed_at: '2025-01-02T10:00:00Z' });
  console.assert(closeDate?.toISOString().startsWith('2024-12-31'), 'Close date takes precedence over closed_at.');
};
