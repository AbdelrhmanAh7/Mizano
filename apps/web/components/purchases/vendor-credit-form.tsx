'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { vendorCreditsApi, billsApi } from '@/lib/api';
import { Bill, isBillPosted } from '@/lib/hooks/use-bills';
import { MONEY_PATTERN } from './expense-payload';
import {
  buildVendorCreditPayload,
  checkCreditAmount,
  CreateVendorCreditPayload,
} from './vendor-credit-payload';

const vendorCreditSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  billId: z.string().min(1, 'Bill is required'),
  date: z.string().min(1, 'Date is required'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(MONEY_PATTERN, 'Enter a positive amount with at most 4 decimals'),
  reason: z.string().max(500).optional(),
  accountId: z.string().optional(),
});

type VendorCreditFormData = z.infer<typeof vendorCreditSchema>;

interface BillOption {
  id: string;
  billNumber: string;
  status: Bill['status'];
  grandTotal: string;
  vendorId: string;
}

interface CreditAccount {
  id: string;
  code: string;
  name: string;
}

interface VendorCreditFormProps {
  vendors: Array<{ id: string; name: string }>;
  onSubmit: (data: CreateVendorCreditPayload) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  preselectedVendorId?: string;
}

export function VendorCreditForm({
  vendors,
  onSubmit,
  onCancel,
  isSubmitting,
  preselectedVendorId,
}: VendorCreditFormProps) {
  const t = useTranslations('purchases.credits.form');
  const form = useForm<VendorCreditFormData>({
    resolver: zodResolver(vendorCreditSchema),
    defaultValues: {
      vendorId: preselectedVendorId || '',
      billId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      amount: '',
      reason: '',
      accountId: '',
    },
  });

  const vendorId = form.watch('vendorId');
  const billId = form.watch('billId');

  const billsQuery = useQuery({
    queryKey: ['bills', 'creditable', vendorId],
    queryFn: async (): Promise<BillOption[]> => {
      const response = await billsApi.getAll({ vendorId, limit: 100 });
      const rows = (response.data?.data ?? []) as BillOption[];
      return rows.filter((b) => b.vendorId === vendorId && isBillPosted(b));
    },
    enabled: !!vendorId,
  });
  const accountsQuery = useQuery({
    queryKey: ['vendor-credits', 'credit-accounts'],
    queryFn: async (): Promise<CreditAccount[]> =>
      (await vendorCreditsApi.creditAccounts()).data as CreditAccount[],
  });

  const bills = billsQuery.data ?? [];
  const selectedBill = bills.find((b) => b.id === billId);

  const handleSubmit = (data: VendorCreditFormData): void => {
    const issue = checkCreditAmount(data.amount, selectedBill?.grandTotal);
    if (issue === 'EXCEEDS_BILL') {
      form.setError('amount', { message: t('exceedsBill') });
      return;
    }
    onSubmit(buildVendorCreditPayload(data));
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendorId">{t('vendor')} *</Label>
              <Select
                value={vendorId}
                onValueChange={(value) => {
                  form.setValue('vendorId', value);
                  form.setValue('billId', '');
                }}
                disabled={!!preselectedVendorId}
              >
                <SelectTrigger id="vendorId">
                  <SelectValue placeholder={t('vendorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.vendorId && (
                <p className="text-sm text-red-500">{form.formState.errors.vendorId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="billId">{t('bill')} *</Label>
              <Select
                value={billId}
                onValueChange={(value) => form.setValue('billId', value)}
                disabled={!vendorId || billsQuery.isLoading || bills.length === 0}
              >
                <SelectTrigger id="billId">
                  <SelectValue
                    placeholder={vendorId ? t('billPlaceholder') : t('selectVendorFirst')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((bill) => (
                    <SelectItem key={bill.id} value={bill.id}>
                      {bill.billNumber} ({bill.grandTotal})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {billsQuery.isError && <p className="text-sm text-red-500">{t('loadError')}</p>}
              {vendorId && billsQuery.isSuccess && bills.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('noBills')}</p>
              )}
              {form.formState.errors.billId && (
                <p className="text-sm text-red-500">{form.formState.errors.billId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">{t('date')} *</Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t('amount')} *</Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                {...form.register('amount')}
              />
              <p className="text-xs text-muted-foreground">{t('amountHelp')}</p>
              {form.formState.errors.amount && (
                <p className="text-sm text-red-500">{form.formState.errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountId">{t('account')}</Label>
              <Select
                value={form.watch('accountId') || ''}
                onValueChange={(value) =>
                  form.setValue('accountId', value === 'default' ? '' : value)
                }
              >
                <SelectTrigger id="accountId">
                  <SelectValue placeholder={t('accountPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('accountPlaceholder')}</SelectItem>
                  {(accountsQuery.data ?? []).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountsQuery.isError && <p className="text-sm text-red-500">{t('loadError')}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">{t('reason')}</Label>
            <Textarea id="reason" rows={2} {...form.register('reason')} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('creating') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
