'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ReportFilters } from '@/components/reports/report-filters';
import { useBalanceSheetReport, formatCurrency, ReportAccount } from '@/lib/hooks/use-reports';

export default function BalanceSheetReportPage() {
  const [asOfDate, setAsOfDate] = useState(new Date());

  const { data: report, isLoading } = useBalanceSheetReport(format(asOfDate, 'yyyy-MM-dd'));

  const renderAccountRow = (account: ReportAccount, level = 0) => (
    <div key={account.id}>
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
          {account.name}
        </span>
        <span className="font-mono">{formatCurrency(account.balance)}</span>
      </div>
      {account.children?.map((child) => renderAccountRow(child, level + 1))}
    </div>
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
    assets: [
      { id: '1', code: '1000', name: 'Cash', type: 'ASSET', balance: 50000 },
      { id: '2', code: '1100', name: 'Accounts Receivable', type: 'ASSET', balance: 35000 },
      { id: '3', code: '1200', name: 'Inventory', type: 'ASSET', balance: 25000 },
      { id: '4', code: '1500', name: 'Fixed Assets', type: 'ASSET', balance: 100000 },
    ],
    liabilities: [
      { id: '5', code: '2000', name: 'Accounts Payable', type: 'LIABILITY', balance: 20000 },
      { id: '6', code: '2100', name: 'Loans Payable', type: 'LIABILITY', balance: 50000 },
    ],
    equity: [
      { id: '7', code: '3000', name: "Owner's Capital", type: 'EQUITY', balance: 100000 },
      { id: '8', code: '3100', name: 'Retained Earnings', type: 'EQUITY', balance: 40000 },
    ],
    totalAssets: 210000,
    totalLiabilities: 70000,
    totalEquity: 140000,
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
          <h1 className="text-3xl font-bold tracking-tight">Balance Sheet</h1>
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

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Assets</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(mockReport.totalAssets)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Liabilities</p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(mockReport.totalLiabilities)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Equity</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(mockReport.totalEquity)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets */}
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
          </CardHeader>
          <CardContent>
            {mockReport.assets.map((account: any) => renderAccountRow(account))}
            <div className="flex justify-between py-3 border-t-2 font-bold">
              <span>Total Assets</span>
              <span className="font-mono">{formatCurrency(mockReport.totalAssets)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Liabilities & Equity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Liabilities</CardTitle>
            </CardHeader>
            <CardContent>
              {mockReport.liabilities.map((account: any) => renderAccountRow(account))}
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>Total Liabilities</span>
                <span className="font-mono">{formatCurrency(mockReport.totalLiabilities)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equity</CardTitle>
            </CardHeader>
            <CardContent>
              {mockReport.equity.map((account: any) => renderAccountRow(account))}
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>Total Equity</span>
                <span className="font-mono">{formatCurrency(mockReport.totalEquity)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Balance Check */}
      <Card
        className={cn(
          'border-2',
          mockReport.totalAssets === mockReport.totalLiabilities + mockReport.totalEquity
            ? 'border-green-500 bg-green-50'
            : 'border-red-500 bg-red-50',
        )}
      >
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <span className="font-bold">Liabilities + Equity</span>
            <span className="text-xl font-bold font-mono">
              {formatCurrency(mockReport.totalLiabilities + mockReport.totalEquity)}
            </span>
          </div>
          <p
            className={cn(
              'text-sm mt-2',
              mockReport.totalAssets === mockReport.totalLiabilities + mockReport.totalEquity
                ? 'text-green-600'
                : 'text-red-600',
            )}
          >
            {mockReport.totalAssets === mockReport.totalLiabilities + mockReport.totalEquity
              ? '✓ Balance sheet is balanced'
              : '✗ Balance sheet is not balanced'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
