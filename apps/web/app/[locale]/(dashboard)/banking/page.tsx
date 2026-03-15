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
import { useBankingStats } from '@/lib/hooks/use-bank-accounts';
import { formatCurrency } from '@/lib/hooks/use-bank-accounts';

export default function BankingPage() {
  const t = useTranslations('banking');
  const { data: stats, isLoading: statsLoading } = useBankingStats();

  const modules = [
    {
      title: t('accounts.title'),
      description: 'View and manage your bank accounts, balances, and transactions.',
      icon: DollarSign,
      href: '/banking/accounts',
      color: 'text-blue-600',
    },
    {
      title: t('reconciliation.title'),
      description: 'Match bank statements with your records for accurate bookkeeping.',
      icon: BarChart3,
      href: '/banking/reconcile',
      color: 'text-green-600',
    },
    {
      title: t('rules.title'),
      description: 'Automate transaction categorization with custom bank rules.',
      icon: FileText,
      href: '/banking/rules',
      color: 'text-purple-600',
    },
    {
      title: t('transactions.title'),
      description: 'View all imported bank transactions and their matching status.',
      icon: TrendingUp,
      href: '/banking/transactions',
      color: 'text-orange-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Landmark className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Accounts</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.totalAccounts ?? 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Balance</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold font-mono">
                    {formatCurrency(stats?.totalSystemBalance ?? 0)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Transactions</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.pendingTransactionCount ?? 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.monthlyTransactionCount ?? 0}</p>
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
                  Open
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
