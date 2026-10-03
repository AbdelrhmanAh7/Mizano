'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { ImportWizard } from '@/components/import/import-wizard';
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
import { vendorCreditsApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  formatCurrency,
  useInfiniteVendorCredits,
  VendorCredit,
} from '@/lib/hooks/use-vendor-credits';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Eye, Plus, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function VendorCreditsPageContent() {
  const t = useTranslations('purchases');
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [importOpen, setImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<VendorCredit[]>([]);

  const {
    data: credits,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteVendorCredits({
    ...tableParams.queryParams,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const canDelete = hasPermission('purchases.delete');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => vendorCreditsApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['vendor-credits']],
    successMessage: '{count} vendor credits deleted',
  });

  const bulkActions = [
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: VendorCredit[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

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
      accessorKey: 'amount',
      header: () => (
        <SortableHeader
          label="Total"
          columnId="amount"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) =>
        formatCurrency(row.original.amount, row.original.vendor?.currency || 'USD'),
    },
    {
      id: 'balance',
      header: 'Balance',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => {
        const balance = row.original.appliedToBillId ? '0' : row.original.amount;
        return formatCurrency(balance, row.original.vendor?.currency || 'USD');
      },
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
          <h1 className="text-3xl font-bold tracking-tight">{t('credits.title')}</h1>
          <p className="text-muted-foreground">{t('credits.pageDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button asChild>
            <Link href="/purchases/credits/new">
              <Plus className="mr-2 h-4 w-4" />
              {t('credits.newCredit')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder={t('credits.searchPlaceholder')}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('credits.allStatus')}</SelectItem>
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
          <CardTitle>{t('credits.allCredits')}</CardTitle>
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
            enableSelection
            bulkActions={bulkActions}
            emptyMessage={t('credits.noCredits')}
            emptyAction={
              <Button asChild>
                <Link href="/purchases/credits/new">{t('credits.createFirst')}</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="vendor credits"
        description="Selected vendor credits will be deleted. Credits that have been applied will be skipped."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'vendor_credits' as ImportEntityType}
        entityLabel="Vendor Credits"
        onComplete={() => refetch()}
      />
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
