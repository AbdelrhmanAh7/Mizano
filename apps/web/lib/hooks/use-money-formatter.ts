'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { documentCurrency, useMoneyFormat } from '@/lib/hooks/use-organization';

/** The Intl locale for amounts (with the organization's Arabic digits) and the base currency. */
function useMoneyLocale(): { numberLocale: string; baseCurrency: string | undefined } {
  const locale = useLocale();
  const { data } = useMoneyFormat();
  const digits = data?.documentDigits === 'arab' ? 'arab' : 'latn';
  return {
    numberLocale: locale === 'ar' ? `ar-u-nu-${digits}` : 'en',
    baseCurrency: data?.baseCurrency,
  };
}

/**
 * Formats a money amount for display in the document's own currency, else the organization base
 * currency (never a guessed USD; review-lessons §11). Arabic uses the organization's digits
 * (Western 0123 or Arabic-Indic ٠١٢٣, the same setting as the Arabic PDFs); English always 0123.
 * Until the base currency has loaded, amounts show as plain numbers rather than a wrong currency.
 * Display only: the value itself stays a decimal string everywhere else.
 */
export function useMoneyFormatter(): (
  amount: string | number | null | undefined,
  currencyCode?: string | null,
) => string {
  const { numberLocale, baseCurrency } = useMoneyLocale();

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

/**
 * Compact form of {@link useMoneyFormatter} for charts and stat tiles (EGP 1.2M), with the same
 * currency rule: the given currency, else the organization base currency, never USD.
 */
export function useCompactMoneyFormatter(): (
  amount: string | number | null | undefined,
  currencyCode?: string | null,
) => string {
  const { numberLocale, baseCurrency } = useMoneyLocale();

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
