'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DollarSign, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/hooks/use-projects';

interface BudgetData {
  budgetUsedPercent?: number;
  isOverBudget?: boolean;
  budget?: string | number;
  grossProfit?: string | number;
}

interface BudgetProgressCardProps {
  data: BudgetData | null | undefined;
  isLoading?: boolean;
}

export function BudgetProgressCard({ data, isLoading }: BudgetProgressCardProps) {
  if (isLoading || !data) return null;

  const pct = Math.min(data.budgetUsedPercent ?? 0, 100);
  const overBudget = data.isOverBudget ?? false;

  const barColor = overBudget ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Budget
          </span>
          {overBudget && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Over Budget
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Progress value={pct} className="h-3" />
          <div
            className={cn('absolute inset-0 rounded-full transition-all', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{pct.toFixed(0)}% used</span>
          <span className="font-medium">Budget: {formatCurrency(data.budget)}</span>
        </div>
        {data.grossProfit !== undefined && (
          <div className="flex items-center justify-between text-sm border-t pt-2">
            <span className="text-muted-foreground">Gross Profit</span>
            <span
              className={cn(
                'font-medium font-mono',
                parseFloat(String(data.grossProfit)) >= 0 ? 'text-green-600' : 'text-red-600',
              )}
            >
              {formatCurrency(data.grossProfit)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
