'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Account, AccountType, flattenAccountsTree } from '@/lib/hooks/use-accounts';

const accountSchema = z.object({
  code: z.string().min(1, 'Code is required').max(20, 'Code must be 20 characters or less'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'INCOME', 'EXPENSE']),
  parentId: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  description: z.string().max(500).optional(),
});

type AccountFormData = z.infer<typeof accountSchema>;

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
  parentAccount?: Account | null;
  accounts: Account[];
  onSubmit: (data: AccountFormData) => void;
  isSubmitting?: boolean;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  parentAccount,
  accounts,
  onSubmit,
  isSubmitting,
}: AccountFormDialogProps) {
  const isEditing = !!account;
  const flattenedAccounts = flattenAccountsTree(accounts);

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'ASSET',
      parentId: undefined,
      currency: 'USD',
      description: '',
    },
  });

  useEffect(() => {
    if (open) {
      if (account) {
        // Editing existing account
        form.reset({
          code: account.code,
          name: account.name,
          type: account.type,
          parentId: account.parentId || undefined,
          currency: account.currency,
          description: account.description || '',
        });
      } else if (parentAccount) {
        // Creating child account
        form.reset({
          code: '',
          name: '',
          type: parentAccount.type,
          parentId: parentAccount.id,
          currency: parentAccount.currency,
          description: '',
        });
      } else {
        // Creating new account
        form.reset({
          code: '',
          name: '',
          type: 'ASSET',
          parentId: undefined,
          currency: 'USD',
          description: '',
        });
      }
    }
  }, [open, account, parentAccount, form]);

  const handleSubmit = (data: AccountFormData) => {
    onSubmit(data);
  };

  const accountTypes: { value: AccountType; label: string }[] = [
    { value: 'ASSET', label: 'Asset' },
    { value: 'LIABILITY', label: 'Liability' },
    { value: 'EQUITY', label: 'Equity' },
    { value: 'INCOME', label: 'Income' },
    { value: 'REVENUE', label: 'Revenue' },
    { value: 'EXPENSE', label: 'Expense' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Account' : 'Create Account'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the account details below.'
              : parentAccount
              ? `Creating a child account under "${parentAccount.name}"`
              : 'Add a new account to your chart of accounts.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Account Code *</Label>
              <Input
                id="code"
                placeholder="e.g., 1000"
                {...form.register('code')}
              />
              {form.formState.errors.code && (
                <p className="text-sm text-red-500">{form.formState.errors.code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Account Type *</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(value) => form.setValue('type', value as AccountType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.type && (
                <p className="text-sm text-red-500">{form.formState.errors.type.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Account Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Cash on Hand"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="parentId">Parent Account</Label>
              <Select
                value={form.watch('parentId') || 'none'}
                onValueChange={(value) => form.setValue('parentId', value === 'none' ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (Top Level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {flattenedAccounts
                    .filter((a) => a.id !== account?.id) // Can't be parent of itself
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span style={{ paddingLeft: `${a.level * 12}px` }}>
                          {a.code} - {a.name}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
                  <SelectItem value="EGP">EGP - Egyptian Pound</SelectItem>
                  <SelectItem value="SAR">SAR - Saudi Riyal</SelectItem>
                  <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description"
              {...form.register('description')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Account' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
