'use client';

import { Brain, TrendingDown, Award, Users } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useHighRiskCustomers, useCLVSegments } from '@/lib/hooks/use-ai';
import { getRiskLevelColor, formatChurnRisk } from '@/lib/hooks/use-ai-churn-prediction';
import { getSegmentColor, formatCLV } from '@/lib/hooks/use-ai-clv';

export function CustomerAIInsights() {
  const { data: churnData, isLoading: churnLoading } = useHighRiskCustomers(5);
  const { data: clvData, isLoading: clvLoading } = useCLVSegments();

  if (churnLoading || clvLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const churnCustomers = churnData?.data || [];
  const segments = clvData?.data || [];

  if (churnCustomers.length === 0 && segments.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Churn Risk */}
      {churnCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              High Churn Risk Customers
              <Badge variant="destructive" className="ml-auto">
                {churnCustomers.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {churnCustomers
                .slice(0, 5)
                .map(
                  (customer: {
                    id: string;
                    name: string;
                    totalRevenue?: number;
                    riskLevel: string;
                    churnRisk: number;
                  }) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between p-2 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/sales/customers/${customer.id}`}
                          className="text-sm font-medium hover:underline truncate block"
                        >
                          {customer.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          Revenue: ${customer.totalRevenue?.toLocaleString() || '0'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getRiskLevelColor(customer.riskLevel)}>
                          {formatChurnRisk(customer.churnRisk)}
                        </Badge>
                      </div>
                    </div>
                  ),
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CLV Segments */}
      {segments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              Customer Lifetime Value Segments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {segments.map(
                (segment: {
                  segment: string;
                  count: number;
                  averageCLV?: number;
                  percentage?: number;
                }) => (
                  <div key={segment.segment} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4" />
                        <span className="text-sm font-medium">{segment.segment}</span>
                      </div>
                      <Badge variant="outline" className={getSegmentColor(segment.segment)}>
                        {segment.count} customers
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pl-6">
                      <span>Avg CLV: {formatCLV(segment.averageCLV || 0)}</span>
                      <span>{segment.percentage?.toFixed(1)}% of total</span>
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
