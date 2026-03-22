'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useProjectBudgets,
  useBillableHours,
  useTaskStatus,
  useProjectProfitability,
} from '@/lib/hooks/use-dashboard-sections';
import { ProjectBudgetsChart } from '@/components/dashboard/charts/project-budgets-chart';
import { BillableHoursChart } from '@/components/dashboard/charts/billable-hours-chart';
import { TaskStatusChart } from '@/components/dashboard/charts/task-status-chart';
import { ProjectProfitabilityChart } from '@/components/dashboard/charts/project-profitability-chart';

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

interface ProjectsSectionProps {
  enabled: boolean;
}

export function ProjectsSection({ enabled }: ProjectsSectionProps) {
  const { data: budgetData } = useProjectBudgets(enabled);
  const { data: hoursData } = useBillableHours(enabled);
  const { data: taskData } = useTaskStatus(enabled);
  const { data: profitData } = useProjectProfitability(enabled);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {budgetData ? <ProjectBudgetsChart data={budgetData} /> : <ChartSkeleton />}
        {hoursData ? <BillableHoursChart data={hoursData} /> : <ChartSkeleton />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {taskData ? <TaskStatusChart data={taskData} /> : <ChartSkeleton />}
        {profitData ? <ProjectProfitabilityChart data={profitData} /> : <ChartSkeleton />}
      </div>
    </div>
  );
}
