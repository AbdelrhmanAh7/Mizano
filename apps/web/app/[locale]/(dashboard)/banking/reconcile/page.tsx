'use client';

import Link from 'next/link';
import { RefreshCw, ArrowRight, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBankAccounts,
  getAccountTypeColor,
  formatCurrency,
  BankAccount,
} from '@/lib/hooks/use-bank-accounts';
import { useTranslations } from 'next-intl';

export default function ReconcilePage() {
  const t = useTranslations('banking');
  const { data, isLoading } = useBankAccounts({ isActive: true });
  const accounts: BankAccount[] = data?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('reconciliation.pageTitle')}</h1>
        <p className="text-muted-foreground">{t('reconciliation.pageDescription')}</p>
      </div>

      {/* Account Selection */}
      {accounts.length === 0 ? (
        <div className="text-center py-12">
          <Landmark className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">{t('reconciliation.empty.noAccounts')}</h3>
          <p className="text-muted-foreground">{t('reconciliation.empty.noAccountsDescription')}</p>
          <Button asChild className="mt-4">
            <Link href="/banking/accounts/new">{t('reconciliation.empty.addBankAccount')}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const currentBalance =
              typeof account.systemBalance === 'string'
                ? parseFloat(account.systemBalance)
                : account.systemBalance;

            const bankBalance =
              typeof account.bankBalance === 'string'
                ? parseFloat(account.bankBalance)
                : account.bankBalance;

            const difference = Math.abs((bankBalance || 0) - (currentBalance || 0));
            const needsReconciliation = difference > 0.01;

            return (
              <Card key={account.id} className="hover:border-primary transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn('p-2 rounded-lg', getAccountTypeColor(account.type))}>
                        <Landmark className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base">{account.name}</CardTitle>
                    </div>
                    {needsReconciliation && (
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                        {t('reconciliation.needsReview')}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t('reconciliation.bookBalance')}
                      </span>
                      <span className="font-mono">{formatCurrency(currentBalance)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t('reconciliation.bankBalance')}
                      </span>
                      <span className="font-mono">{formatCurrency(bankBalance || 0)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          needsReconciliation ? 'text-yellow-600' : 'text-green-600',
                        )}
                      >
                        {t('reconciliation.summary.difference')}
                      </span>
                      <span
                        className={cn(
                          'font-mono font-medium',
                          needsReconciliation ? 'text-yellow-600' : 'text-green-600',
                        )}
                      >
                        {formatCurrency(difference)}
                      </span>
                    </div>
                  </div>

                  <Button asChild className="w-full">
                    <Link href={`/banking/reconcile/${account.id}`}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {t('reconciliation.reconcile')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
