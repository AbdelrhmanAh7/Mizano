'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BankAccount, accountTypeOptions } from '@/lib/hooks/use-bank-accounts';

const bankAccountSchema = z.object({
  // Messages are keys of banking.accounts.form.
  name: z.string().min(1, 'nameRequired').max(100, 'nameMax'),
  accountNumber: z.string().optional(),
  type: z.enum(['BANK', 'CREDIT_CARD', 'PETTY_CASH']),
  currency: z.string().default('USD'),
  openingBalance: z.number().optional(),
  linkedAccountId: z.string().min(1, 'linkedAccountRequired'),
  isActive: z.boolean().default(true),
});

type BankAccountFormData = z.infer<typeof bankAccountSchema>;

/** Currencies offered for a bank account; names come from Intl in the page language. */
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'EGP'];

interface BankAccountFormProps {
  account?: BankAccount | null;
  glAccounts: Array<{ id: string; name: string; code: string }>;
  onSubmit: (data: BankAccountFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function BankAccountForm({
  account,
  glAccounts,
  onSubmit,
  onCancel,
  isSubmitting,
}: BankAccountFormProps) {
  const isEditing = !!account;
  const t = useTranslations('banking');
  const tForm = useTranslations('banking.accounts.form');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const currencyNames = new Intl.DisplayNames([locale], { type: 'currency' });
  const errorText = (message?: string): string | undefined =>
    message && tForm.has(message) ? tForm(message) : message;

  const form = useForm<BankAccountFormData>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: {
      name: '',
      accountNumber: '',
      type: 'BANK',
      currency: 'USD',
      openingBalance: 0,
      linkedAccountId: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (account) {
      form.reset({
        name: account.name || '',
        accountNumber: account.accountNumber || '',
        type: account.type || 'BANK',
        currency: account.currency || 'USD',
        linkedAccountId: account.linkedAccountId || '',
        isActive: account.isActive ?? true,
      });
    }
  }, [account, form]);

  const handleSubmit = (data: BankAccountFormData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>{tForm('sectionInformation')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{tForm('name')} *</Label>
              <Input id="name" placeholder={tForm('nameExample')} {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.name.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{tForm('type')} *</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(value: BankAccountFormData['type']) => form.setValue('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tForm('typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {accountTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountNumber">{tForm('accountNumber')}</Label>
              <Input
                id="accountNumber"
                dir="ltr"
                placeholder={tForm('accountNumberHint')}
                {...form.register('accountNumber')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{tForm('currency')}</Label>
              <Select
                value={form.watch('currency')}
                onValueChange={(value) => form.setValue('currency', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tForm('currencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code} - {currencyNames.of(code) ?? code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="openingBalance">{tForm('openingBalance')}</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...form.register('openingBalance', { valueAsNumber: true })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accounting */}
      <Card>
        <CardHeader>
          <CardTitle>{tForm('sectionAccounting')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="linkedAccountId">{tForm('glAccount')} *</Label>
            <Select
              value={form.watch('linkedAccountId') || '__none__'}
              onValueChange={(value) =>
                form.setValue('linkedAccountId', value === '__none__' ? '' : value, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={tForm('glAccountPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>
                  {tForm('glAccountSelect')}
                </SelectItem>
                {glAccounts.map((glAccount) => (
                  <SelectItem key={glAccount.id} value={glAccount.id}>
                    {glAccount.code} - {glAccount.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.linkedAccountId && (
              <p className="text-sm text-red-500">
                {errorText(form.formState.errors.linkedAccountId.message)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{tForm('glAccountHint')}</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>{tForm('isActive')}</Label>
              <p className="text-sm text-muted-foreground">{tForm('isActiveHint')}</p>
            </div>
            <Switch
              checked={form.watch('isActive')}
              onCheckedChange={(checked) => form.setValue('isActive', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {tCommon('buttons.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? tCommon('loading.saving') : isEditing ? tForm('update') : tForm('create')}
        </Button>
      </div>
    </form>
  );
}
