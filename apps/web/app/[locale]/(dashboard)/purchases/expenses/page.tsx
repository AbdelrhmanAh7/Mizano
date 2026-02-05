'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, RefreshCw, Eye, Trash2, Receipt } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  useExpenses,
  useDeleteExpense,
  Expense,
  formatCurrency,
} from '@/lib/hooks/use-expenses';
import { usePermissions } from '@/lib/hooks/use-permissions';

export default function ExpensesPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  const { data: expensesData, isLoading, refetch } = useExpenses({
    search: searchQuery || undefined,
  });
  const deleteExpense = useDeleteExpense();

  const expenses = expensesData?.data || [];

  const canCreate = hasPermission('purchases.create');
  const canDelete = hasPermission('purchases.delete');

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
          description:
            error.response?.data?.message || 'Failed to delete expense.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">
            Track and manage business expenses
          </p>
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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by description, reference, or vendor..."
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

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No expenses found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/purchases/expenses/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Record Your First Expense
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense: Expense) => {
                  const total = parseFloat(expense.amount) + parseFloat(expense.taxAmount || '0');

                  return (
                    <TableRow key={expense.id}>
                      <TableCell>
                        {format(new Date(expense.date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {expense.account ? (
                          <Badge variant="secondary">
                            {expense.account.name}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {expense.vendor ? (
                          <Link
                            href={`/purchases/vendors/${expense.vendor.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {expense.vendor.name}
                          </Link>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {expense.reference || '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {expense.description || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(expense.taxInclusive ? expense.amount : total)}
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
                              <Link href={`/purchases/expenses/${expense.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            {canDelete && (
                              <DropdownMenuItem
                                onClick={() => handleDelete(expense)}
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
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense? This action cannot be
              undone.
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
