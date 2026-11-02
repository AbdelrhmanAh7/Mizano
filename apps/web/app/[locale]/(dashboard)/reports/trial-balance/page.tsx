'use client';

import { useState } from 'react';
import { format, startOfYear } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import {
  ledgerHref,
  ReportPageHeader,
  ReportPageSkeleton,
  useReportDateLabels,
} from '@/components/reports/report-page';
import { useTrialBalanceReport, TrialBalanceAccount } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { TrialBalanceEmpty } from '@/components/reports/trial-balance-empty';

export default function TrialBalanceReportPage() {
  // Report figures are ledger amounts, in the organization base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('reports');
  const tTypes = useTranslations('common.accountTypes');
  const dateLabels = useReportDateLabels();
  const [asOfDate, setAsOfDate] = useState(new Date());

  const { data: report, isLoading } = useTrialBalanceReport(format(asOfDate, 'yyyy-MM-dd'));

  if (isLoading) {
    return <ReportPageSkeleton />;
  }

  const accounts = Array.isArray(report?.accounts) ? report.accounts : [];
  const totalDebits = report?.totalDebits ?? 0;
  const totalCredits = report?.totalCredits ?? 0;
  const isBalanced = report?.isBalanced ?? true;
  const hasData = accounts.length > 0;

  const getAccountTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      ASSET: 'bg-info/10 text-info',
      LIABILITY: 'bg-primary/10 text-primary',
      EQUITY: 'bg-success/10 text-success',
      INCOME: 'bg-success/10 text-success',
      EXPENSE: 'bg-destructive/10 text-destructive',
    };
    return colors[type] || 'bg-muted text-foreground';
  };

  return (
    <div className="space-y-6">
      <ReportPageHeader title={t('trialBalance.title')} subtitle={dateLabels.asOf(asOfDate)} />

      {/* Filters */}
      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      {!hasData ? (
        <Card>
          <CardContent className="pt-6">
            <TrialBalanceEmpty />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Balance Status */}
          <Card className={cn('border-2', isBalanced ? 'border-success' : 'border-destructive')}>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {isBalanced ? (
                    <CheckCircle className="h-8 w-8 text-success" />
                  ) : (
                    <XCircle className="h-8 w-8 text-destructive" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {isBalanced ? t('trialBalance.balanced') : t('trialBalance.notBalanced')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isBalanced
                        ? t('trialBalance.debitsEqualCredits')
                        : t('trialBalance.difference', {
                            amount: formatCurrency(Math.abs(totalDebits - totalCredits)),
                          })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t('trialBalance.totalDebit')}
                      </p>
                      <p className="text-xl font-bold font-mono">{formatCurrency(totalDebits)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t('trialBalance.totalCredit')}
                      </p>
                      <p className="text-xl font-bold font-mono">{formatCurrency(totalCredits)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trial Balance Table */}
          <Card>
            <CardHeader>
              <CardTitle>{t('trialBalance.accountBalances')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('trialBalance.code')}</TableHead>
                      <TableHead>{t('trialBalance.account')}</TableHead>
                      <TableHead>{t('trialBalance.type')}</TableHead>
                      <TableHead className="text-right">{t('trialBalance.debit')}</TableHead>
                      <TableHead className="text-right">{t('trialBalance.credit')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account: TrialBalanceAccount) => {
                      // The account's ledger up to the as-of date: its journals and documents (#669).
                      const href = ledgerHref(account.id, startOfYear(asOfDate), asOfDate);
                      const figure = (value: number) =>
                        value > 0 ? (
                          <Link href={href} className="text-primary hover:underline">
                            {formatCurrency(value)}
                          </Link>
                        ) : (
                          '-'
                        );
                      return (
                        <TableRow key={account.id}>
                          <TableCell className="font-mono">{account.code}</TableCell>
                          <TableCell className="font-medium">
                            <Link href={href} className="hover:underline">
                              {account.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getAccountTypeColor(account.type)}>
                              {tTypes.has(account.type.toLowerCase())
                                ? tTypes(account.type.toLowerCase())
                                : account.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {figure(account.debit)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {figure(account.credit)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell colSpan={3}>{t('trialBalance.total')}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(totalDebits)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(totalCredits)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
