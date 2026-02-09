'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    formatCurrency,
    getStatusText,
    getStatusVariant,
    getTypeText,
    useInfiniteVendorCredits,
    VendorCredit,
} from '@/lib/hooks/use-vendor-credits';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function VendorCreditsPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const {
    data: credits,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteVendorCredits({
    ...tableParams.queryParams,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const columns: ColumnDef<VendorCredit>[] = [
    {
      accessorKey: 'creditNumber',
      header: () => (
        <SortableHeader
          label="Credit #"
          columnId="creditNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/purchases/credits/${row.original.id}`}
          className="font-mono text-blue-600 hover:underline"
        >
          {row.original.creditNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'vendor.name',
      header: 'Vendor',
      cell: ({ row }) => row.original.vendor?.name || '-',
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
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{getTypeText(row.original.type)}</Badge>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={getStatusVariant(row.original.status)}>
          {getStatusText(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'total',
      header: () => (
        <SortableHeader
          label="Total"
          columnId="total"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatCurrency(row.original.total, row.original.vendor?.currency || 'USD'),
    },
    {
      accessorKey: 'balanceRemaining',
      header: 'Balance',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) =>
        formatCurrency(row.original.balanceRemaining, row.original.vendor?.currency || 'USD'),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              ...
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/purchases/credits/${row.original.id}`}>
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
          <h1 className="text-3xl font-bold tracking-tight">Vendor Credits</h1>
          <p className="text-muted-foreground">Manage credits and refunds from vendors</p>
        </div>
        <Button asChild>
          <Link href="/purchases/credits/new">
            <Plus className="mr-2 h-4 w-4" />
            New Credit
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search credits..."
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="APPLIED">Applied</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Credits Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Vendor Credits</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={credits}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="vendor-credits"
            emptyMessage="No vendor credits found"
            emptyAction={
              <Button asChild>
                <Link href="/purchases/credits/new">Create your first credit</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function VendorCreditsPage() {
  return (
    <Suspense>
      <VendorCreditsPageContent />
    </Suspense>
  );
}
