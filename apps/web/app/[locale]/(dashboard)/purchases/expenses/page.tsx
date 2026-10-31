'use client';

import type { DateRangeValue } from '@/components/data-table';
import {
  DataTable,
  DataTableDateRangeFilter,
  DataTableSearch,
  SortableHeader,
} from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { ImportWizard } from '@/components/import/import-wizard';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
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
import { expensesApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { useBulkConfirm } from '@/lib/hooks/use-bulk-confirm';
import {
  Expense,
  formatCurrency,
  useDeleteExpense,
  useInfiniteExpenses,
} from '@/lib/hooks/use-expenses';
import { useExportAll } from '@/lib/hooks/use-export-all';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { sumDecimals } from '@/lib/decimal';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { CheckCircle, Eye, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useDateFnsLocale } from '@/lib/date-locale';

function ExpensesPageContent() {
  const dateLocale = useDateFnsLocale();
  const t = useTranslations('purchases');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('expenses', 'expenses');
  const tableParams = useTableParams({
    defaultSortBy: 'date',
    filterKeys: ['startDate', 'endDate'],
    mode: 'virtual',
  });

  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  const {
    data: expenses,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteExpenses({
    ...tableParams.queryParams,
    startDate: tableParams.filters.startDate || undefined,
    endDate: tableParams.filters.endDate || undefined,
  });

  const dateRange: DateRangeValue | undefined =
    tableParams.filters.startDate && tableParams.filters.endDate
      ? { from: new Date(tableParams.filters.startDate), to: new Date(tableParams.filters.endDate) }
      : undefined;
  const deleteExpense = useDeleteExpense();

  const canCreate = hasPermission('purchases.create');
  const canDelete = hasPermission('purchases.delete');

  // Bulk action state

  const tBulk = useTranslations('common.bulk');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => expensesApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['expenses']],
    successMessage: tBulk.raw('expensesDeleted'),
  });
  const bulkDelete = useBulkConfirm<Expense>(bulkDeleteAction, () => void refetch());

  const bulkApproveAction = useBulkAction({
    mutationFn: (ids) => expensesApi.bulkApprove(ids).then((r) => r.data),
    queryKeys: [['expenses']],
    successMessage: tBulk.raw('expensesApproved'),
  });
  const bulkApprove = useBulkConfirm<Expense>(bulkApproveAction, () => void refetch());

  const canEdit = hasPermission('purchases.edit');

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Approve',
            icon: CheckCircle,
            onClick: bulkApprove.openFor,
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: bulkDelete.openFor,
          },
        ]
      : []),
  ];

  const handleDelete = (expense: Expense) => {
    setExpenseToDelete(expense);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (expenseToDelete) {
      try {
        await deleteExpense.mutateAsync(expenseToDelete.id);
        toast({
          title: t('expenses.toast.deleted'),
          description: t('expenses.toast.deletedDescription'),
        });
      } catch (error: unknown) {
        toast({
          title: tCommon('errors.generic'),
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            t('expenses.toast.deleteError'),
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    }
  };

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label={t('expenses.table.date')}
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'PP', { locale: dateLocale }),
    },
    {
      accessorKey: 'account.name',
      header: t('expenses.table.account'),
      cell: ({ row }) =>
        row.original.account ? <Badge variant="secondary">{row.original.account.name}</Badge> : '-',
    },
    {
      accessorKey: 'vendor.name',
      header: t('expenses.table.vendor'),
      cell: ({ row }) =>
        row.original.vendor ? (
          <Link
            href={`/purchases/vendors/${row.original.vendor.id}`}
            className="text-blue-600 hover:underline"
          >
            {row.original.vendor.name}
          </Link>
        ) : (
          '-'
        ),
    },
    {
      accessorKey: 'reference',
      header: t('expenses.table.reference'),
      meta: { cellClassName: 'font-mono text-sm' },
      cell: ({ row }) => row.original.reference || '-',
    },
    {
      accessorKey: 'description',
      header: t('expenses.table.description'),
      meta: { cellClassName: 'max-w-[200px] truncate' },
      cell: ({ row }) => row.original.description || '-',
    },
    {
      accessorKey: 'amount',
      header: () => (
        <SortableHeader
          label={t('expenses.table.amount')}
          columnId="amount"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono font-medium' },
      cell: ({ row }) => {
        const expense = row.original;
        // `amount` is stored net of VAT for inclusive and exclusive entries alike.
        return formatCurrency(sumDecimals([expense.amount, expense.taxAmount || '0']));
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const expense = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/purchases/expenses/${expense.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem onClick={() => handleDelete(expense)} className="text-red-600">
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('expenses.title')}</h1>
          <p className="text-muted-foreground">{t('expenses.pageDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {tCommon('buttons.import')}
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/purchases/expenses/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('expenses.newExpense')}
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
              placeholder={t('expenses.searchPlaceholder')}
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
              placeholder={t('expenses.dateRange')}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label={t('expenses.refreshExpenses')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('expenses.allExpenses')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={expenses}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="expenses"
            enableSelection
            enableExport
            enableColumnVisibility
            exportFilename="expenses"
            onExportAll={onExportAll}
            bulkActions={bulkActions}
            emptyMessage={t('expenses.noExpenses')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/purchases/expenses/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('expenses.recordFirst')}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('expenses.deleteTitle')}
        description={t('expenses.deleteConfirmation')}
        onConfirm={confirmDelete}
      />

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        {...bulkDelete.dialogProps}
        action="delete"
        itemType="expenses"
        description="Selected expenses will be permanently deleted."
        destructive
      />
      <BulkActionConfirmDialog
        {...bulkApprove.dialogProps}
        action="approve"
        itemType="expenses"
        description="Selected expenses will be approved."
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'expenses' as ImportEntityType}
        entityLabel="Expenses"
        onComplete={() => refetch()}
      />
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense>
      <ExpensesPageContent />
    </Suspense>
  );
}
