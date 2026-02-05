'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
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
import { useTrialBalanceReport, formatCurrency, TrialBalanceAccount } from '@/lib/hooks/use-reports';

export default function TrialBalanceReportPage() {
  const [asOfDate, setAsOfDate] = useState(new Date());

  const { data: report, isLoading } = useTrialBalanceReport(
    format(asOfDate, 'yyyy-MM-dd')
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Mock data for display
  const mockReport = report || {
    accounts: [
      { id: '1', code: '1000', name: 'Cash', type: 'ASSET', debit: 50000, credit: 0 },
      { id: '2', code: '1100', name: 'Accounts Receivable', type: 'ASSET', debit: 35000, credit: 0 },
      { id: '3', code: '1200', name: 'Inventory', type: 'ASSET', debit: 25000, credit: 0 },
      { id: '4', code: '1500', name: 'Fixed Assets', type: 'ASSET', debit: 100000, credit: 0 },
      { id: '5', code: '2000', name: 'Accounts Payable', type: 'LIABILITY', debit: 0, credit: 20000 },
      { id: '6', code: '2100', name: 'Loans Payable', type: 'LIABILITY', debit: 0, credit: 50000 },
      { id: '7', code: '3000', name: 'Owner\'s Capital', type: 'EQUITY', debit: 0, credit: 100000 },
      { id: '8', code: '3100', name: 'Retained Earnings', type: 'EQUITY', debit: 0, credit: 15000 },
      { id: '9', code: '4000', name: 'Revenue', type: 'INCOME', debit: 0, credit: 125000 },
      { id: '10', code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', debit: 45000, credit: 0 },
      { id: '11', code: '6000', name: 'Operating Expenses', type: 'EXPENSE', debit: 35000, credit: 0 },
      { id: '12', code: '6100', name: 'Salaries', type: 'EXPENSE', debit: 20000, credit: 0 },
    ],
    totalDebits: 310000,
    totalCredits: 310000,
    isBalanced: true,
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
          <p className="text-muted-foreground">
            As of {format(asOfDate, 'MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Filters */}
      <ReportFilters
        asOfDate={asOfDate}
        onAsOfDateChange={setAsOfDate}
        showDateRange={false}
        showAsOfDate
      />

      {/* Balance Status */}
      <Card className={cn(
        'border-2',
        mockReport.isBalanced ? 'border-green-500' : 'border-red-500'
      )}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {mockReport.isBalanced ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600" />
              )}
              <div>
                <p className="font-semibold">
                  {mockReport.isBalanced
                    ? 'Trial Balance is Balanced'
                    : 'Trial Balance is Not Balanced'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {mockReport.isBalanced
                    ? 'Total debits equal total credits'
                    : `Difference: ${formatCurrency(Math.abs(mockReport.totalDebits - mockReport.totalCredits))}`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-sm text-muted-foreground">Total Debits</p>
                  <p className="text-xl font-bold font-mono">
                    {formatCurrency(mockReport.totalDebits)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Credits</p>
                  <p className="text-xl font-bold font-mono">
                    {formatCurrency(mockReport.totalCredits)}
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
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockReport.accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-mono">{account.code}</TableCell>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getAccountTypeColor(account.type)}>
                      {account.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {account.debit > 0 ? formatCurrency(account.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {account.credit > 0 ? formatCurrency(account.credit) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-bold">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(mockReport.totalDebits)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(mockReport.totalCredits)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
