'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownLeft, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBankTransactions,
  getStatusLabel,
  getStatusColor,
  type TransactionStatus,
} from '@/lib/hooks/use-bank-transactions';
import { useTranslations } from 'next-intl';

export default function BankTransactionsPage() {
  const t = useTranslations('banking');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | ''>('');
  const [bankAccountId, setBankAccountId] = useState('');

  const { data, isLoading } = useBankTransactions({
    status: (statusFilter || undefined) as TransactionStatus | undefined,
    bankAccountId: bankAccountId || undefined,
  });

  const transactions = data?.data || [];

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

      <div className="flex gap-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TransactionStatus | '')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="UNMATCHED">Unmatched</SelectItem>
            <SelectItem value="MATCHED">Matched</SelectItem>
            <SelectItem value="RECONCILED">Reconciled</SelectItem>
            <SelectItem value="EXCLUDED">Excluded</SelectItem>
          </SelectContent>
        </Select>
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
                          <Badge variant="outline" className={getStatusColor(txn.status)}>
                            {getStatusLabel(txn.status)}
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
