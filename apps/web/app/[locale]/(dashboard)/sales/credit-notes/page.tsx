'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    CreditNote,
    CreditNoteType,
    getCreditNoteTypeColor,
    getCreditNoteTypeLabel,
    useInfiniteCreditNotes,
} from '@/lib/hooks/use-credit-notes';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Filter, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'APPLY_TO_INVOICE', label: 'Applied to Invoice' },
];

function CreditNotesPageContent() {
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [selectedType, setSelectedType] = useState<string>('all');

  const {
    data: creditNotes,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteCreditNotes({
    ...tableParams.queryParams,
    type: selectedType !== 'all' ? (selectedType as CreditNoteType) : undefined,
  });

  const canCreate = hasPermission('sales.create');

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  const columns: ColumnDef<CreditNote>[] = [
    {
      accessorKey: 'creditNoteNumber',
      header: () => (
        <SortableHeader
          label="Credit Note #"
          columnId="creditNoteNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/sales/credit-notes/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.creditNoteNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customer.name',
      header: 'Customer',
      cell: ({ row }) => {
        const creditNote = row.original;
        return creditNote.customer ? (
          <Link href={`/sales/customers/${creditNote.customer.id}`} className="hover:underline">
            {creditNote.customer.name}
          </Link>
        ) : (
          '-'
        );
      },
    },
    {
      accessorKey: 'invoice.invoiceNumber',
      header: 'Original Invoice',
      cell: ({ row }) => {
        const creditNote = row.original;
        return creditNote.invoice ? (
          <Link href={`/sales/invoices/${creditNote.invoice.id}`} className="hover:underline">
            {creditNote.invoice.invoiceNumber}
          </Link>
        ) : (
          '-'
        );
      },
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
      cell: ({ row }) => (
        <Badge className={getCreditNoteTypeColor(row.original.type)}>
          {getCreditNoteTypeLabel(row.original.type)}
        </Badge>
      ),
    },
    {
      accessorKey: 'amount',
      header: () => (
        <SortableHeader
          label="Amount"
          columnId="amount"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right font-mono text-orange-600',
      },
      cell: ({ row }) => formatCurrency(row.original.amount),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/sales/credit-notes/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Credit Notes</h1>
          <p className="text-muted-foreground">Manage customer credit notes and refunds</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/sales/credit-notes/new">
                <Plus className="mr-2 h-4 w-4" />
                New Credit Note
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search by credit note number or customer..."
            />
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Credit Notes Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Credit Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={creditNotes}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="credit-notes"
            emptyMessage="No credit notes found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/credit-notes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Credit Note
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreditNotesPage() {
  return (
    <Suspense>
      <CreditNotesPageContent />
    </Suspense>
  );
}
