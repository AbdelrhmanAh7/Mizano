'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, RefreshCw, Eye, Filter } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreditNotes,
  CreditNote,
  CreditNoteType,
  getCreditNoteTypeColor,
  getCreditNoteTypeLabel,
} from '@/lib/hooks/use-credit-notes';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { format } from 'date-fns';

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'APPLY_TO_INVOICE', label: 'Applied to Invoice' },
];

export default function CreditNotesPage() {
  const { hasPermission } = usePermissions();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  const { data: creditNotesData, isLoading, refetch } = useCreditNotes({
    search: searchQuery || undefined,
    type: selectedType !== 'all' ? (selectedType as CreditNoteType) : undefined,
  });

  const creditNotes = creditNotesData?.data || [];

  const canCreate = hasPermission('sales.create');

  const formatCurrency = (amount: string | number, currency: string = 'USD') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Credit Notes</h1>
          <p className="text-muted-foreground">
            Manage customer credit notes and refunds
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <Button asChild>
              <Link href="/sales/credit-notes/new">
                <Plus className="mr-2 h-4 w-4" />
                New Credit Note
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
                placeholder="Search by credit note number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
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

      {/* Credit Notes Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Credit Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : creditNotes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No credit notes found</p>
              {canCreate && (
                <Button asChild>
                  <Link href="/sales/credit-notes/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Credit Note
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credit Note #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Original Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNotes.map((creditNote: CreditNote) => (
                  <TableRow key={creditNote.id}>
                    <TableCell>
                      <Link
                        href={`/sales/credit-notes/${creditNote.id}`}
                        className="font-medium hover:underline"
                      >
                        {creditNote.creditNoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {creditNote.customer ? (
                        <Link
                          href={`/sales/customers/${creditNote.customer.id}`}
                          className="hover:underline"
                        >
                          {creditNote.customer.name}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {creditNote.invoice ? (
                        <Link
                          href={`/sales/invoices/${creditNote.invoice.id}`}
                          className="hover:underline"
                        >
                          {creditNote.invoice.invoiceNumber}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(creditNote.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge className={getCreditNoteTypeColor(creditNote.type)}>
                        {getCreditNoteTypeLabel(creditNote.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-orange-600">
                      {formatCurrency(creditNote.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/sales/credit-notes/${creditNote.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
