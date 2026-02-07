'use client';

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
import {
  useCreateTaxRate,
  useUpdateTaxRate,
  TaxRate,
} from '@/lib/hooks/use-tax';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useToast } from '@/components/ui/use-toast';

const taxRateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  rate: z.number().min(0, 'Rate must be 0 or higher').max(100, 'Rate cannot exceed 100'),
  type: z.enum(['OUTPUT', 'INPUT', 'BOTH']),
  accountId: z.string().min(1, 'Linked account is required'),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

type TaxRateFormData = z.infer<typeof taxRateSchema>;

interface TaxRateFormProps {
  taxRate?: TaxRate;
  onSuccess?: () => void;
}

export function TaxRateForm({ taxRate, onSuccess }: TaxRateFormProps) {
  const { toast } = useToast();
  const createTaxRate = useCreateTaxRate();
  const updateTaxRate = useUpdateTaxRate();

  const { data: accountsData, isLoading: accountsLoading } = useAccounts();
  const accounts = accountsData?.data || [];

  const form = useForm<TaxRateFormData>({
    resolver: zodResolver(taxRateSchema),
    defaultValues: taxRate
      ? {
          name: taxRate.name,
          rate: typeof taxRate.rate === 'string' ? parseFloat(taxRate.rate) : taxRate.rate,
          type: taxRate.type,
          accountId: taxRate.accountId,
          isDefault: taxRate.isDefault,
          isActive: taxRate.isActive,
        }
      : {
          name: '',
          rate: 0,
          type: 'BOTH' as const,
          accountId: '',
          isDefault: false,
          isActive: true,
        },
  });

  const handleSubmit = async (data: TaxRateFormData) => {
    try {
      if (taxRate) {
        await updateTaxRate.mutateAsync({ id: taxRate.id, data: data as any });
        toast({ title: 'Tax rate updated successfully' });
      } else {
        await createTaxRate.mutateAsync(data as any);
        toast({ title: 'Tax rate created successfully' });
      }
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to save tax rate',
        variant: 'destructive',
      });
    }
  };

  const isPending = createTaxRate.isPending || updateTaxRate.isPending;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          placeholder="e.g., VAT 15%"
          {...form.register('name')}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rate">Rate (%) *</Label>
          <Input
            id="rate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            {...form.register('rate', { valueAsNumber: true })}
          />
          {form.formState.errors.rate && (
            <p className="text-sm text-red-500">{form.formState.errors.rate.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Type *</Label>
          <Select
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OUTPUT">Output (Sales)</SelectItem>
              <SelectItem value="INPUT">Input (Purchases)</SelectItem>
              <SelectItem value="BOTH">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Linked Account *</Label>
        <Select
          value={form.watch('accountId') || ''}
          onValueChange={(value) => form.setValue('accountId', value)}
          disabled={accountsLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account: any) => (
              <SelectItem key={account.id} value={account.id}>
                {account.code} - {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.accountId && (
          <p className="text-sm text-red-500">{form.formState.errors.accountId.message}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch
            id="isDefault"
            checked={form.watch('isDefault')}
            onCheckedChange={(checked) => form.setValue('isDefault', checked)}
          />
          <Label htmlFor="isDefault">Default tax rate</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={form.watch('isActive')}
            onCheckedChange={(checked) => form.setValue('isActive', checked)}
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : taxRate ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
