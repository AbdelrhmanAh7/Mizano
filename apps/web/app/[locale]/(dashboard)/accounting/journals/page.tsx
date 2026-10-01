'use client';

import type { DateRangeValue } from '@/components/data-table';
import {
  DataTable,
  DataTableDateRangeFilter,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useToast } from '@/components/ui/use-toast';
import { journalsApi } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api-error';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { useExportAll } from '@/lib/hooks/use-export-all';
import {
  Journal,
  LEDGER_QUERY_KEYS,
  calculateJournalTotals,
  canReverseJournal,
  formatJournalAmount,
  getStatusColor,
  isJournalEditable,
  isSystemJournal,
  useDeleteJournal,
  useInfiniteJournals,
  usePostJournal,
  useReverseJournal,
} from '@/lib/hooks/use-journals';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { CheckCircle, Edit, Eye, Plus, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';

function JournalsPageContent() {
  const t = useTranslations('accounting');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { onExportAll } = useExportAll('journals', 'journals');
  const tableParams = useTableParams({
    defaultSortBy: 'date',
    filterKeys: ['dateFrom', 'dateTo'],
    mode: 'virtual',
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [journalToDelete, setJournalToDelete] = useState<Journal | null>(null);
  const [journalToReverse, setJournalToReverse] = useState<Journal | null>(null);

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkPostOpen, setBulkPostOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<Journal[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => journalsApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: LEDGER_QUERY_KEYS,
    successMessage: '{count} unposted journals deleted',
  });

  const bulkPostAction = useBulkAction({
    mutationFn: (ids) => journalsApi.bulkPost(ids).then((r) => r.data),
    queryKeys: LEDGER_QUERY_KEYS,
    successMessage: '{count} journals posted',
  });

  const {
    data: journals,
    total,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteJournals({
    ...tableParams.queryParams,
    dateFrom: tableParams.filters.dateFrom || undefined,
    dateTo: tableParams.filters.dateTo || undefined,
  });

  const dateRange: DateRangeValue | undefined =
    tableParams.filters.dateFrom && tableParams.filters.dateTo
      ? { from: new Date(tableParams.filters.dateFrom), to: new Date(tableParams.filters.dateTo) }
      : undefined;
  const deleteJournal = useDeleteJournal();
  const postJournal = usePostJournal();
  const reverseJournal = useReverseJournal();

  const canCreate = hasPermission('accounting.create');
  const canEdit = hasPermission('accounting.edit');
  // Same permission as POST /journals/:id/reverse.
  const canReverse = hasPermission('accounting.create');
  const canDelete = hasPermission('accounting.delete');

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Post',
            icon: CheckCircle,
            onClick: (rows: Journal[]) => {
              setBulkSelectedRows(rows);
              setBulkPostOpen(true);
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
            onClick: (rows: Journal[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const handleDelete = (journal: Journal) => {
    setJournalToDelete(journal);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (journalToDelete) {
      try {
        await deleteJournal.mutateAsync(journalToDelete.id);
        toast({
          title: 'Journal deleted',
          description: `Journal ${journalToDelete.journalNumber} has been deleted.`,
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: getApiErrorMessage(error, 'Failed to delete journal.'),
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setJournalToDelete(null);
    }
  };

  const handlePost = async (journal: Journal) => {
    try {
      await postJournal.mutateAsync(journal.id);
      toast({
        title: 'Journal posted',
        description: `Journal ${journal.journalNumber} has been posted.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: getApiErrorMessage(error, 'Failed to post journal.'),
        variant: 'destructive',
      });
    }
  };

  const confirmReverse = async () => {
    if (!journalToReverse) return;
    try {
      const reversal = await reverseJournal.mutateAsync({ id: journalToReverse.id });
      toast({ title: t('journals.reversed'), description: reversal.journalNumber });
    } catch (error) {
      toast({
        title: t('journals.reverseFailed'),
        description: getApiErrorMessage(error, t('journals.reverseFailed')),
        variant: 'destructive',
      });
    }
    setJournalToReverse(null);
  };

  const calculateTotal = (journal: Journal): string =>
    journal.totalDebit ?? calculateJournalTotals(journal.lines ?? []).totalDebit;

  const columns: ColumnDef<Journal>[] = [
    {
      accessorKey: 'journalNumber',
      header: () => (
        <SortableHeader
          label={t('journals.table.journalNumber')}
          columnId="journalNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => <span className="font-medium">{row.original.journalNumber}</span>,
    },
    {
      accessorKey: 'entryDate',
      header: () => (
        <SortableHeader
          label={t('journals.table.date')}
          columnId="date"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.entryDate), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'description',
      header: t('journals.form.description'),
      meta: { cellClassName: 'max-w-[300px] truncate' },
      cell: ({ row }) => row.original.description || '-',
    },
    {
      id: 'amount',
      header: t('journals.table.debit'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right font-mono' },
      cell: ({ row }) => formatJournalAmount(calculateTotal(row.original)),
    },
    {
      accessorKey: 'status',
      header: t('recurring.table.status'),
      cell: ({ row }) => (
        <Badge className={getStatusColor(row.original.status)}>{row.original.status}</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const journal = row.original;
        const editable = isJournalEditable(journal);
        const reversible = canReverseJournal(journal) && !isSystemJournal(journal);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounting/journals/${journal.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {canEdit && editable && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/journals/${journal.id}/edit`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePost(journal)}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Post
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && editable && (
                <DropdownMenuItem
                  onClick={() => handleDelete(journal)}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
              {canReverse && reversible && (
                <DropdownMenuItem onClick={() => setJournalToReverse(journal)}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  {t('journals.reverse')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <AutoTourTrigger tourId="accounting_journals" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('journals.title')}</h1>
          <p className="text-muted-foreground">Create and manage manual journal entries</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild data-tour="create-journal-btn">
              <Link href="/accounting/journals/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('journals.newJournal')}
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
              placeholder="Search by journal number or description..."
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
              aria-label="Refresh journals"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Journals Table */}
      <Card data-tour="journal-list">
        <CardHeader>
          <CardTitle>Journals</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={journals}
            total={total}
            isLoading={isLoading}
            enableVirtualization
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            enableColumnResizing
            tableId="journals"
            enableSelection
            enableExport
            enableColumnVisibility
            exportFilename="journals"
            onExportAll={onExportAll}
            bulkActions={bulkActions}
            emptyMessage={t('journals.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/accounting/journals/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Journal
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
            <AlertDialogTitle>{t('journals.deleteJournal')}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{journalToDelete?.journalNumber}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse Confirmation Dialog */}
      <AlertDialog
        open={!!journalToReverse}
        onOpenChange={(open) => !open && setJournalToReverse(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('journals.reverseTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('journals.reverseConfirm', { number: journalToReverse?.journalNumber ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReverse} disabled={reverseJournal.isPending}>
              {t('journals.reverse')}
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
        itemType="journals"
        description="Only unposted journals will be deleted. Posted journals will be skipped."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkPostOpen}
        onOpenChange={setBulkPostOpen}
        action="post"
        count={bulkSelectedRows.length}
        itemType="journals"
        description="Selected unposted journals will be posted. This will create accounting entries."
        isLoading={bulkPostAction.isLoading}
        onConfirm={async () => {
          await bulkPostAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkPostOpen(false);
          refetch();
        }}
      />
    </div>
  );
}

export default function JournalsPage() {
  return (
    <Suspense>
      <JournalsPageContent />
    </Suspense>
  );
}
