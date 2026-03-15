'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useStockLevels,
  useInventoryMovements,
  useReorderAlerts,
  useWorkOrderStatus,
  useProductionEfficiency,
} from '@/lib/hooks/use-dashboard-sections';
import { StockLevelsChart } from '@/components/dashboard/charts/stock-levels-chart';
import { InventoryMovementsChart } from '@/components/dashboard/charts/inventory-movements-chart';
import { ReorderAlertsChart } from '@/components/dashboard/charts/reorder-alerts-chart';
import { WorkOrderStatusChart } from '@/components/dashboard/charts/work-order-status-chart';
import { ProductionEfficiencyChart } from '@/components/dashboard/charts/production-efficiency-chart';

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

interface InventorySectionProps {
  enabled: boolean;
}

export function InventorySection({ enabled }: InventorySectionProps) {
  const { data: stockData } = useStockLevels(enabled);
  const { data: movementsData } = useInventoryMovements(enabled);
  const { data: reorderData } = useReorderAlerts(enabled);
  const { data: workOrderData } = useWorkOrderStatus(enabled);
  const { data: efficiencyData } = useProductionEfficiency(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stockData ? <StockLevelsChart data={stockData} /> : <ChartSkeleton />}
        {movementsData ? <InventoryMovementsChart data={movementsData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {reorderData ? <ReorderAlertsChart data={reorderData} /> : <ChartSkeleton />}
        {workOrderData ? <WorkOrderStatusChart data={workOrderData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {efficiencyData ? <ProductionEfficiencyChart data={efficiencyData} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
