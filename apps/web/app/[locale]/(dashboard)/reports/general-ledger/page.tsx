'use client';

import { useState } from 'react';
import { format, startOfYear, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ReportFilters } from '@/components/reports/report-filters';
import {
  ReportPageHeader,
  ReportPageSkeleton,
  useReportDateLabels,
} from '@/components/reports/report-page';
import { useGeneralLedgerReport } from '@/lib/hooks/use-reports';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useDateFnsLocale } from '@/lib/date-locale';

export default function GeneralLedgerPage() {
  const dateLocale = useDateFnsLocale();
  // Report figures are ledger amounts, in the organization base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('reports');
  const dateLabels = useReportDateLabels();
  const [dateRange, setDateRange] = useState({
    startDate: startOfYear(new Date()),
    endDate: endOfMonth(new Date()),
  });
  const [accountId, setAccountId] = useState('');

  const { data: accounts } = useAccounts();
  const { data: ledger, isLoading } = useGeneralLedgerReport(accountId, {
    startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
    endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
  });

  const accountList = accounts?.data || accounts || [];

  if (isLoading && accountId) {
    return <ReportPageSkeleton />;
  }

  const entries = ledger?.entries || [];
  const openingBalance = ledger?.openingBalance || 0;
  const closingBalance = ledger?.closingBalance || 0;

  return (
    <div className="space-y-6">
      <ReportPageHeader
        title={t('generalLedger.title')}
        subtitle={<>{dateLabels.period(dateRange.startDate, dateRange.endDate)}</>}
      />

      <div className="flex flex-wrap gap-4 items-end">
        <div className="w-[300px]">
          <label className="text-sm font-medium mb-1.5 block">{t('generalLedger.account')}</label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder={t('generalLedger.selectAccount')} />
            </SelectTrigger>
            <SelectContent>
              {Array.isArray(accountList) &&
                accountList.map((account: { id: string; code: string; name: string }) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} showDateRange />
      </div>

      {!accountId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('generalLedger.selectAccountTitle')}</h3>
            <p className="text-muted-foreground">{t('generalLedger.selectAccountHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('cashFlow.openingBalance')}</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(openingBalance)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('cashFlow.closingBalance')}</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(closingBalance)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ledger Entries</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No entries found for this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Journal #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">{t('trialBalance.debit')}</TableHead>
                      <TableHead className="text-right">{t('trialBalance.credit')}</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(
                      (
                        entry: {
                          date: string;
                          journalNumber?: string;
                          journalId?: string;
                          description?: string;
                          reference?: string;
                          debit: number;
                          credit: number;
                          runningBalance?: number;
                        },
                        i: number,
                      ) => (
                        <TableRow key={i}>
                          <TableCell>
                            {format(new Date(entry.date), 'PP', { locale: dateLocale })}
                          </TableCell>
                          <TableCell>
                            {entry.journalNumber ? (
                              <Link
                                href={`/accounting/journals/${entry.journalId}`}
                                className="text-blue-600 hover:underline"
                              >
                                {entry.journalNumber}
                              </Link>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>{entry.description || entry.reference || '-'}</TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatCurrency(entry.runningBalance || 0)}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
