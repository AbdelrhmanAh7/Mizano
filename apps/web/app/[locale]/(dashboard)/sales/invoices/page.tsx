'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { CollectionPriorityCard } from '@/components/ai';
import type { DateRangeValue } from '@/components/data-table';
import {
  DataTable,
  DataTableDateRangeFilter,
  DataTableFacetedFilter,
  DataTableSearch,
  SortableHeader,
} from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { AutoTourTrigger } from '@/components/tour/auto-tour-trigger';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useToast } from '@/components/ui/use-toast';
import { ImportWizard } from '@/components/import/import-wizard';
import { invoicesApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { useExportAll } from '@/lib/hooks/use-export-all';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import {
  Invoice,
  InvoiceStatus,
  getInvoiceStatusColor,
  getInvoiceStatusLabel,
  useCloneInvoice,
  useDeleteInvoice,
  useInfiniteInvoices,
  useSendInvoice,
  useVoidInvoice,
} from '@/lib/hooks/use-invoices';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { cn } from '@/lib/utils';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  Ban,
  Copy,
  DollarSign,
  Edit,
  Eye,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function InvoicesPageContent() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const money = useDocumentMoney();

  const STATUS_OPTIONS = [
    { value: 'DRAFT', label: t('invoices.status.draft') },
    { value: 'SENT', label: t('invoices.status.sent') },
    { value: 'PARTIALLY_PAID', label: t('invoices.status.partiallyPaid') },
    { value: 'PAID', label: t('invoices.status.paid') },
    { value: 'OVERDUE', label: t('invoices.status.overdue') },
    { value: 'VOID', label: t('invoices.status.void') },
  ];
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('invoices', 'invoices');
  const tableParams = useTableParams({
    defaultSortBy: 'date',
    filterKeys: ['status', 'dateFrom', 'dateTo'],
    mode: 'virtual',
  });
  const [importOpen, setImportOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const {
    data: invoices,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteInvoices({
    ...tableParams.queryParams,
    status: (tableParams.filters.status as InvoiceStatus) || undefined,
    dateFrom: tableParams.filters.dateFrom || undefined,
    dateTo: tableParams.filters.dateTo || undefined,
  });

  const dateRange: DateRangeValue | undefined =
    tableParams.filters.dateFrom && tableParams.filters.dateTo
      ? { from: new Date(tableParams.filters.dateFrom), to: new Date(tableParams.filters.dateTo) }
      : undefined;
  const cloneInvoice = useCloneInvoice();
  const deleteInvoice = useDeleteInvoice();
  const sendInvoice = useSendInvoice();
  const voidInvoice = useVoidInvoice();

  const canCreate = hasPermission('sales.create');
  const canEdit = hasPermission('sales.edit');
  const canDelete = hasPermission('sales.delete');

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkVoidOpen, setBulkVoidOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Invoice[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => invoicesApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['invoices']],
    successMessage: '{count} draft invoices deleted',
  });

  const bulkSendAction = useBulkAction({
    mutationFn: (ids) => invoicesApi.bulkSend(ids).then((r) => r.data),
    queryKeys: [['invoices']],
    successMessage: '{count} invoices sent',
  });

  const bulkVoidAction = useBulkAction({
    mutationFn: (ids) => invoicesApi.bulkVoid(ids).then((r) => r.data),
    queryKeys: [['invoices']],
    successMessage: '{count} invoices voided',
  });

  const bulkPayAction = useBulkAction({
    mutationFn: (ids) => invoicesApi.bulkPay(ids).then((r) => r.data),
    queryKeys: [['invoices']],
    successMessage: '{count} invoices marked as paid',
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Send',
            icon: Send,
            onClick: (rows: Invoice[]) => {
              setBulkSelectedRows(rows);
              setBulkSendOpen(true);
            },
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            label: 'Mark as Paid',
            icon: DollarSign,
            onClick: (rows: Invoice[]) => {
              setBulkSelectedRows(rows);
              setBulkPayOpen(true);
            },
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            label: 'Void',
            icon: Ban,
            variant: 'outline' as const,
            onClick: (rows: Invoice[]) => {
              setBulkSelectedRows(rows);
              setBulkVoidOpen(true);
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
            onClick: (rows: Invoice[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

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
      } catch (error: unknown) {
        toast({
          title: 'Error',
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            'Failed to delete invoice',
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
      } catch (error: unknown) {
        toast({
          title: 'Error',
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            'Failed to send invoice',
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
      } catch (error: unknown) {
        toast({
          title: 'Error',
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            'Failed to void invoice',
          variant: 'destructive',
        });
      }
      setVoidDialogOpen(false);
      setSelectedInvoice(null);
    }
  };

  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: 'invoiceNumber',
      header: () => (
        <SortableHeader
          label={t('invoices.table.invoiceNumber')}
          columnId="invoiceNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link href={`/sales/invoices/${row.original.id}`} className="font-medium hover:underline">
          {row.original.invoiceNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customer.name',
      header: t('invoices.table.customer'),
      cell: ({ row }) => row.original.customer?.name || '-',
    },
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label={t('invoices.table.date')}
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'dueDate',
      header: () => (
        <SortableHeader
          label={t('invoices.table.dueDate')}
          columnId="dueDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => {
        const isOverdue = row.original.status === 'OVERDUE';
        return (
          <span className={cn(isOverdue && 'text-red-600 font-medium')}>
            {format(new Date(row.original.dueDate), 'MMM d, yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: t('invoices.table.status'),
      cell: ({ row }) => (
        <Badge className={getInvoiceStatusColor(row.original.status)}>
          {getInvoiceStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'grandTotal',
      header: () => (
        <SortableHeader
          label={tCommon('total')}
          columnId="grandTotal"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => money(row.original.grandTotal, row.original.currencyCode),
    },
    {
      accessorKey: 'balanceDue',
      header: t('invoices.table.balance'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => {
        const balanceDue = parseFloat(row.original.balanceDue || '0');
        return (
          <span className={cn(balanceDue > 0 && 'text-red-600 font-semibold')}>
            {money(row.original.balanceDue, row.original.currencyCode)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const invoice = row.original;
        return (
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
              {canCreate && (
                <DropdownMenuItem onClick={() => cloneInvoice.mutate(invoice.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
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
                <DropdownMenuItem onClick={() => handleVoid(invoice)} className="text-orange-600">
                  <Ban className="mr-2 h-4 w-4" />
                  Void
                </DropdownMenuItem>
              )}
              {canDelete && invoice.status === 'DRAFT' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(invoice)} className="text-red-600">
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
      <AutoTourTrigger tourId="sales_invoices" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('invoices.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          {canCreate && (
            <Button asChild data-tour="create-invoice-btn">
              <Link href="/sales/invoices/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('invoices.newInvoice')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* AI Collection Priority */}
      <CollectionPriorityCard />

      {/* Filters */}
      <Card data-tour="invoice-filters">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search by invoice number or customer..."
            />
            <DataTableFacetedFilter
              title="Status"
              options={STATUS_OPTIONS}
              selected={tableParams.filters.status ? [tableParams.filters.status] : []}
              onSelectionChange={(values) =>
                tableParams.setFilter('status', values[0] || undefined)
              }
              singleSelect
            />
            <DataTableDateRangeFilter
              value={dateRange}
              onChange={(range) => {
                if (range) {
                  tableParams.setFilters({
                    dateFrom: format(range.from, 'yyyy-MM-dd'),
                    dateTo: format(range.to, 'yyyy-MM-dd'),
                  });
                } else {
                  tableParams.setFilters({ dateFrom: undefined, dateTo: undefined });
                }
              }}
              placeholder="Date range"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Refresh invoices"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card data-tour="invoice-list">
        <CardHeader>
          <CardTitle>{t('invoices.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={invoices}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="invoices"
            enableSelection
            enableExport
            enableColumnVisibility
            exportFilename="invoices"
            onExportAll={onExportAll}
            bulkActions={bulkActions}
            emptyMessage={t('invoices.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/invoices/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Invoice
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
            <AlertDialogTitle>{t('invoices.deleteInvoice')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice &quot;{selectedInvoice?.invoiceNumber}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('invoices.sendInvoice')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark invoice &quot;{selectedInvoice?.invoiceNumber}&quot; as
              sent? This will create an accounting entry and you won&apos;t be able to edit it
              anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend}>{t('invoices.sendInvoice')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void Confirmation Dialog */}
      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('invoices.voidInvoice')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void invoice &quot;{selectedInvoice?.invoiceNumber}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmVoid} className="bg-orange-600 hover:bg-orange-700">
              {t('invoices.voidInvoice')}
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
        itemType="invoices"
        description="Only draft invoices will be deleted. Non-draft invoices will be skipped."
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
        itemType="invoices"
        description="Draft invoices will be marked as sent. This will create accounting entries."
        isLoading={bulkSendAction.isLoading}
        onConfirm={async () => {
          await bulkSendAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkSendOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkVoidOpen}
        onOpenChange={setBulkVoidOpen}
        action="void"
        count={bulkSelectedRows.length}
        itemType="invoices"
        description="Selected invoices will be voided. This action cannot be undone."
        destructive
        isLoading={bulkVoidAction.isLoading}
        onConfirm={async () => {
          await bulkVoidAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkVoidOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkPayOpen}
        onOpenChange={setBulkPayOpen}
        action="mark as paid"
        count={bulkSelectedRows.length}
        itemType="invoices"
        description="Selected sent/overdue invoices will be marked as fully paid."
        isLoading={bulkPayAction.isLoading}
        onConfirm={async () => {
          await bulkPayAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkPayOpen(false);
          refetch();
        }}
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'invoices' as ImportEntityType}
        entityLabel="Invoices"
        onComplete={() => refetch()}
      />
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoicesPageContent />
    </Suspense>
  );
}
