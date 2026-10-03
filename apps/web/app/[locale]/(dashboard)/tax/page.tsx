'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import {
  Percent,
  FileText,
  ArrowRight,
  Plus,
  Calculator,
  TrendingUp,
  Clock,
  AlertCircle,
  CreditCard,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useTaxDashboardStats,
  formatCurrency,
  getVATReturnStatusColor,
  getVATReturnStatusLabel,
  type VATReturnStatus,
} from '@/lib/hooks/use-tax';

export default function TaxPage() {
  const t = useTranslations('tax');
  const { data: stats, isLoading } = useTaxDashboardStats();

  const modules = [
    {
      title: t('rates.title'),
      description: t('rates.description'),
      icon: Percent,
      href: '/tax/rates',
      color: 'bg-blue-500',
      stats: stats ? `${stats.activeRates} active` : undefined,
    },
    {
      title: t('returns.title'),
      description: t('returns.description'),
      icon: FileText,
      href: '/tax/returns',
      color: 'bg-green-500',
      stats: stats ? `${stats.pendingReturns} pending` : undefined,
    },
    {
      title: t('payments.title'),
      description: t('payments.description'),
      icon: CreditCard,
      href: '/tax/payments',
      color: 'bg-purple-500',
      stats: stats ? formatCurrency(stats.totalPaid) : undefined,
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
          <Link href="/tax/returns/generate">
            <Plus className="mr-2 h-4 w-4" />
            {t('hub.newReturn')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/tax/rates">
            <Percent className="mr-2 h-4 w-4" />
            {t('hub.newRate')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/tax/returns">
            <FileText className="mr-2 h-4 w-4" />
            {t('hub.viewReturns')}
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.activeRates')}</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{stats?.activeRates ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats
                ? t('hub.stats.activeRatesDesc', {
                    count: stats.activeRates,
                    total: stats.totalRates,
                  })
                : '\u00A0'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.pendingReturns')}</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">{stats?.pendingReturns ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats
                ? t('hub.stats.pendingReturnsDesc', { count: stats.pendingReturns })
                : '\u00A0'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.outstandingVat')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(stats?.outstandingVAT ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('hub.stats.outstandingVatDesc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('hub.stats.totalPaid')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats?.totalPaid ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('hub.stats.totalPaidDesc')}</p>
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
                  {isLoading ? (
                    <Skeleton className="h-4 w-16 mt-1" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{module.stats}</p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{module.description}</p>
              <Button asChild variant="outline" className="w-full group">
                <Link href={module.href}>
                  Open {module.title}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity & Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent VAT Returns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('hub.recentReturns')}</CardTitle>
            {(stats?.recentReturns?.length ?? 0) > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/tax/returns">{t('hub.viewAllReturns')}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !stats?.recentReturns?.length ? (
              <div className="text-center py-8">
                <Calculator className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">{t('hub.noRecentReturns')}</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/tax/returns/generate">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('hub.newReturn')}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentReturns.map(
                  (ret: {
                    id: string;
                    returnNumber?: string;
                    status: string;
                    netPayable: number | string;
                    startDate: string;
                    endDate: string;
                  }) => {
                    const netVal =
                      typeof ret.netPayable === 'string'
                        ? parseFloat(ret.netPayable)
                        : ret.netPayable;
                    return (
                      <div
                        key={ret.id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <Link
                            href={`/tax/returns/${ret.id}`}
                            className="font-medium hover:underline text-sm"
                          >
                            {ret.returnNumber || 'VAT Return'}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(ret.startDate), 'MMM d')} -{' '}
                            {format(new Date(ret.endDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge className={getVATReturnStatusColor(ret.status as VATReturnStatus)}>
                            {getVATReturnStatusLabel(ret.status as VATReturnStatus)}
                          </Badge>
                          <p
                            className={`text-sm font-mono mt-1 ${netVal > 0 ? 'text-red-600' : 'text-green-600'}`}
                          >
                            {formatCurrency(Math.abs(netVal))}
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

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('hub.upcomingDeadlines')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !stats?.upcomingDeadlines?.length ? (
              <div className="text-center py-8">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">{t('hub.noDeadlines')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.upcomingDeadlines.map(
                  (dl: {
                    id: string;
                    returnNumber?: string;
                    dueDate?: string;
                    status: string;
                    startDate: string;
                    endDate: string;
                  }) => {
                    const daysUntilDue = dl.dueDate
                      ? Math.ceil(
                          (new Date(dl.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                        )
                      : null;
                    const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                    return (
                      <div
                        key={dl.id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <Link
                            href={`/tax/returns/${dl.id}`}
                            className="font-medium hover:underline text-sm"
                          >
                            {dl.returnNumber || 'VAT Return'}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(dl.startDate), 'MMM d')} -{' '}
                            {format(new Date(dl.endDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="text-right">
                          {daysUntilDue !== null && (
                            <p
                              className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}
                            >
                              {isOverdue
                                ? t('hub.overdue', { days: Math.abs(daysUntilDue) })
                                : t('hub.dueIn', { days: daysUntilDue })}
                            </p>
                          )}
                          {dl.dueDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(dl.dueDate), 'MMM d, yyyy')}
                            </p>
                          )}
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
