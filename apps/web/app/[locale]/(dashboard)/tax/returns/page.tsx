'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Eye, Trash2, FileCheck, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useVATReturns,
  useDeleteVATReturn,
  useFileVATReturn,
  VATReturn,
  getVATReturnStatusColor,
  getVATReturnStatusLabel,
  formatCurrency,
} from '@/lib/hooks/use-tax';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FILED', label: 'Filed' },
  { value: 'PAID', label: 'Paid' },
];

export default function VATReturnsPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [selectedStatus, setSelectedStatus] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<VATReturn | null>(null);

  const { data: returnsData, isLoading, refetch } = useVATReturns({
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  });
  const deleteReturn = useDeleteVATReturn();
  const fileReturn = useFileVATReturn();

  const returns = returnsData?.data || [];

  const canCreate = hasPermission('tax.create');
  const canEdit = hasPermission('tax.edit');
  const canDelete = hasPermission('tax.delete');

  const handleDelete = (vatReturn: VATReturn) => {
    setSelectedReturn(vatReturn);
    setDeleteDialogOpen(true);
  };

  const handleFile = (vatReturn: VATReturn) => {
    setSelectedReturn(vatReturn);
    setFileDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedReturn) {
      try {
        await deleteReturn.mutateAsync(selectedReturn.id);
        toast({ title: 'VAT return deleted' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete VAT return',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedReturn(null);
    }
  };

  const confirmFile = async () => {
    if (selectedReturn) {
      try {
        await fileReturn.mutateAsync(selectedReturn.id);
        toast({ title: 'VAT return filed successfully' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to file VAT return',
          variant: 'destructive',
        });
      }
      setFileDialogOpen(false);
      setSelectedReturn(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">VAT Returns</h1>
          <p className="text-muted-foreground">
            Generate and manage VAT returns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/tax/returns/generate">
                <Plus className="mr-2 h-4 w-4" />
                Generate Return
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle>All VAT Returns</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : returns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No VAT returns found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/tax/returns/generate">
                    <Plus className="mr-2 h-4 w-4" />
                    Generate Your First Return
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Output VAT</TableHead>
                  <TableHead className="text-right">Input VAT</TableHead>
                  <TableHead className="text-right">Net Payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((vatReturn: VATReturn) => {
                  const netVat = typeof vatReturn.netVat === 'string'
                    ? parseFloat(vatReturn.netVat)
                    : vatReturn.netVat;

                  return (
                    <TableRow key={vatReturn.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/tax/returns/${vatReturn.id}`}
                          className="hover:underline"
                        >
                          {format(new Date(vatReturn.startDate), 'MMM d')} -{' '}
                          {format(new Date(vatReturn.endDate), 'MMM d, yyyy')}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(vatReturn.outputVat)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(vatReturn.inputVat)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        <span className={netVat > 0 ? 'text-red-600' : 'text-green-600'}>
                          {formatCurrency(vatReturn.netVat)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={getVATReturnStatusColor(vatReturn.status)}>
                          {getVATReturnStatusLabel(vatReturn.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              ...
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/tax/returns/${vatReturn.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            {canEdit && vatReturn.status === 'DRAFT' && (
                              <DropdownMenuItem onClick={() => handleFile(vatReturn)}>
                                <FileCheck className="mr-2 h-4 w-4" />
                                File Return
                              </DropdownMenuItem>
                            )}
                            {canDelete && vatReturn.status === 'DRAFT' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(vatReturn)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </>
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

      {/* File Confirmation Dialog */}
      <AlertDialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File VAT Return</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to file this VAT return? This will lock the
              period transactions and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFile}>
              File Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete VAT Return</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this VAT return? This action cannot be undone.
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
