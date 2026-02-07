'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Trash2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  useWorkOrders,
  useDeleteWorkOrder,
  WorkOrder,
  WorkOrderStatus,
  getWorkOrderStatusColor,
  getWorkOrderStatusLabel,
} from '@/lib/hooks/use-manufacturing';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'IN_PROCESS', label: 'In Process' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function WorkOrdersPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);

  const { data: workOrdersData, isLoading, refetch } = useWorkOrders({
    search: searchQuery || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  });
  const deleteWorkOrder = useDeleteWorkOrder();

  const workOrders = workOrdersData?.data || [];

  const canCreate = hasPermission('manufacturing.create');
  const canDelete = hasPermission('manufacturing.delete');

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work Orders</h1>
          <p className="text-muted-foreground">
            Manage production work orders
          </p>
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
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by WO number or BOM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
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
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : workOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No work orders found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/manufacturing/work-orders/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Work Order
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO #</TableHead>
                  <TableHead>Output Item</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo: WorkOrder) => (
                  <TableRow key={wo.id}>
                    <TableCell>
                      <Link
                        href={`/manufacturing/work-orders/${wo.id}`}
                        className="font-medium hover:underline"
                      >
                        {wo.workOrderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {wo.outputItem ? (
                        <span>
                          <span className="text-xs text-muted-foreground">{wo.outputItem.code}</span>
                          {' '}{wo.outputItem.name}
                        </span>
                      ) : wo.bom?.name || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {wo.quantity}
                    </TableCell>
                    <TableCell>
                      {format(new Date(wo.startDate), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {wo.dueDate ? format(new Date(wo.dueDate), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={getWorkOrderStatusColor(wo.status)}>
                        {getWorkOrderStatusLabel(wo.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
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
                              <DropdownMenuItem
                                onClick={() => handleDelete(wo)}
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
            <AlertDialogTitle>Delete Work Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete work order &quot;{selectedWO?.workOrderNumber}&quot;?
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
