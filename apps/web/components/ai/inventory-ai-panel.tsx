'use client';

import { Brain, Package, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReorderSummary, useForecastDashboard } from '@/lib/hooks/use-ai';

export function InventoryAIPanel() {
  const { data: reorderData, isLoading: reorderLoading } = useReorderSummary();
  const { data: forecastData, isLoading: forecastLoading } = useForecastDashboard();

  if (reorderLoading || forecastLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const reorder = reorderData?.data;
  const forecast = forecastData?.data;

  if (!reorder && !forecast) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Reorder Alerts */}
      {reorder && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" />
              AI Reorder Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm text-muted-foreground">Need Reorder</span>
                </div>
                <Badge variant="destructive">{reorder.needsReorder || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-muted-foreground">Dead Stock</span>
                </div>
                <Badge variant="secondary">{reorder.deadStock || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-muted-foreground">Optimal Stock</span>
                </div>
                <Badge variant="outline">{reorder.optimal || 0}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demand Forecast */}
      {forecast && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" />
              Demand Forecast Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Items with Forecasts</span>
                <span className="text-sm font-medium">{forecast.totalForecasts || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Accuracy</span>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  {forecast.averageAccuracy
                    ? `${(forecast.averageAccuracy * 100).toFixed(1)}%`
                    : 'N/A'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Next Update</span>
                <span className="text-xs text-muted-foreground">
                  {forecast.nextUpdate ? new Date(forecast.nextUpdate).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
