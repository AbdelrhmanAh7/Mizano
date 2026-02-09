'use client';

import { Brain, Clock, DollarSign, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCollectionPriority } from '@/lib/hooks/use-ai';

export function CollectionPriorityCard() {
  const { data, isLoading } = useCollectionPriority();

  if (isLoading) {
    return <Skeleton className="h-64 mb-6" />;
  }

  const items = data?.data || [];

  if (items.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          AI Collection Priority
          <Badge variant="secondary" className="ml-auto">
            {items.length} overdue
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.slice(0, 5).map((item: any) => (
            <div
              key={item.invoiceId}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    href={`/sales/invoices/${item.invoiceId}`}
                    className="text-sm font-medium hover:underline truncate"
                  >
                    {item.invoiceNumber}
                  </Link>
                  <Badge
                    variant="outline"
                    className={
                      item.riskLevel === 'HIGH' || item.riskLevel === 'CRITICAL'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-orange-50 text-orange-700 border-orange-200'
                    }
                  >
                    {item.riskLevel}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${item.amount?.toLocaleString() || '0'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.daysOverdue || 0} days overdue
                  </span>
                  {item.predictedPaymentDate && (
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Est: {new Date(item.predictedPaymentDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/sales/invoices/${item.invoiceId}`}>Follow Up</Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
