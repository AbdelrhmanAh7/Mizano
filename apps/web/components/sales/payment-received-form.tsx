'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { useDateFnsLocale } from '@/lib/date-locale';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useCustomers, Customer } from '@/lib/hooks/use-customers';
import { useInvoices, Invoice } from '@/lib/hooks/use-invoices';
import { useAccountsByType, Account } from '@/lib/hooks/use-accounts';
import {
  PaymentMode,
  getPaymentModeOptions,
  validateAllocations,
} from '@/lib/hooks/use-payments-received';

const allocationSchema = z.object({
  invoiceId: z.string(),
  amount: z.string(),
  selected: z.boolean(),
});

const paymentReceivedSchema = z.object({
  customerId: z.string().min(1, 'customerRequired'),
  date: z.string().min(1, 'dateRequired'),
  amount: z.string().min(1, 'amountRequired'),
  paymentMode: z.enum([
    'CASH',
    'BANK_TRANSFER',
    'CREDIT_CARD',
    'DEBIT_CARD',
    'CHEQUE',
    'ONLINE',
    'OTHER',
  ]),
  depositToAccountId: z.string().min(1, 'depositAccountRequired'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(allocationSchema),
});

export type PaymentReceivedFormData = z.infer<typeof paymentReceivedSchema>;

// Labels live under common.paymentModes.
const PAYMENT_MODE_KEYS: Record<PaymentReceivedFormData['paymentMode'], string> = {
  CASH: 'cash',
  BANK_TRANSFER: 'bankTransfer',
  CREDIT_CARD: 'creditCard',
  DEBIT_CARD: 'debitCard',
  CHEQUE: 'cheque',
  ONLINE: 'online',
  OTHER: 'other',
};

interface PaymentReceivedFormProps {
  defaultCustomerId?: string;
  defaultInvoiceId?: string;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function PaymentReceivedForm({
  defaultCustomerId,
  defaultInvoiceId,
  onSubmit,
  onCancel,
  isSubmitting,
}: PaymentReceivedFormProps) {
  const t = useTranslations('sales.payments.form');
  const tValidation = useTranslations('sales.payments.validation');
  const tModes = useTranslations('common.paymentModes');
  const dateLocale = useDateFnsLocale();
  const fieldError = (message?: string) =>
    message ? (tValidation.has(message) ? tValidation(message) : message) : undefined;
  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data || [];

  const { data: assetAccounts } = useAccountsByType('ASSET');

  // Filter for bank/cash type accounts
  const depositAccounts = useMemo(() => {
    if (!assetAccounts) return [];
    return assetAccounts.filter(
      (acc: Account) =>
        acc.isActive &&
        (acc.name.toLowerCase().includes('bank') ||
          acc.name.toLowerCase().includes('cash') ||
          acc.code.startsWith('1000') ||
          acc.code.startsWith('1001') ||
          acc.code.startsWith('1002')),
    );
  }, [assetAccounts]);

  const form = useForm<PaymentReceivedFormData>({
    resolver: zodResolver(paymentReceivedSchema),
    defaultValues: {
      customerId: defaultCustomerId || '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      paymentMode: 'BANK_TRANSFER',
      depositToAccountId: '',
      reference: '',
      notes: '',
      allocations: [],
    },
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'allocations',
  });

  const selectedCustomerId = form.watch('customerId');
  const paymentAmount = form.watch('amount');
  const allocations = form.watch('allocations');

  // Fetch invoices for selected customer
  const { data: invoicesData } = useInvoices({
    customerId: selectedCustomerId || undefined,
    limit: 100,
  });

  // Filter for open invoices (not paid, not void, not draft, with balance due)
  const openInvoices = useMemo(() => {
    if (!invoicesData?.data) return [];
    return invoicesData.data.filter(
      (inv: Invoice) =>
        inv.status !== 'VOID' &&
        inv.status !== 'DRAFT' &&
        inv.status !== 'PAID' &&
        parseFloat(inv.balanceDue || '0') > 0,
    );
  }, [invoicesData]);

  // Update allocations when customer changes or invoices load
  useEffect(() => {
    if (openInvoices.length > 0) {
      const newAllocations = openInvoices.map((inv: Invoice) => ({
        invoiceId: inv.id,
        amount: '0',
        selected: defaultInvoiceId === inv.id,
      }));

      // If there's a default invoice, pre-fill the amount
      if (defaultInvoiceId) {
        const defaultInv = openInvoices.find((inv: Invoice) => inv.id === defaultInvoiceId);
        if (defaultInv) {
          const idx = newAllocations.findIndex(
            (a: { invoiceId: string; amount: string }) => a.invoiceId === defaultInvoiceId,
          );
          if (idx >= 0) {
            newAllocations[idx].amount = defaultInv.balanceDue;
            form.setValue('amount', defaultInv.balanceDue);
          }
        }
      }

      replace(newAllocations);
    } else {
      replace([]);
    }
  }, [openInvoices, defaultInvoiceId, replace, form]);

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  // Calculate total allocated
  const totalAllocated = useMemo(() => {
    return allocations
      .filter((a) => a.selected)
      .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  }, [allocations]);

  const { isValid: isBalanced, difference } = validateAllocations(
    paymentAmount || '0',
    allocations.filter((a) => a.selected),
  );

  const paymentModeOptions = getPaymentModeOptions();

  // Handle checkbox selection
  const handleSelectInvoice = (index: number, checked: boolean) => {
    form.setValue(`allocations.${index}.selected`, checked);
    if (checked) {
      const invoice = openInvoices.find((inv: Invoice) => inv.id === allocations[index]?.invoiceId);
      if (invoice) {
        form.setValue(`allocations.${index}.amount`, invoice.balanceDue);
      }
    } else {
      form.setValue(`allocations.${index}.amount`, '0');
    }
  };

  // Auto-distribute payment amount
  const autoDistribute = () => {
    let remaining = parseFloat(paymentAmount) || 0;
    const newAllocations = [...allocations];

    for (let i = 0; i < newAllocations.length; i++) {
      const invoice = openInvoices.find((inv: Invoice) => inv.id === newAllocations[i].invoiceId);
      if (invoice && remaining > 0) {
        const balance = parseFloat(invoice.balanceDue || '0');
        const toAllocate = Math.min(remaining, balance);
        newAllocations[i] = {
          ...newAllocations[i],
          selected: toAllocate > 0,
          amount: toAllocate.toFixed(2),
        };
        remaining -= toAllocate;
      } else {
        newAllocations[i] = {
          ...newAllocations[i],
          selected: false,
          amount: '0',
        };
      }
    }

    replace(newAllocations);
  };

  const handleSubmit = (data: PaymentReceivedFormData) => {
    if (!isBalanced) {
      return;
    }

    // Filter to only selected allocations with amount > 0
    const filteredData = {
      ...data,
      allocations: data.allocations
        .filter((a) => a.selected && parseFloat(a.amount) > 0)
        .map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    };

    onSubmit(filteredData);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerId">
                {t('customer')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.watch('customerId')}
                onValueChange={(value) => {
                  form.setValue('customerId', value);
                  form.setValue('amount', '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('customerPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer: Customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.displayName || customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.customerId && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.customerId.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">
                {t('date')} <span className="text-destructive">*</span>
              </Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.date.message)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">
                {t('amountReceived')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...form.register('amount')}
              />
              {form.formState.errors.amount && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.amount.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMode">
                {t('paymentMode')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.watch('paymentMode')}
                onValueChange={(value) => form.setValue('paymentMode', value as PaymentMode)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('paymentModePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {paymentModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {tModes(PAYMENT_MODE_KEYS[option.value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="depositToAccountId">
                {t('depositTo')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.watch('depositToAccountId')}
                onValueChange={(value) => form.setValue('depositToAccountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('depositToPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {depositAccounts.map((account: Account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.depositToAccountId && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.depositToAccountId.message)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference">{t('reference')}</Label>
            <Input
              id="reference"
              placeholder={t('referencePlaceholder')}
              {...form.register('reference')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Invoice Allocation */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('applyToInvoices')}</CardTitle>
            {openInvoices.length > 0 && paymentAmount && (
              <Button type="button" variant="outline" size="sm" onClick={autoDistribute}>
                {t('autoDistribute')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedCustomerId ? (
            <p className="text-center text-muted-foreground py-8">{t('selectCustomerFirst')}</p>
          ) : openInvoices.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('noOpenInvoices')}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>{t('invoiceNumber')}</TableHead>
                    <TableHead>{t('invoiceDate')}</TableHead>
                    <TableHead>{t('dueDate')}</TableHead>
                    <TableHead className="text-end">{t('total')}</TableHead>
                    <TableHead className="text-end">{t('balanceDue')}</TableHead>
                    <TableHead className="text-end">{t('amountToApply')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const invoice = openInvoices.find((inv: Invoice) => inv.id === field.invoiceId);
                    if (!invoice) return null;

                    return (
                      <TableRow key={field.id}>
                        <TableCell>
                          <Checkbox
                            checked={form.watch(`allocations.${index}.selected`)}
                            onCheckedChange={(checked) =>
                              handleSelectInvoice(index, checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>
                          {format(new Date(invoice.date), 'PP', { locale: dateLocale })}
                        </TableCell>
                        <TableCell>
                          {format(new Date(invoice.dueDate), 'PP', { locale: dateLocale })}
                        </TableCell>
                        <TableCell className="text-end font-mono">
                          {formatCurrency(invoice.grandTotal)}
                        </TableCell>
                        <TableCell className="text-end font-mono text-red-600">
                          {formatCurrency(invoice.balanceDue)}
                        </TableCell>
                        <TableCell className="text-end">
                          <Input
                            aria-label={t('amountToApply')}
                            type="number"
                            step="0.01"
                            min="0"
                            max={invoice.balanceDue}
                            className="w-28 text-end ms-auto"
                            disabled={!form.watch(`allocations.${index}.selected`)}
                            value={form.watch(`allocations.${index}.amount`) || ''}
                            onChange={(e) =>
                              form.setValue(`allocations.${index}.amount`, e.target.value)
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Balance Summary */}
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      {t('paymentAmount', { amount: formatCurrency(paymentAmount || '0') })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t('totalAllocated', { amount: formatCurrency(totalAllocated) })}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium',
                      isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
                    )}
                  >
                    {isBalanced ? (
                      <>
                        <Check className="h-4 w-4" />
                        {t('balanced')}
                      </>
                    ) : (
                      <>
                        <X className="h-4 w-4" />
                        {t('difference', { amount: formatCurrency(difference) })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>{t('additionalNotes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={t('notesPlaceholder')}
            aria-label={t('additionalNotes')}
            rows={3}
            {...form.register('notes')}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || !isBalanced || totalAllocated === 0}>
          {isSubmitting ? t('recording') : t('recordPayment')}
        </Button>
      </div>
    </form>
  );
}
