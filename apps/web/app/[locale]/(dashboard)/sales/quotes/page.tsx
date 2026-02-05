'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Edit, Trash2, Send, FileText, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useQuotes,
  useDeleteQuote,
  useSendQuote,
  useAcceptQuote,
  useDeclineQuote,
  useConvertToInvoice,
  Quote,
  QuoteStatus,
} from '@/lib/hooks/use-quotes';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { QuoteStatusBadge } from '@/components/sales/status-badge';
import { formatCurrency } from '@/lib/hooks/use-customers';
import { format } from 'date-fns';

export default function QuotesPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);

  const { data: quotesData, isLoading, refetch } = useQuotes({
    search: searchQuery || undefined,
    status: selectedStatus !== 'all' ? (selectedStatus as QuoteStatus) : undefined,
  });

  const deleteQuote = useDeleteQuote();
  const sendQuote = useSendQuote();
  const acceptQuote = useAcceptQuote();
  const declineQuote = useDeclineQuote();
  const convertToInvoice = useConvertToInvoice();

  const quotes = quotesData?.data || [];

  const canCreate = hasPermission('sales.create');
  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">
            Create and manage estimates for your customers
          </p>
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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by quote number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
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
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No quotes found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/sales/quotes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Quote
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote: Quote) => (
                  <TableRow key={quote.id}>
                    <TableCell>
                      <Link
                        href={`/sales/quotes/${quote.id}`}
                        className="font-medium hover:underline"
                      >
                        {quote.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {quote.customer?.displayName || quote.customer?.name || '-'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(quote.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {format(new Date(quote.expiryDate), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={quote.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(
                        parseFloat(quote.grandTotal || '0'),
                        quote.customer?.currency || 'USD'
                      )}
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
                              <DropdownMenuItem
                                onClick={() => handleDelete(quote)}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{quoteToDelete?.quoteNumber}&quot;?
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
