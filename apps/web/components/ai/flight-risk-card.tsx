'use client';

import { Brain, AlertTriangle, Users } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFlightRisk } from '@/lib/hooks/use-ai';
import { getRiskLevelColor, formatAttritionRisk, formatTenure } from '@/lib/hooks/use-ai-attrition';

export function FlightRiskCard() {
  const { data, isLoading } = useFlightRisk(5);

  if (isLoading) {
    return <Skeleton className="h-64 mb-6" />;
  }

  const employees = data?.data || [];

  if (employees.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          Employee Flight Risk
          <Badge variant="destructive" className="ml-auto">
            {employees.length} at risk
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {employees.map((employee: any) => (
            <div
              key={employee.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    href={`/hr/employees/${employee.id}`}
                    className="text-sm font-medium hover:underline truncate"
                  >
                    {employee.name}
                  </Link>
                  <Badge variant="outline" className={getRiskLevelColor(employee.riskLevel)}>
                    {employee.riskLevel}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {employee.department}
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {formatAttritionRisk(employee.attritionRisk)}
                  </span>
                  <span>Tenure: {formatTenure(employee.tenure || 0)}</span>
                </div>
                {employee.recommendations && employee.recommendations.length > 0 && (
                  <div className="text-xs text-blue-600 mt-1">
                    💡 {employee.recommendations[0]}
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/hr/employees/${employee.id}`}>Review</Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
