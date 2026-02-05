'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, MoreHorizontal, Eye, Play, CheckCircle2, XCircle, Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  useWorkOrders,
  useStartWorkOrder,
  getWorkOrderStatusLabel,
  getWorkOrderStatusColor,
  WorkOrder,
} from '@/lib/hooks/use-manufacturing';

export default function WorkOrdersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useWorkOrders({
    search,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const startWorkOrder = useStartWorkOrder();

  const workOrders: WorkOrder[] = data?.data || [];

  const handleStart = async (id: string) => {
    await startWorkOrder.mutateAsync(id);
  };

  // Summary
  const draftCount = workOrders.filter((wo) => wo.status === 'DRAFT').length;
  const inProcessCount = workOrders.filter((wo) => wo.status === 'IN_PROCESS').length;
  const completedCount = workOrders.filter((wo) => wo.status === 'COMPLETED').length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

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
        <Button asChild>
          <Link href="/manufacturing/work-orders/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Work Order
          </Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Factory className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{workOrders.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Factory className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold">{draftCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Play className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">In Process</p>
                <p className="text-2xl font-bold text-blue-600">{inProcessCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search work orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="IN_PROCESS">In Process</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {workOrders.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Factory className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No work orders found</h3>
              <p className="text-muted-foreground">
                Create your first work order to start manufacturing.
              </p>
              <Button asChild className="mt-4">
                <Link href="/manufacturing/work-orders/new">Create Work Order</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Order #</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>BOM</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo) => {
                  const progress = wo.completedQuantity
                    ? (wo.completedQuantity / wo.quantity) * 100
                    : 0;
                  return (
                    <TableRow key={wo.id}>
                      <TableCell>
                        <Link
                          href={`/manufacturing/work-orders/${wo.id}`}
                          className="font-medium hover:text-blue-600 hover:underline"
                        >
                          {wo.workOrderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {wo.outputItem?.code} - {wo.outputItem?.name}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/manufacturing/bom/${wo.bomId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {wo.bom?.name || '-'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        {wo.completedQuantity || 0} / {wo.quantity}
                      </TableCell>
                      <TableCell>
                        <div className="w-24">
                          <Progress value={progress} className="h-2" />
                          <span className="text-xs text-muted-foreground">
                            {progress.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(wo.startDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getWorkOrderStatusColor(wo.status)}
                        >
                          {getWorkOrderStatusLabel(wo.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/manufacturing/work-orders/${wo.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            {wo.status === 'DRAFT' && (
                              <DropdownMenuItem onClick={() => handleStart(wo.id)}>
                                <Play className="mr-2 h-4 w-4" />
                                Start
                              </DropdownMenuItem>
                            )}
                            {wo.status === 'IN_PROCESS' && (
                              <DropdownMenuItem asChild>
                                <Link href={`/manufacturing/work-orders/${wo.id}?action=complete`}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Record Production
                                </Link>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
