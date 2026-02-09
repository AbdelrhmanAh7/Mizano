'use client';

import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
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
import { workOrdersApi } from '@/lib/api';
import { useBulkAction } from '@/lib/hooks/use-bulk-action';
import {
    getWorkOrderStatusColor,
    getWorkOrderStatusLabel,
    useDeleteWorkOrder,
    useWorkOrders,
    WorkOrder,
} from '@/lib/hooks/use-manufacturing';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { type ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { CheckCircle, Eye, Filter, Play, Plus, RefreshCw, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'IN_PROCESS', label: 'In Process' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function WorkOrdersPageContent() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'createdAt' });

  const [selectedStatus, setSelectedStatus] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);

  const {
    data: workOrdersData,
    isLoading,
    refetch,
  } = useWorkOrders({
    search: tableParams.search || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  });
  const deleteWorkOrder = useDeleteWorkOrder();

  const workOrders = workOrdersData?.data || [];
  const meta = workOrdersData?.meta;

  const canCreate = hasPermission('manufacturing.create');
  const canEdit = hasPermission('manufacturing.edit');
  const canDelete = hasPermission('manufacturing.delete');

  // Bulk action state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStartOpen, setBulkStartOpen] = useState(false);
  const [bulkCompleteOpen, setBulkCompleteOpen] = useState(false);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkSelectedRows, setBulkSelectedRows] = useState<WorkOrder[]>([]);

  const bulkDeleteAction = useBulkAction({
    mutationFn: (ids) => workOrdersApi.bulkDelete(ids).then((r) => r.data),
    queryKeys: [['work-orders']],
    successMessage: '{count} work orders deleted',
  });

  const bulkStartAction = useBulkAction({
    mutationFn: (ids) => workOrdersApi.bulkStart(ids).then((r) => r.data),
    queryKeys: [['work-orders']],
    successMessage: '{count} work orders started',
  });

  const bulkCompleteAction = useBulkAction({
    mutationFn: (ids) => workOrdersApi.bulkComplete(ids).then((r) => r.data),
    queryKeys: [['work-orders']],
    successMessage: '{count} work orders completed',
  });

  const bulkCancelAction = useBulkAction({
    mutationFn: (ids) => workOrdersApi.bulkCancel(ids).then((r) => r.data),
    queryKeys: [['work-orders']],
    successMessage: '{count} work orders cancelled',
  });

  const bulkActions = [
    ...(canEdit
      ? [
          {
            label: 'Start',
            icon: Play,
            onClick: (rows: WorkOrder[]) => {
              setBulkSelectedRows(rows);
              setBulkStartOpen(true);
            },
          },
          {
            label: 'Complete',
            icon: CheckCircle,
            onClick: (rows: WorkOrder[]) => {
              setBulkSelectedRows(rows);
              setBulkCompleteOpen(true);
            },
          },
          {
            label: 'Cancel',
            icon: XCircle,
            variant: 'destructive' as const,
            onClick: (rows: WorkOrder[]) => {
              setBulkSelectedRows(rows);
              setBulkCancelOpen(true);
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
            onClick: (rows: WorkOrder[]) => {
              setBulkSelectedRows(rows);
              setBulkDeleteOpen(true);
            },
          },
        ]
      : []),
  ];

  const handleDelete = (wo: WorkOrder) => {
    setSelectedWO(wo);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedWO) {
      try {
        await deleteWorkOrder.mutateAsync(selectedWO.id);
        toast({ title: 'Work order deleted successfully' });
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Failed to delete work order',
          variant: 'destructive',
        });
      }
      setDeleteDialogOpen(false);
      setSelectedWO(null);
    }
  };

  const columns: ColumnDef<WorkOrder>[] = [
    {
      accessorKey: 'workOrderNumber',
      header: () => (
        <SortableHeader
          label="WO #"
          columnId="workOrderNumber"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <Link
          href={`/manufacturing/work-orders/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.workOrderNumber}
        </Link>
      ),
    },
    {
      id: 'outputItem',
      header: 'Output Item',
      cell: ({ row }) => {
        const wo = row.original;
        return wo.outputItem ? (
          <span>
            <span className="text-xs text-muted-foreground">{wo.outputItem.code}</span>{' '}
            {wo.outputItem.name}
          </span>
        ) : (
          wo.bom?.name || '-'
        );
      },
    },
    {
      accessorKey: 'quantity',
      header: 'Quantity',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => <span className="font-mono">{row.original.quantity}</span>,
    },
    {
      accessorKey: 'startDate',
      header: () => (
        <SortableHeader
          label="Start Date"
          columnId="startDate"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => format(new Date(row.original.startDate), 'MMM d, yyyy'),
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) =>
        row.original.dueDate ? format(new Date(row.original.dueDate), 'MMM d, yyyy') : '-',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge className={getWorkOrderStatusColor(row.original.status)}>
          {getWorkOrderStatusLabel(row.original.status)}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => {
        const wo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/manufacturing/work-orders/${wo.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {canDelete && wo.status === 'DRAFT' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(wo)} className="text-red-600">
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
          <h1 className="text-3xl font-bold tracking-tight">Work Orders</h1>
          <p className="text-muted-foreground">Manage production work orders</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/manufacturing/work-orders/new">
                <Plus className="mr-2 h-4 w-4" />
                New Work Order
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
              placeholder="Search by WO number or BOM..."
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

      {/* Work Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Work Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={workOrders}
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 1}
            total={meta?.total || 0}
            limit={tableParams.limit}
            onPageChange={tableParams.setPage}
            onLimitChange={tableParams.setLimit}
            isLoading={isLoading}
            enableSelection
            bulkActions={bulkActions}
            emptyMessage="No work orders found"
            emptyAction={
              canCreate ? (
                <Button asChild>
                  <Link href="/manufacturing/work-orders/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Work Order
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
            <AlertDialogTitle>Delete Work Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete work order &quot;{selectedWO?.workOrderNumber}&quot;?
              This action cannot be undone.
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
        itemType="work orders"
        description="Only draft work orders will be deleted."
        destructive
        isLoading={bulkDeleteAction.isLoading}
        onConfirm={async () => {
          await bulkDeleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkDeleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkStartOpen}
        onOpenChange={setBulkStartOpen}
        action="start"
        count={bulkSelectedRows.length}
        itemType="work orders"
        description="Draft work orders will be started."
        isLoading={bulkStartAction.isLoading}
        onConfirm={async () => {
          await bulkStartAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkStartOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkCompleteOpen}
        onOpenChange={setBulkCompleteOpen}
        action="complete"
        count={bulkSelectedRows.length}
        itemType="work orders"
        description="In-process work orders will be marked as completed."
        isLoading={bulkCompleteAction.isLoading}
        onConfirm={async () => {
          await bulkCompleteAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkCompleteOpen(false);
          refetch();
        }}
      />
      <BulkActionConfirmDialog
        open={bulkCancelOpen}
        onOpenChange={setBulkCancelOpen}
        action="cancel"
        count={bulkSelectedRows.length}
        itemType="work orders"
        description="Selected work orders will be cancelled."
        destructive
        isLoading={bulkCancelAction.isLoading}
        onConfirm={async () => {
          await bulkCancelAction.execute(bulkSelectedRows.map((r) => r.id));
          setBulkCancelOpen(false);
          refetch();
        }}
      />
    </div>
  );
}

export default function WorkOrdersPage() {
  return (
    <Suspense>
      <WorkOrdersPageContent />
    </Suspense>
  );
}
