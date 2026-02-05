'use client';

import Link from 'next/link';
import { Users, FileText, Receipt, CreditCard, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomers, formatCurrency } from '@/lib/hooks/use-customers';
import { useInvoices } from '@/lib/hooks/use-invoices';
import { useQuotes } from '@/lib/hooks/use-quotes';

export default function SalesPage() {
  const { data: customersData, isLoading: customersLoading } = useCustomers({ limit: 1000 });
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({ limit: 1000 });
  const { data: quotesData, isLoading: quotesLoading } = useQuotes({ limit: 1000 });

  const customers = customersData?.data || [];
  const invoices = invoicesData?.data || [];
  const quotes = quotesData?.data || [];

  const isLoading = customersLoading || invoicesLoading || quotesLoading;

  // Calculate metrics
  const totalOutstanding = customers.reduce(
    (sum: number, c: any) => sum + parseFloat(c.outstandingBalance || '0'),
    0
  );

  const overdueInvoices = invoices.filter((i: any) => i.status === 'OVERDUE');
  const overdueAmount = overdueInvoices.reduce(
    (sum: number, i: any) => sum + parseFloat(i.balanceDue || '0'),
    0
  );

  const pendingQuotes = quotes.filter((q: any) => q.status === 'SENT');
  const pendingQuotesTotal = pendingQuotes.reduce(
    (sum: number, q: any) => sum + parseFloat(q.grandTotal || '0'),
    0
  );

  const paidThisMonth = invoices
    .filter((i: any) => i.status === 'PAID')
    .reduce((sum: number, i: any) => sum + parseFloat(i.grandTotal || '0'), 0);

  const modules = [
    {
      title: 'Customers',
      description: 'Manage customer accounts and view balances',
      icon: Users,
      href: '/sales/customers',
      color: 'bg-blue-500',
      stats: `${customers.length} total`,
    },
    {
      title: 'Quotes',
      description: 'Create and send estimates to customers',
      icon: FileText,
      href: '/sales/quotes',
      color: 'bg-purple-500',
      stats: `${pendingQuotes.length} pending`,
    },
    {
      title: 'Invoices',
      description: 'Create invoices and track payments',
      icon: Receipt,
      href: '/sales/invoices',
      color: 'bg-green-500',
      stats: `${invoices.filter((i: any) => i.status === 'SENT').length} unpaid`,
    },
    {
      title: 'Credit Notes',
      description: 'Issue refunds and invoice adjustments',
      icon: CreditCard,
      href: '/sales/credit-notes',
      color: 'bg-orange-500',
      stats: 'Manage refunds',
    },
    {
      title: 'Payments Received',
      description: 'Record and track customer payments',
      icon: TrendingUp,
      href: '/sales/payments',
      color: 'bg-cyan-500',
      stats: 'Track payments',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
        <p className="text-muted-foreground">
          Manage customers, quotes, invoices, and payments
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(totalOutstanding, 'USD')}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Across {customers.length} customers
            </p>
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
            <p className="text-xs text-muted-foreground">
              {overdueInvoices.length} overdue invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Quotes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(pendingQuotesTotal, 'USD')}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {pendingQuotes.length} quotes awaiting response
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received This Month</CardTitle>
            <CreditCard className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(paidThisMonth, 'USD')}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              From paid invoices
            </p>
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
              <p className="text-sm text-muted-foreground mb-4">
                {module.description}
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href={module.href}>Open {module.title}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
