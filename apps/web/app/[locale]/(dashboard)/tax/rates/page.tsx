'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Edit, Star, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { DataTable, SortableHeader } from '@/components/data-table';
import { DataTableSearch, DataTableFacetedFilter } from '@/components/data-table';
import {
  useTaxRates,
  useDeleteTaxRate,
  TaxRate,
  getTaxRateTypeLabel,
  formatPercentage,
} from '@/lib/hooks/use-tax';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { TaxRateForm } from '@/components/tax/tax-rate-form';
import { type ColumnDef } from '@tanstack/react-table';

export default function TaxRatesPage() {
  const t = useTranslations('tax');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'name' });

  const TYPE_OPTIONS = [
    { value: 'OUTPUT', label: 'Output (Sales)' },
    { value: 'INPUT', label: 'Input (Purchases)' },
    { value: 'BOTH', label: 'Both' },
  ];

  const STATUS_OPTIONS = [
    { value: 'active', label: t('rates.activeOnly') },
    { value: 'inactive', label: t('rates.inactiveOnly') },
  ];

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<TaxRate | null>(null);
  const [editingRate, setEditingRate] = useState<TaxRate | undefined>(undefined);

  const { data: taxRatesData, isLoading, refetch } = useTaxRates();
  const deleteTaxRate = useDeleteTaxRate();

  // Client-side filtering
  const filteredRates = useMemo(() => {
    const allRates: TaxRate[] = taxRatesData?.data || [];
    let result = allRates;

    // Search
    if (tableParams.search) {
      const q = tableParams.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.account?.name?.toLowerCase().includes(q) ||
          r.account?.code?.toLowerCase().includes(q),
      );
    }

    // Type filter
    if (tableParams.filters.type) {
      result = result.filter((r) => r.type === tableParams.filters.type);
    }

    // Active filter
    if (tableParams.filters.status === 'active') {
      result = result.filter((r) => r.isActive);
    } else if (tableParams.filters.status === 'inactive') {
      result = result.filter((r) => !r.isActive);
    }

    return result;
  }, [taxRatesData, tableParams.search, tableParams.filters.type, tableParams.filters.status]);

  const canCreate = hasPermission('tax.create');
  const canEdit = hasPermission('tax.edit');
  const canDelete = hasPermission('tax.delete');

  const handleDelete = (rate: TaxRate) => {
    setSelectedRate(rate);
    setDeleteDialogOpen(true);
  };

  const handleEdit = (rate: TaxRate) => {
    setEditingRate(rate);
    setFormDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingRate(undefined);
    setFormDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedRate) {
      try {
        await deleteTaxRate.mutateAsync(selectedRate.id);
        toast({ title: t('rates.deleteSuccess') });
      } catch (error: unknown) {
        toast({
          title: tCommon('errors.generic'),
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            t('rates.deleteFail'),
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedRate(null);
    }
  };

  const columns: ColumnDef<TaxRate>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('rates.table.name')}
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.isDefault && (
            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'rate',
      header: () => (
        <SortableHeader
          label={t('rates.table.rate')}
          columnId="rate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono font-semibold">{formatPercentage(row.original.rate)}</span>
      ),
    },
    {
      accessorKey: 'type',
      header: t('rates.table.type'),
      cell: ({ row }) => <Badge variant="outline">{getTaxRateTypeLabel(row.original.type)}</Badge>,
    },
    {
      accessorKey: 'account.name',
      header: t('rates.table.linkedAccount'),
      cell: ({ row }) =>
        row.original.account ? (
          <span className="text-sm">
            <span className="text-muted-foreground">{row.original.account.code}</span>{' '}
            {row.original.account.name}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      accessorKey: 'isActive',
      header: t('rates.table.active'),
      cell: ({ row }) => (
        <Badge
          className={
            row.original.isActive
              ? 'bg-green-100 text-green-800 border-green-200'
              : 'bg-gray-100 text-gray-800 border-gray-200'
          }
        >
          {row.original.isActive ? tCommon('status.active') : tCommon('status.inactive')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const rate = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => handleEdit(rate)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {tCommon('buttons.edit')}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(rate)} className="text-red-600">
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
          <h1 className="text-3xl font-bold tracking-tight">{t('rates.title')}</h1>
          <p className="text-muted-foreground">{t('rates.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('rates.newTaxRate')}
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
              placeholder={t('rates.searchPlaceholder')}
            />
            <DataTableFacetedFilter
              title={t('rates.filterByType')}
              options={TYPE_OPTIONS}
              selected={tableParams.filters.type ? [tableParams.filters.type] : []}
              onSelectionChange={(values) => tableParams.setFilter('type', values[0] || undefined)}
              singleSelect
            />
            <DataTableFacetedFilter
              title={t('rates.filterByStatus')}
              options={STATUS_OPTIONS}
              selected={tableParams.filters.status ? [tableParams.filters.status] : []}
              onSelectionChange={(values) =>
                tableParams.setFilter('status', values[0] || undefined)
              }
              singleSelect
            />
            <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tax Rates Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('rates.allRates')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredRates}
            total={filteredRates.length}
            isLoading={isLoading}
            emptyMessage={t('rates.noRates')}
            emptyAction={
              canCreate ? (
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('rates.createFirst')}
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRate ? t('rates.editTaxRate') : t('rates.newTaxRate')}
            </DialogTitle>
            <DialogDescription>
              {editingRate ? t('rates.editDescription') : t('rates.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <TaxRateForm taxRate={editingRate} onSuccess={() => setFormDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rates.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rates.deleteDescription', { name: selectedRate?.name ?? '' })}
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
    </div>
  );
}
