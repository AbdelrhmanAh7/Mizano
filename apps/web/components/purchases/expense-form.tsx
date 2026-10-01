'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useVendors, Vendor } from '@/lib/hooks/use-vendors';
import {
  buildExpensePayload,
  CreateExpensePayload,
  MONEY_PATTERN,
  previewExpense,
} from './expense-payload';

const expenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  accountId: z.string().min(1, 'Expense account is required'),
  vendorId: z.string().optional(),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(MONEY_PATTERN, 'Enter a positive amount with at most 4 decimals'),
  taxRate: z.string().optional(),
  taxInclusive: z.boolean().default(false),
  paidThroughAccountId: z.string().min(1, 'Paid through account is required'),
  description: z.string().max(500).optional(),
  reference: z.string().max(200).optional(),
  projectId: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

export interface LookupAccount {
  id: string;
  code: string;
  name: string;
}

interface ExpenseFormProps {
  /** Expense-type accounts (GET /expenses/expense-accounts). */
  expenseAccounts: LookupAccount[];
  /** Eligible bank/cash accounts (GET /expenses/paid-through-accounts). */
  paidThroughAccounts: LookupAccount[];
  projects?: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateExpensePayload) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  defaultVendorId?: string;
}

const taxRates = [
  { value: '0', label: 'No Tax (0%)' },
  { value: '5', label: '5%' },
  { value: '10', label: '10%' },
  { value: '14', label: 'VAT 14%' },
  { value: '15', label: '15%' },
];

export function ExpenseForm({
  expenseAccounts,
  paidThroughAccounts,
  projects = [],
  onSubmit,
  onCancel,
  isSubmitting,
  defaultVendorId,
}: ExpenseFormProps) {
  const t = useTranslations('purchases.expenses.form');
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors: Vendor[] = vendorsData?.data || [];

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      accountId: '',
      vendorId: defaultVendorId || '',
      amount: '',
      taxRate: '0',
      taxInclusive: false,
      paidThroughAccountId: '',
      description: '',
      reference: '',
      projectId: '',
    },
  });

  const handleSubmit = (data: ExpenseFormData): void => {
    onSubmit(buildExpensePayload(data));
  };

  const preview = previewExpense(
    form.watch('amount') || '',
    form.watch('taxRate'),
    form.watch('taxInclusive'),
  );

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">{t('date')} *</Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountId">{t('account')} *</Label>
              <Select
                value={form.watch('accountId')}
                onValueChange={(value) => form.setValue('accountId', value)}
                disabled={expenseAccounts.length === 0}
              >
                <SelectTrigger id="accountId">
                  <SelectValue placeholder={t('accountPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {expenseAccounts.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('noExpenseAccounts')}</p>
              )}
              {form.formState.errors.accountId && (
                <p className="text-sm text-red-500">{form.formState.errors.accountId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendorId">{t('vendor')}</Label>
              <Select
                value={form.watch('vendorId') || ''}
                onValueChange={(value) => form.setValue('vendorId', value === 'none' ? '' : value)}
              >
                <SelectTrigger id="vendorId">
                  <SelectValue placeholder={t('vendorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('noVendor')}</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t('amount')} *</Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                {...form.register('amount')}
              />
              {form.formState.errors.amount && (
                <p className="text-sm text-red-500">{form.formState.errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxRate">{t('taxRate')}</Label>
              <Select
                value={form.watch('taxRate') || '0'}
                onValueChange={(value) => form.setValue('taxRate', value)}
              >
                <SelectTrigger id="taxRate">
                  <SelectValue placeholder={t('taxRate')} />
                </SelectTrigger>
                <SelectContent>
                  {taxRates.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 flex items-end">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="taxInclusive"
                  checked={form.watch('taxInclusive')}
                  onCheckedChange={(checked) => form.setValue('taxInclusive', checked === true)}
                />
                <Label htmlFor="taxInclusive" className="font-normal">
                  {t('taxInclusive')}
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('total')}</Label>
              <div
                className="h-10 flex items-center px-3 rounded-md border bg-muted font-mono"
                aria-live="polite"
              >
                {preview ? preview.total : '-'}
              </div>
              {preview && (
                <p className="text-xs text-muted-foreground">
                  {t('vat')}: {preview.tax}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paidThroughAccountId">{t('paidThrough')} *</Label>
              <Select
                value={form.watch('paidThroughAccountId')}
                onValueChange={(value) => form.setValue('paidThroughAccountId', value)}
                disabled={paidThroughAccounts.length === 0}
              >
                <SelectTrigger id="paidThroughAccountId">
                  <SelectValue placeholder={t('paidThroughPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {paidThroughAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paidThroughAccounts.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('noPaidThroughAccounts')}</p>
              )}
              {form.formState.errors.paidThroughAccountId && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.paidThroughAccountId.message}
                </p>
              )}
            </div>

            {projects.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="projectId">{t('project')}</Label>
                <Select
                  value={form.watch('projectId') || ''}
                  onValueChange={(value) =>
                    form.setValue('projectId', value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger id="projectId">
                    <SelectValue placeholder={t('project')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('noProject')}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference">{t('reference')}</Label>
              <Input id="reference" {...form.register('reference')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('description')}</Label>
            <Textarea id="description" {...form.register('description')} rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting || expenseAccounts.length === 0 || paidThroughAccounts.length === 0
          }
        >
          {isSubmitting ? t('saving') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
