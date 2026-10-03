'use client';

import { sumDecimals } from '@/lib/decimal';
import { useDocumentMoney } from '@/lib/hooks/use-organization';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Users,
  FileText,
  Receipt,
  CreditCard,
  TrendingUp,
  Clock,
  AlertCircle,
  Plus,
  DollarSign,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomers } from '@/lib/hooks/use-customers';
import { useInvoices } from '@/lib/hooks/use-invoices';
import { useQuotes } from '@/lib/hooks/use-quotes';
import { differenceInDays } from 'date-fns';

export default function SalesPage() {
  const t = useTranslations('sales');
  const money = useDocumentMoney();
  const { data: customersData, isLoading: customersLoading } = useCustomers({ limit: 100 });
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({ limit: 100 });
  const { data: quotesData, isLoading: quotesLoading } = useQuotes({ limit: 100 });

  const customers = customersData?.data || [];
  const invoices = invoicesData?.data || [];
  const quotes = quotesData?.data || [];

  const isLoading = customersLoading || invoicesLoading || quotesLoading;

  // Calculate metrics
  const totalOutstanding = sumDecimals(
    customers.map((c: { outstandingBalance?: string }) => c.outstandingBalance || '0'),
  );

  const overdueInvoices = invoices.filter((i: { status: string }) => i.status === 'OVERDUE');
  const overdueAmount = sumDecimals(
    overdueInvoices.map((i: { balanceDue?: string }) => i.balanceDue || '0'),
  );

  const pendingQuotes = quotes.filter((q: { status: string }) => q.status === 'SENT');
  const pendingQuotesTotal = sumDecimals(
    pendingQuotes.map((q: { grandTotal?: string }) => q.grandTotal || '0'),
  );

  const paidThisMonth = sumDecimals(
    invoices
      .filter((i: { status: string }) => i.status === 'PAID')
      .map((i: { grandTotal?: string }) => i.grandTotal || '0'),
  );

  const modules = [
    {
      title: t('customers.title'),
      description: 'Manage customer accounts and view balances',
      icon: Users,
      href: '/sales/customers',
      color: 'bg-blue-500',
      stats: `${customers.length} total`,
    },
    {
      title: t('quotes.title'),
      description: 'Create and send estimates to customers',
      icon: FileText,
      href: '/sales/quotes',
      color: 'bg-purple-500',
      stats: `${pendingQuotes.length} pending`,
    },
    {
      title: t('invoices.title'),
      description: 'Create invoices and track payments',
      icon: Receipt,
      href: '/sales/invoices',
      color: 'bg-green-500',
      stats: `${invoices.filter((i: { status: string }) => i.status === 'SENT').length} unpaid`,
    },
    {
      title: t('creditNotes.title'),
      description: 'Issue refunds and invoice adjustments',
      icon: CreditCard,
      href: '/sales/credit-notes',
      color: 'bg-orange-500',
      stats: 'Manage refunds',
    },
    {
      title: t('payments.title'),
      description: 'Record and track customer payments',
      icon: TrendingUp,
      href: '/sales/payments',
      color: 'bg-cyan-500',
      stats: 'Track payments',
    },
    {
      title: 'Delivery Challans',
      description: 'Track goods dispatch and returns',
      icon: Truck,
      href: '/sales/delivery-challans',
      color: 'bg-rose-500',
      stats: 'Track deliveries',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/sales/invoices/new">
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sales/quotes/new">
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sales/payments/new">
            <DollarSign className="mr-2 h-4 w-4" />
            Record Payment
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.totalOutstanding')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{money(totalOutstanding)}</div>
            )}
            <p className="text-xs text-muted-foreground">Across {customers.length} customers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.overdueAmount')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-red-600">{money(overdueAmount)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {overdueInvoices.length} overdue invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.pendingQuotes')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{money(pendingQuotesTotal)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {pendingQuotes.length} quotes awaiting response
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.receivedThisMonth')}</CardTitle>
            <CreditCard className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">{money(paidThisMonth)}</div>
            )}
            <p className="text-xs text-muted-foreground">From paid invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${module.color}`}>
                  <module.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{module.stats}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{module.description}</p>
              <Button asChild variant="outline" className="w-full">
                <Link href={module.href}>Open {module.title}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity & Overdue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {invoices
                  .slice(0, 5)
                  .map(
                    (inv: {
                      id: string;
                      invoiceNumber: string;
                      status: string;
                      grandTotal?: string;
                      currencyCode?: string | null;
                      date: string;
                      customer?: { name?: string };
                    }) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <Link
                            href={`/sales/invoices/${inv.id}`}
                            className="font-medium hover:underline text-sm"
                          >
                            {inv.invoiceNumber}
                          </Link>
                          <p className="text-xs text-muted-foreground">{inv.customer?.name}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-xs">
                            {inv.status}
                          </Badge>
                          <p className="text-sm font-mono mt-1">
                            {money(inv.grandTotal || '0', inv.currencyCode)}
                          </p>
                        </div>
                      </div>
                    ),
                  )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg text-red-600">Overdue Invoices</CardTitle>
            {overdueInvoices.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/sales/invoices?status=OVERDUE">View All</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {overdueInvoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">No overdue invoices</p>
            ) : (
              <div className="space-y-3">
                {overdueInvoices
                  .slice(0, 5)
                  .map(
                    (inv: {
                      id: string;
                      invoiceNumber: string;
                      dueDate: string;
                      balanceDue?: string;
                      currencyCode?: string | null;
                      customer?: { name?: string };
                    }) => {
                      const daysOverdue = differenceInDays(new Date(), new Date(inv.dueDate));
                      return (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div>
                            <Link
                              href={`/sales/invoices/${inv.id}`}
                              className="font-medium hover:underline text-sm"
                            >
                              {inv.invoiceNumber}
                            </Link>
                            <p className="text-xs text-muted-foreground">{inv.customer?.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-red-600">{daysOverdue} days overdue</p>
                            <p className="text-sm font-mono font-semibold text-red-600">
                              {money(inv.balanceDue || '0', inv.currencyCode)}
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
