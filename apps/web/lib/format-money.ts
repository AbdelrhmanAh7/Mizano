import { decimalToDisplayNumber } from '@/lib/decimal';

/**
 * Display-only money formatting. The currency is required: there is no default, so a missing
 * currency is a type error instead of a silent USD. Amounts stay decimal strings until here.
 */
export function formatMoney(
  amount: string | number | null | undefined,
  currency: string,
  locale = 'en-US',
): string {
  const num = typeof amount === 'string' ? decimalToDisplayNumber(amount) : (amount ?? 0);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    Number.isFinite(num) ? num : 0,
  );
}

/** Compact display (for chart axes and KPI tiles). The currency is required, as in formatMoney. */
export function formatCompactMoney(amount: number, currency: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(amount) ? amount : 0);
}
