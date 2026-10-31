'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { documentCurrency, useBaseCurrency } from '@/lib/hooks/use-organization';

/**
 * Formats a money amount for display in the document's own currency, else the organization base
 * currency (never a guessed USD; review-lessons §11). Arabic uses Western digits, like the PDFs.
 * Until the base currency has loaded, amounts show as plain numbers rather than a wrong currency.
 * Display only: the value itself stays a decimal string everywhere else.
 */
export function useMoneyFormatter(): (
  amount: string | number | null | undefined,
  currencyCode?: string | null,
) => string {
  const locale = useLocale();
  const baseCurrency = useBaseCurrency();
  const numberLocale = locale === 'ar' ? 'ar-u-nu-latn' : 'en';

  return useCallback(
    (amount, currencyCode) => {
      const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
      const value = Number.isFinite(num) ? num : 0;
      const currency = documentCurrency(currencyCode, baseCurrency);
      return new Intl.NumberFormat(
        numberLocale,
        currency
          ? { style: 'currency', currency }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      ).format(value);
    },
    [numberLocale, baseCurrency],
  );
}

/**
 * Compact form of {@link useMoneyFormatter} for charts and stat tiles (EGP 1.2M), with the same
 * currency rule: the given currency, else the organization base currency, never USD.
 */
export function useCompactMoneyFormatter(): (
  amount: string | number | null | undefined,
  currencyCode?: string | null,
) => string {
  const locale = useLocale();
  const baseCurrency = useBaseCurrency();
  const numberLocale = locale === 'ar' ? 'ar-u-nu-latn' : 'en';

  return useCallback(
    (amount, currencyCode) => {
      const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
      const value = Number.isFinite(num) ? num : 0;
      const currency = documentCurrency(currencyCode, baseCurrency);
      return new Intl.NumberFormat(numberLocale, {
        ...(currency ? { style: 'currency' as const, currency } : {}),
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    },
    [numberLocale, baseCurrency],
  );
}
