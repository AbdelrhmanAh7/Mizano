'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, LayoutGrid, List, DollarSign, TrendingUp, Target, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeals,
  usePipelineMetrics,
  Deal,
  getDealStageColor,
  getDealStageLabel,
  formatCurrency,
} from '@/lib/hooks/use-crm';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { KanbanBoard } from '@/components/crm/kanban-board';
import { format } from 'date-fns';

export default function DealsPage() {
  const { hasPermission } = usePermissions();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');

  const { data: dealsData, isLoading } = useDeals();
  const { data: metricsData } = usePipelineMetrics();

  const deals = dealsData?.data || [];
  const metrics = metricsData?.data || metricsData;

  const canCreate = hasPermission('crm.create');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deals Pipeline</h1>
          <p className="text-muted-foreground">
            Manage your sales deals and track pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            <Button
              variant={view === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('kanban')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('table')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          {canCreate && (
            <Button asChild>
              <Link href="/crm/deals/new">
                <Plus className="mr-2 h-4 w-4" />
                New Deal
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Target className="h-4 w-4" />
                Total Deals
              </div>
              <div className="text-2xl font-bold">{metrics.totalDeals || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                Pipeline Value
              </div>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(metrics.totalValue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                Weighted Value
              </div>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(metrics.weightedValue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                Conversion Rate
              </div>
              <div className="text-2xl font-bold">
                {(metrics.conversionRate || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No deals yet</p>
            {canCreate && (
              <Button asChild>
                <Link href="/crm/deals/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Deal
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : view === 'kanban' ? (
        <KanbanBoard deals={deals} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal Name</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Probability</TableHead>
                  <TableHead>Expected Close</TableHead>
                  <TableHead>Assigned To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal: Deal) => (
                  <TableRow key={deal.id}>
                    <TableCell>
                      <Link
                        href={`/crm/deals/${deal.id}`}
                        className="font-medium hover:underline"
                      >
                        {deal.dealName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={getDealStageColor(deal.stage)}>
                        {getDealStageLabel(deal.stage)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(deal.expectedAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {deal.probability}%
                    </TableCell>
                    <TableCell>
                      {deal.expectedCloseDate
                        ? format(new Date(deal.expectedCloseDate), 'MMM d, yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>{deal.assignedTo?.name || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
