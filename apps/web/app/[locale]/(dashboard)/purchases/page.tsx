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
import { useBills, formatCurrency, getStatusVariant } from '@/lib/hooks/use-bills';
import { useExpenses } from '@/lib/hooks/use-expenses';
import { differenceInDays } from 'date-fns';

export default function PurchasesPage() {
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
      description: 'Manage your vendor contacts, payment terms, and purchase history.',
      icon: Users,
      href: '/purchases/vendors',
      color: 'text-blue-600',
      bgColor: 'bg-blue-500',
      stats: `${vendors.length} total`,
    },
    {
      title: t('expenses.title'),
      description: 'Record and categorize business expenses for accurate tracking.',
      icon: Receipt,
      href: '/purchases/expenses',
      color: 'text-red-600',
      bgColor: 'bg-red-500',
      stats: `${expenses.length} recorded`,
    },
    {
      title: t('bills.title'),
      description: 'Track vendor bills, schedule payments, and manage accounts payable.',
      icon: FileText,
      href: '/purchases/bills',
      color: 'text-purple-600',
      bgColor: 'bg-purple-500',
      stats: `${unpaidBills.length} unpaid`,
    },
    {
      title: t('payments.title'),
      description: 'Record payments made to vendors and suppliers.',
      icon: Banknote,
      href: '/purchases/payments',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-500',
      stats: 'Track payments',
    },
    {
      title: t('credits.title'),
      description: 'Manage vendor credits and apply them to outstanding bills.',
      icon: CreditCard,
      href: '/purchases/credits',
      color: 'text-orange-600',
      bgColor: 'bg-orange-500',
      stats: 'Manage credits',
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
            <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(totalPayable, 'USD')}</div>
            )}
            <p className="text-xs text-muted-foreground">Across {vendors.length} vendors</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Amount</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(overdueAmount, 'USD')}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{overdueBills.length} overdue bills</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unpaid Bills</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{unpaidBills.length}</div>
            )}
            <p className="text-xs text-muted-foreground">Open, overdue, or partially paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid This Month</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">{paidThisMonth.length}</div>
            )}
            <p className="text-xs text-muted-foreground">Bills paid this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/purchases/bills/new">
            <Plus className="mr-2 h-4 w-4" />
            New Bill
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchases/expenses/new">
            <Plus className="mr-2 h-4 w-4" />
            New Expense
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchases/payments/new">
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
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
                  <module.icon className="h-5 w-5 text-white" />
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
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {bills.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recent activity</p>
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
                            {formatCurrency(parseFloat(bill.grandTotal || '0'), 'USD')}
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
            <CardTitle className="text-lg text-red-600">Overdue Bills</CardTitle>
            {overdueBills.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/purchases/bills?status=OVERDUE">View All</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {overdueBills.length === 0 ? (
              <p className="text-muted-foreground text-sm">No overdue bills</p>
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
                            <p className="text-xs text-red-600">{daysOverdue} days overdue</p>
                            <p className="text-sm font-mono font-semibold text-red-600">
                              {formatCurrency(parseFloat(bill.balanceDue || '0'), 'USD')}
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
