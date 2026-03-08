'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Save, DollarSign, CreditCard, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccountsTree, flattenAccountsTree } from '@/lib/hooks/use-accounts';
import {
  useAccountSettings,
  useUpdateAccountSettings,
} from '@/lib/hooks/use-organization-settings';

interface AccountSettingsFormData {
  defaultArAccountId: string;
  defaultRevenueAccountId: string;
  defaultVatPayableAccountId: string;
  defaultApAccountId: string;
  defaultVatReceivableAccountId: string;
  defaultBankAccountId: string;
  defaultCashAccountId: string;
  defaultSalesReturnsAccountId: string;
}

export default function AccountSettingsPage() {
  const t = useTranslations('settings');
  const { data: settings, isLoading: settingsLoading } = useAccountSettings();
  const { data: accountsTree, isLoading: accountsLoading } = useAccountsTree();
  const updateSettings = useUpdateAccountSettings();

  const form = useForm<AccountSettingsFormData>({
    defaultValues: {
      defaultArAccountId: '',
      defaultRevenueAccountId: '',
      defaultVatPayableAccountId: '',
      defaultApAccountId: '',
      defaultVatReceivableAccountId: '',
      defaultBankAccountId: '',
      defaultCashAccountId: '',
      defaultSalesReturnsAccountId: '',
    },
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      form.reset({
        defaultArAccountId: settings.defaultArAccountId || '',
        defaultRevenueAccountId: settings.defaultRevenueAccountId || '',
        defaultVatPayableAccountId: settings.defaultVatPayableAccountId || '',
        defaultApAccountId: settings.defaultApAccountId || '',
        defaultVatReceivableAccountId: settings.defaultVatReceivableAccountId || '',
        defaultBankAccountId: settings.defaultBankAccountId || '',
        defaultCashAccountId: settings.defaultCashAccountId || '',
        defaultSalesReturnsAccountId: settings.defaultSalesReturnsAccountId || '',
      });
    }
  }, [settings, form]);

  const flattenedAccounts = accountsTree ? flattenAccountsTree(accountsTree) : [];

  // Filter accounts by type
  const assetAccounts = flattenedAccounts.filter((a) => a.type === 'ASSET' && a.isActive);
  const liabilityAccounts = flattenedAccounts.filter((a) => a.type === 'LIABILITY' && a.isActive);
  const revenueAccounts = flattenedAccounts.filter(
    (a) => (a.type === 'REVENUE' || a.type === 'INCOME') && a.isActive,
  );
  const expenseAccounts = flattenedAccounts.filter((a) => a.type === 'EXPENSE' && a.isActive);

  const handleSubmit = async (data: AccountSettingsFormData) => {
    // Convert empty strings to null
    const cleanedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value || null]),
    );
    await updateSettings.mutateAsync(cleanedData);
  };

  const isLoading = settingsLoading || accountsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('accountSettings.title')}</h1>
        <p className="text-muted-foreground">{t('accountSettings.description')}</p>
      </div>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Sales Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {t('accountSettings.salesAccounts')}
            </CardTitle>
            <CardDescription>{t('accountSettings.salesAccountsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultArAccountId">
                  {t('accountSettings.accountsReceivable')}
                </Label>
                <Select
                  value={form.watch('defaultArAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultArAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {assetAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.accountsReceivableHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultRevenueAccountId">{t('accountSettings.salesRevenue')}</Label>
                <Select
                  value={form.watch('defaultRevenueAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultRevenueAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {revenueAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.salesRevenueHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultVatPayableAccountId">
                  {t('accountSettings.vatPayable')}
                </Label>
                <Select
                  value={form.watch('defaultVatPayableAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultVatPayableAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {liabilityAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.vatPayableHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultSalesReturnsAccountId">
                  {t('accountSettings.salesReturns')}
                </Label>
                <Select
                  value={form.watch('defaultSalesReturnsAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultSalesReturnsAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {[...revenueAccounts, ...expenseAccounts].map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.salesReturnsHint')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchases Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('accountSettings.purchasesAccounts')}
            </CardTitle>
            <CardDescription>{t('accountSettings.purchasesAccountsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultApAccountId">{t('accountSettings.accountsPayable')}</Label>
                <Select
                  value={form.watch('defaultApAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultApAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {liabilityAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.accountsPayableHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultVatReceivableAccountId">
                  {t('accountSettings.vatReceivable')}
                </Label>
                <Select
                  value={form.watch('defaultVatReceivableAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultVatReceivableAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {assetAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.vatReceivableHint')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bank & Cash Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              {t('accountSettings.bankCashAccounts')}
            </CardTitle>
            <CardDescription>{t('accountSettings.bankCashAccountsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultBankAccountId">
                  {t('accountSettings.defaultBankAccount')}
                </Label>
                <Select
                  value={form.watch('defaultBankAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultBankAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {assetAccounts
                      .filter(
                        (a) => a.name.toLowerCase().includes('bank') || a.code.startsWith('1001'),
                      )
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.defaultBankAccountHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultCashAccountId">
                  {t('accountSettings.defaultCashAccount')}
                </Label>
                <Select
                  value={form.watch('defaultCashAccountId') || ''}
                  onValueChange={(value) => form.setValue('defaultCashAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('accountSettings.selectAccount')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('accountSettings.notSet')}</SelectItem>
                    {assetAccounts
                      .filter(
                        (a) => a.name.toLowerCase().includes('cash') || a.code.startsWith('1000'),
                      )
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('accountSettings.defaultCashAccountHint')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end">
          <Button type="submit" disabled={updateSettings.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {updateSettings.isPending ? t('common.saving') : t('accountSettings.saveSettings')}
          </Button>
        </div>
      </form>
    </div>
  );
}
