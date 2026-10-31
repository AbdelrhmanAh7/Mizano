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
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { DataTableSearch } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import { AccountTree } from '@/components/accounting/account-tree';
import dynamic from 'next/dynamic';

const AccountFormDialog = dynamic(
  () =>
    import('@/components/accounting/account-form-dialog').then((m) => ({
      default: m.AccountFormDialog,
    })),
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
import { useTranslations } from 'next-intl';

function AccountsPageContent() {
  const t = useTranslations('accounting');
  const { hasPermission } = usePermissions();
  const tableParams = useTableParams({ defaultSortBy: 'code' });

  const [selectedType, setSelectedType] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [parentAccount, setParentAccount] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const { data: accounts = [], isLoading, isError, refetch } = useAccountsTree();
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('accounts.title')}</h1>
          <p className="text-muted-foreground">{t('accounts.page.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && !isLoading && !isError && accounts.length === 0 && (
            <Select onValueChange={(value) => handleSeedAccounts(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('accounts.page.seed')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="services">{t('accounts.page.seedServices')}</SelectItem>
                <SelectItem value="retail">{t('accounts.page.seedRetail')}</SelectItem>
                <SelectItem value="construction">{t('accounts.page.seedConstruction')}</SelectItem>
              </SelectContent>
            </Select>
          )}
          {canCreate && (
            <Button onClick={handleCreate}>
              <Plus className="me-2 h-4 w-4" />
              {t('accounts.newAccount')}
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
              placeholder={t('accounts.page.searchPlaceholder')}
            />
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('accounts.page.filterByType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('accounts.page.allTypes')}</SelectItem>
                <SelectItem value="ASSET">{t('accounts.page.assets')}</SelectItem>
                <SelectItem value="LIABILITY">{t('accounts.page.liabilities')}</SelectItem>
                <SelectItem value="EQUITY">{t('accounts.page.equity')}</SelectItem>
                <SelectItem value="INCOME">{t('accounts.page.income')}</SelectItem>
                <SelectItem value="REVENUE">{t('accounts.page.revenue')}</SelectItem>
                <SelectItem value="EXPENSE">{t('accounts.page.expenses')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              aria-label={t('accounts.page.refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Tree */}
      <Card>
        <CardHeader>
          <CardTitle>{t('accounts.page.listTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="py-12 text-center text-muted-foreground" role="alert">
              <p>{t('accounts.tree.loadError')}</p>
              <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
                {t('accounts.tree.retry')}
              </Button>
            </div>
          ) : (
            <AccountTree
              accounts={filteredAccounts}
              onEdit={canEdit ? handleEdit : undefined}
              onDelete={canDelete ? handleDelete : undefined}
              onAddChild={canCreate ? handleAddChild : undefined}
              isLoading={isLoading}
            />
          )}
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

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('accounts.deleteAccount')}
        description={t('accounts.page.deleteConfirm', { name: accountToDelete?.name ?? '' })}
        onConfirm={confirmDelete}
        cancelLabel={t('accounts.page.cancel')}
        deleteLabel={t('accounts.page.delete')}
      />
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
