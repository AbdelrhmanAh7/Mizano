'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Search, MoreHorizontal, Eye } from 'lucide-react';
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
  useVendorCredits,
  getStatusVariant,
  getStatusText,
  getTypeText,
  formatCurrency,
  VendorCredit,
} from '@/lib/hooks/use-vendor-credits';

export default function VendorCreditsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useVendorCredits({
    search,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const credits: VendorCredit[] = data?.data || [];

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
          <h1 className="text-3xl font-bold tracking-tight">Vendor Credits</h1>
          <p className="text-muted-foreground">
            Manage credits and refunds from vendors
          </p>
        </div>
        <Button asChild>
          <Link href="/purchases/credits/new">
            <Plus className="mr-2 h-4 w-4" />
            New Credit
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search credits..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="APPLIED">Applied</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {credits.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No vendor credits found</p>
          <Button asChild className="mt-4">
            <Link href="/purchases/credits/new">Create your first credit</Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Credit #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credits.map((credit) => (
                <TableRow key={credit.id}>
                  <TableCell>
                    <Link
                      href={`/purchases/credits/${credit.id}`}
                      className="font-mono text-blue-600 hover:underline"
                    >
                      {credit.creditNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{credit.vendor?.name || '-'}</TableCell>
                  <TableCell>
                    {format(new Date(credit.date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getTypeText(credit.type)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(credit.status)}>
                      {getStatusText(credit.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(credit.total, credit.vendor?.currency || 'USD')}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(
                      credit.balanceRemaining,
                      credit.vendor?.currency || 'USD'
                    )}
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
                          <Link href={`/purchases/credits/${credit.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
