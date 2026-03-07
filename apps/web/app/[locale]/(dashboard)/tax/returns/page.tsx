'use client';

import { DataTable, SortableHeader } from '@/components/data-table';
import { BulkActionConfirmDialog } from '@/components/data-table/bulk-action-confirm';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { vatReturnsApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  formatCurrency,
  getVATReturnStatusColor,
  getVATReturnStatusLabel,
  useDeleteVATReturn,
  useFileVATReturn,
  useVATReturns,
  VATReturn,
} from '@/lib/hooks/use-tax';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye, FileCheck, Filter, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';

function VATReturnsPageContent() {
  const t = useTranslations('tax');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'createdAt' });

  const STATUS_OPTIONS = [
    { value: 'all', label: t('returns.allStatuses') },
    { value: 'DRAFT', label: tCommon('status.draft') },
    { value: 'FILED', label: tCommon('status.filed') },
    { value: 'PAID', label: tCommon('status.paid') },
  ];

  const [selectedStatus, setSelectedStatus] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<VATReturn | null>(null);

  const {
    data: returnsData,
    isLoading,
    refetch,
  } = useVATReturns({
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  });
  const deleteReturn = useDeleteVATReturn();
  const fileReturn = useFileVATReturn();

  const returns = returnsData?.data || [];
  const meta = returnsData?.meta;

  const canCreate = hasPermission('tax.create');
  const canEdit = hasPermission('tax.edit');
  const canDelete = hasPermission('tax.delete');

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSubmitOpen, setBulkSubmitOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<VATReturn[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => vatReturnsApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['vat-returns']],
    successMessage: '{count} VAT returns deleted',
  });

  const bulkSubmitAction = useBulkAction({
    mutationFn: (ids) => vatReturnsApi.bulkSubmit(ids).then((r) => r.data),
    queryKeys: [['vat-returns']],
    successMessage: '{count} VAT returns submitted',
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: t('returns.fileReturns'),
            icon: FileCheck,
            onClick: (rows: VATReturn[]) => {
              setBulkSelectedRows(rows);
              setBulkSubmitOpen(true);
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
            onClick: (rows: VATReturn[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

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
        toast({ title: t('returns.deleteSuccess') });
      } catch (error: unknown) {
        toast({
          title: tCommon('errors.generic'),
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            t('returns.deleteFail'),
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
        toast({ title: t('returns.fileSuccess') });
      } catch (error: unknown) {
        toast({
          title: tCommon('errors.generic'),
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            t('returns.fileFail'),
          variant: 'destructive',
        });
      }
      setFileDialogOpen(false);
      setSelectedReturn(null);
    }
  };

  const columns: ColumnDef<VATReturn>[] = [
    {
      id: 'period',
      header: () => (
        <SortableHeader
          label={t('returns.table.period')}
          columnId="startDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link href={`/tax/returns/${row.original.id}`} className="font-medium hover:underline">
          {format(new Date(row.original.startDate), 'MMM d')} -{' '}
          {format(new Date(row.original.endDate), 'MMM d, yyyy')}
        </Link>
      ),
    },
    {
      accessorKey: 'outputVat',
      header: t('returns.table.outputVat'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.original.outputVat)}</span>
      ),
    },
    {
      accessorKey: 'inputVat',
      header: t('returns.table.inputVat'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.inputVat)}</span>,
    },
    {
      accessorKey: 'netVat',
      header: t('returns.table.netPayable'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const netVat =
          typeof row.original.netVat === 'string'
            ? parseFloat(row.original.netVat)
            : row.original.netVat;
        return (
          <span
            className={`font-mono font-semibold ${netVat > 0 ? 'text-red-600' : 'text-green-600'}`}
          >
            {formatCurrency(row.original.netVat)}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: t('returns.table.status'),
      cell: ({ row }) => (
        <Badge className={getVATReturnStatusColor(row.original.status)}>
          {getVATReturnStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const vatReturn = row.original;
        return (
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
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              {canEdit && vatReturn.status === 'DRAFT' && (
                <DropdownMenuItem onClick={() => handleFile(vatReturn)}>
                  <FileCheck className="mr-2 h-4 w-4" />
                  {t('returns.fileReturn')}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('returns.title')}</h1>
          <p className="text-muted-foreground">{t('returns.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/tax/returns/generate">
                <Plus className="mr-2 h-4 w-4" />
                {t('returns.generateReturn')}
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
                <SelectValue placeholder={t('returns.filterByStatus')} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('returns.allReturns')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={returns}
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 1}
            total={meta?.total || 0}
            limit={tableParams.limit}
            onPageChange={tableParams.setPage}
            onLimitChange={tableParams.setLimit}
            isLoading={isLoading}
            enableSelection
            bulkActions={bulkActions}
            emptyMessage={t('returns.noReturns')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/tax/returns/generate">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('returns.generateFirst')}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      {/* File Confirmation Dialog */}
      <AlertDialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('returns.fileTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('returns.fileDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFile}>{t('returns.fileReturn')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('returns.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('returns.deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {tCommon('buttons.delete')}
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
        itemType={t('returns.itemType')}
        description={t('returns.bulkDeleteDescription')}
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkSubmitOpen}
        onOpenChange={setBulkSubmitOpen}
        action="file"
        count={bulkSelectedRows.length}
        itemType={t('returns.itemType')}
        description={t('returns.bulkFileDescription')}
        isLoading={bulkSubmitAction.isLoading}
        onConfirm={async () => {
          await bulkSubmitAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkSubmitOpen(false);
          refetch();
        }}
      />
    </div>
  );
}

export default function VATReturnsPage() {
  return (
    <Suspense>
      <VATReturnsPageContent />
    </Suspense>
  );
}
