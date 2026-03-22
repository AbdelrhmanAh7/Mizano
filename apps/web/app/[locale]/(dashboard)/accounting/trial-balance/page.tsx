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
import { useTrialBalance } from '@/lib/hooks/use-accounting-reports';

interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number | string;
  credit: number | string;
}

const formatAmount = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (num === 0) return '-';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { data, isLoading } = useTrialBalance(asOfDate);

  const rows: TrialBalanceRow[] = Array.isArray(data)
    ? data
    : (data?.accounts || data?.rows || []).map((a: Record<string, unknown>) => ({
        accountId: a.id || a.accountId,
        accountCode: a.code || a.accountCode,
        accountName: a.name || a.accountName,
        accountType: a.type || a.accountType,
        debit: a.debit,
        credit: a.credit,
      }));
  const totalDebit = rows.reduce(
    (sum, row) =>
      sum + (typeof row.debit === 'string' ? parseFloat(row.debit) : Number(row.debit) || 0),
    0,
  );
  const totalCredit = rows.reduce(
    (sum, row) =>
      sum + (typeof row.credit === 'string' ? parseFloat(row.credit) : Number(row.credit) || 0),
    0,
  );
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

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
                  Out of Balance: {formatAmount(Math.abs(totalDebit - totalCredit))}
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
