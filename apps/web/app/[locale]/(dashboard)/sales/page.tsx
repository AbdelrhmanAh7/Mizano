'use client';

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
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { InvoiceStatusText } from '@/components/sales/status-badge';

export default function SalesPage() {
  // Overview figures are ledger amounts, in the org base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('sales');
  const { data: customersData, isLoading: customersLoading } = useCustomers({ limit: 100 });
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({ limit: 100 });
  const { data: quotesData, isLoading: quotesLoading } = useQuotes({ limit: 100 });

  const customers = customersData?.data || [];
  const invoices = invoicesData?.data || [];
  const quotes = quotesData?.data || [];

  const isLoading = customersLoading || invoicesLoading || quotesLoading;

  // Calculate metrics
  const totalOutstanding = customers.reduce(
    (sum: number, c: { outstandingBalance?: string }) =>
      sum + parseFloat(c.outstandingBalance || '0'),
    0,
  );

  const overdueInvoices = invoices.filter((i: { status: string }) => i.status === 'OVERDUE');
  const overdueAmount = overdueInvoices.reduce(
    (sum: number, i: { balanceDue?: string }) => sum + parseFloat(i.balanceDue || '0'),
    0,
  );

  const pendingQuotes = quotes.filter((q: { status: string }) => q.status === 'SENT');
  const pendingQuotesTotal = pendingQuotes.reduce(
    (sum: number, q: { grandTotal?: string }) => sum + parseFloat(q.grandTotal || '0'),
    0,
  );

  const paidThisMonth = invoices
    .filter((i: { status: string }) => i.status === 'PAID')
    .reduce((sum: number, i: { grandTotal?: string }) => sum + parseFloat(i.grandTotal || '0'), 0);

  const modules = [
    {
      title: t('customers.title'),
      description: t('overview.modules.customers'),
      icon: Users,
      href: '/sales/customers',
      color: 'bg-info',
      stats: t('overview.modules.customersStats', { count: customers.length }),
    },
    {
      title: t('quotes.title'),
      description: t('overview.modules.quotes'),
      icon: FileText,
      href: '/sales/quotes',
      color: 'bg-primary',
      stats: t('overview.modules.quotesStats', { count: pendingQuotes.length }),
    },
    {
      title: t('invoices.title'),
      description: t('overview.modules.invoices'),
      icon: Receipt,
      href: '/sales/invoices',
      color: 'bg-success',
      stats: t('overview.modules.invoicesStats', {
        count: invoices.filter((i: { status: string }) => i.status === 'SENT').length,
      }),
    },
    {
      title: t('creditNotes.title'),
      description: t('overview.modules.creditNotes'),
      icon: CreditCard,
      href: '/sales/credit-notes',
      color: 'bg-warning',
      stats: t('overview.modules.creditNotesStats'),
    },
    {
      title: t('payments.title'),
      description: t('overview.modules.payments'),
      icon: TrendingUp,
      href: '/sales/payments',
      color: 'bg-info',
      stats: t('overview.modules.paymentsStats'),
    },
    {
      title: t('deliveryChallans.title'),
      description: t('overview.modules.deliveryChallans'),
      icon: Truck,
      href: '/sales/delivery-challans',
      color: 'bg-destructive',
      stats: t('overview.modules.deliveryChallansStats'),
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
            {t('invoices.newInvoice')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sales/quotes/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('quotes.newQuote')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sales/payments/new">
            <DollarSign className="mr-2 h-4 w-4" />
            {t('payments.recordPayment')}
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
              <div className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {t('overview.acrossCustomers', { count: customers.length })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.overdueAmount')}</CardTitle>
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
              {t('overview.overdueCount', { count: overdueInvoices.length })}
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
              <div className="text-2xl font-bold">{formatCurrency(pendingQuotesTotal)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {t('overview.quotesAwaiting', { count: pendingQuotes.length })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.receivedThisMonth')}</CardTitle>
            <CreditCard className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-success">{formatCurrency(paidThisMonth)}</div>
            )}
            <p className="text-xs text-muted-foreground">{t('overview.fromPaidInvoices')}</p>
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
                <Link href={module.href}>{t('overview.openModule', { name: module.title })}</Link>
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
            <CardTitle className="text-lg">{t('overview.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('overview.noRecentActivity')}</p>
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
                            <InvoiceStatusText status={inv.status} />
                          </Badge>
                          <p className="text-sm font-mono mt-1">{formatCurrency(inv.grandTotal)}</p>
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
            <CardTitle className="text-lg text-destructive">
              {t('overview.overdueInvoices')}
            </CardTitle>
            {overdueInvoices.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/sales/invoices?status=OVERDUE">{t('overview.viewAll')}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {overdueInvoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('overview.noOverdue')}</p>
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
                            <p className="text-xs text-destructive">
                              {t('overview.daysOverdue', { days: daysOverdue })}
                            </p>
                            <p className="text-sm font-mono font-semibold text-destructive">
                              {formatCurrency(inv.balanceDue)}
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
