'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBankTransaction,
  getStatusLabel,
  getStatusColor,
} from '@/lib/hooks/use-bank-transactions';
import { useTranslations } from 'next-intl';

export default function BankTransactionDetailPage() {
  const t = useTranslations('banking');
  const params = useParams();
  const id = params.id as string;

  const { data: txn, isLoading } = useBankTransaction(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/banking/transactions">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Transaction Not Found</h1>
        </div>
      </div>
    );
  }

  const amount = parseFloat(txn.amount?.toString() || '0');
  const isDeposit = amount >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/banking/transactions">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {t('transactions.transactionDetails')}
              </h1>
              <Badge variant="outline" className={getStatusColor(txn.status)}>
                {getStatusLabel(txn.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground">{txn.description || 'No description'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('transactions.transactionDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transactions.form.date')}</span>
              <span>{txn.date ? format(new Date(txn.date), 'MMMM d, yyyy') : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transactions.form.amount')}</span>
              <span
                className={cn(
                  'font-mono font-bold text-lg flex items-center gap-1',
                  isDeposit ? 'text-green-600' : 'text-red-600',
                )}
              >
                {isDeposit ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                ${Math.abs(amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transactions.form.type')}</span>
              <span>
                {isDeposit ? t('transactions.types.deposit') : t('transactions.types.withdrawal')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transactions.form.payee')}</span>
              <span>{txn.payee || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('transactions.form.reference')}</span>
              <span>{txn.reference || '-'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bank Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account</span>
              <span>{txn.bankAccount?.name || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className={getStatusColor(txn.status)}>
                {getStatusLabel(txn.status)}
              </Badge>
            </div>
            {txn.matchedTransaction && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Matched To</span>
                <span>{txn.matchedTransaction.reference || 'Matched'}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
