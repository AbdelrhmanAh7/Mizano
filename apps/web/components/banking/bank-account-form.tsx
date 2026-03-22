'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  name: z.string().min(1, 'Account name is required').max(100),
  accountNumber: z.string().optional(),
  type: z.enum(['BANK', 'CREDIT_CARD', 'PETTY_CASH']),
  currency: z.string().default('USD'),
  openingBalance: z.number().optional(),
  linkedAccountId: z.string().min(1, 'GL Account is required'),
  isActive: z.boolean().default(true),
});

type BankAccountFormData = z.infer<typeof bankAccountSchema>;

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
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Main Operating Account"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Account Type *</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(value: BankAccountFormData['type']) => form.setValue('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {accountTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                placeholder="Last 4 digits or full number"
                {...form.register('accountNumber')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={form.watch('currency')}
                onValueChange={(value) => form.setValue('currency', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                  <SelectItem value="EGP">EGP - Egyptian Pound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="openingBalance">Opening Balance</Label>
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
          <CardTitle>Accounting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="linkedAccountId">GL Account *</Label>
            <Select
              value={form.watch('linkedAccountId') || '__none__'}
              onValueChange={(value) =>
                form.setValue('linkedAccountId', value === '__none__' ? '' : value, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Link to GL account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>
                  Select a GL account
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
                {form.formState.errors.linkedAccountId.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Link this bank account to a general ledger account for accurate financial reporting
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Active</Label>
              <p className="text-sm text-muted-foreground">
                Inactive accounts won&apos;t appear in selections
              </p>
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
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Account' : 'Create Account'}
        </Button>
      </div>
    </form>
  );
}
