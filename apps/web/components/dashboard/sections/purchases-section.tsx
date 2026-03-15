'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBillStatus,
  useTopVendors,
  usePurchaseTrend,
  useExpenseTrend,
  useVendorPaymentTime,
} from '@/lib/hooks/use-dashboard-sections';
import { BillStatusChart } from '@/components/dashboard/charts/bill-status-chart';
import { TopVendorsChart } from '@/components/dashboard/charts/top-vendors-chart';
import { PurchasesTrendChart } from '@/components/dashboard/charts/purchases-trend-chart';
import { ExpenseTrendChart } from '@/components/dashboard/charts/expense-trend-chart';
import { VendorPaymentTimeChart } from '@/components/dashboard/charts/vendor-payment-time-chart';

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

interface PurchasesSectionProps {
  enabled: boolean;
}

// Note: payables-aging-chart exists but needs receivables-aging endpoint data
// We skip it here since it reuses the existing `/reports/payables-aging` endpoint
// which returns differently structured data. Can be added later with a dedicated hook.

export function PurchasesSection({ enabled }: PurchasesSectionProps) {
  const { data: billStatusData } = useBillStatus(enabled);
  const { data: vendorsData } = useTopVendors(enabled);
  const { data: purchaseTrendData } = usePurchaseTrend(enabled);
  const { data: expenseTrendData } = useExpenseTrend(enabled);
  const { data: paymentTimeData } = useVendorPaymentTime(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {billStatusData ? <BillStatusChart data={billStatusData} /> : <ChartSkeleton />}
        {vendorsData ? <TopVendorsChart data={vendorsData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {purchaseTrendData ? <PurchasesTrendChart data={purchaseTrendData} /> : <ChartSkeleton />}
        {expenseTrendData ? <ExpenseTrendChart data={expenseTrendData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {paymentTimeData ? <VendorPaymentTimeChart data={paymentTimeData} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
