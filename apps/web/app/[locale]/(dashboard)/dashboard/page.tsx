'use client';

import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  RefreshCw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/stat-card';
import { ARAPChart } from '@/components/dashboard/ar-ap-chart';
import { CashFlowChart } from '@/components/dashboard/cash-flow-chart';
import { ExpensesPie } from '@/components/dashboard/expenses-pie';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { AIAlerts } from '@/components/dashboard/ai-alerts';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { useDashboard } from '@/lib/hooks/use-dashboard';
import { useQueryClient } from '@tanstack/react-query';

export default function DashboardPage() {
  const { data, isLoading, isRefetching } = useDashboard();
  const queryClient = useQueryClient();
  const t = useTranslations('common.dashboard');

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('failedToLoad')}</p>
        <Button onClick={handleRefresh} className="mt-4">
          {t('tryAgain')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefetching}>
          <RefreshCw className={`me-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('stats.revenue')}
          value={data.stats.revenue}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBgColor="bg-green-100"
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          title={t('stats.expenses')}
          value={data.stats.expenses}
          icon={TrendingDown}
          iconColor="text-red-600"
          iconBgColor="bg-red-100"
          trend={{ value: 5, isPositive: false }}
        />
        <StatCard
          title={t('stats.netProfit')}
          value={data.stats.netProfit}
          icon={DollarSign}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
          trend={{ value: 18, isPositive: true }}
        />
        <StatCard
          title={t('stats.bankBalance')}
          value={data.stats.bankBalance}
          icon={Wallet}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-100"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashFlowChart data={data.cashFlowTrend} />
        <RevenueChart data={data.revenueTrend} />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ARAPChart data={data.receivablesVsPayables} />
        <ExpensesPie data={data.topExpenses} />
      </div>

      {/* AI Alerts & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AIAlerts alerts={data.alerts} />
        <RecentTransactions transactions={data.recentTransactions} />
      </div>
    </div>
  );
}
