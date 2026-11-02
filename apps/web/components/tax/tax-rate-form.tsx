'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
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
import { useCreateTaxRate, useUpdateTaxRate, TaxRate } from '@/lib/hooks/use-tax';
import { useAccounts, Account, ACCOUNT_PICKER_PARAMS } from '@/lib/hooks/use-accounts';
import { useToast } from '@/components/ui/use-toast';

/** Validation rules; the messages come from the catalog so the form follows the page language. */
function buildTaxRateSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t('nameRequired')),
    rate: z
      .number({ invalid_type_error: t('rateInvalid') })
      .min(0, t('rateMin'))
      .max(100, t('rateMax')),
    type: z.enum(['SALES', 'PURCHASES', 'BOTH']),
    linkedAccountId: z.string().min(1, t('accountRequired')),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
  });
}

type TaxRateFormData = z.infer<ReturnType<typeof buildTaxRateSchema>>;

interface TaxRateFormProps {
  taxRate?: TaxRate;
  onSuccess?: () => void;
}

export function TaxRateForm({ taxRate, onSuccess }: TaxRateFormProps) {
  const t = useTranslations('tax.rates');
  const tForm = useTranslations('tax.rates.form');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const taxRateSchema = useMemo(() => buildTaxRateSchema(tForm), [tForm]);
  const createTaxRate = useCreateTaxRate();
  const updateTaxRate = useUpdateTaxRate();

  const { data: accountsData, isLoading: accountsLoading } = useAccounts(ACCOUNT_PICKER_PARAMS);
  const accounts: Account[] = accountsData?.data || [];

  const form = useForm<TaxRateFormData>({
    resolver: zodResolver(taxRateSchema),
    defaultValues: taxRate
      ? {
          name: taxRate.name,
          rate: typeof taxRate.rate === 'string' ? parseFloat(taxRate.rate) : taxRate.rate,
          type: taxRate.type,
          linkedAccountId: taxRate.linkedAccountId,
          isDefault: taxRate.isDefault,
          isActive: taxRate.isActive,
        }
      : {
          name: '',
          rate: 0,
          type: 'BOTH' as const,
          linkedAccountId: '',
          isDefault: false,
          isActive: true,
        },
  });

  const handleSubmit = async (values: TaxRateFormData) => {
    // The API takes the rate as a decimal string, never a float.
    const data = { ...values, rate: String(values.rate) };
    try {
      if (taxRate) {
        await updateTaxRate.mutateAsync({ id: taxRate.id, data });
        toast({ title: tForm('updated') });
      } else {
        await createTaxRate.mutateAsync(data);
        toast({ title: tForm('created') });
      }
      onSuccess?.();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast({
        title: tCommon('errors.title'),
        description: err.response?.data?.message || tForm('saveFailed'),
        variant: 'destructive',
      });
    }
  };

  const isPending = createTaxRate.isPending || updateTaxRate.isPending;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('table.name')} *</Label>
        <Input id="name" placeholder={tForm('namePlaceholder')} {...form.register('name')} />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rate">{tForm('rate')} *</Label>
          <Input
            id="rate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            {...form.register('rate', { valueAsNumber: true })}
          />
          {form.formState.errors.rate && (
            <p className="text-sm text-destructive">{form.formState.errors.rate.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('table.type')} *</Label>
          <Select
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as TaxRateFormData['type'])}
          >
            <SelectTrigger>
              <SelectValue placeholder={tForm('selectType')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SALES">{t('type.SALES')}</SelectItem>
              <SelectItem value="PURCHASES">{t('type.PURCHASES')}</SelectItem>
              <SelectItem value="BOTH">{t('type.BOTH')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('table.linkedAccount')} *</Label>
        <Select
          value={form.watch('linkedAccountId') || ''}
          onValueChange={(value) => form.setValue('linkedAccountId', value)}
          disabled={accountsLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={tForm('selectAccount')} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.code} - {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.linkedAccountId && (
          <p className="text-sm text-destructive">
            {form.formState.errors.linkedAccountId.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch
            id="isDefault"
            checked={form.watch('isDefault')}
            onCheckedChange={(checked) => form.setValue('isDefault', checked)}
          />
          <Label htmlFor="isDefault">{tForm('defaultRate')}</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={form.watch('isActive')}
            onCheckedChange={(checked) => form.setValue('isActive', checked)}
          />
          <Label htmlFor="isActive">{tCommon('status.active')}</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? tCommon('loading.saving')
            : taxRate
              ? tForm('update')
              : tCommon('buttons.create')}
        </Button>
      </div>
    </form>
  );
}
