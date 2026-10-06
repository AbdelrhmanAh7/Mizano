'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/hooks/use-bills';
import { documentCurrency, type useBaseCurrencyQuery } from '@/lib/hooks/use-organization';

interface BillAmountProps {
  amount: string | number;
  currencyCode?: string | null;
  currencyQuery: ReturnType<typeof useBaseCurrencyQuery>;
}

/** Never label an amount until its document or ledger currency is known. */
export function BillAmount({ amount, currencyCode, currencyQuery }: BillAmountProps): JSX.Element {
  const t = useTranslations('purchases.bills.currency');
  const locale = useLocale();

  if (!currencyCode && currencyQuery.isError) {
    return (
      <span role="alert" className="inline-flex flex-wrap items-center gap-2 text-sm">
        <span>{t('error')}</span>
        <Button variant="outline" size="sm" onClick={() => void currencyQuery.refetch()}>
          {t('retry')}
        </Button>
      </span>
    );
  }

  const currency = documentCurrency(currencyCode, currencyQuery.data?.baseCurrency);
  if (!currency) {
    return (
      <span role="status" aria-label={t('loading')}>
        <span
          aria-hidden="true"
          className="inline-block h-5 w-24 animate-pulse rounded-md bg-muted align-middle"
        />
      </span>
    );
  }

  return <>{formatCurrency(amount, currency, locale)}</>;
}
