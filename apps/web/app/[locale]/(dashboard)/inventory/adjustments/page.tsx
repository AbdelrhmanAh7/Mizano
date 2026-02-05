'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, MoreHorizontal, Eye, FileText, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAdjustments,
  getAdjustmentStatusLabel,
  getAdjustmentStatusColor,
  getReasonLabel,
  Adjustment,
} from '@/lib/hooks/use-adjustments';

export default function AdjustmentsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data, isLoading } = useAdjustments({
    search,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
  });

  const adjustments: Adjustment[] = data?.data || [];

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
          <h1 className="text-3xl font-bold tracking-tight">Inventory Adjustments</h1>
          <p className="text-muted-foreground">
            Manage stock corrections and adjustments
          </p>
        </div>
        <Button asChild>
          <Link href="/inventory/adjustments/new">
            <Plus className="mr-2 h-4 w-4" />
            New Adjustment
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search adjustments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="INCREASE">Increase</SelectItem>
            <SelectItem value="DECREASE">Decrease</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="POSTED">Posted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {adjustments.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No adjustments found</h3>
          <p className="text-muted-foreground">
            Create your first inventory adjustment to get started.
          </p>
          <Button asChild className="mt-4">
            <Link href="/inventory/adjustments/new">Create Adjustment</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adjustment #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((adjustment) => {
                const totalQty = adjustment.lines?.reduce(
                  (sum, line) => sum + (line.quantityAdjusted || 0),
                  0
                ) || 0;

                return (
                  <TableRow key={adjustment.id}>
                    <TableCell>
                      <Link
                        href={`/inventory/adjustments/${adjustment.id}`}
                        className="font-medium hover:text-blue-600 hover:underline"
                      >
                        {adjustment.adjustmentNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {format(new Date(adjustment.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {adjustment.type === 'INCREASE' ? (
                          <ArrowUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-red-600" />
                        )}
                        <span
                          className={cn(
                            'font-medium',
                            adjustment.type === 'INCREASE'
                              ? 'text-green-600'
                              : 'text-red-600'
                          )}
                        >
                          {adjustment.type === 'INCREASE' ? 'Increase' : 'Decrease'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getReasonLabel(adjustment.reason)}</TableCell>
                    <TableCell className="text-right">
                      {adjustment.lines?.length || 0}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span
                        className={cn(
                          'font-medium',
                          adjustment.type === 'INCREASE'
                            ? 'text-green-600'
                            : 'text-red-600'
                        )}
                      >
                        {adjustment.type === 'INCREASE' ? '+' : '-'}
                        {totalQty}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getAdjustmentStatusColor(adjustment.status)}
                      >
                        {getAdjustmentStatusLabel(adjustment.status)}
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
                            <Link href={`/inventory/adjustments/${adjustment.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
