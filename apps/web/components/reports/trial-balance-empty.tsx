'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FileText, NotebookPen, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/lib/hooks/use-permissions';

/**
 * Empty trial balance (RPT-015): a new organization has posted nothing yet, which is expected.
 * Says so plainly and offers the two usual first postings the user may make, instead of a bare
 * "no data" line.
 */
export function TrialBalanceEmpty(): JSX.Element {
  const t = useTranslations('reports.trialBalance');
  const { hasPermission } = usePermissions();
  const canInvoice = hasPermission('sales.create');
  const canJournal = hasPermission('accounting.create');
  return (
    <div
      className="flex flex-col items-center gap-3 py-10 text-center"
      data-testid="trial-balance-empty"
    >
      <div className="rounded-full bg-muted p-3">
        <Scale className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-semibold">{t('emptyTitle')}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t('emptyBody')}</p>
      {(canInvoice || canJournal) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {canInvoice && (
            <Button asChild variant="outline" size="sm">
              <Link href="/sales/invoices/new">
                <FileText className="me-2 h-4 w-4" aria-hidden />
                {t('emptyNewInvoice')}
              </Link>
            </Button>
          )}
          {canJournal && (
            <Button asChild variant="outline" size="sm">
              <Link href="/accounting/journals/new">
                <NotebookPen className="me-2 h-4 w-4" aria-hidden />
                {t('emptyNewJournal')}
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
