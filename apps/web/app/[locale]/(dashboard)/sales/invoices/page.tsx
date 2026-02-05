'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Edit, Trash2, Send, Ban, Filter } from 'lucide-react';
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
  useInvoices,
  useDeleteInvoice,
  useSendInvoice,
  useVoidInvoice,
  Invoice,
  InvoiceStatus,
  getInvoiceStatusColor,
  getInvoiceStatusLabel,
} from '@/lib/hooks/use-invoices';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'VOID', label: 'Void' },
];

export default function InvoicesPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const { data: invoicesData, isLoading, refetch } = useInvoices({
    search: searchQuery || undefined,
    status: selectedStatus !== 'all' ? (selectedStatus as InvoiceStatus) : undefined,
  });
  const deleteInvoice = useDeleteInvoice();
  const sendInvoice = useSendInvoice();
  const voidInvoice = useVoidInvoice();

  const invoices = invoicesData?.data || [];

  const canCreate = hasPermission('sales.create');
  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  const handleDelete = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDeleteDialogOpen(true);
  };

  const handleSend = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setSendDialogOpen(true);
  };

  const handleVoid = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setVoidDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedInvoice) {
      try {
        await deleteInvoice.mutateAsync(selectedInvoice.id);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete invoice',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedInvoice(null);
    }
  };

  const confirmSend = async () => {
    if (selectedInvoice) {
      try {
        await sendInvoice.mutateAsync(selectedInvoice.id);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to send invoice',
          variant: 'destructive',
        });
      }
      setSendDialogOpen(false);
      setSelectedInvoice(null);
    }
  };

  const confirmVoid = async () => {
    if (selectedInvoice) {
      try {
        await voidInvoice.mutateAsync(selectedInvoice.id);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to void invoice',
          variant: 'destructive',
        });
      }
      setVoidDialogOpen(false);
      setSelectedInvoice(null);
    }
  };

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Manage your invoices and track payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/sales/invoices/new">
                <Plus className="mr-2 h-4 w-4" />
                New Invoice
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
                placeholder="Search by invoice number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
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

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No invoices found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/sales/invoices/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Invoice
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice: Invoice) => {
                  const balanceDue = parseFloat(invoice.balanceDue || '0');
                  const isOverdue = invoice.status === 'OVERDUE';

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link
                          href={`/sales/invoices/${invoice.id}`}
                          className="font-medium hover:underline"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {invoice.customer?.name || '-'}
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <span className={cn(isOverdue && 'text-red-600 font-medium')}>
                          {format(new Date(invoice.dueDate), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={getInvoiceStatusColor(invoice.status)}>
                          {getInvoiceStatusLabel(invoice.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(invoice.grandTotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={cn(
                          balanceDue > 0 && 'text-red-600 font-semibold'
                        )}>
                          {formatCurrency(invoice.balanceDue)}
                        </span>
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
                              <Link href={`/sales/invoices/${invoice.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            {canEdit && invoice.status === 'DRAFT' && (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link href={`/sales/invoices/${invoice.id}/edit`}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSend(invoice)}>
                                  <Send className="mr-2 h-4 w-4" />
                                  Send
                                </DropdownMenuItem>
                              </>
                            )}
                            {canEdit && invoice.status !== 'VOID' && invoice.status !== 'DRAFT' && (
                              <DropdownMenuItem
                                onClick={() => handleVoid(invoice)}
                                className="text-orange-600"
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Void
                              </DropdownMenuItem>
                            )}
                            {canDelete && invoice.status === 'DRAFT' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(invoice)}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice &quot;{selectedInvoice?.invoiceNumber}&quot;?
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

      {/* Send Confirmation Dialog */}
      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark invoice &quot;{selectedInvoice?.invoiceNumber}&quot; as sent?
              This will create an accounting entry and you won&apos;t be able to edit it anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend}>
              Send Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void Confirmation Dialog */}
      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void invoice &quot;{selectedInvoice?.invoiceNumber}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoid}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Void Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
