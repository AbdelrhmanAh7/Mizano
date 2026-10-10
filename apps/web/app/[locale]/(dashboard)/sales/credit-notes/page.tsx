'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
import { ImportWizard } from '@/components/import/import-wizard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { creditNotesApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import type { ImportEntityType } from '@/lib/hooks/use-import-export';
import {
  CreditNote,
  CreditNoteType,
  getCreditNoteTypeColor,
  getCreditNoteTypeLabel,
  useInfiniteCreditNotes,
} from '@/lib/hooks/use-credit-notes';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, Filter, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function CreditNotesPageContent() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const money = useDocumentMoney();

  const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'all', label: tCommon('all') },
    { value: 'REFUND', label: t('creditNotes.types.refund') },
    { value: 'APPLY_TO_INVOICE', label: t('creditNotes.types.applyToInvoice') },
  ];
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'date', mode: 'virtual' });

  const [selectedType, setSelectedType] = useState<string>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<CreditNote[]>([]);

  const {
    data: creditNotes,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteCreditNotes({
    ...tableParams.queryParams,
    type: selectedType !== 'all' ? (selectedType as CreditNoteType) : undefined,
  });

  const canCreate = hasPermission('sales.create');
  const canDelete = hasPermission('sales.delete');

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => creditNotesApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['credit-notes']],
    successMessage: '{count} credit notes deleted',
  });

  const bulkActions = [
    ...(canDelete
      ? [
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive' as const,
            onClick: (rows: CreditNote[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const columns: ColumnDef<CreditNote>[] = [
    {
      accessorKey: 'creditNoteNumber',
      header: () => (
        <SortableHeader
          label={t('creditNotes.table.creditNoteNumber')}
          columnId="creditNoteNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/sales/credit-notes/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.creditNoteNumber}
        </Link>
      ),
    },
    {
      accessorKey: 'customer.name',
      header: t('creditNotes.table.customer'),
      cell: ({ row }) => {
        const creditNote = row.original;
        return creditNote.customer ? (
          <Link href={`/sales/customers/${creditNote.customer.id}`} className="hover:underline">
            {creditNote.customer.name}
          </Link>
        ) : (
          '-'
        );
      },
    },
    {
      accessorKey: 'invoice.invoiceNumber',
      header: t('creditNotes.table.invoice'),
      cell: ({ row }) => {
        const creditNote = row.original;
        return creditNote.invoice ? (
          <Link href={`/sales/invoices/${creditNote.invoice.id}`} className="hover:underline">
            {creditNote.invoice.invoiceNumber}
          </Link>
        ) : (
          '-'
        );
      },
    },
    {
      accessorKey: 'date',
      header: () => (
        <SortableHeader
          label={t('creditNotes.table.date')}
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'type',
      header: t('creditNotes.form.type'),
      cell: ({ row }) => (
        <Badge className={getCreditNoteTypeColor(row.original.type)}>
          {getCreditNoteTypeLabel(row.original.type)}
        </Badge>
      ),
    },
    {
      accessorKey: 'amount',
      header: () => (
        <SortableHeader
          label={t('creditNotes.table.amount')}
          columnId="amount"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right font-mono text-orange-600',
      },
      cell: ({ row }) => money(row.original.amount),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/sales/credit-notes/${row.original.id}`}>
            <Eye className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('creditNotes.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/sales/credit-notes/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('creditNotes.newCreditNote')}
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
              placeholder="Search by credit note number or customer..."
            />
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Refresh credit notes"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Credit Notes Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('creditNotes.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={creditNotes}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="credit-notes"
            enableSelection
            bulkActions={bulkActions}
            emptyMessage={t('creditNotes.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/sales/credit-notes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Credit Note
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Bulk Action Dialogs */}
      <BulkActionConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        action="delete"
        count={bulkSelectedRows.length}
        itemType="credit notes"
        description="Selected credit notes will be deleted. Credit notes that have been applied will be skipped."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={'credit_notes' as ImportEntityType}
        entityLabel="Credit Notes"
        onComplete={() => refetch()}
      />
    </div>
  );
}

export default function CreditNotesPage() {
  return (
    <Suspense>
      <CreditNotesPageContent />
    </Suspense>
  );
}
