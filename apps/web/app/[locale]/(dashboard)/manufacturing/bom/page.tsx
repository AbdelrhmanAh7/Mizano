'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, RefreshCw, Eye, Edit, Trash2, Filter } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
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
import { useToast } from '@/components/ui/use-toast';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useBOMs,
  useDeleteBOM,
  BOM,
  getBOMStatusColor,
  getBOMStatusLabel,
  formatCurrency,
} from '@/lib/hooks/use-manufacturing';
import { usePermissions } from '@/lib/hooks/use-permissions';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

function BOMListPageContent() {
  const t = useTranslations('manufacturing');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'createdAt' });

  const [selectedStatus, setSelectedStatus] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBOM, setSelectedBOM] = useState<BOM | null>(null);

  const {
    data: bomsData,
    isLoading,
    refetch,
  } = useBOMs({
    search: tableParams.search || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  });
  const deleteBOM = useDeleteBOM();

  const boms = bomsData?.data || [];
  const meta = bomsData?.meta;

  const canCreate = hasPermission('manufacturing.create');
  const canEdit = hasPermission('manufacturing.edit');
  const canDelete = hasPermission('manufacturing.delete');

  const handleDelete = (bom: BOM) => {
    setSelectedBOM(bom);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedBOM) {
      try {
        await deleteBOM.mutateAsync(selectedBOM.id);
        toast({ title: t('bom.deleteBom') });
      } catch (error: unknown) {
        toast({
          title: 'Error',
          description:
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
            'Failed to delete BOM',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedBOM(null);
    }
  };

  const columns: ColumnDef<BOM>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('bom.table.name')}
          columnId="name"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/manufacturing/bom/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: 'outputItem',
      header: t('bom.table.outputItem'),
      cell: ({ row }) => {
        const bom = row.original;
        return bom.outputItem ? (
          <span>
            <span className="text-xs text-muted-foreground">{bom.outputItem.code}</span>{' '}
            {bom.outputItem.name}
          </span>
        ) : (
          '-'
        );
      },
    },
    {
      id: 'components',
      header: t('bom.table.itemCount'),
      meta: { headerClassName: 'text-center', cellClassName: 'text-center' },
      cell: ({ row }) => row.original.components?.length || 0,
    },
    {
      accessorKey: 'operationsCost',
      header: t('bom.table.cost'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.original.operationsCost)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('workOrders.table.status'),
      cell: ({ row }) => (
        <Badge className={getBOMStatusColor(row.original.status)}>
          {getBOMStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const bom = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/manufacturing/bom/${bom.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  {tCommon('buttons.view')}
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/manufacturing/bom/${bom.id}`}>
                    <Edit className="mr-2 h-4 w-4" />
                    {tCommon('buttons.edit')}
                  </Link>
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(bom)} className="text-red-600">
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
          <h1 className="text-3xl font-bold tracking-tight">{t('bom.title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/manufacturing/bom/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('bom.newBom')}
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
              placeholder="Search by name or item..."
            />
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

      {/* BOMs Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('bom.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={boms}
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 1}
            total={meta?.total || 0}
            limit={tableParams.limit}
            onPageChange={tableParams.setPage}
            onLimitChange={tableParams.setLimit}
            isLoading={isLoading}
            emptyMessage={t('bom.empty.title')}
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/manufacturing/bom/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('bom.empty.description')}
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
            <AlertDialogTitle>{t('bom.deleteBom')}</AlertDialogTitle>
            <AlertDialogDescription>{tCommon('confirm.deleteMessage')}</AlertDialogDescription>
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

export default function BOMListPage() {
  return (
    <Suspense>
      <BOMListPageContent />
    </Suspense>
  );
}
