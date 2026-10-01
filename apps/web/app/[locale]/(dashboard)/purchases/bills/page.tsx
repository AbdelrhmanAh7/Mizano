'use client';

import type { DateRangeValue } from '@/components/data-table';
import {
  DataTable,
  DataTableDateRangeFilter,
  DataTableFacetedFilter,
  DataTableSearch,
  SortableHeader,
} from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { ImportWizard } from '@/components/import/import-wizard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useToast } from '@/components/ui/use-toast';
import { billsApi } from '@/lib/api';
import {
  Bill,
  BillStatus,
  formatCurrency,
  getStatusText,
  getStatusVariant,
  useCloneBill,
  useDeleteBill,
  useInfiniteBills,
} from '@/lib/hooks/use-bills';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { useExportAll } from '@/lib/hooks/use-export-all';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import {
  CheckCircle,
  Copy,
  DollarSign,
  Edit,
  Eye,
  FolderOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function BillsPageContent() {
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const BILL_STATUS_OPTIONS = [
    { value: 'DRAFT', label: t('bills.status.draft') },
    { value: 'OPEN', label: t('bills.status.open') },
    { value: 'OVERDUE', label: t('bills.status.overdue') },
    { value: 'PARTIALLY_PAID', label: t('bills.status.partiallyPaid') },
    { value: 'PAID', label: t('bills.status.paid') },
  ];

  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('bills', 'bills');
  const tableParams = useTableParams({
    defaultSortBy: 'date',
    filterKeys: ['status', 'startDate', 'endDate'],
    mode: 'virtual',
  });

  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);

  const {
    data: bills,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteBills({
    ...tableParams.queryParams,
    status: (tableParams.filters.status as BillStatus) || undefined,
    startDate: tableParams.filters.startDate || undefined,
    endDate: tableParams.filters.endDate || undefined,
  });

  const dateRange: DateRangeValue | undefined =
    tableParams.filters.startDate && tableParams.filters.endDate
      ? { from: new Date(tableParams.filters.startDate), to: new Date(tableParams.filters.endDate) }
      : undefined;
  const deleteBill = useDeleteBill();
  const cloneBill = useCloneBill();

  const canCreate = hasPermission('purchases.create');
  const canEdit = hasPermission('purchases.edit');
  const canDelete = hasPermission('purchases.delete');

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkOpenOpen, setBulkOpenOpen] = useState(false);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Bill[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => billsApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['bills']],
    successMessage: '{count} draft bills deleted',
  });

  const bulkOpenAction = useBulkAction({
    mutationFn: (ids) => billsApi.bulkOpen(ids).then((r) => r.data),
    queryKeys: [['bills']],
    successMessage: '{count} bills approved and posted',
  });

  const bulkApproveAction = useBulkAction({
    mutationFn: (ids) => billsApi.bulkApprove(ids).then((r) => r.data),
    queryKeys: [['bills']],
    successMessage: '{count} bills approved',
  });

  const bulkPayAction = useBulkAction({
    mutationFn: (ids) => billsApi.bulkPay(ids).then((r) => r.data),
    queryKeys: [['bills']],
    successMessage: '{count} bills paid (payments recorded)',
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Open',
            icon: FolderOpen,
            onClick: (rows: Bill[]) => {
              setBulkSelectedRows(rows);
              setBulkOpenOpen(true);
            },
          },
          {
            label: 'Approve',
            icon: CheckCircle,
            onClick: (rows: Bill[]) => {
              setBulkSelectedRows(rows);
              setBulkApproveOpen(true);
            },
          },
          {
            label: 'Mark as Paid',
            icon: DollarSign,
            onClick: (rows: Bill[]) => {
              setBulkSelectedRows(rows);
              setBulkPayOpen(true);
            },
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: Bill[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const handleDelete = (bill: Bill) => {
    setBillToDelete(bill);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (billToDelete) {
      try {
        await deleteBill.mutateAsync(billToDelete.id);
        toast({
          title: 'Bill deleted',
          description: `Bill ${billToDelete.billNumber} has been deleted.`,
        });
      } catch (error: unknown) {
        toast({
          title: 'Error',
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            'Failed to delete bill.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setBillToDelete(null);
    }
  };

  const columns: ColumnDef<Bill>[] = [
    {
      accessorKey: 'billNumber',
      header: () => (
        <SortableHeader
          label={t('bills.table.billNumber')}
          columnId="billNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/purchases/bills/${row.original.id}`}
          className="font-mono font-medium text-blue-600 hover:underline"
        >
          {row.original.billNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'vendor.name',
      header: t('bills.table.vendor'),
      cell: ({ row }) => {
        const bill = row.original;
        return bill.vendor ? (
          <Link href={`/purchases/vendors/${bill.vendor.id}`} className="hover:underline">
            {bill.vendor.name}
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
          label={t('bills.table.date')}
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'dueDate',
      header: () => (
        <SortableHeader
          label={t('bills.table.dueDate')}
          columnId="dueDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => {
        const bill = row.original;
        const isOverdue =
          bill.status === 'OVERDUE' ||
          (bill.status === 'OPEN' && new Date(bill.dueDate) < new Date());
        return (
          <span className={cn(isOverdue && 'text-red-600')}>
            {format(new Date(bill.dueDate), 'MMM d, yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: t('bills.table.status'),
      cell: ({ row }) => (
        <Badge variant={getStatusVariant(row.original.status)}>
          {getStatusText(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'grandTotal',
      header: () => (
        <SortableHeader
          label={tCommon('total')}
          columnId="grandTotal"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatCurrency(row.original.grandTotal, row.original.vendor?.currency),
    },
    {
      accessorKey: 'balanceDue',
      header: t('bills.table.balance'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const balanceDue = parseFloat(row.original.balanceDue || '0');
        return (
          <span
            className={cn(
              'font-mono font-medium',
              balanceDue > 0 ? 'text-red-600' : 'text-green-600',
            )}
          >
            {formatCurrency(balanceDue, row.original.vendor?.currency)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const bill = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/purchases/bills/${bill.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              {canEdit && bill.status === 'DRAFT' && (
                <DropdownMenuItem asChild>
                  <Link href={`/purchases/bills/${bill.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    {tCommon('buttons.edit')}
                  </Link>
                </DropdownMenuItem>
              )}
              {canCreate && (
                <DropdownMenuItem onClick={() => cloneBill.mutate(bill.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {canDelete && bill.status === 'DRAFT' && (
                <DropdownMenuItem onClick={() => handleDelete(bill)} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {tCommon('buttons.delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('bills.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          {canCreate && (
            <>
              <Button asChild variant="outline">
                <Link href="/purchases/bills/scan">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Scan Bill
                </Link>
              </Button>
              <Button asChild>
                <Link href="/purchases/bills/new">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('bills.newBill')}
                </Link>
              </Button>
            </>
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
              placeholder="Search by bill number or vendor..."
            />
            <DataTableFacetedFilter
              title={t('bills.table.status')}
              options={BILL_STATUS_OPTIONS}
              selected={tableParams.filters.status ? [tableParams.filters.status] : []}
              onSelectionChange={(values) =>
                tableParams.setFilter('status', values[0] || undefined)
              }
              singleSelect
            />
            <DataTableDateRangeFilter
              value={dateRange}
              onChange={(range) => {
                if (range) {
                  tableParams.setFilters({
                    startDate: format(range.from, 'yyyy-MM-dd'),
                    endDate: format(range.to, 'yyyy-MM-dd'),
                  });
                } else {
                  tableParams.setFilters({ startDate: undefined, endDate: undefined });
                }
              }}
              placeholder="Date range"
            />
            {(tableParams.activeFilterCount > 0 || tableParams.search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={tableParams.resetParams}
                className="text-muted-foreground"
              >
                <X className="mr-1 h-4 w-4" />
                Reset
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Refresh bills"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bills Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('bills.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={bills}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="bills"
            enableSelection
            enableExport
            enableColumnVisibility
            exportFilename="bills"
            onExportAll={onExportAll}
            bulkActions={bulkActions}
            emptyMessage={t('bills.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/purchases/bills/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('bills.newBill')}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bills.deleteBill')}</AlertDialogTitle>
            <AlertDialogDescription>{tCommon('confirm.deleteMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="bills"
        description="Only draft bills will be deleted. Non-draft bills will be skipped."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkOpenOpen}
        onOpenChange={setBulkOpenOpen}
        action="open"
        count={bulkSelectedRows.length}
        itemType="bills"
        description="Draft bills will be marked as open. This will create accounting entries."
        isLoading={bulkOpenAction.isLoading}
        onConfirm={async () => {
          await bulkOpenAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkOpenOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkApproveOpen}
        onOpenChange={setBulkApproveOpen}
        action="approve"
        count={bulkSelectedRows.length}
        itemType="bills"
        description="Draft bills will be approved and posted to the ledger (expense, VAT and accounts payable)."
        isLoading={bulkApproveAction.isLoading}
        onConfirm={async () => {
          await bulkApproveAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkApproveOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkPayOpen}
        onOpenChange={setBulkPayOpen}
        action="mark as paid"
        count={bulkSelectedRows.length}
        itemType="bills"
        description="A payment for the full remaining balance will be recorded for each bill from the default bank account and posted to the ledger."
        isLoading={bulkPayAction.isLoading}
        onConfirm={async () => {
          await bulkPayAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkPayOpen(false);
          refetch();
        }}
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'bills' as ImportEntityType}
        entityLabel="Bills"
        onComplete={() => refetch()}
      />
    </div>
  );
}

export default function BillsPage() {
  return (
    <Suspense>
      <BillsPageContent />
    </Suspense>
  );
}
