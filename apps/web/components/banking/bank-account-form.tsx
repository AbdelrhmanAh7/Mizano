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
  accountName: z.string().min(1, 'Account name is required'),
  accountNumber: z.string().optional(),
  bankName: z.string().optional(),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'OTHER']),
  currency: z.string().default('USD'),
  openingBalance: z.number().optional(),
  glAccountId: z.string().optional(),
  isActive: z.boolean().default(true),
});

type BankAccountFormData = z.infer<typeof bankAccountSchema>;

interface BankAccountFormProps {
  account?: BankAccount | null;
  glAccounts: Array<{ id: string; name: string; code: string }>;
  onSubmit: (data: any) => void;
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
      accountName: '',
      accountNumber: '',
      bankName: '',
      accountType: 'CHECKING',
      currency: 'USD',
      openingBalance: 0,
      glAccountId: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (account) {
      form.reset({
        accountName: account.accountName || '',
        accountNumber: account.accountNumber || '',
        bankName: account.bankName || '',
        accountType: account.accountType || 'CHECKING',
        currency: account.currency || 'USD',
        glAccountId: account.glAccountId || '',
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
              <Label htmlFor="accountName">Account Name *</Label>
              <Input
                id="accountName"
                placeholder="e.g., Main Operating Account"
                {...form.register('accountName')}
              />
              {form.formState.errors.accountName && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.accountName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountType">Account Type *</Label>
              <Select
                value={form.watch('accountType')}
                onValueChange={(value: any) => form.setValue('accountType', value)}
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
              <Label htmlFor="bankName">Bank Name</Label>
              <Input
                id="bankName"
                placeholder="e.g., Chase Bank"
                {...form.register('bankName')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                placeholder="Last 4 digits or full number"
                {...form.register('accountNumber')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Accounting */}
      <Card>
        <CardHeader>
          <CardTitle>Accounting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="glAccountId">GL Account</Label>
            <Select
              value={form.watch('glAccountId') || ''}
              onValueChange={(value) => form.setValue('glAccountId', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link to GL account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {glAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Link this bank account to a general ledger account for accurate financial reporting
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Active</Label>
              <p className="text-sm text-muted-foreground">
                Inactive accounts won't appear in selections
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
