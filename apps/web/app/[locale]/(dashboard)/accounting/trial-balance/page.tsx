'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslations } from 'next-intl';
import { moneyToNumber } from '@/lib/money';
import { useTrialBalance } from '@/lib/hooks/use-accounting-reports';

interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  /** Exact decimal strings from the API. */
  debit: string;
  credit: string;
}

interface TrialBalanceResponse {
  accounts?: Array<{
    id?: string;
    accountId?: string;
    code?: string;
    accountCode?: string;
    name?: string;
    accountName?: string;
    type?: string;
    accountType?: string;
    debit?: string | number;
    credit?: string | number;
  }>;
  totals?: { totalDebits?: string | number; totalCredits?: string | number };
  isBalanced?: boolean;
}

/** Formats an API decimal string for display only (all sums are computed by the API). */
const formatAmount = (amount: string | number | undefined): string => {
  const num = moneyToNumber(amount);
  if (num === 0) return '-';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function TrialBalancePage() {
  const tc = useTranslations('common');
  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { data, isLoading, isError, refetch } = useTrialBalance(asOfDate);

  const response = (data ?? {}) as TrialBalanceResponse;
  const rows: TrialBalanceRow[] = (response.accounts ?? []).map((a) => ({
    accountId: a.id ?? a.accountId ?? '',
    accountCode: a.code ?? a.accountCode ?? '',
    accountName: a.name ?? a.accountName ?? '',
    accountType: a.type ?? a.accountType ?? '',
    debit: String(a.debit ?? '0'),
    credit: String(a.credit ?? '0'),
  }));
  // Totals and the balanced flag come from the API's exact Decimal computation.
  const totalDebit = String(response.totals?.totalDebits ?? '0');
  const totalCredit = String(response.totals?.totalCredits ?? '0');
  const isBalanced = response.isBalanced ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/accounting">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
          <p className="text-muted-foreground">View debit and credit balances for all accounts</p>
        </div>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div>
              <label htmlFor="asOfDate" className="text-sm font-medium text-muted-foreground">
                As of Date
              </label>
              <Input
                id="asOfDate"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-[200px] mt-1"
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              {isBalanced ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Balanced
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-800">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Out of Balance: {formatAmount(totalDebit)} / {formatAmount(totalCredit)}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trial Balance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance as of {format(new Date(asOfDate), 'MMMM d, yyyy')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-8 text-center space-y-4" role="alert">
              <p className="text-sm text-muted-foreground">{tc('table.error')}</p>
              <Button variant="outline" onClick={() => void refetch()}>
                {tc('dashboard.tryAgain')}
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No trial balance data available. Create and post journal entries to see data here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell className="font-mono">{row.accountCode}</TableCell>
                    <TableCell>
                      <Link
                        href={`/accounting/accounts/${row.accountId}`}
                        className="hover:underline"
                      >
                        {row.accountName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.accountType}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.debit)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(row.credit)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals */}
                <TableRow className="border-t-2 font-semibold bg-muted/50">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(totalDebit)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatAmount(totalCredit)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
