'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  Check,
  Plus,
  FileText,
  Receipt,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useBankAccount } from '@/lib/hooks/use-bank-accounts';
import {
  useUnmatchedTransactions,
  useSuggestedMatches,
  useMatchTransaction,
  BankTransaction,
  SuggestedMatch,
  isRecordedPayment,
  getConfidenceColor,
  getConfidenceLabel,
} from '@/lib/hooks/use-bank-transactions';
import { useTranslations } from 'next-intl';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { useDateFnsLocale } from '@/lib/date-locale';

interface ReconcileAccountPageProps {
  params: { accountId: string };
}

export default function ReconcileAccountPage({ params }: ReconcileAccountPageProps) {
  const dateLocale = useDateFnsLocale();
  const { accountId } = params;
  const t = useTranslations('banking');
  const tCommon = useTranslations('common');
  const formatCurrency = useMoneyFormatter();
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);

  const {
    data: account,
    isLoading: accountLoading,
    isError: accountFailed,
    refetch: refetchAccount,
  } = useBankAccount(accountId);
  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    isError: transactionsFailed,
    refetch: refetchTransactions,
  } = useUnmatchedTransactions(accountId);
  const {
    data: suggestedData,
    isLoading: suggestedLoading,
    isError: suggestedFailed,
    refetch: refetchSuggested,
  } = useSuggestedMatches(accountId, selectedTransaction || '');

  const matchTransaction = useMatchTransaction();

  const transactions: BankTransaction[] = transactionsData?.data || [];
  const suggestedMatches: SuggestedMatch[] = suggestedData ?? [];

  const isLoading = accountLoading || transactionsLoading;

  const handleMatch = async (transactionId: string, match: SuggestedMatch) => {
    try {
      await matchTransaction.mutateAsync({
        id: transactionId,
        documentId: match.id,
        documentType: match.type,
      });
      setSelectedTransaction(null);
    } catch {
      // The failure toast is shown by the mutation; the line stays selected to try again.
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  if (accountFailed || transactionsFailed) {
    return (
      <div className="text-center py-12 space-y-4" role="alert">
        <p className="text-muted-foreground">{tCommon('errors.generic')}</p>
        <Button
          variant="outline"
          onClick={() => void (accountFailed ? refetchAccount() : refetchTransactions())}
        >
          {tCommon('dashboard.tryAgain')}
        </Button>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('reconciliation.accountNotFound')}</p>
        <Button asChild className="mt-4">
          <Link href="/banking/reconcile">{t('reconciliation.backToReconciliation')}</Link>
        </Button>
      </div>
    );
  }

  const selectedTx = transactions.find((t) => t.id === selectedTransaction);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={tCommon('buttons.back')}>
            <Link href="/banking/reconcile">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t('reconciliation.reconcileAccount', { name: account.name })}
            </h1>
            <p className="text-muted-foreground">{t('reconciliation.matchDescription')}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {t('reconciliation.unmatched', { count: transactions.length })}
        </Badge>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('reconciliation.bookBalance')}</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(account.systemBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('reconciliation.bankBalance')}</p>
            <p className="text-2xl font-bold font-mono">
              {formatCurrency(account.bankBalance || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('reconciliation.toReconcile')}</p>
            <p className="text-2xl font-bold">
              {t('reconciliation.transactionsCount', { count: transactions.length })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Split View */}
      {transactions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Check className="mx-auto h-12 w-12 text-green-600" />
            <h3 className="mt-4 text-lg font-semibold text-green-600">
              {t('reconciliation.allCaughtUp')}
            </h3>
            <p className="text-muted-foreground">{t('reconciliation.allMatched')}</p>
            <Button asChild className="mt-4">
              <Link href={`/banking/accounts/${accountId}`}>
                {t('reconciliation.viewAccountDetails')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Bank Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>{t('reconciliation.bankTransactions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      onClick={() => setSelectedTransaction(tx.id)}
                      className={cn(
                        'p-4 border rounded-lg cursor-pointer transition-colors',
                        selectedTransaction === tx.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/50',
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {tx.type === 'DEPOSIT' ? (
                              <ArrowDownRight className="h-4 w-4 text-green-600" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4 text-red-600" />
                            )}
                            <span className="font-medium">{tx.description}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {format(new Date(tx.date), 'PP', { locale: dateLocale })}
                            {tx.payee && ` • ${tx.payee}`}
                          </p>
                        </div>
                        <div className="text-end">
                          <p
                            className={cn(
                              'font-mono font-medium',
                              tx.type === 'DEPOSIT' ? 'text-green-600' : 'text-red-600',
                            )}
                          >
                            {tx.type === 'DEPOSIT' ? '+' : '-'}
                            {formatCurrency(Math.abs(parseFloat(tx.amount as string)))}
                          </p>
                          {tx.confidence !== null && (
                            <p className={cn('text-xs', getConfidenceColor(tx.confidence))}>
                              {t('reconciliation.confidenceWithLevel', {
                                level: getConfidenceLabel(tx.confidence, t),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right Panel - Suggested Matches */}
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedTransaction
                  ? t('reconciliation.suggestedMatches')
                  : t('reconciliation.selectTransaction')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedTransaction ? (
                <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Zap className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4">{t('reconciliation.selectTransactionHint')}</p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {/* Selected Transaction Summary */}
                    {selectedTx && (
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="font-medium">{selectedTx.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(selectedTx.date), 'PP', { locale: dateLocale })} •{' '}
                          <span
                            className={cn(
                              'font-mono',
                              selectedTx.type === 'DEPOSIT' ? 'text-green-600' : 'text-red-600',
                            )}
                          >
                            {selectedTx.type === 'DEPOSIT' ? '+' : '-'}
                            {formatCurrency(Math.abs(parseFloat(selectedTx.amount as string)))}
                          </span>
                        </p>
                      </div>
                    )}

                    {/* Suggested Matches */}
                    {suggestedLoading ? (
                      <Skeleton className="h-24" />
                    ) : suggestedFailed ? (
                      <div className="text-center py-8 space-y-4" role="alert">
                        <p className="text-sm text-muted-foreground">{tCommon('table.error')}</p>
                        <Button variant="outline" onClick={() => void refetchSuggested()}>
                          {tCommon('dashboard.tryAgain')}
                        </Button>
                      </div>
                    ) : suggestedMatches.length > 0 ? (
                      <div className="space-y-2">
                        {suggestedMatches.map((match) => (
                          <div
                            key={match.id}
                            className="p-4 border rounded-lg hover:border-primary transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {isRecordedPayment(match.type) ? (
                                    <Banknote className="h-4 w-4 text-green-600" />
                                  ) : match.type === 'INVOICE' ? (
                                    <FileText className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <Receipt className="h-4 w-4 text-orange-600" />
                                  )}
                                  <span className="font-medium">{match.number}</span>
                                  <Badge
                                    variant="outline"
                                    className={getConfidenceColor(match.confidence)}
                                  >
                                    {t('reconciliation.matchPercent', { value: match.confidence })}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {match.counterpartyName} •{' '}
                                  {format(new Date(match.date), 'PP', { locale: dateLocale })}
                                </p>
                                {isRecordedPayment(match.type) ? (
                                  <>
                                    <p className="text-sm font-mono mt-1">
                                      {t(
                                        match.type === 'EXPENSE'
                                          ? 'reconciliation.recordedExpense'
                                          : 'reconciliation.recordedPayment',
                                        { amount: formatCurrency(match.amount) },
                                      )}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {t('reconciliation.recordedPaymentHint')}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-sm font-mono mt-1">
                                    {t('reconciliation.balanceDue', {
                                      amount: formatCurrency(match.balanceDue),
                                    })}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                disabled={matchTransaction.isPending}
                                onClick={() => void handleMatch(selectedTransaction, match)}
                              >
                                <Check className="me-1 h-3 w-3" />
                                {t('reconciliation.match')}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>{t('reconciliation.noSuggestedMatches')}</p>
                      </div>
                    )}

                    {/* Actions: only money out can become an expense (#682). */}
                    {selectedTx?.type === 'WITHDRAWAL' && (
                      <div className="border-t pt-4 space-y-2">
                        <Button variant="outline" className="w-full" asChild>
                          <Link
                            href={`/purchases/expenses/new?bankTransactionId=${selectedTransaction}`}
                          >
                            <Plus className="me-2 h-4 w-4" />
                            {t('reconciliation.createExpense')}
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
