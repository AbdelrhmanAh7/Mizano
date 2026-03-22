'use client';

import { PipelineForecastCard } from '@/components/ai';
import { KanbanBoard } from '@/components/crm/kanban-board';
import { DataTable, SortableHeader } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Deal,
  DealStage,
  formatCurrency,
  getDealStageColor,
  getDealStageLabel,
  useInfiniteDeals,
  usePipelineMetrics,
} from '@/lib/hooks/use-crm';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Clock, DollarSign, LayoutGrid, List, Plus, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';

function DealsPageContent() {
  const t = useTranslations('crm');
  const tCommon = useTranslations('common');
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });
  const [view, setView] = useState<'kanban' | 'table'>('kanban');

  const {
    data: deals,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteDeals({
    search: tableParams.search || undefined,
    page: tableParams.page,
  });
  const { data: metricsData } = usePipelineMetrics();
  const metrics = metricsData?.data || metricsData;

  const canCreate = hasPermission('crm.create');

  const columns: ColumnDef<Deal>[] = [
    {
      accessorKey: 'dealName',
      header: () => (
        <SortableHeader
          label={t('deals.form.name')}
          columnId="dealName"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link href={`/crm/deals/${row.original.id}`} className="font-medium hover:underline">
          {row.original.dealName}
        </Link>
      ),
    },
    {
      accessorKey: 'stage',
      header: t('deals.table.stage'),
      cell: ({ row }) => (
        <Badge className={getDealStageColor(row.original.stage)}>
          {getDealStageLabel(row.original.stage)}
        </Badge>
      ),
    },
    {
      accessorKey: 'expectedAmount',
      header: () => (
        <SortableHeader
          label={tCommon('amount')}
          columnId="expectedAmount"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.original.expectedAmount)}</span>
      ),
    },
    {
      accessorKey: 'probability',
      header: t('deals.table.probability'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => `${row.original.probability}%`,
    },
    {
      accessorKey: 'expectedCloseDate',
      header: t('deals.table.expectedClose'),
      cell: ({ row }) =>
        row.original.expectedCloseDate
          ? format(new Date(row.original.expectedCloseDate), 'MMM d, yyyy')
          : '-',
    },
    {
      id: 'assignedTo',
      header: t('deals.form.assignedTo'),
      cell: ({ row }) => row.original.assignedTo?.name || '-',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('deals.pipeline.title')}</h1>
          <p className="text-muted-foreground">{t('deals.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md">
            <Button
              type="button"
              variant={view === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('kanban')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
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
                {t('deals.newDeal')}
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
                {t('deals.pipeline.totalDeals')}
              </div>
              <div className="text-2xl font-bold">{metrics.totalDeals || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                {t('deals.pipeline.pipelineValue')}
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
                {t('deals.pipeline.weightedValue')}
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
                {t('deals.pipeline.conversionRate')}
              </div>
              <div className="text-2xl font-bold">{(metrics.conversionRate || 0).toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pipeline Stage Breakdown */}
      {metrics?.byStage && Object.keys(metrics.byStage).length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {t('deals.pipeline.byStage')}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(
                metrics.byStage as Record<string, { count: number; value: number }>,
              ).map(([stage, data]) => (
                <div key={stage} className="flex flex-col gap-1 p-3 rounded-lg border">
                  <Badge className={getDealStageColor(stage as DealStage)}>
                    {getDealStageLabel(stage as DealStage)}
                  </Badge>
                  <span className="text-lg font-bold">
                    {t('deals.pipeline.dealCount', { count: data.count })}
                  </span>
                  <span className="text-sm text-muted-foreground font-mono">
                    {formatCurrency(data.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Pipeline Forecast */}
      <PipelineForecastCard />

      {/* Content */}
      {view === 'kanban' ? (
        isLoading ? (
          <DataTable
            columns={columns}
            data={[]}
            isLoading={true}
            emptyMessage={t('deals.empty.title')}
          />
        ) : deals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">{t('deals.empty.title')}</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/crm/deals/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('deals.empty.action')}
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <KanbanBoard deals={deals} />
        )
      ) : (
        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={deals}
              total={total}
              isLoading={isLoading}
              enableVirtualization
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
              enableColumnResizing
              tableId="deals"
              emptyMessage={t('deals.empty.title')}
              emptyAction={
                canCreate ? (
                  <Button asChild>
                    <Link href="/crm/deals/new">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('deals.empty.action')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense>
      <DealsPageContent />
    </Suspense>
  );
}
