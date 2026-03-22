'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Adjustment,
  AdjustmentStatus,
  AdjustmentType,
  getAdjustmentStatusColor,
  getAdjustmentStatusLabel,
  getReasonLabel,
  useInfiniteAdjustments,
} from '@/lib/hooks/use-adjustments';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { ArrowDown, ArrowUp, Eye, MoreHorizontal, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';

function AdjustmentsPageContent() {
  const t = useTranslations('inventory');
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const {
    data: adjustments,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteAdjustments({
    ...tableParams.queryParams,
    status: statusFilter !== 'all' ? (statusFilter as AdjustmentStatus) : undefined,
    type: typeFilter !== 'all' ? (typeFilter as AdjustmentType) : undefined,
  });

  const columns: ColumnDef<Adjustment>[] = [
    {
      accessorKey: 'adjustmentNumber',
      header: () => (
        <SortableHeader
          label="Adjustment #"
          columnId="adjustmentNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/inventory/adjustments/${row.original.id}`}
          className="font-medium hover:text-blue-600 hover:underline"
        >
          {row.original.adjustmentNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label="Date"
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'type',
      header: t('adjustments.table.type'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.type === 'INCREASE' ? (
            <ArrowUp className="h-4 w-4 text-green-600" />
          ) : (
            <ArrowDown className="h-4 w-4 text-red-600" />
          )}
          <span
            className={cn(
              'font-medium',
              row.original.type === 'INCREASE' ? 'text-green-600' : 'text-red-600',
            )}
          >
            {row.original.type === 'INCREASE'
              ? t('adjustments.types.increase')
              : t('adjustments.types.decrease')}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'reason',
      header: t('adjustments.table.reason'),
      cell: ({ row }) => getReasonLabel(row.original.reason),
    },
    {
      id: 'itemCount',
      header: t('adjustments.table.item'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => row.original.lines?.length || 0,
    },
    {
      id: 'totalQty',
      header: 'Total Qty',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => {
        const totalQty =
          row.original.lines?.reduce((sum, line) => sum + (line.quantityAdjusted || 0), 0) || 0;
        return (
          <span
            className={cn(
              'font-medium',
              row.original.type === 'INCREASE' ? 'text-green-600' : 'text-red-600',
            )}
          >
            {row.original.type === 'INCREASE' ? '+' : '-'}
            {totalQty}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={getAdjustmentStatusColor(row.original.status)}>
          {getAdjustmentStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/inventory/adjustments/${row.original.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                {t('common.view')}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('adjustments.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/inventory/adjustments/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('adjustments.newAdjustment')}
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search adjustments..."
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="INCREASE">{t('adjustments.types.increase')}</SelectItem>
            <SelectItem value="DECREASE">{t('adjustments.types.decrease')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="POSTED">Posted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={adjustments}
        total={total}
        isLoading={isLoading}
        enableVirtualization
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        enableColumnResizing
        tableId="adjustments"
        emptyMessage={t('adjustments.empty.title')}
        emptyAction={
          <Button asChild>
            <Link href="/inventory/adjustments/new">{t('adjustments.newAdjustment')}</Link>
          </Button>
        }
      />
    </div>
  );
}

export default function AdjustmentsPage() {
  return (
    <Suspense>
      <AdjustmentsPageContent />
    </Suspense>
  );
}
