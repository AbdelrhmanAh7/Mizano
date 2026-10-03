'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGrossMarginTrend,
  useRevenueYoY,
  useAccountBalances,
  useVATSummary,
} from '@/lib/hooks/use-dashboard-sections';
import { useDashboardRevenue } from '@/lib/hooks/use-dashboard';
import { GrossProfitMarginChart } from '@/components/dashboard/charts/gross-profit-margin-chart';
import { MonthlyBurnRateChart } from '@/components/dashboard/charts/monthly-burn-rate-chart';
import { RevenueYoYChart } from '@/components/dashboard/charts/revenue-yoy-chart';
import { AccountTypeBreakdownChart } from '@/components/dashboard/charts/account-type-breakdown-chart';
import { VATSummaryChart } from '@/components/dashboard/charts/vat-summary-chart';
import { useBaseCurrency } from '@/lib/hooks/use-organization';

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

interface FinancialSectionProps {
  enabled: boolean;
}

export function FinancialSection({ enabled }: FinancialSectionProps) {
  const currency = useBaseCurrency() || 'USD';
  const { data: marginData } = useGrossMarginTrend(enabled);
  const { data: revenueData } = useDashboardRevenue(); // reuse existing, always loaded
  const { data: yoyData } = useRevenueYoY(enabled);
  const { data: accountData } = useAccountBalances(enabled);
  const { data: vatData } = useVATSummary(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {marginData ? <GrossProfitMarginChart data={marginData} /> : <ChartSkeleton />}
        {revenueData ? (
          <MonthlyBurnRateChart data={revenueData} currency={currency} />
        ) : (
          <ChartSkeleton />
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {yoyData ? <RevenueYoYChart data={yoyData} currency={currency} /> : <ChartSkeleton />}
        {accountData ? (
          <AccountTypeBreakdownChart data={accountData} currency={currency} />
        ) : (
          <ChartSkeleton />
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {vatData ? <VATSummaryChart data={vatData} currency={currency} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
