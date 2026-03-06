'use client';

import { AIBusinessPulse } from '@/components/dashboard/ai-business-pulse';
import { WidgetErrorBoundary } from '@/components/dashboard/widget-error-boundary';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { EnhancedAIInsights } from '@/components/dashboard/enhanced-ai-insights';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { StatCard } from '@/components/dashboard/stat-card';
import { WidgetCustomizer } from '@/components/dashboard/widget-customizer';
import { AutoTourTrigger } from '@/components/tour/auto-tour-trigger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/routing';
import {
  useDashboardBanking,
  useDashboardCashFlow,
  useDashboardCustomers,
  useDashboardExpenses,
  useDashboardInventory,
  useDashboardRevenue,
  useDashboardStats,
} from '@/lib/hooks/use-dashboard';
import { useDashboardFilters } from '@/lib/stores/use-dashboard-filters';
import { useDashboardLayout } from '@/lib/stores/use-dashboard-layout';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CreditCard,
  DollarSign,
  ExternalLink,
  FolderKanban,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { CashFlowChart } from '@/components/dashboard/cash-flow-chart';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { ARAPChart } from '@/components/dashboard/ar-ap-chart';
import { ExpensesPie } from '@/components/dashboard/expenses-pie';
import { ProfitMarginChart } from '@/components/dashboard/profit-margin-chart';
import { TopCustomersChart } from '@/components/dashboard/top-customers-chart';
import { BankBalanceChart } from '@/components/dashboard/bank-balance-chart';
import { InventoryValueChart } from '@/components/dashboard/inventory-value-chart';
import { CashFlowForecastChart } from '@/components/dashboard/cash-flow-forecast-chart';
import { RevenueForecastChart } from '@/components/dashboard/revenue-forecast-chart';

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[250px] w-full rounded" />
      </CardContent>
    </Card>
  );
}

function ChartDrillLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Skeleton className="h-4 w-20 mb-2" />
      <Skeleton className="h-8 w-28 mb-1" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function DashboardClient() {
  const { dateRange } = useDashboardFilters();
  const { data: statsData, isLoading: statsLoading } = useDashboardStats(dateRange);
  const { data: revenueData } = useDashboardRevenue();
  const { data: cashFlowData } = useDashboardCashFlow();
  const { data: expensesData } = useDashboardExpenses();
  const { data: customersData } = useDashboardCustomers();
  const { data: bankingData } = useDashboardBanking();
  const { data: inventoryData } = useDashboardInventory();

  const queryClient = useQueryClient();
  const t = useTranslations('common.dashboard');

  const { widgets, loadFromServer } = useDashboardLayout();
  const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order);
  const _isVisible = (id: string) => widgets.find((w) => w.id === id)?.visible ?? true;

  // Load dashboard layout from server on mount
  useEffect(() => {
    loadFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['ai-'] });
  };

  const isRefetching = queryClient.isFetching({ queryKey: ['dashboard'] }) > 0;
  const trends = statsData?.trends;

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'ai-pulse':
        return <AIBusinessPulse key={widgetId} />;

      case 'kpi-row-1':
        return (
          <div
            key={widgetId}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            data-tour="dashboard-stats"
          >
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  title={t('stats.revenue')}
                  value={statsData?.stats.revenue || 0}
                  icon={TrendingUp}
                  iconColor="text-green-600"
                  iconBgColor="bg-green-100"
                  trend={trends?.revenue}
                />
                <StatCard
                  title={t('stats.expenses')}
                  value={statsData?.stats.expenses || 0}
                  icon={TrendingDown}
                  iconColor="text-red-600"
                  iconBgColor="bg-red-100"
                  trend={
                    trends?.expenses
                      ? { ...trends.expenses, isPositive: !trends.expenses.isPositive }
                      : undefined
                  }
                />
                <StatCard
                  title={t('stats.netProfit')}
                  value={statsData?.stats.netProfit || 0}
                  icon={DollarSign}
                  iconColor="text-blue-600"
                  iconBgColor="bg-blue-100"
                  trend={trends?.profit}
                />
                <StatCard
                  title={t('stats.bankBalance')}
                  value={statsData?.stats.bankBalance || 0}
                  icon={Wallet}
                  iconColor="text-purple-600"
                  iconBgColor="bg-purple-100"
                />
              </>
            )}
          </div>
        );

      case 'kpi-row-2':
        return (
          <div key={widgetId} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  title={t('stats.receivables')}
                  value={statsData?.stats.totalReceivables || 0}
                  icon={Receipt}
                  iconColor="text-emerald-600"
                  iconBgColor="bg-emerald-100"
                />
                <StatCard
                  title={t('stats.payables')}
                  value={statsData?.stats.totalPayables || 0}
                  icon={CreditCard}
                  iconColor="text-orange-600"
                  iconBgColor="bg-orange-100"
                />
                <StatCard
                  title={t('stats.overdueAmount')}
                  value={
                    (statsData?.stats.overdueInvoices || 0) + (statsData?.stats.overdueBills || 0)
                  }
                  icon={AlertTriangle}
                  iconColor="text-red-600"
                  iconBgColor="bg-red-100"
                  currency="count"
                />
                <StatCard
                  title={t('stats.activeProjects')}
                  value={statsData?.stats.activeProjects || 0}
                  icon={FolderKanban}
                  iconColor="text-indigo-600"
                  iconBgColor="bg-indigo-100"
                  currency="count"
                />
              </>
            )}
          </div>
        );

      case 'ai-forecast':
        return (
          <div key={widgetId} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CashFlowForecastChart />
            <RevenueForecastChart />
          </div>
        );

      case 'cash-flow-revenue':
        return (
          <div
            key={widgetId}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            data-tour="dashboard-charts"
          >
            <div className="relative">
              {cashFlowData ? <CashFlowChart data={cashFlowData} /> : <ChartSkeleton />}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/banking/accounts" label="View Transactions" />
              </div>
            </div>
            <div className="relative">
              {revenueData ? <RevenueChart data={revenueData} /> : <ChartSkeleton />}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/sales/invoices" label="View Invoices" />
              </div>
            </div>
          </div>
        );

      case 'ar-ap-expenses':
        return (
          <div key={widgetId} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="relative">
              {statsData ? <ARAPChart data={statsData.receivablesVsPayables} /> : <ChartSkeleton />}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/sales/invoices?status=OVERDUE" label="View Overdue" />
              </div>
            </div>
            <div className="relative">
              {expensesData ? <ExpensesPie data={expensesData} /> : <ChartSkeleton />}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/purchases/expenses" label="View Expenses" />
              </div>
            </div>
          </div>
        );

      case 'profit-customers':
        return (
          <div key={widgetId} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="relative">
              {revenueData ? (
                <ProfitMarginChart
                  data={revenueData.map((r) => ({
                    month: r.month,
                    revenue: r.revenue,
                    expenses: r.expenses ?? 0,
                    profit: r.profit ?? 0,
                  }))}
                />
              ) : (
                <ChartSkeleton />
              )}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/accounting/journals" label="View P&L" />
              </div>
            </div>
            <div className="relative">
              {customersData ? <TopCustomersChart data={customersData} /> : <ChartSkeleton />}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/sales/customers" label="View Customers" />
              </div>
            </div>
          </div>
        );

      case 'bank-inventory':
        return (
          <div key={widgetId} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="relative">
              {bankingData ? <BankBalanceChart data={bankingData} /> : <ChartSkeleton />}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/banking/accounts" label="View Accounts" />
              </div>
            </div>
            <div className="relative">
              {inventoryData ? <InventoryValueChart data={inventoryData} /> : <ChartSkeleton />}
              <div className="absolute top-4 end-4">
                <ChartDrillLink href="/inventory/items" label="View Items" />
              </div>
            </div>
          </div>
        );

      case 'insights-transactions':
        return (
          <div key={widgetId} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div data-tour="dashboard-ai-alerts">
              <EnhancedAIInsights />
            </div>
            <div data-tour="dashboard-transactions">
              <RecentTransactions transactions={statsData?.recentTransactions || []} />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <AutoTourTrigger tourId="dashboard" />

      {/* Header with Date Range Picker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker />
          <WidgetCustomizer />
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Render widgets in user-defined order */}
      {sortedWidgets.map((widget) => {
        if (!widget.visible) return null;
        return (
          <WidgetErrorBoundary key={widget.id} widgetId={widget.id}>
            {renderWidget(widget.id)}
          </WidgetErrorBoundary>
        );
      })}
    </div>
  );
}
