'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  InventoryMovement,
  MovementSource,
  MovementType,
  useInfiniteInventoryMovements,
} from '@/lib/hooks/use-inventory-movements';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';
import { Suspense, useState } from 'react';

function getMovementTypeColor(type: MovementType): string {
  return type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
}

function getSourceLabel(source: MovementSource): string {
  const labels: Record<MovementSource, string> = {
    SALE: 'Sale',
    PURCHASE: 'Purchase',
    ADJUSTMENT: 'Adjustment',
    TRANSFER: 'Transfer',
    ASSEMBLY: 'Assembly',
    RETURN: 'Return',
    MANUAL: 'Manual',
  };
  return labels[source] || source;
}

function getSourceColor(source: MovementSource): string {
  const colors: Record<MovementSource, string> = {
    SALE: 'bg-blue-50 text-blue-700',
    PURCHASE: 'bg-purple-50 text-purple-700',
    ADJUSTMENT: 'bg-yellow-50 text-yellow-700',
    TRANSFER: 'bg-cyan-50 text-cyan-700',
    ASSEMBLY: 'bg-orange-50 text-orange-700',
    RETURN: 'bg-pink-50 text-pink-700',
    MANUAL: 'bg-gray-50 text-gray-700',
  };
  return colors[source] || 'bg-gray-50 text-gray-700';
}

function MovementsPageContent() {
  const money = useDocumentMoney();
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const {
    data: movements,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteInventoryMovements({
    ...tableParams.queryParams,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const columns: ColumnDef<InventoryMovement>[] = [
    {
      accessorKey: 'createdAt',
      header: () => (
        <SortableHeader
          label="Date"
          columnId="createdAt"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.createdAt), 'MMM d, yyyy HH:mm'),
    },
    {
      id: 'item',
      header: 'Item',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.item?.name || '-'}</p>
          {row.original.item?.sku && (
            <p className="text-xs text-muted-foreground font-mono">{row.original.item.sku}</p>
          )}
        </div>
      ),
    },
    {
      id: 'warehouse',
      header: 'Warehouse',
      cell: ({ row }) => row.original.warehouse?.name || '-',
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            getSourceColor(row.original.source),
          )}
        >
          {getSourceLabel(row.original.source)}
        </span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Direction',
      cell: ({ row }) => (
        <Badge className={cn('text-xs', getMovementTypeColor(row.original.type))}>
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: 'quantity',
      header: 'Quantity',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => row.original.quantity,
    },
    {
      id: 'reference',
      header: 'Reference',
      cell: ({ row }) =>
        row.original.referenceType
          ? `${row.original.referenceType} ${row.original.referenceId || ''}`
          : '-',
    },
    {
      accessorKey: 'costPerUnit',
      header: 'Cost/Unit',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => money(row.original.costPerUnit),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventory Movements</h1>
        <p className="text-muted-foreground">
          Track all stock movements across your inventory. This is a read-only view.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search movements..."
        />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="SALE">Sale</SelectItem>
            <SelectItem value="PURCHASE">Purchase</SelectItem>
            <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
            <SelectItem value="ASSEMBLY">Assembly</SelectItem>
            <SelectItem value="RETURN">Return</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="IN">IN</SelectItem>
            <SelectItem value="OUT">OUT</SelectItem>
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={movements}
        total={total}
        isLoading={isLoading}
        enableVirtualization
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        enableColumnResizing
        tableId="inventory-movements"
        emptyMessage="No inventory movements found"
        emptyAction={
          <div className="flex flex-col items-center gap-2">
            <Activity className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Movements are created automatically from sales, purchases, adjustments, and transfers.
            </p>
          </div>
        }
      />
    </div>
  );
}

export default function MovementsPage() {
  return (
    <Suspense>
      <MovementsPageContent />
    </Suspense>
  );
}
