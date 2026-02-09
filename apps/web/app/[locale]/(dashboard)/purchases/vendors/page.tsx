'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
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
import { useExportAll } from '@/lib/hooks/use-export-all';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  formatCurrency,
  getBalanceColor,
  useDeleteVendor,
  useInfiniteVendors,
  Vendor,
} from '@/lib/hooks/use-vendors';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { Edit, Eye, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function VendorsPageContent() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('vendors', 'vendors');
  const tableParams = useTableParams({ defaultSortBy: 'createdAt', mode: 'virtual' });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);

  const {
    data: vendors,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteVendors({
    ...tableParams.queryParams,
  });
  const deleteVendor = useDeleteVendor();

  const canCreate = hasPermission('purchases.create');
  const canEdit = hasPermission('purchases.edit');
  const canDelete = hasPermission('purchases.delete');

  const handleDelete = (vendor: Vendor) => {
    setVendorToDelete(vendor);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (vendorToDelete) {
      try {
        await deleteVendor.mutateAsync(vendorToDelete.id);
        toast({
          title: 'Vendor deleted',
          description: `${vendorToDelete.name} has been deleted.`,
        });
      } catch (error: any) {
        toast({
          title: 'Error',
          description:
            error.response?.data?.message ||
            'Failed to delete vendor. They may have associated transactions.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setVendorToDelete(null);
    }
  };

  const columns: ColumnDef<Vendor>[] = [
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
        const vendor = row.original;
        return (
          <div>
            <Link href={`/purchases/vendors/${vendor.id}`} className="font-medium hover:underline">
              {vendor.displayName || vendor.name}
            </Link>
            {vendor.displayName && vendor.displayName !== vendor.name && (
              <p className="text-sm text-muted-foreground">{vendor.name}</p>
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
        const vendor = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/purchases/vendors/${vendor.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/purchases/vendors/${vendor.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={() => handleDelete(vendor)} className="text-red-600">
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
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">Manage your supplier accounts and track balances</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/purchases/vendors/new">
                <Plus className="mr-2 h-4 w-4" />
                New Vendor
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
              placeholder="Search by name, email, or phone..."
            />
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Vendors</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={vendors}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="vendors"
            enableSelection
            enableExport
            enableColumnVisibility
            exportFilename="vendors"
            onExportAll={onExportAll}
            emptyMessage="No vendors found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/purchases/vendors/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Vendor
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
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{vendorToDelete?.name}&quot;? This action cannot
              be undone.
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

export default function VendorsPage() {
  return (
    <Suspense>
      <VendorsPageContent />
    </Suspense>
  );
}
