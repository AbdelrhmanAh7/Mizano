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
  useCustomers,
  useDeleteCustomer,
  Customer,
  formatCurrency,
  getBalanceColor,
} from '@/lib/hooks/use-customers';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';

export default function CustomersPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const { data: customersData, isLoading, refetch } = useCustomers({
    search: searchQuery || undefined,
  });
  const deleteCustomer = useDeleteCustomer();

  const customers = customersData?.data || [];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">
            Manage your customer accounts and track balances
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/sales/customers/new">
                <Plus className="mr-2 h-4 w-4" />
                New Customer
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

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No customers found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/sales/customers/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Customer
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
                {customers.map((customer: Customer) => {
                  const balance = parseFloat(customer.outstandingBalance || '0');

                  return (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Link
                          href={`/sales/customers/${customer.id}`}
                          className="font-medium hover:underline"
                        >
                          {customer.displayName || customer.name}
                        </Link>
                        {customer.displayName && customer.displayName !== customer.name && (
                          <p className="text-sm text-muted-foreground">
                            {customer.name}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{customer.email || '-'}</TableCell>
                      <TableCell>{customer.phone || '-'}</TableCell>
                      <TableCell>{customer.currency}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'font-mono font-medium',
                            getBalanceColor(balance)
                          )}
                        >
                          {formatCurrency(balance, customer.currency)}
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
                              <DropdownMenuItem
                                onClick={() => handleDelete(customer)}
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
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{customerToDelete?.name}&quot;? This
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
