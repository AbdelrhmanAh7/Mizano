'use client';

import { useBaseCurrency } from '@/lib/hooks/use-organization';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePayrollTrend,
  useDepartmentHeadcount,
  useAttendanceOverview,
  useSalaryDistribution,
  useAttritionRisk,
} from '@/lib/hooks/use-dashboard-sections';
import { PayrollTrendChart } from '@/components/dashboard/charts/payroll-trend-chart';
import { DepartmentHeadcountChart } from '@/components/dashboard/charts/department-headcount-chart';
import { AttendanceOverviewChart } from '@/components/dashboard/charts/attendance-overview-chart';
import { SalaryDistributionChart } from '@/components/dashboard/charts/salary-distribution-chart';
import { AttritionRiskChart } from '@/components/dashboard/charts/attrition-risk-chart';

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

interface HRSectionProps {
  enabled: boolean;
}

export function HRSection({ enabled }: HRSectionProps) {
  const currency = useBaseCurrency();
  const { data: payrollData } = usePayrollTrend(enabled);
  const { data: headcountData } = useDepartmentHeadcount(enabled);
  const { data: attendanceData } = useAttendanceOverview(enabled);
  const { data: salaryData } = useSalaryDistribution(enabled);
  const { data: attritionData } = useAttritionRisk(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {payrollData && currency ? (
          <PayrollTrendChart data={payrollData} currency={currency} />
        ) : (
          <ChartSkeleton />
        )}
        {headcountData ? <DepartmentHeadcountChart data={headcountData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {attendanceData ? <AttendanceOverviewChart data={attendanceData} /> : <ChartSkeleton />}
        {salaryData ? <SalaryDistributionChart data={salaryData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {attritionData ? <AttritionRiskChart data={attritionData} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
