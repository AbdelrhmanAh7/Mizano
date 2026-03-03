'use client';

import { Suspense, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { DataTableSearch } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { AccountTree } from '@/components/accounting/account-tree';
import dynamic from 'next/dynamic';

const AccountFormDialog = dynamic(
  () => import('@/components/accounting/account-form-dialog').then((m) => m.AccountFormDialog),
  { ssr: false },
);
import {
  useAccountsTree,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useSeedAccounts,
  Account,
  AccountType,
} from '@/lib/hooks/use-accounts';
import { usePermissions } from '@/lib/hooks/use-permissions';

function AccountsPageContent() {
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'code' });

  const [selectedType, setSelectedType] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [parentAccount, setParentAccount] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const { data: accounts = [], isLoading, refetch } = useAccountsTree();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const seedAccounts = useSeedAccounts();

  const canCreate = hasPermission('accounting.create');
  const canEdit = hasPermission('accounting.edit');
  const canDelete = hasPermission('accounting.delete');

  // Filter accounts based on search and type
  const filterAccounts = (accounts: Account[]): Account[] => {
    return accounts
      .filter((account) => {
        const matchesSearch =
          !tableParams.search ||
          account.name.toLowerCase().includes(tableParams.search.toLowerCase()) ||
          account.code.toLowerCase().includes(tableParams.search.toLowerCase());
        const matchesType = selectedType === 'all' || account.type === selectedType;
        return matchesSearch && matchesType;
      })
      .map((account) => ({
        ...account,
        children: account.children ? filterAccounts(account.children) : [],
      }));
  };

  const filteredAccounts = filterAccounts(accounts);

  const handleCreate = () => {
    setSelectedAccount(null);
    setParentAccount(null);
    setDialogOpen(true);
  };

  const handleEdit = (account: Account) => {
    setSelectedAccount(account);
    setParentAccount(null);
    setDialogOpen(true);
  };

  const handleAddChild = (parent: Account) => {
    setSelectedAccount(null);
    setParentAccount(parent);
    setDialogOpen(true);
  };

  const handleDelete = (account: Account) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async (data: {
    code: string;
    name: string;
    type: string;
    parentId?: string;
    currency?: string;
    description?: string;
  }) => {
    if (selectedAccount) {
      await updateAccount.mutateAsync({
        id: selectedAccount.id,
        data,
      });
    } else {
      await createAccount.mutateAsync(data as typeof data & { type: AccountType });
    }
    setDialogOpen(false);
  };

  const confirmDelete = async () => {
    if (accountToDelete) {
      await deleteAccount.mutateAsync(accountToDelete.id);
      setDeleteDialogOpen(false);
      setAccountToDelete(null);
    }
  };

  const handleSeedAccounts = async (industry?: string) => {
    await seedAccounts.mutateAsync(industry);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-muted-foreground">Manage your organization&apos;s account structure</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && accounts.length === 0 && (
            <Select onValueChange={(value) => handleSeedAccounts(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Seed Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="services">Services Industry</SelectItem>
                <SelectItem value="retail">Retail Industry</SelectItem>
                <SelectItem value="construction">Construction Industry</SelectItem>
              </SelectContent>
            </Select>
          )}
          {canCreate && (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <DataTableSearch
              value={tableParams.search}
              onChange={tableParams.setSearch}
              placeholder="Search accounts..."
            />
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ASSET">Assets</SelectItem>
                <SelectItem value="LIABILITY">Liabilities</SelectItem>
                <SelectItem value="EQUITY">Equity</SelectItem>
                <SelectItem value="INCOME">Income</SelectItem>
                <SelectItem value="REVENUE">Revenue</SelectItem>
                <SelectItem value="EXPENSE">Expenses</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label="Refresh accounts"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Tree */}
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountTree
            accounts={filteredAccounts}
            onEdit={canEdit ? handleEdit : undefined}
            onDelete={canDelete ? handleDelete : undefined}
            onAddChild={canCreate ? handleAddChild : undefined}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={selectedAccount}
        parentAccount={parentAccount}
        accounts={accounts}
        onSubmit={handleSubmit}
        isSubmitting={createAccount.isPending || updateAccount.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{accountToDelete?.name}&quot;? This action
              cannot be undone. Accounts with transactions or child accounts cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense>
      <AccountsPageContent />
    </Suspense>
  );
}
