'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, Landmark, CreditCard, Wallet, PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useBankAccounts,
  useDeleteBankAccount,
  getAccountTypeLabel,
  getAccountTypeColor,
  formatCurrency,
  BankAccount,
  BankAccountType,
} from '@/lib/hooks/use-bank-accounts';

const accountIcons: Record<BankAccountType, React.ComponentType<{ className?: string }>> = {
  CHECKING: Landmark,
  SAVINGS: PiggyBank,
  CREDIT_CARD: CreditCard,
  CASH: Wallet,
  OTHER: Landmark,
};

export default function BankAccountsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useBankAccounts({
    search,
    type: typeFilter !== 'all' ? (typeFilter as BankAccountType) : undefined,
  });

  const deleteBankAccount = useDeleteBankAccount();

  const accounts: BankAccount[] = data?.data || [];

  const handleDelete = async () => {
    if (deleteId) {
      await deleteBankAccount.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  // Calculate totals
  const totalBalance = accounts.reduce((sum, acc) => {
    const balance = typeof acc.currentBalance === 'string'
      ? parseFloat(acc.currentBalance)
      : acc.currentBalance;
    return sum + (balance || 0);
  }, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bank Accounts</h1>
          <p className="text-muted-foreground">
            Manage your bank accounts and track balances
          </p>
        </div>
        <Button asChild>
          <Link href="/banking/accounts/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Link>
        </Button>
      </div>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Balance</p>
              <p className="text-3xl font-bold font-mono">{formatCurrency(totalBalance)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Active Accounts</p>
              <p className="text-2xl font-bold">{accounts.filter(a => a.isActive).length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="CHECKING">Checking</SelectItem>
            <SelectItem value="SAVINGS">Savings</SelectItem>
            <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Accounts Grid */}
      {accounts.length === 0 ? (
        <div className="text-center py-12">
          <Landmark className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No bank accounts</h3>
          <p className="text-muted-foreground">
            Add your first bank account to start tracking your finances.
          </p>
          <Button asChild className="mt-4">
            <Link href="/banking/accounts/new">Add Bank Account</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const Icon = accountIcons[account.accountType] || Landmark;
            const balance = typeof account.currentBalance === 'string'
              ? parseFloat(account.currentBalance)
              : account.currentBalance;

            return (
              <Card key={account.id} className={cn(!account.isActive && 'opacity-60')}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg', getAccountTypeColor(account.accountType))}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          <Link
                            href={`/banking/accounts/${account.id}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {account.accountName}
                          </Link>
                        </CardTitle>
                        {account.bankName && (
                          <p className="text-sm text-muted-foreground">
                            {account.bankName}
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/banking/accounts/${account.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/banking/accounts/${account.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteId(account.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={getAccountTypeColor(account.accountType)}>
                        {getAccountTypeLabel(account.accountType)}
                      </Badge>
                      {!account.isActive && (
                        <Badge variant="outline" className="text-gray-500">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Current Balance</p>
                      <p className={cn(
                        'text-2xl font-bold font-mono',
                        balance < 0 ? 'text-red-600' : 'text-green-600'
                      )}>
                        {formatCurrency(balance)}
                      </p>
                    </div>
                    {account.accountNumber && (
                      <p className="text-sm text-muted-foreground font-mono">
                        •••• {account.accountNumber.slice(-4)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this bank account? This action cannot be
              undone. All associated transactions will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
