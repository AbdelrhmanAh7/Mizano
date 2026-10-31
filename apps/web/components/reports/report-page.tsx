'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFormatter } from '@/lib/hooks/use-date-locale';
import type { ReportAccount } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { cn } from '@/lib/utils';

/** A report page's title row: back to the reports index, title and period line. */
export function ReportPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" asChild>
        <Link href="/reports">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Report period lines in the page language with Western digits: "1 يناير 2026 - 31 أكتوبر 2026"
 * and "حتى 31 أكتوبر 2026" ("As of October 31, 2026" in English).
 */
export function useReportDateLabels(): {
  period: (start: Date, end: Date) => string;
  asOf: (date: Date) => string;
} {
  const formatDate = useDateFormatter('long');
  const t = useTranslations('reports');
  return {
    period: (start, end) => `${formatDate(start)} - ${formatDate(end)}`,
    asOf: (date) => t('aging.asOf', { date: formatDate(date) }),
  };
}

/** Loading placeholder of a report page (title, filters, body). */
export function ReportPageSkeleton({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-12 w-full max-w-md" />
      {children ?? <Skeleton className="h-96" />}
    </div>
  );
}

/** A report that failed to load, with Retry; never shown as "no data". */
export function ReportLoadError({ onRetry }: { onRetry: () => void }): JSX.Element {
  const tc = useTranslations('common');
  return (
    <Card>
      <CardContent className="pt-6 text-center space-y-4" role="alert">
        <p className="text-muted-foreground">{tc('table.error')}</p>
        <Button variant="outline" onClick={onRetry}>
          {tc('dashboard.tryAgain')}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * One statement account with its children indented below it, amounts in the base currency.
 * `labelOf` names a row in the page language (the section rows the report transform adds);
 * it is passed down to the children and falls back to the account name.
 */
export function ReportAccountRow({
  account,
  level = 0,
  labelOf,
}: {
  account: ReportAccount;
  level?: number;
  labelOf?: (account: ReportAccount) => string;
}): JSX.Element {
  const formatCurrency = useMoneyFormatter();
  return (
    <div>
      <div
        className={cn(
          'flex justify-between py-2 border-b',
          level === 0 && 'font-medium',
          level > 0 && 'text-sm',
        )}
        style={{ paddingLeft: `${level * 24}px` }}
      >
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono">{account.code}</span>
          {labelOf ? labelOf(account) : account.name}
        </span>
        <span className="font-mono">{formatCurrency(account.balance)}</span>
      </div>
      {account.children?.map((child) => (
        <ReportAccountRow key={child.id} account={child} level={level + 1} labelOf={labelOf} />
      ))}
    </div>
  );
}
