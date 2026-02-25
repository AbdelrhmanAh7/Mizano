'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Upload,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Landmark,
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
  useDeleteBankAccount,
  getAccountTypeLabel,
  getAccountTypeColor,
  formatCurrency,
} from '@/lib/hooks/use-bank-accounts';
import { getStatusLabel, getStatusColor } from '@/lib/hooks/use-bank-transactions';

interface BankAccountDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function BankAccountDetailPage({ params }: BankAccountDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: account, isLoading } = useBankAccount(id);
  const { data: transactionsData } = useBankAccountTransactions(id);
  const deleteBankAccount = useDeleteBankAccount();

  const transactions = transactionsData?.data || [];

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

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Bank account not found</p>
        <Button asChild className="mt-4">
          <Link href="/banking/accounts">Back to Accounts</Link>
        </Button>
      </div>
    );
  }

  const currentBalance =
    typeof account.currentBalance === 'string'
      ? parseFloat(account.currentBalance)
      : account.currentBalance;

  const bankBalance =
    typeof account.bankBalance === 'string' ? parseFloat(account.bankBalance) : account.bankBalance;

  const difference = (bankBalance || 0) - (currentBalance || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/banking/accounts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{account.accountName}</h1>
              <Badge variant="outline" className={getAccountTypeColor(account.accountType)}>
                {getAccountTypeLabel(account.accountType)}
              </Badge>
              {!account.isActive && (
                <Badge variant="outline" className="text-gray-500">
                  Inactive
                </Badge>
              )}
            </div>
            {account.bankName && <p className="text-muted-foreground">{account.bankName}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/banking/reconcile/${id}`}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reconcile
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/banking/accounts/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Bank Account</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this bank account? This action cannot be undone.
                  All associated transactions will also be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  Delete
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
              <div className="p-2 bg-blue-100 rounded-lg">
                <Landmark className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p
                  className={cn(
                    'text-2xl font-bold font-mono',
                    currentBalance < 0 ? 'text-red-600' : 'text-green-600',
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
            <p className="text-sm text-muted-foreground">Bank Balance</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(bankBalance || 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Difference</p>
            <p
              className={cn(
                'text-2xl font-bold font-mono',
                Math.abs(difference) > 0.01 ? 'text-yellow-600' : 'text-green-600',
              )}
            >
              {formatCurrency(difference)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Last Reconciled</p>
            <p className="text-lg font-semibold">
              {account.lastReconciled
                ? format(new Date(account.lastReconciled), 'MMM d, yyyy')
                : 'Never'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Account Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Account Number</span>
              <span className="font-mono">{account.accountNumber || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bank Name</span>
              <span>{account.bankName || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Currency</span>
              <span>{account.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={account.isActive ? 'default' : 'secondary'}>
                {account.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {account.glAccount && (
          <Card>
            <CardHeader>
              <CardTitle>Linked GL Account</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono">
                {account.glAccount.code} - {account.glAccount.name}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Import Transactions
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet. Import transactions to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.slice(0, 10).map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell>{format(new Date(tx.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tx.description}</p>
                        {tx.payee && <p className="text-sm text-muted-foreground">{tx.payee}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(tx.status)}>
                        {getStatusLabel(tx.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {tx.type === 'DEPOSIT' ? (
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-red-600" />
                        )}
                        <span
                          className={cn(
                            'font-mono font-medium',
                            tx.type === 'DEPOSIT' ? 'text-green-600' : 'text-red-600',
                          )}
                        >
                          {tx.type === 'DEPOSIT' ? '+' : '-'}
                          {formatCurrency(Math.abs(parseFloat(tx.amount)))}
                        </span>
                      </div>
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
