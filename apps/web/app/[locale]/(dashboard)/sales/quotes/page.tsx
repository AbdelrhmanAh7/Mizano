'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { QuoteStatusBadge } from '@/components/sales/status-badge';
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
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
import { ImportWizard } from '@/components/import/import-wizard';
import { quotesApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import { usePermissions } from '@/lib/hooks/use-permissions';
import {
  Quote,
  QuoteStatus,
  useAcceptQuote,
  useCloneQuote,
  useConvertToInvoice,
  useDeclineQuote,
  useDeleteQuote,
  useInfiniteQuotes,
  useSendQuote,
} from '@/lib/hooks/use-quotes';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  Ban,
  Copy,
  Edit,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { useDateFnsLocale } from '@/lib/date-locale';

function QuotesPageContent() {
  const dateLocale = useDateFnsLocale();
  // Quote totals in the quote's own currency, else the org base currency (audit B5).
  const formatCurrency = useMoneyFormatter();
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [importOpen, setImportOpen] = useState(false);
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

  const cloneQuote = useCloneQuote();
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

  const tBulk = useTranslations('common.bulk');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => quotesApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['quotes']],
    successMessage: (count) => tBulk('quotesDeleted', { count }),
  });

  const bulkSendAction = useBulkAction({
    mutationFn: (ids) => quotesApi.bulkSend(ids).then((r) => r.data),
    queryKeys: [['quotes']],
    successMessage: (count) => tBulk('quotesSent', { count }),
  });

  const bulkDeclineAction = useBulkAction({
    mutationFn: (ids) => quotesApi.bulkDecline(ids).then((r) => r.data),
    queryKeys: [['quotes']],
    successMessage: (count) => tBulk('quotesDeclined', { count }),
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: tCommon('buttons.send'),
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
            label: t('quotes.decline'),
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
            label: tCommon('buttons.delete'),
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
          title: t('quotes.toast.deleted'),
          description: t('quotes.toast.deletedNumber', { number: quoteToDelete.quoteNumber }),
        });
      } catch (error: unknown) {
        toast({
          title: tCommon('errors.title'),
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            t('quotes.toast.deleteError'),
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
        title: t('quotes.toast.sent'),
        description: t('quotes.toast.sentNumber', { number: quote.quoteNumber }),
      });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.sendError'),
        variant: 'destructive',
      });
    }
  };

  const handleAccept = async (quote: Quote) => {
    try {
      await acceptQuote.mutateAsync(quote.id);
      toast({
        title: t('quotes.toast.accepted'),
        description: t('quotes.toast.acceptedNumber', { number: quote.quoteNumber }),
      });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.acceptError'),
        variant: 'destructive',
      });
    }
  };

  const handleDecline = async (quote: Quote) => {
    try {
      await declineQuote.mutateAsync(quote.id);
      toast({
        title: t('quotes.toast.declined'),
        description: t('quotes.toast.declinedNumber', { number: quote.quoteNumber }),
      });
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.declineError'),
        variant: 'destructive',
      });
    }
  };

  const handleConvert = async (quote: Quote) => {
    try {
      await convertToInvoice.mutateAsync(quote.id);
      toast({
        title: t('quotes.toast.invoiceCreated'),
        description: t('quotes.toast.convertedNumber', { number: quote.quoteNumber }),
      });
      // Optionally navigate to the new invoice
    } catch (error: unknown) {
      toast({
        title: tCommon('errors.title'),
        description:
          (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('quotes.toast.convertError'),
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<Quote>[] = [
    {
      accessorKey: 'quoteNumber',
      header: () => (
        <SortableHeader
          label={t('quotes.table.quoteNumber')}
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
      header: t('quotes.table.customer'),
      cell: ({ row }) => row.original.customer?.displayName || row.original.customer?.name || '-',
    },
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label={t('quotes.table.date')}
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'PP', { locale: dateLocale }),
    },
    {
      accessorKey: 'expiryDate',
      header: () => (
        <SortableHeader
          label={t('quotes.table.expiryDate')}
          columnId="expiryDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.expiryDate), 'PP', { locale: dateLocale }),
    },
    {
      accessorKey: 'status',
      header: t('quotes.table.status'),
      cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'grandTotal',
      header: () => (
        <SortableHeader
          label={t('quotes.table.amount')}
          columnId="grandTotal"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) =>
        formatCurrency(parseFloat(row.original.grandTotal || '0'), row.original.currencyCode),
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
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              {canCreate && (
                <DropdownMenuItem onClick={() => cloneQuote.mutate(quote.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {tCommon('clone.duplicate')}
                </DropdownMenuItem>
              )}

              {canEdit && quote.status === 'DRAFT' && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/sales/quotes/${quote.id}/edit`}>
                      <Edit className="mr-2 h-4 w-4" />
                      {tCommon('buttons.edit')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSend(quote)}>
                    <Send className="mr-2 h-4 w-4" />
                    {t('quotes.markAsSent')}
                  </DropdownMenuItem>
                </>
              )}

              {canEdit && quote.status === 'SENT' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleAccept(quote)}>
                    <FileText className="mr-2 h-4 w-4" />
                    {t('quotes.markAsAccepted')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDecline(quote)}>
                    <Ban className="mr-2 h-4 w-4" />
                    {t('quotes.markAsDeclined')}
                  </DropdownMenuItem>
                </>
              )}

              {canEdit && quote.status === 'ACCEPTED' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleConvert(quote)}>
                    <FileText className="mr-2 h-4 w-4" />
                    {t('quotes.convertToInvoice')}
                  </DropdownMenuItem>
                </>
              )}

              {canDelete && quote.status === 'DRAFT' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDelete(quote)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tCommon('buttons.delete')}
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('quotes.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {tCommon('buttons.import')}
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/sales/quotes/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('quotes.newQuote')}
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
              placeholder={t('quotes.list.searchPlaceholder')}
            />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('quotes.list.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tCommon('all')}</SelectItem>
                <SelectItem value="DRAFT">{t('quotes.status.draft')}</SelectItem>
                <SelectItem value="SENT">{t('quotes.status.sent')}</SelectItem>
                <SelectItem value="ACCEPTED">{t('quotes.status.accepted')}</SelectItem>
                <SelectItem value="INVOICED">{t('quotes.status.invoiced')}</SelectItem>
                <SelectItem value="DECLINED">{t('quotes.status.declined')}</SelectItem>
                <SelectItem value="EXPIRED">{t('quotes.status.expired')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label={t('quotes.list.refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('quotes.title')}</CardTitle>
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
            emptyMessage={t('quotes.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/quotes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('quotes.empty.action')}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('quotes.deleteQuote')}
        description={t('quotes.deleteConfirmNumber', { number: quoteToDelete?.quoteNumber ?? '' })}
        onConfirm={confirmDelete}
      />

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="quotes"
        title={t('quotes.bulkDelete.title', { count: bulkSelectedRows.length })}
        description={t('quotes.bulkDelete.description')}
        confirmLabel={t('quotes.bulkDelete.confirm', { count: bulkSelectedRows.length })}
        cancelLabel={tCommon('buttons.cancel')}
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
        title={t('quotes.bulkSend.title', { count: bulkSelectedRows.length })}
        description={t('quotes.bulkSend.description')}
        confirmLabel={t('quotes.bulkSend.confirm', { count: bulkSelectedRows.length })}
        cancelLabel={tCommon('buttons.cancel')}
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
        title={t('quotes.bulkDecline.title', { count: bulkSelectedRows.length })}
        description={t('quotes.bulkDecline.description')}
        confirmLabel={t('quotes.bulkDecline.confirm', { count: bulkSelectedRows.length })}
        cancelLabel={tCommon('buttons.cancel')}
        destructive
        isLoading={bulkDeclineAction.isLoading}
        onConfirm={async () => {
          await bulkDeclineAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeclineOpen(false);
          refetch();
        }}
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'quotes' as ImportEntityType}
        entityLabel={t('quotes.list.importLabel')}
        onComplete={() => refetch()}
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
