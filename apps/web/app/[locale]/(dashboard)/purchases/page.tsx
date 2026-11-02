'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Users,
  Receipt,
  FileText,
  Banknote,
  CreditCard,
  ArrowRight,
  Plus,
  DollarSign,
  AlertCircle,
  Clock,
  TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useVendors } from '@/lib/hooks/use-vendors';
import { useBills, getStatusVariant } from '@/lib/hooks/use-bills';
import { useExpenses } from '@/lib/hooks/use-expenses';
import { differenceInDays } from 'date-fns';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

export default function PurchasesPage() {
  // Overview figures are ledger amounts, in the org base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');

  const { data: vendorsData, isLoading: vendorsLoading } = useVendors({ limit: 100 });
  const { data: billsData, isLoading: billsLoading } = useBills({ limit: 100 });
  const { data: expensesData, isLoading: expensesLoading } = useExpenses({ limit: 100 });

  const vendors = vendorsData?.data || [];
  const bills = billsData?.data || [];
  const expenses = expensesData?.data || [];

  const isLoading = vendorsLoading || billsLoading || expensesLoading;

  // Calculate metrics
  const totalPayable = bills.reduce((sum: number, b: { balanceDue?: string }) => {
    const balance = parseFloat(b.balanceDue || '0');
    return balance > 0 ? sum + balance : sum;
  }, 0);

  const overdueBills = bills.filter((b: { status: string }) => b.status === 'OVERDUE');
  const overdueAmount = overdueBills.reduce(
    (sum: number, b: { balanceDue?: string }) => sum + parseFloat(b.balanceDue || '0'),
    0,
  );

  const unpaidBills = bills.filter(
    (b: { status: string }) =>
      b.status === 'OPEN' || b.status === 'OVERDUE' || b.status === 'PARTIALLY_PAID',
  );

  const now = new Date();
  const paidThisMonth = bills.filter((b: { status: string; date: string }) => {
    if (b.status !== 'PAID') return false;
    const billDate = new Date(b.date);
    return billDate.getMonth() === now.getMonth() && billDate.getFullYear() === now.getFullYear();
  });

  const modules = [
    {
      title: t('vendors.title'),
      description: t('overview.modules.vendors.description'),
      icon: Users,
      href: '/purchases/vendors',
      color: 'text-info',
      bgColor: 'bg-info text-info-foreground',
      stats: t('overview.modules.vendors.stats', { count: vendors.length }),
    },
    {
      title: t('expenses.title'),
      description: t('overview.modules.expenses.description'),
      icon: Receipt,
      href: '/purchases/expenses',
      color: 'text-destructive',
      bgColor: 'bg-destructive text-destructive-foreground',
      stats: t('overview.modules.expenses.stats', { count: expenses.length }),
    },
    {
      title: t('bills.title'),
      description: t('overview.modules.bills.description'),
      icon: FileText,
      href: '/purchases/bills',
      color: 'text-primary',
      bgColor: 'bg-primary text-primary-foreground',
      stats: t('overview.modules.bills.stats', { count: unpaidBills.length }),
    },
    {
      title: t('payments.title'),
      description: t('overview.modules.payments.description'),
      icon: Banknote,
      href: '/purchases/payments',
      color: 'text-success',
      bgColor: 'bg-success text-success-foreground',
      stats: t('overview.modules.payments.stats'),
    },
    {
      title: t('credits.title'),
      description: t('overview.modules.credits.description'),
      icon: CreditCard,
      href: '/purchases/credits',
      color: 'text-warning',
      bgColor: 'bg-warning text-warning-foreground',
      stats: t('overview.modules.credits.stats'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('overview.totalPayable')}</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(totalPayable)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {t('overview.acrossVendors', { count: vendors.length })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('overview.overdueAmount')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency(overdueAmount)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t('overview.overdueBillsCount', { count: overdueBills.length })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('overview.unpaidBills')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{unpaidBills.length}</div>
            )}
            <p className="text-xs text-muted-foreground">{t('overview.unpaidHint')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('overview.paidThisMonth')}</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-success">{paidThisMonth.length}</div>
            )}
            <p className="text-xs text-muted-foreground">{t('overview.paidThisMonthHint')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/purchases/bills/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('bills.newBill')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchases/expenses/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('expenses.newExpense')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchases/payments/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('payments.recordPayment')}
          </Link>
        </Button>
      </div>

      {/* Module Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${module.bgColor}`}>
                  <module.icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">{module.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{module.stats}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="text-sm">{module.description}</CardDescription>
              <Link href={module.href}>
                <Button variant="outline" className="w-full group">
                  {tCommon('buttons.view')}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity & Overdue Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('overview.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {bills.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('overview.noRecentActivity')}</p>
            ) : (
              <div className="space-y-3">
                {bills
                  .slice(0, 5)
                  .map(
                    (bill: {
                      id: string;
                      billNumber: string;
                      status: string;
                      grandTotal?: string;
                      date: string;
                      vendor?: { id: string; name: string };
                    }) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <Link
                            href={`/purchases/bills/${bill.id}`}
                            className="font-medium hover:underline text-sm"
                          >
                            {bill.billNumber}
                          </Link>
                          <p className="text-xs text-muted-foreground">{bill.vendor?.name}</p>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant={getStatusVariant(
                              bill.status as
                                | 'DRAFT'
                                | 'OPEN'
                                | 'OVERDUE'
                                | 'PARTIALLY_PAID'
                                | 'PAID'
                                | 'VOID',
                            )}
                            className="text-xs"
                          >
                            {bill.status}
                          </Badge>
                          <p className="text-sm font-mono mt-1">
                            {formatCurrency(bill.grandTotal)}
                          </p>
                        </div>
                      </div>
                    ),
                  )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Bills */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg text-destructive">{t('overview.overdueBills')}</CardTitle>
            {overdueBills.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/purchases/bills?status=OVERDUE">{t('overview.viewAll')}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {overdueBills.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('overview.noOverdue')}</p>
            ) : (
              <div className="space-y-3">
                {overdueBills
                  .slice(0, 5)
                  .map(
                    (bill: {
                      id: string;
                      billNumber: string;
                      dueDate: string;
                      balanceDue?: string;
                      vendor?: { id: string; name: string };
                    }) => {
                      const daysOverdue = differenceInDays(new Date(), new Date(bill.dueDate));
                      return (
                        <div
                          key={bill.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div>
                            <Link
                              href={`/purchases/bills/${bill.id}`}
                              className="font-medium hover:underline text-sm"
                            >
                              {bill.billNumber}
                            </Link>
                            <p className="text-xs text-muted-foreground">{bill.vendor?.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-destructive">
                              {t('overview.daysOverdue', { days: daysOverdue })}
                            </p>
                            <p className="text-sm font-mono font-semibold text-destructive">
                              {formatCurrency(bill.balanceDue)}
                            </p>
                          </div>
                        </div>
                      );
                    },
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
