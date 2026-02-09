'use client';

import type { DateRangeValue } from '@/components/data-table';
import {
  DataTable,
  DataTableDateRangeFilter,
  DataTableSearch,
  SortableHeader,
} from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
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
import { expensesApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import {
  Expense,
  formatCurrency,
  useDeleteExpense,
  useInfiniteExpenses,
} from '@/lib/hooks/use-expenses';
import { useExportAll } from '@/lib/hooks/use-export-all';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { CheckCircle, Eye, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function ExpensesPageContent() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('expenses', 'expenses');
  const tableParams = useTableParams({
    defaultSortBy: 'date',
    filterKeys: ['startDate', 'endDate'],
    mode: 'virtual',
  });

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
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Expense[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => expensesApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['expenses']],
    successMessage: '{count} expenses deleted',
  });

  const bulkApproveAction = useBulkAction({
    mutationFn: (ids) => expensesApi.bulkApprove(ids).then((r) => r.data),
    queryKeys: [['expenses']],
    successMessage: '{count} expenses approved',
  });

  const canEdit = hasPermission('purchases.edit');

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Approve',
            icon: CheckCircle,
            onClick: (rows: Expense[]) => {
              setBulkSelectedRows(rows);
              setBulkApproveOpen(true);
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
            onClick: (rows: Expense[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
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
          title: 'Expense deleted',
          description: 'The expense has been deleted.',
        });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete expense.',
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
      accessorKey: 'account.name',
      header: 'Category',
      cell: ({ row }) =>
        row.original.account ? <Badge variant="secondary">{row.original.account.name}</Badge> : '-',
    },
    {
      accessorKey: 'vendor.name',
      header: 'Vendor',
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
      header: 'Reference',
      meta: { cellClassName: 'font-mono text-sm' },
      cell: ({ row }) => row.original.reference || '-',
    },
    {
      accessorKey: 'description',
      header: 'Description',
      meta: { cellClassName: 'max-w-[200px] truncate' },
      cell: ({ row }) => row.original.description || '-',
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
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono font-medium' },
      cell: ({ row }) => {
        const expense = row.original;
        const total = parseFloat(expense.amount) + parseFloat(expense.taxAmount || '0');
        return formatCurrency(expense.taxInclusive ? expense.amount : total);
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
                  View
                </Link>
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem onClick={() => handleDelete(expense)} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
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
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track and manage business expenses</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/purchases/expenses/new">
                <Plus className="mr-2 h-4 w-4" />
                New Expense
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
              placeholder="Search by description, reference, or vendor..."
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
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Expenses</CardTitle>
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
            emptyMessage="No expenses found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/purchases/expenses/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Your First Expense
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
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
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
        itemType="expenses"
        description="Selected expenses will be permanently deleted."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkApproveOpen}
        onOpenChange={setBulkApproveOpen}
        action="approve"
        count={bulkSelectedRows.length}
        itemType="expenses"
        description="Selected expenses will be approved."
        isLoading={bulkApproveAction.isLoading}
        onConfirm={async () => {
          await bulkApproveAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkApproveOpen(false);
          refetch();
        }}
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
