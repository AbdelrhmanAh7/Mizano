'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Landmark,
  CreditCard,
  Wallet,
  PiggyBank,
} from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useBankAccounts,
  useDeleteBankAccount,
  getAccountTypeLabel,
  getAccountTypeColor,
  formatCurrency,
  BankAccount,
  BankAccountType,
} from '@/lib/hooks/use-bank-accounts';

function BankAccountsPageContent() {
  const tableParams = useTableParams({ defaultSortBy: 'accountName' });
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useBankAccounts({
    ...tableParams.queryParams,
    type: typeFilter !== 'all' ? (typeFilter as BankAccountType) : undefined,
  });

  const deleteBankAccount = useDeleteBankAccount();

  const accounts: BankAccount[] = data?.data || [];
  const meta = data?.meta;

  const handleDelete = async () => {
    if (deleteId) {
      await deleteBankAccount.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  // Calculate totals
  const totalBalance = accounts.reduce((sum, acc) => {
    const balance =
      typeof acc.currentBalance === 'string' ? parseFloat(acc.currentBalance) : acc.currentBalance;
    return sum + (balance || 0);
  }, 0);

  const columns: ColumnDef<BankAccount>[] = [
    {
      accessorKey: 'accountName',
      header: () => (
        <SortableHeader
          label="Account Name"
          columnId="accountName"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      cell: ({ row }) => (
        <div>
          <Link
            href={`/banking/accounts/${row.original.id}`}
            className="font-medium hover:text-blue-600 hover:underline"
          >
            {row.original.accountName}
          </Link>
          {row.original.bankName && (
            <p className="text-sm text-muted-foreground">{row.original.bankName}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'accountType',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline" className={getAccountTypeColor(row.original.accountType)}>
          {getAccountTypeLabel(row.original.accountType)}
        </Badge>
      ),
    },
    {
      accessorKey: 'accountNumber',
      header: 'Account #',
      meta: { cellClassName: 'font-mono text-sm text-muted-foreground' },
      cell: ({ row }) =>
        row.original.accountNumber ? `.... ${row.original.accountNumber.slice(-4)}` : '-',
    },
    {
      accessorKey: 'currentBalance',
      header: () => (
        <SortableHeader
          label="Balance"
          columnId="currentBalance"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => {
        const balance =
          typeof row.original.currentBalance === 'string'
            ? parseFloat(row.original.currentBalance)
            : row.original.currentBalance;
        return (
          <span
            className={cn('font-bold font-mono', balance < 0 ? 'text-red-600' : 'text-green-600')}
          >
            {formatCurrency(balance)}
          </span>
        );
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { cellClassName: 'w-12' },
      cell: ({ row }) => {
        const account = row.original;
        return (
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
              <DropdownMenuItem className="text-red-600" onClick={() => setDeleteId(account.id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bank Accounts</h1>
          <p className="text-muted-foreground">Manage your bank accounts and track balances</p>
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
              <p className="text-2xl font-bold">{accounts.filter((a) => a.isActive).length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder="Search accounts..."
        />
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

      {/* Table */}
      <DataTable
        columns={columns}
        data={accounts}
        page={meta?.page || 1}
        totalPages={meta?.totalPages || 1}
        total={meta?.total || 0}
        limit={tableParams.limit}
        onPageChange={tableParams.setPage}
        onLimitChange={tableParams.setLimit}
        isLoading={isLoading}
        emptyMessage="No bank accounts"
        emptyAction={
          <Button asChild>
            <Link href="/banking/accounts/new">Add Bank Account</Link>
          </Button>
        }
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bank Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this bank account? This action cannot be undone. All
              associated transactions will also be deleted.
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
  );
}

export default function BankAccountsPage() {
  return (
    <Suspense>
      <BankAccountsPageContent />
    </Suspense>
  );
}
