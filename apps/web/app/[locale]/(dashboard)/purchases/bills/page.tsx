'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, RefreshCw, Eye, Edit, Trash2, FileText } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  useBills,
  useDeleteBill,
  Bill,
  BillStatus,
  formatCurrency,
  getStatusVariant,
  getStatusText,
} from '@/lib/hooks/use-bills';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { cn } from '@/lib/utils';

export default function BillsPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);

  const { data: billsData, isLoading, refetch } = useBills({
    search: searchQuery || undefined,
    status: statusFilter !== 'all' ? (statusFilter as BillStatus) : undefined,
  });
  const deleteBill = useDeleteBill();

  const bills = billsData?.data || [];

  const canCreate = hasPermission('purchases.create');
  const canEdit = hasPermission('purchases.edit');
  const canDelete = hasPermission('purchases.delete');

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
      } catch (error: any) {
        toast({
          title: 'Error',
          description:
            error.response?.data?.message || 'Failed to delete bill.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setBillToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bills</h1>
          <p className="text-muted-foreground">
            Manage vendor bills and track payables
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/purchases/bills/new">
                <Plus className="mr-2 h-4 w-4" />
                New Bill
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
                placeholder="Search by bill number or vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="PARTIAL">Partial</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bills Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Bills</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No bills found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/purchases/bills/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Bill
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill: Bill) => {
                  const balanceDue = parseFloat(bill.balanceDue || '0');
                  const isOverdue = bill.status === 'OVERDUE' || (
                    bill.status === 'OPEN' && new Date(bill.dueDate) < new Date()
                  );

                  return (
                    <TableRow key={bill.id}>
                      <TableCell>
                        <Link
                          href={`/purchases/bills/${bill.id}`}
                          className="font-mono font-medium text-blue-600 hover:underline"
                        >
                          {bill.billNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {bill.vendor ? (
                          <Link
                            href={`/purchases/vendors/${bill.vendor.id}`}
                            className="hover:underline"
                          >
                            {bill.vendor.name}
                          </Link>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(bill.date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className={cn(isOverdue && 'text-red-600')}>
                        {format(new Date(bill.dueDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(bill.status)}>
                          {getStatusText(bill.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(bill.grandTotal, bill.vendor?.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          'font-mono font-medium',
                          balanceDue > 0 ? 'text-red-600' : 'text-green-600'
                        )}>
                          {formatCurrency(balanceDue, bill.vendor?.currency)}
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
                              <Link href={`/purchases/bills/${bill.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            {canEdit && bill.status === 'DRAFT' && (
                              <DropdownMenuItem asChild>
                                <Link href={`/purchases/bills/${bill.id}/edit`}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {canDelete && bill.status === 'DRAFT' && (
                              <DropdownMenuItem
                                onClick={() => handleDelete(bill)}
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
            <AlertDialogTitle>Delete Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete bill &quot;{billToDelete?.billNumber}&quot;?
              This action cannot be undone.
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
