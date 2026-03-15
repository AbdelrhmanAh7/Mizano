'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownLeft, Eye, Filter, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBankTransactions,
  getStatusLabel,
  getStatusColor,
  type TransactionStatus,
} from '@/lib/hooks/use-bank-transactions';
import { useTranslations } from 'next-intl';
import { StatementImportZone } from '@/components/banking/statement-import-zone';

export default function BankTransactionsPage() {
  const t = useTranslations('banking');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | ''>('');
  const [bankAccountId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const hasActiveFilters = dateFrom || dateTo || amountMin || amountMax;

  const { data, isLoading } = useBankTransactions({
    status: (statusFilter || undefined) as TransactionStatus | undefined,
    bankAccountId: bankAccountId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    amountMin: amountMin || undefined,
    amountMax: amountMax || undefined,
  });

  const transactions = data?.data || [];

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('transactions.title')}</h1>
        <p className="text-muted-foreground">View and manage imported bank transactions</p>
      </div>

      {/* Import Statement */}
      <Collapsible open={importOpen} onOpenChange={setImportOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import Statement
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <StatementImportZone />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex gap-4 items-center flex-wrap">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TransactionStatus | '')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="MATCHED">Matched</SelectItem>
            <SelectItem value="CREATED">Created</SelectItem>
            <SelectItem value="RECONCILED">Reconciled</SelectItem>
          </SelectContent>
        </Select>

        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge
                  variant="secondary"
                  className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  !
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Date From</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date To</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amountMin}
                      onChange={(e) => setAmountMin(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amountMax}
                      onChange={(e) => setAmountMax(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3">
                    <X className="mr-1 h-3 w-3" />
                    Clear filters
                  </Button>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Card>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t('transactions.empty.title')}. {t('transactions.empty.description')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('transactions.table.date')}</TableHead>
                  <TableHead>{t('transactions.table.description')}</TableHead>
                  <TableHead>{t('transactions.table.payee')}</TableHead>
                  <TableHead className="text-right">{t('transactions.table.amount')}</TableHead>
                  <TableHead>{t('transactions.table.status')}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map(
                  (txn: {
                    id: string;
                    date?: string;
                    description?: string;
                    payee?: string;
                    amount?: string | number;
                    status: string;
                  }) => {
                    const amount = parseFloat(txn.amount?.toString() || '0');
                    const isDeposit = amount >= 0;
                    return (
                      <TableRow key={txn.id}>
                        <TableCell className="text-sm">
                          {txn.date ? format(new Date(txn.date), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">
                          {txn.description || '-'}
                        </TableCell>
                        <TableCell>{txn.payee || '-'}</TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              'font-mono font-medium flex items-center justify-end gap-1',
                              isDeposit ? 'text-green-600' : 'text-red-600',
                            )}
                          >
                            {isDeposit ? (
                              <ArrowDownLeft className="h-3 w-3" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            ${Math.abs(amount).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getStatusColor(txn.status as TransactionStatus)}
                          >
                            {getStatusLabel(txn.status as TransactionStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/banking/transactions/${txn.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  },
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
