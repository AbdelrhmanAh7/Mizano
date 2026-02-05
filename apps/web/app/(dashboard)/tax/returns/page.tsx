'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, FileText, Eye, CheckCircle2, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  useVATReturns,
  getVATReturnStatusLabel,
  getVATReturnStatusColor,
  formatCurrency,
  VATReturn,
} from '@/lib/hooks/use-tax';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function VATReturnsPage() {
  const [yearFilter, setYearFilter] = useState<string>(currentYear.toString());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useVATReturns({
    year: yearFilter !== 'all' ? parseInt(yearFilter) : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const vatReturns: VATReturn[] = data?.data || [];

  // Summary
  const totalOutputVat = vatReturns.reduce((sum, r) => {
    const amount = typeof r.outputVat === 'string' ? parseFloat(r.outputVat) : r.outputVat;
    return sum + (amount || 0);
  }, 0);
  const totalInputVat = vatReturns.reduce((sum, r) => {
    const amount = typeof r.inputVat === 'string' ? parseFloat(r.inputVat) : r.inputVat;
    return sum + (amount || 0);
  }, 0);
  const totalNetVat = totalOutputVat - totalInputVat;

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
          <h1 className="text-3xl font-bold tracking-tight">VAT Returns</h1>
          <p className="text-muted-foreground">
            Generate and manage VAT returns
          </p>
        </div>
        <Button asChild>
          <Link href="/tax/returns/generate">
            <Plus className="mr-2 h-4 w-4" />
            Generate Return
          </Link>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Returns</p>
                <p className="text-2xl font-bold">{vatReturns.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Output VAT</p>
                <p className="text-2xl font-bold font-mono text-green-600">
                  {formatCurrency(totalOutputVat)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Input VAT</p>
                <p className="text-2xl font-bold font-mono text-red-600">
                  {formatCurrency(totalInputVat)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={totalNetVat >= 0 ? 'bg-blue-50' : 'bg-green-50'}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {totalNetVat >= 0 ? 'Net Payable' : 'Net Refundable'}
            </p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(Math.abs(totalNetVat))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="FILED">Filed</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {vatReturns.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No VAT returns found</h3>
              <p className="text-muted-foreground">
                Generate your first VAT return to get started.
              </p>
              <Button asChild className="mt-4">
                <Link href="/tax/returns/generate">Generate Return</Link>
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
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Output VAT</TableHead>
                  <TableHead className="text-right">Input VAT</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filed Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vatReturns.map((vatReturn) => {
                  const outputVat = typeof vatReturn.outputVat === 'string'
                    ? parseFloat(vatReturn.outputVat)
                    : vatReturn.outputVat;
                  const inputVat = typeof vatReturn.inputVat === 'string'
                    ? parseFloat(vatReturn.inputVat)
                    : vatReturn.inputVat;
                  const netVat = outputVat - inputVat;

                  return (
                    <TableRow key={vatReturn.id}>
                      <TableCell>
                        <Link
                          href={`/tax/returns/${vatReturn.id}`}
                          className="font-medium hover:text-blue-600 hover:underline"
                        >
                          {format(new Date(vatReturn.startDate), 'MMM d')} -{' '}
                          {format(new Date(vatReturn.endDate), 'MMM d, yyyy')}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        {formatCurrency(outputVat)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        {formatCurrency(inputVat)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {netVat >= 0 ? '' : '-'}{formatCurrency(Math.abs(netVat))}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getVATReturnStatusColor(vatReturn.status)}
                        >
                          {getVATReturnStatusLabel(vatReturn.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {vatReturn.filedAt
                          ? format(new Date(vatReturn.filedAt), 'MMM d, yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/tax/returns/${vatReturn.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
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
