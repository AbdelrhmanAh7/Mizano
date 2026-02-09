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
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  getTransferStatusColor,
  getTransferStatusLabel,
  Transfer,
  TransferStatus,
  useInfiniteTransfers,
} from '@/lib/hooks/use-transfers';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, MoreHorizontal, Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function TransfersPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const {
    data: transfers,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteTransfers({
    ...tableParams.queryParams,
    status: statusFilter !== 'all' ? (statusFilter as TransferStatus) : undefined,
  });

  const columns: ColumnDef<Transfer>[] = [
    {
      accessorKey: 'transferNumber',
      header: () => (
        <SortableHeader
          label="Transfer #"
          columnId="transferNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/inventory/transfers/${row.original.id}`}
          className="font-medium hover:text-blue-600 hover:underline"
        >
          {row.original.transferNumber}
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
      id: 'from',
      header: 'From',
      cell: ({ row }) => row.original.fromWarehouse?.name || '-',
    },
    {
      id: 'to',
      header: 'To',
      cell: ({ row }) => row.original.toWarehouse?.name || '-',
    },
    {
      id: 'itemCount',
      header: 'Items',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => row.original.lines?.length || 0,
    },
    {
      id: 'totalQty',
      header: 'Total Qty',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => {
        const totalQty =
          row.original.lines?.reduce((sum, line) => sum + (line.quantity || 0), 0) || 0;
        return totalQty;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={getTransferStatusColor(row.original.status)}>
          {getTransferStatusLabel(row.original.status)}
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
              <Link href={`/inventory/transfers/${row.original.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
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
          <h1 className="text-3xl font-bold tracking-tight">Stock Transfers</h1>
          <p className="text-muted-foreground">Transfer inventory between warehouses</p>
        </div>
        <Button asChild>
          <Link href="/inventory/transfers/new">
            <Plus className="mr-2 h-4 w-4" />
            New Transfer
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search transfers..."
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={transfers}
        total={total}
        isLoading={isLoading}
        enableVirtualization
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        enableColumnResizing
        tableId="transfers"
        emptyMessage="No transfers found"
        emptyAction={
          <Button asChild>
            <Link href="/inventory/transfers/new">Create Transfer</Link>
          </Button>
        }
      />
    </div>
  );
}

export default function TransfersPage() {
  return (
    <Suspense>
      <TransfersPageContent />
    </Suspense>
  );
}
