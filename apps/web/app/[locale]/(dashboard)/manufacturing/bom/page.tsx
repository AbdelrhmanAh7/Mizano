'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
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
        toast({ title: 'BOM deleted successfully' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete BOM',
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
          label="Name"
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
      header: 'Output Item',
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
      header: 'Components',
      meta: { headerClassName: 'text-center', cellClassName: 'text-center' },
      cell: ({ row }) => row.original.components?.length || 0,
    },
    {
      accessorKey: 'operationsCost',
      header: 'Operations Cost',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.original.operationsCost)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
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
                  View
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/manufacturing/bom/${bom.id}`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(bom)} className="text-red-600">
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
          <h1 className="text-3xl font-bold tracking-tight">Bills of Materials</h1>
          <p className="text-muted-foreground">Define product recipes and component requirements</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/manufacturing/bom/new">
                <Plus className="mr-2 h-4 w-4" />
                New BOM
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
          <CardTitle>All BOMs</CardTitle>
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
            emptyMessage="No bills of materials found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/manufacturing/bom/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First BOM
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
            <AlertDialogTitle>Delete BOM</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete BOM &quot;{selectedBOM?.name}&quot;? This action
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
