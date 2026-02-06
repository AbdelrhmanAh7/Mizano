'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, MoreHorizontal, Eye, ArrowRightLeft } from 'lucide-react';
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
import {
  useTransfers,
  getTransferStatusLabel,
  getTransferStatusColor,
  Transfer,
  TransferStatus,
} from '@/lib/hooks/use-transfers';

export default function TransfersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useTransfers({
    search,
    status: statusFilter !== 'all' ? statusFilter as TransferStatus : undefined,
  });

  const transfers: Transfer[] = data?.data || [];

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
          <h1 className="text-3xl font-bold tracking-tight">Stock Transfers</h1>
          <p className="text-muted-foreground">
            Transfer inventory between warehouses
          </p>
        </div>
        <Button asChild>
          <Link href="/inventory/transfers/new">
            <Plus className="mr-2 h-4 w-4" />
            New Transfer
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transfers..."
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
            <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {transfers.length === 0 ? (
        <div className="text-center py-12">
          <ArrowRightLeft className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No transfers found</h3>
          <p className="text-muted-foreground">
            Create your first stock transfer to move inventory between warehouses.
          </p>
          <Button asChild className="mt-4">
            <Link href="/inventory/transfers/new">Create Transfer</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => {
                const totalQty = transfer.lines?.reduce(
                  (sum, line) => sum + (line.quantity || 0),
                  0
                ) || 0;

                return (
                  <TableRow key={transfer.id}>
                    <TableCell>
                      <Link
                        href={`/inventory/transfers/${transfer.id}`}
                        className="font-medium hover:text-blue-600 hover:underline"
                      >
                        {transfer.transferNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {format(new Date(transfer.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {transfer.fromWarehouse?.name || '-'}
                    </TableCell>
                    <TableCell>
                      {transfer.toWarehouse?.name || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {transfer.lines?.length || 0}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {totalQty}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getTransferStatusColor(transfer.status)}
                      >
                        {getTransferStatusLabel(transfer.status)}
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
                            <Link href={`/inventory/transfers/${transfer.id}`}>
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
