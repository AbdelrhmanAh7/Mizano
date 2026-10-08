'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TriangleAlert, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  formatCurrency,
  usePossibleDuplicates,
  type PossibleDuplicatesTarget,
} from '@/lib/hooks/use-bills';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface PossibleDuplicatesBannerProps {
  target: PossibleDuplicatesTarget;
}

/**
 * Dismissible, non-blocking warning on an unposted bill or a completed intake when posted bills of the same vendor
 * have the identical amount and currency within ±3 days. Nothing shows while loading or when
 * there is no match; a failed or inconclusive (missing vendor, amount, date or currency) check says so
 * rather than looking like "no match".
 */
export function PossibleDuplicatesBanner({
  target,
}: PossibleDuplicatesBannerProps): JSX.Element | null {
  const { hasPermission } = usePermissions();
  // The check route requires purchases.view; a role with only purchases.create must not see a failed check.
  if (!hasPermission('purchases.view')) return null;
  return <DuplicatesAlert target={target} />;
}

function DuplicatesAlert({ target }: PossibleDuplicatesBannerProps): JSX.Element | null {
  const t = useTranslations('purchases.bills.duplicates');
  const { data, isError, refetch } = usePossibleDuplicates(target);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (isError) {
    return (
      <Alert data-testid="possible-duplicates-error">
        <AlertDescription className="flex items-center justify-between gap-2">
          <span>{t('checkFailed')}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (data?.status === 'unknown') {
    return (
      <Alert data-testid="possible-duplicates-unknown">
        <AlertDescription>{t('unknown')}</AlertDescription>
      </Alert>
    );
  }

  if (data?.status !== 'possible') return null;

  return (
    <Alert data-testid="possible-duplicates" className="border-warning/30 bg-warning/10 pe-12">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>
        <p>{t('body')}</p>
        <ul className="mt-2 space-y-1">
          {data.matches.map((match) => (
            <li key={match.billId} className="flex flex-wrap gap-x-2">
              <Link href={`/purchases/bills/${match.billId}`} className="font-mono underline">
                {match.billNumber}
              </Link>
              <span dir="ltr">{match.documentDate}</span>
              <span className="font-mono" dir="ltr">
                {formatCurrency(match.amount, match.currency)}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute end-2 top-2 h-8 w-8"
        aria-label={t('dismiss')}
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
