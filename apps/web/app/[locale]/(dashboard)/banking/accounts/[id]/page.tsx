'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Landmark,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBankAccount,
  useBankAccountTransactions,
  useBankAccountBalanceHistory,
  useDeleteBankAccount,
  getAccountTypeLabel,
  getAccountTypeColor,
} from '@/lib/hooks/use-bank-accounts';
import {
  getStatusLabel,
  getStatusColor,
  type TransactionStatus,
} from '@/lib/hooks/use-bank-transactions';
import { useLocale, useTranslations } from 'next-intl';
import { localeDirections, type Locale } from '@/i18n/config';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useDateFnsLocale } from '@/lib/date-locale';

interface BankAccountDetailPageProps {
  params: { id: string };
}

export default function BankAccountDetailPage({ params }: BankAccountDetailPageProps) {
  const dateLocale = useDateFnsLocale();
  const t = useTranslations('banking');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const isRtl = localeDirections[locale as Locale] === 'rtl';
  const compactNumber = new Intl.NumberFormat(locale, { notation: 'compact' });
  const formatCurrency = useMoneyFormatter();
  const { id } = params;
  const router = useRouter();
  const {
    data: account,
    isLoading,
    isError: accountFailed,
    refetch: refetchAccount,
  } = useBankAccount(id);
  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    isError: transactionsFailed,
    refetch: refetchTransactions,
  } = useBankAccountTransactions(id);
  const { data: historyData } = useBankAccountBalanceHistory(id);
  const deleteBankAccount = useDeleteBankAccount();

  const transactions = transactionsData?.data || [];
  const balanceHistory: { date: string; runningBalance: number }[] = historyData?.history || [];

  const handleDelete = async () => {
    await deleteBankAccount.mutateAsync(id);
    router.push('/banking/accounts');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (accountFailed) {
    return (
      <div className="text-center py-12 space-y-4" role="alert">
        <p className="text-muted-foreground">{tCommon('errors.generic')}</p>
        <Button variant="outline" onClick={() => void refetchAccount()}>
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
          <Link href="/banking/accounts">{t('accounts.backToAccounts')}</Link>
        </Button>
      </div>
    );
  }

  const currentBalance =
    typeof account.systemBalance === 'string'
      ? parseFloat(account.systemBalance)
      : (account.systemBalance as number) || 0;

  const bankBalance =
    typeof account.bankBalance === 'string'
      ? parseFloat(account.bankBalance)
      : (account.bankBalance as number) || 0;

  const difference = bankBalance - currentBalance;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label={tCommon('buttons.back')}>
            <Link href="/banking/accounts">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{account.name}</h1>
              <Badge variant="outline" className={getAccountTypeColor(account.type)}>
                {getAccountTypeLabel(account.type, t)}
              </Badge>
              {!account.isActive && (
                <Badge variant="outline" className="text-muted-foreground">
                  {tCommon('status.inactive')}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/banking/reconcile/${id}`}>
              <RefreshCw className="me-2 h-4 w-4" />
              {t('reconciliation.reconcile')}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/banking/accounts/${id}/edit`}>
              <Pencil className="me-2 h-4 w-4" />
              {t('accounts.editAccount')}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive">
                <Trash2 className="me-2 h-4 w-4" />
                {t('accounts.deleteAccount')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('accounts.deleteAccount')}</AlertDialogTitle>
                <AlertDialogDescription>{t('accounts.deleteConfirmShort')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon('buttons.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {tCommon('buttons.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info/10 rounded-lg">
                <Landmark className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('accounts.systemBalance')}</p>
                <p
                  className={cn(
                    'text-2xl font-bold font-mono',
                    currentBalance < 0 ? 'text-destructive' : 'text-success',
                  )}
                >
                  {formatCurrency(currentBalance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('reconciliation.bankBalance')}</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(bankBalance)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {t('reconciliation.summary.difference')}
            </p>
            <p
              className={cn(
                'text-2xl font-bold font-mono',
                Math.abs(difference) > 0.01 ? 'text-warning' : 'text-success',
              )}
            >
              {formatCurrency(difference)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('accounts.lastReconciled')}</p>
            <p className="text-lg font-semibold">
              {account.lastReconciled
                ? format(new Date(account.lastReconciled), 'PP', { locale: dateLocale })
                : t('accounts.neverReconciled')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 30-day Balance Chart */}
      {balanceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('accounts.balanceHistory')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={balanceHistory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) =>
                    format(new Date(v), 'MMM d', { locale: dateLocale })
                  }
                  tick={{ fontSize: 11 }}
                  reversed={isRtl}
                />
                <YAxis
                  tickFormatter={(v: number) => compactNumber.format(v)}
                  tick={{ fontSize: 11 }}
                  orientation={isRtl ? 'right' : 'left'}
                />
                <Tooltip
                  formatter={(value: number) => [
                    formatCurrency(value),
                    t('accounts.table.balance'),
                  ]}
                  labelFormatter={(label: string) =>
                    format(new Date(label), 'PP', { locale: dateLocale })
                  }
                />
                <Line
                  type="monotone"
                  dataKey="runningBalance"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Account Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('accounts.accountDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('accounts.form.accountNumber')}</span>
              <span className="font-mono" dir="ltr">
                {account.accountNumber || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('accounts.form.currency')}</span>
              <span>{account.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('accounts.table.status')}</span>
              <Badge variant={account.isActive ? 'default' : 'secondary'}>
                {account.isActive ? tCommon('status.active') : tCommon('status.inactive')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {account.linkedAccount && (
          <Card>
            <CardHeader>
              <CardTitle>{t('accounts.form.linkedAccount')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono">
                {account.linkedAccount.code} - {account.linkedAccount.name}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('accounts.recentTransactions')}</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/banking/transactions`}>{t('accounts.viewAll')}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <Skeleton className="h-32" />
          ) : transactionsFailed ? (
            <div className="py-8 text-center space-y-4" role="alert">
              <p className="text-sm text-muted-foreground">{tCommon('table.error')}</p>
              <Button variant="outline" onClick={() => void refetchTransactions()}>
                {tCommon('dashboard.tryAgain')}
              </Button>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('accounts.noTransactions')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('transactions.table.date')}</TableHead>
                  <TableHead>{t('transactions.table.description')}</TableHead>
                  <TableHead>{t('transactions.table.status')}</TableHead>
                  <TableHead className="text-end">{t('transactions.table.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions
                  .slice(0, 10)
                  .map(
                    (tx: {
                      id: string;
                      date: string;
                      description: string;
                      payee?: string;
                      status: string;
                      type: string;
                      amount: string | number;
                    }) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          {format(new Date(tx.date), 'PP', { locale: dateLocale })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{tx.description}</p>
                            {tx.payee && (
                              <p className="text-sm text-muted-foreground">{tx.payee}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={getStatusColor(tx.status as TransactionStatus)}
                          >
                            {getStatusLabel(tx.status as TransactionStatus, t)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            {tx.type === 'DEPOSIT' ? (
                              <ArrowDownRight className="h-4 w-4 text-success" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4 text-destructive" />
                            )}
                            <span
                              className={cn(
                                'font-mono font-medium',
                                tx.type === 'DEPOSIT' ? 'text-success' : 'text-destructive',
                              )}
                            >
                              {tx.type === 'DEPOSIT' ? '+' : '-'}
                              {formatCurrency(Math.abs(parseFloat(String(tx.amount))))}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
