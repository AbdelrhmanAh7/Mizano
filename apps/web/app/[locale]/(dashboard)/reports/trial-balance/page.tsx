'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import {
  useTrialBalanceReport,
  formatCurrency,
  TrialBalanceAccount,
} from '@/lib/hooks/use-reports';

export default function TrialBalanceReportPage() {
  const t = useTranslations('reports');
  const [asOfDate, setAsOfDate] = useState(new Date());

  const { data: report, isLoading } = useTrialBalanceReport(format(asOfDate, 'yyyy-MM-dd'));

  const currencyCode = report?.currencyCode;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const accounts = Array.isArray(report?.accounts) ? report.accounts : [];
  const totalDebits = report?.totalDebits ?? 0;
  const totalCredits = report?.totalCredits ?? 0;
  const isBalanced = report?.isBalanced ?? true;
  const hasData = accounts.length > 0;

  const getAccountTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      ASSET: 'bg-blue-100 text-blue-800',
      LIABILITY: 'bg-purple-100 text-purple-800',
      EQUITY: 'bg-green-100 text-green-800',
      INCOME: 'bg-emerald-100 text-emerald-800',
      EXPENSE: 'bg-red-100 text-red-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('trialBalance.title')}</h1>
          <p className="text-muted-foreground">As of {format(asOfDate, 'MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* Filters */}
      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      {!hasData ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No trial balance data available. Create some transactions first.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Balance Status */}
          <Card className={cn('border-2', isBalanced ? 'border-green-500' : 'border-red-500')}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isBalanced ? (
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-600" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {isBalanced ? 'Trial Balance is Balanced' : 'Trial Balance is Not Balanced'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isBalanced
                        ? 'Total debits equal total credits'
                        : `Difference: ${formatCurrency(Math.abs(totalDebits - totalCredits), currencyCode)}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t('trialBalance.totalDebit')}
                      </p>
                      <p className="text-xl font-bold font-mono">
                        {formatCurrency(totalDebits, currencyCode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t('trialBalance.totalCredit')}
                      </p>
                      <p className="text-xl font-bold font-mono">
                        {formatCurrency(totalCredits, currencyCode)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trial Balance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Account Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>{t('trialBalance.account')}</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">{t('trialBalance.debit')}</TableHead>
                    <TableHead className="text-right">{t('trialBalance.credit')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account: TrialBalanceAccount) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono">{account.code}</TableCell>
                      <TableCell className="font-medium">{account.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getAccountTypeColor(account.type)}>
                          {account.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {account.debit > 0 ? formatCurrency(account.debit, currencyCode) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {account.credit > 0 ? formatCurrency(account.credit, currencyCode) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(totalDebits, currencyCode)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(totalCredits, currencyCode)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
