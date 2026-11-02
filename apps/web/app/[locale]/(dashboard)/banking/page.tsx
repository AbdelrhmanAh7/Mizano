'use client';

import Link from 'next/link';
import {
  DollarSign,
  BarChart3,
  FileText,
  ArrowRight,
  Landmark,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { useBankingStats } from '@/lib/hooks/use-bank-accounts';

export default function BankingPage() {
  const t = useTranslations('banking');
  const formatCurrency = useMoneyFormatter();
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsFailed,
    refetch: refetchStats,
  } = useBankingStats();
  const tCommon = useTranslations('common');

  const modules = [
    {
      title: t('accounts.title'),
      description: t('hub.accountsDescription'),
      icon: DollarSign,
      href: '/banking/accounts',
      color: 'text-info',
    },
    {
      title: t('reconciliation.title'),
      description: t('hub.reconcileDescription'),
      icon: BarChart3,
      href: '/banking/reconcile',
      color: 'text-success',
    },
    {
      title: t('rules.title'),
      description: t('hub.rulesDescription'),
      icon: FileText,
      href: '/banking/rules',
      color: 'text-primary',
    },
    {
      title: t('transactions.title'),
      description: t('hub.transactionsDescription'),
      icon: TrendingUp,
      href: '/banking/transactions',
      color: 'text-warning',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {statsFailed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          <span>{t('hub.statsFailed')}</span>
          <Button variant="outline" size="sm" onClick={() => void refetchStats()}>
            {tCommon('combobox.retry')}
          </Button>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info/10 rounded-lg">
                <Landmark className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('hub.totalAccounts')}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">
                    {statsFailed ? '—' : (stats?.totalAccounts ?? 0)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('hub.totalBalance')}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold font-mono">
                    {statsFailed ? '—' : formatCurrency(stats?.totalSystemBalance ?? 0)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('hub.pendingTransactions')}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">
                    {statsFailed ? '—' : (stats?.pendingTransactionCount ?? 0)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('hub.thisMonth')}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">
                    {statsFailed ? '—' : (stats?.monthlyTransactionCount ?? 0)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {modules.map((module) => (
          <Card key={module.href} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${module.color}`}>
                  <module.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">{module.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="text-sm">{module.description}</CardDescription>
              <Link href={module.href}>
                <Button variant="outline" className="w-full group">
                  {tCommon('buttons.open')}
                  <ArrowRight className="ms-2 h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
