'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocale, useTranslations } from 'next-intl';
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
import {
  Account,
  AccountType,
  flattenAccountsTree,
  useAccountTypeLabel,
} from '@/lib/hooks/use-accounts';
import { useBaseCurrency } from '@/lib/hooks/use-organization';

// Messages are keys of accounting.accounts.dialog.errors.
const accountSchema = z.object({
  code: z.string().min(1, 'codeRequired').max(20, 'codeTooLong'),
  name: z.string().min(2, 'nameTooShort').max(100, 'nameTooLong'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'INCOME', 'EXPENSE']),
  parentId: z.string().optional(),
  currency: z.string().length(3, 'currencyRequired'),
  description: z.string().max(500, 'descriptionTooLong').optional(),
});

type AccountFormData = z.infer<typeof accountSchema>;

/** Currencies offered for an account; names come from Intl in the page language. */
const CURRENCY_CODES = ['EGP', 'SAR', 'AED', 'USD', 'EUR', 'GBP'];

const ACCOUNT_TYPES: AccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'REVENUE',
  'EXPENSE',
];

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
  const t = useTranslations('accounting.accounts');
  const tErrors = useTranslations('accounting.accounts.dialog.errors');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const typeLabel = useAccountTypeLabel();
  const baseCurrency = useBaseCurrency();
  const isEditing = !!account;
  const flattenedAccounts = flattenAccountsTree(accounts);
  const currencyNames = new Intl.DisplayNames([locale], { type: 'currency' });
  const errorText = (message?: string): string | undefined =>
    message && tErrors.has(message) ? tErrors(message) : message;

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'ASSET',
      parentId: undefined,
      currency: '',
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
          currency: '',
          description: '',
        });
      }
    }
  }, [open, account, parentAccount, form]);

  // A new top-level account starts in the org base currency, never USD; a choice already made stays.
  useEffect(() => {
    if (open && !account && !parentAccount && baseCurrency && !form.getValues('currency')) {
      form.setValue('currency', baseCurrency);
    }
  }, [open, account, parentAccount, baseCurrency, form]);

  const currentCurrency = form.watch('currency');
  const currencies = [currentCurrency, baseCurrency, ...CURRENCY_CODES]
    .filter((code, i, all): code is string => !!code && all.indexOf(code) === i)
    .map((code) => ({ code, label: `${code} - ${currencyNames.of(code) ?? code}` }));

  const handleSubmit = (data: AccountFormData) => {
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" closeLabel={tCommon('buttons.close')}>
        <DialogHeader>
          <DialogTitle>{isEditing ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('dialog.editDescription')
              : parentAccount
                ? t('dialog.childDescription', { name: parentAccount.name })
                : t('dialog.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">{t('form.code')} *</Label>
              <Input
                id="code"
                placeholder={t('dialog.codePlaceholder')}
                {...form.register('code')}
              />
              {form.formState.errors.code && (
                <p className="text-sm text-destructive">
                  {errorText(form.formState.errors.code.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{t('form.type')} *</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(value) => {
                  // Radix emits '' for a value missing from the options; keep the current type.
                  if (value) form.setValue('type', value as AccountType);
                }}
              >
                <SelectTrigger id="type">
                  <SelectValue placeholder={t('form.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {typeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">{t('form.name')} *</Label>
            <Input id="name" placeholder={t('dialog.namePlaceholder')} {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {errorText(form.formState.errors.name.message)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="parentId">{t('form.parent')}</Label>
              <Select
                value={form.watch('parentId') || 'none'}
                onValueChange={(value) => {
                  if (!value) return;
                  form.setValue('parentId', value === 'none' ? undefined : value);
                }}
              >
                <SelectTrigger id="parentId">
                  <SelectValue placeholder={t('dialog.parentNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('dialog.parentNone')}</SelectItem>
                  {flattenedAccounts
                    .filter((a) => a.id !== account?.id) // Can't be parent of itself
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span style={{ paddingInlineStart: `${a.level * 12}px` }}>
                          <bdi>{a.code}</bdi> - {a.name}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">{t('form.currency')}</Label>
              <Select
                value={currentCurrency}
                onValueChange={(value) => {
                  if (value) form.setValue('currency', value, { shouldValidate: true });
                }}
              >
                <SelectTrigger id="currency">
                  <SelectValue placeholder={t('dialog.currencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.currency && (
                <p className="text-sm text-destructive">
                  {errorText(form.formState.errors.currency.message)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('form.description')}</Label>
            <Input
              id="description"
              placeholder={t('dialog.descriptionPlaceholder')}
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <p className="text-sm text-destructive">
                {errorText(form.formState.errors.description.message)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('dialog.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t('dialog.saving')
                : isEditing
                  ? t('dialog.update')
                  : t('dialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
