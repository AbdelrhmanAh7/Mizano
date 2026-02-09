'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { QuoteStatusBadge } from '@/components/sales/status-badge';
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
import { useToast } from '@/components/ui/use-toast';
import { quotesApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { formatCurrency } from '@/lib/hooks/use-customers';
import { usePermissions } from '@/lib/hooks/use-permissions';
import {
    Quote,
    QuoteStatus,
    useAcceptQuote,
    useConvertToInvoice,
    useDeclineQuote,
    useDeleteQuote,
    useInfiniteQuotes,
    useSendQuote,
} from '@/lib/hooks/use-quotes';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Ban, Edit, Eye, FileText, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function QuotesPageContent() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);

  const {
    data: quotes,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuotes({
    ...tableParams.queryParams,
    status: selectedStatus !== 'all' ? (selectedStatus as QuoteStatus) : undefined,
  });

  const deleteQuote = useDeleteQuote();
  const sendQuote = useSendQuote();
  const acceptQuote = useAcceptQuote();
  const declineQuote = useDeclineQuote();
  const convertToInvoice = useConvertToInvoice();

  const canCreate = hasPermission('sales.create');
  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkDeclineOpen, setBulkDeclineOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Quote[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => quotesApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['quotes']],
    successMessage: '{count} draft quotes deleted',
  });

  const bulkSendAction = useBulkAction({
    mutationFn: (ids) => quotesApi.bulkSend(ids).then((r) => r.data),
    queryKeys: [['quotes']],
    successMessage: '{count} quotes sent',
  });

  const bulkDeclineAction = useBulkAction({
    mutationFn: (ids) => quotesApi.bulkDecline(ids).then((r) => r.data),
    queryKeys: [['quotes']],
    successMessage: '{count} quotes declined',
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Send',
            icon: Send,
            onClick: (rows: Quote[]) => {
              setBulkSelectedRows(rows);
              setBulkSendOpen(true);
            },
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            label: 'Decline',
            icon: Ban,
            variant: 'outline' as const,
            onClick: (rows: Quote[]) => {
              setBulkSelectedRows(rows);
              setBulkDeclineOpen(true);
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
            onClick: (rows: Quote[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const handleDelete = (quote: Quote) => {
    setQuoteToDelete(quote);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (quoteToDelete) {
      try {
        await deleteQuote.mutateAsync(quoteToDelete.id);
        toast({
          title: 'Quote deleted',
          description: `Quote ${quoteToDelete.quoteNumber} has been deleted.`,
        });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete quote.',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setQuoteToDelete(null);
    }
  };

  const handleSend = async (quote: Quote) => {
    try {
      await sendQuote.mutateAsync(quote.id);
      toast({
        title: 'Quote sent',
        description: `Quote ${quote.quoteNumber} has been marked as sent.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to send quote.',
        variant: 'destructive',
      });
    }
  };

  const handleAccept = async (quote: Quote) => {
    try {
      await acceptQuote.mutateAsync(quote.id);
      toast({
        title: 'Quote accepted',
        description: `Quote ${quote.quoteNumber} has been marked as accepted.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to accept quote.',
        variant: 'destructive',
      });
    }
  };

  const handleDecline = async (quote: Quote) => {
    try {
      await declineQuote.mutateAsync(quote.id);
      toast({
        title: 'Quote declined',
        description: `Quote ${quote.quoteNumber} has been marked as declined.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to decline quote.',
        variant: 'destructive',
      });
    }
  };

  const handleConvert = async (quote: Quote) => {
    try {
      const result = await convertToInvoice.mutateAsync(quote.id);
      toast({
        title: 'Invoice created',
        description: `Quote ${quote.quoteNumber} has been converted to invoice.`,
      });
      // Optionally navigate to the new invoice
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to convert quote.',
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<Quote>[] = [
    {
      accessorKey: 'quoteNumber',
      header: () => (
        <SortableHeader
          label="Quote #"
          columnId="quoteNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link href={`/sales/quotes/${row.original.id}`} className="font-medium hover:underline">
          {row.original.quoteNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customer.name',
      header: 'Customer',
      cell: ({ row }) => row.original.customer?.displayName || row.original.customer?.name || '-',
    },
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
      accessorKey: 'expiryDate',
      header: () => (
        <SortableHeader
          label="Expiry"
          columnId="expiryDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.expiryDate), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'grandTotal',
      header: () => (
        <SortableHeader
          label="Amount"
          columnId="grandTotal"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) =>
        formatCurrency(
          parseFloat(row.original.grandTotal || '0'),
          row.original.customer?.currency || 'USD',
        ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const quote = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/sales/quotes/${quote.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>

              {canEdit && quote.status === 'DRAFT' && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/sales/quotes/${quote.id}/edit`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSend(quote)}>
                    <Send className="mr-2 h-4 w-4" />
                    Mark as Sent
                  </DropdownMenuItem>
                </>
              )}

              {canEdit && quote.status === 'SENT' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleAccept(quote)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Mark as Accepted
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDecline(quote)}>
                    <Ban className="mr-2 h-4 w-4" />
                    Mark as Declined
                  </DropdownMenuItem>
                </>
              )}

              {canEdit && quote.status === 'ACCEPTED' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleConvert(quote)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Convert to Invoice
                  </DropdownMenuItem>
                </>
              )}

              {canDelete && quote.status === 'DRAFT' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(quote)} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
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
          <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">Create and manage estimates for your customers</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/sales/quotes/new">
                <Plus className="mr-2 h-4 w-4" />
                New Quote
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
              placeholder="Search by quote number or customer..."
            />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="INVOICED">Invoiced</SelectItem>
                <SelectItem value="DECLINED">Declined</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Quotes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={quotes}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="quotes"
            enableSelection
            bulkActions={bulkActions}
            emptyMessage="No quotes found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/quotes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Quote
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
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{quoteToDelete?.quoteNumber}&quot;? This action
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

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="quotes"
        description="Only draft quotes will be deleted. Non-draft quotes will be skipped."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkSendOpen}
        onOpenChange={setBulkSendOpen}
        action="send"
        count={bulkSelectedRows.length}
        itemType="quotes"
        description="Draft quotes will be marked as sent."
        isLoading={bulkSendAction.isLoading}
        onConfirm={async () => {
          await bulkSendAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkSendOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkDeclineOpen}
        onOpenChange={setBulkDeclineOpen}
        action="decline"
        count={bulkSelectedRows.length}
        itemType="quotes"
        description="Sent quotes will be marked as declined."
        destructive
        isLoading={bulkDeclineAction.isLoading}
        onConfirm={async () => {
          await bulkDeclineAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeclineOpen(false);
          refetch();
        }}
      />
    </div>
  );
}

export default function QuotesPage() {
  return (
    <Suspense>
      <QuotesPageContent />
    </Suspense>
  );
}
