'use client';

import { CustomerAIInsights } from '@/components/ai';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { AutoTourTrigger } from '@/components/tour/auto-tour-trigger';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import {
  Customer,
  formatCurrency,
  getBalanceColor,
  useDeleteCustomer,
  useInfiniteCustomers,
} from '@/lib/hooks/use-customers';
import { useExportAll } from '@/lib/hooks/use-export-all';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { Edit, Eye, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function CustomersPageContent() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('customers', 'customers');
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const {
    data: customers,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteCustomers({
    ...tableParams.queryParams,
  });
  const deleteCustomer = useDeleteCustomer();

  const canCreate = hasPermission('sales.create');
  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  const handleDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (customerToDelete) {
      try {
        await deleteCustomer.mutateAsync(customerToDelete.id);
        toast({
          title: 'Customer deleted',
          description: `${customerToDelete.name} has been deleted.`,
        });
      } catch (error: any) {
        toast({
          title: 'Error',
          description:
            error.response?.data?.message ||
            'Failed to delete customer. They may have associated transactions.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    }
  };

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label="Name"
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <div>
            <Link href={`/sales/customers/${customer.id}`} className="font-medium hover:underline">
              {customer.displayName || customer.name}
            </Link>
            {customer.displayName && customer.displayName !== customer.name && (
              <p className="text-sm text-muted-foreground">{customer.name}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email || '-',
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone || '-',
    },
    {
      accessorKey: 'currency',
      header: 'Currency',
    },
    {
      accessorKey: 'outstandingBalance',
      header: () => (
        <SortableHeader
          label="Outstanding Balance"
          columnId="outstandingBalance"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const balance = parseFloat(row.original.outstandingBalance || '0');
        return (
          <span className={cn('font-mono font-medium', getBalanceColor(balance))}>
            {formatCurrency(balance, row.original.currency)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/sales/customers/${customer.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/sales/customers/${customer.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={() => handleDelete(customer)} className="text-red-600">
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
      <AutoTourTrigger tourId="sales_customers" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customer accounts and track balances</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild data-tour="create-customer-btn">
              <Link href="/sales/customers/new">
                <Plus className="mr-2 h-4 w-4" />
                New Customer
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* AI Customer Insights */}
      <CustomerAIInsights />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search by name, email, or phone..."
            />
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card data-tour="customer-list">
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={customers}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="customers"
            enableSelection
            enableExport
            enableColumnVisibility
            exportFilename="customers"
            onExportAll={onExportAll}
            emptyMessage="No customers found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/customers/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Customer
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
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{customerToDelete?.name}&quot;? This action
              cannot be undone.
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
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersPageContent />
    </Suspense>
  );
}
