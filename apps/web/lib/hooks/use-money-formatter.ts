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
      // Documents are calculated to two decimals in every currency (the PDFs show the same), so the screen
      // never rounds them differently (JPY 10.49 stays 10.49).
      const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
      if (currency) {
        try {
          return new Intl.NumberFormat(numberLocale, {
            style: 'currency',
            currency,
            ...digits,
          }).format(value);
        } catch {
          // A saved code Intl doesn't know (e.g. "US$") must not break the page: show it as text.
          return `${new Intl.NumberFormat(numberLocale, digits).format(value)} ${currency}`;
        }
      }
      return new Intl.NumberFormat(numberLocale, digits).format(value);
    },
    [numberLocale, baseCurrency],
  );
}
