'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useVendors,
  useDeleteVendor,
  Vendor,
  formatCurrency,
  getBalanceColor,
} from '@/lib/hooks/use-vendors';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';

export default function VendorsPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);

  const { data: vendorsData, isLoading, refetch } = useVendors({
    search: searchQuery || undefined,
  });
  const deleteVendor = useDeleteVendor();

  const vendors = vendorsData?.data || [];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
          <p className="text-muted-foreground">
            Manage your supplier accounts and track balances
          </p>
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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
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
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No vendors found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/purchases/vendors/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Vendor
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Outstanding Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor: Vendor) => {
                  const balance = parseFloat(vendor.outstandingBalance || '0');

                  return (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <Link
                          href={`/purchases/vendors/${vendor.id}`}
                          className="font-medium hover:underline"
                        >
                          {vendor.displayName || vendor.name}
                        </Link>
                        {vendor.displayName && vendor.displayName !== vendor.name && (
                          <p className="text-sm text-muted-foreground">
                            {vendor.name}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{vendor.email || '-'}</TableCell>
                      <TableCell>{vendor.phone || '-'}</TableCell>
                      <TableCell>{vendor.currency}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'font-mono font-medium',
                            getBalanceColor(balance)
                          )}
                        >
                          {formatCurrency(balance, vendor.currency)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              •••
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
                              <DropdownMenuItem
                                onClick={() => handleDelete(vendor)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{vendorToDelete?.name}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
