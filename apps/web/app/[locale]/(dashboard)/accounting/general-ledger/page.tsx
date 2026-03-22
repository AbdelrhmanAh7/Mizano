'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { format, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAccountsTree, flattenAccountsTree } from '@/lib/hooks/use-accounts';
import { useGeneralLedger } from '@/lib/hooks/use-accounting-reports';

interface LedgerEntry {
  date: string;
  journalId: string;
  journalNumber: string;
  description: string;
  debit: number | string;
  credit: number | string;
  runningBalance: number | string;
}

const formatAmount = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (num === 0) return '-';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatCurrency = (amount: number | string, currency = 'USD'): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(num);
};

export default function GeneralLedgerPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: accountsTree = [], isLoading: accountsLoading } = useAccountsTree();
  const flatAccounts = flattenAccountsTree(accountsTree);

  const { data, isLoading: ledgerLoading } = useGeneralLedger(
    selectedAccountId || undefined,
    dateFrom,
    dateTo,
  );

  const entries: LedgerEntry[] = data?.entries || data || [];
  const openingBalance = data?.openingBalance ?? 0;
  const closingBalance =
    data?.closingBalance ??
    (entries.length > 0 ? entries[entries.length - 1]?.runningBalance : openingBalance);

  const selectedAccount = flatAccounts.find((a) => a.id === selectedAccountId);

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
          <h1 className="text-3xl font-bold tracking-tight">General Ledger</h1>
          <p className="text-muted-foreground">View detailed transaction history by account</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Account</label>
              {accountsLoading ? (
                <Skeleton className="h-10 w-full mt-1" />
              ) : (
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {flatAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <span style={{ paddingLeft: `${account.level * 16}px` }}>
                          {account.code} - {account.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label htmlFor="dateFrom" className="text-sm font-medium text-muted-foreground">
                From
              </label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="dateTo" className="text-sm font-medium text-muted-foreground">
                To
              </label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table */}
      {!selectedAccountId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an account to view its general ledger.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedAccount
                ? `${selectedAccount.code} - ${selectedAccount.name}`
                : 'General Ledger'}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {format(new Date(dateFrom), 'MMM d, yyyy')} -{' '}
                {format(new Date(dateTo), 'MMM d, yyyy')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ledgerLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Journal #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening Balance */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={5}>Opening Balance</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(openingBalance)}
                    </TableCell>
                  </TableRow>

                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No transactions found for the selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry, index) => (
                      <TableRow key={`${entry.journalId}-${index}`}>
                        <TableCell>{format(new Date(entry.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Link
                            href={`/accounting/journals/${entry.journalId}`}
                            className="font-medium hover:underline"
                          >
                            {entry.journalNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{entry.description || '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(entry.debit)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(entry.credit)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(entry.runningBalance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* Closing Balance */}
                  <TableRow className="border-t-2 bg-muted/50 font-semibold">
                    <TableCell colSpan={5}>Closing Balance</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(closingBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
