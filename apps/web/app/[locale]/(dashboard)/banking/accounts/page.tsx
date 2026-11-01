'use client';

import { RowActionsMenu } from '@/components/shared/row-actions-menu';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
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
import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DataTable, DataTableSearch, SortableHeader } from '@/components/data-table';
import { useTableParams } from '@/lib/hooks/use-table-params';
import {
  useBankAccounts,
  useDeleteBankAccount,
  getAccountTypeLabel,
  getAccountTypeColor,
  accountTypeOptions,
  BankAccount,
  BankAccountType,
} from '@/lib/hooks/use-bank-accounts';
import { useTranslations } from 'next-intl';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { sumDecimals } from '@/lib/decimal';

function BankAccountsPageContent() {
  const t = useTranslations('banking');
  const tCommon = useTranslations('common');
  const formatCurrency = useMoneyFormatter();
  const tableParams = useTableParams({ defaultSortBy: 'name' });
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useBankAccounts({
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

  // Ledger balances (base currency), summed exactly. A bank account's balance is its ledger
  // account's, so bank accounts that share one ledger account count it once (#663).
  const totalBalance = sumDecimals(
    Array.from(
      new Map(
        accounts.map((acc) => [acc.linkedAccountId || acc.id, String(acc.systemBalance ?? 0)]),
      ).values(),
    ),
  );

  const columns: ColumnDef<BankAccount>[] = [
    {
      accessorKey: 'name',
      header: () => (
        <SortableHeader
          label={t('accounts.table.name')}
          columnId="name"
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
            {row.original.name}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('accounts.table.type'),
      cell: ({ row }) => (
        <Badge variant="outline" className={getAccountTypeColor(row.original.type)}>
          {getAccountTypeLabel(row.original.type, t)}
        </Badge>
      ),
    },
    {
      accessorKey: 'accountNumber',
      header: t('accounts.table.accountNumber'),
      meta: { cellClassName: 'font-mono text-sm text-muted-foreground' },
      cell: ({ row }) =>
        row.original.accountNumber ? (
          <bdi>{`.... ${row.original.accountNumber.slice(-4)}`}</bdi>
        ) : (
          '-'
        ),
    },
    {
      accessorKey: 'systemBalance',
      header: () => (
        <SortableHeader
          label={t('accounts.table.balance')}
          columnId="systemBalance"
          currentSortBy={tableParams.sortBy}
          currentSortOrder={tableParams.sortOrder}
          onSort={tableParams.setSort}
        />
      ),
      meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
      cell: ({ row }) => {
        const balance =
          typeof row.original.systemBalance === 'string'
            ? parseFloat(row.original.systemBalance)
            : row.original.systemBalance;
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
      header: t('accounts.table.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? tCommon('status.active') : tCommon('status.inactive')}
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
          <RowActionsMenu
            viewHref={`/banking/accounts/${account.id}`}
            editHref={`/banking/accounts/${account.id}/edit`}
            onDelete={() => setDeleteId(account.id)}
            labels={{
              view: tCommon('buttons.view'),
              edit: tCommon('buttons.edit'),
              delete: tCommon('buttons.delete'),
            }}
          />
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('accounts.title')}</h1>
          <p className="text-muted-foreground">{t('accounts.pageDescription')}</p>
        </div>
        <Button asChild>
          <Link href="/banking/accounts/new">
            <Plus className="me-2 h-4 w-4" />
            {t('accounts.newAccount')}
          </Link>
        </Button>
      </div>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('accounts.totalBalance')}</p>
              <p className="text-3xl font-bold font-mono">
                {isError ? '—' : formatCurrency(totalBalance)}
              </p>
            </div>
            <div className="text-end">
              <p className="text-sm text-muted-foreground">{t('accounts.activeAccounts')}</p>
              <p className="text-2xl font-bold">
                {isError ? '—' : accounts.filter((a) => a.isActive).length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <DataTableSearch
          value={tableParams.search}
          onChange={tableParams.setSearch}
          placeholder={t('accounts.searchPlaceholder')}
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('accounts.table.type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('accounts.allTypes')}</SelectItem>
            {accountTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isError ? (
        <div className="py-8 text-center space-y-4" role="alert">
          <p className="text-sm text-muted-foreground">{tCommon('table.error')}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {tCommon('dashboard.tryAgain')}
          </Button>
        </div>
      ) : (
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
          emptyMessage={t('accounts.empty.title')}
          emptyAction={
            <Button asChild>
              <Link href="/banking/accounts/new">{t('accounts.newAccount')}</Link>
            </Button>
          }
        />
      )}

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t('accounts.deleteAccount')}
        description={t('accounts.deleteConfirm')}
        onConfirm={handleDelete}
        cancelLabel={tCommon('buttons.cancel')}
        deleteLabel={tCommon('buttons.delete')}
      />
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
