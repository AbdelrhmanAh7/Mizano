'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCustomers, Customer } from '@/lib/hooks/use-customers';
import { useInvoices, Invoice } from '@/lib/hooks/use-invoices';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { creditNotesApi } from '@/lib/api';
import { CreditNoteType } from '@/lib/hooks/use-credit-notes';

const creditNoteSchema = z
  .object({
    customerId: z.string().min(1, 'Customer is required'),
    invoiceId: z.string().min(1, 'Original invoice is required'),
    date: z.string().min(1, 'Date is required'),
    type: z.enum(['REFUND', 'APPLY_TO_INVOICE']),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,15}(\.\d{1,4})?$/, 'Enter a valid amount (up to 15 digits, 4 decimals)'),
    reason: z.string().trim().min(1, 'Reason is required').max(500),
    appliedToInvoiceId: z.string().optional(),
    refundAccountId: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'REFUND' && !v.refundAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Refund account is required',
        path: ['refundAccountId'],
      });
    }
    // No silent default: applying a credit needs an explicit target invoice.
    if (v.type === 'APPLY_TO_INVOICE' && !v.appliedToInvoiceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose the invoice to apply this credit to',
        path: ['appliedToInvoiceId'],
      });
    }
  });

interface RefundAccount {
  id: string;
  code: string;
  name: string;
}

export type CreditNoteFormData = z.infer<typeof creditNoteSchema>;

interface CreditNoteFormProps {
  defaultCustomerId?: string;
  defaultInvoiceId?: string;
  onSubmit: (data: CreditNoteFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function CreditNoteForm({
  defaultCustomerId,
  defaultInvoiceId,
  onSubmit,
  onCancel,
  isSubmitting,
}: CreditNoteFormProps) {
  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data || [];

  const form = useForm<CreditNoteFormData>({
    resolver: zodResolver(creditNoteSchema),
    defaultValues: {
      customerId: defaultCustomerId || '',
      invoiceId: defaultInvoiceId || '',
      date: new Date().toISOString().split('T')[0],
      type: 'REFUND',
      amount: '',
      reason: '',
      appliedToInvoiceId: '',
      refundAccountId: '',
    },
  });

  const t = useTranslations('sales');
  // Sales-authorized lookup of bank/cash accounts (the server enforces the same rule on create).
  const { data: refundAccountsData } = useQuery({
    queryKey: ['credit-notes', 'refund-accounts'],
    queryFn: async () => (await creditNotesApi.refundAccounts()).data as RefundAccount[],
  });
  const refundAccounts = refundAccountsData ?? [];

  const selectedCustomerId = form.watch('customerId');
  const selectedType = form.watch('type');
  const selectedInvoiceId = form.watch('invoiceId');

  // Fetch invoices for selected customer
  const { data: invoicesData } = useInvoices({
    customerId: selectedCustomerId || undefined,
    limit: 100,
  });
  const invoices = invoicesData?.data || [];

  // Filter for open invoices (to apply credit to)
  const openInvoices = invoices.filter(
    (inv: Invoice) =>
      inv.id !== selectedInvoiceId &&
      inv.status !== 'VOID' &&
      inv.status !== 'DRAFT' &&
      parseFloat(inv.balanceDue || '0') > 0,
  );

  // Get selected invoice details
  const selectedInvoice = invoices.find((inv: Invoice) => inv.id === selectedInvoiceId);

  // Set max amount based on selected invoice
  useEffect(() => {
    if (selectedInvoice && !form.getValues('amount')) {
      form.setValue('amount', selectedInvoice.grandTotal);
    }
  }, [selectedInvoice, form]);

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  const handleSubmit = (data: CreditNoteFormData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Customer & Invoice Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Note Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer *</Label>
              <Select
                value={form.watch('customerId')}
                onValueChange={(value) => {
                  form.setValue('customerId', value);
                  form.setValue('invoiceId', '');
                  form.setValue('appliedToInvoiceId', '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
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
                <p className="text-sm text-red-500">{form.formState.errors.customerId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceId">Original Invoice *</Label>
            <Select
              value={form.watch('invoiceId')}
              onValueChange={(value) => form.setValue('invoiceId', value)}
              disabled={!selectedCustomerId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={selectedCustomerId ? 'Select an invoice' : 'Select a customer first'}
                />
              </SelectTrigger>
              <SelectContent>
                {invoices
                  .filter((inv: Invoice) => inv.status !== 'VOID' && inv.status !== 'DRAFT')
                  .map((invoice: Invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - {formatCurrency(invoice.grandTotal)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {form.formState.errors.invoiceId && (
              <p className="text-sm text-red-500">{form.formState.errors.invoiceId.message}</p>
            )}
          </div>

          {selectedInvoice && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Invoice Total:</span>
                  <span className="ml-2 font-mono font-medium">
                    {formatCurrency(selectedInvoice.grandTotal)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Balance Due:</span>
                  <span className="ml-2 font-mono font-medium">
                    {formatCurrency(selectedInvoice.balanceDue)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Note Type */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as CreditNoteType)}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 p-4 border rounded-lg">
              <RadioGroupItem value="REFUND" id="refund" />
              <div>
                <Label htmlFor="refund" className="font-medium cursor-pointer">
                  {t('creditNotes.form.refundLabel')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  Issue a refund to the customer. The credit will reduce their account balance.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-4 border rounded-lg">
              <RadioGroupItem value="APPLY_TO_INVOICE" id="apply" />
              <div>
                <Label htmlFor="apply" className="font-medium cursor-pointer">
                  Apply to Invoice
                </Label>
                <p className="text-sm text-muted-foreground">
                  Apply the credit to another open invoice to reduce its balance.
                </p>
              </div>
            </div>
          </RadioGroup>

          {selectedType === 'REFUND' && (
            <div className="space-y-2 pt-4">
              <Label htmlFor="refundAccountId">Refund Paid From *</Label>
              <Select
                value={form.watch('refundAccountId') || ''}
                onValueChange={(value) =>
                  form.setValue('refundAccountId', value, { shouldValidate: true })
                }
                disabled={refundAccounts.length === 0}
              >
                <SelectTrigger id="refundAccountId">
                  <SelectValue
                    placeholder={
                      refundAccounts.length === 0
                        ? t('creditNotes.form.noRefundAccountOption')
                        : t('creditNotes.form.selectRefundAccount')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {refundAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {refundAccountsData && refundAccounts.length === 0 && (
                <p className="text-sm text-amber-600">{t('creditNotes.form.noRefundAccounts')}</p>
              )}
              {form.formState.errors.refundAccountId && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.refundAccountId.message}
                </p>
              )}
            </div>
          )}

          {selectedType === 'APPLY_TO_INVOICE' && (
            <div className="space-y-2 pt-4">
              <Label htmlFor="appliedToInvoiceId">Apply to Invoice *</Label>
              <Select
                value={form.watch('appliedToInvoiceId') || ''}
                onValueChange={(value) =>
                  form.setValue('appliedToInvoiceId', value, { shouldValidate: true })
                }
                disabled={!selectedCustomerId || openInvoices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      openInvoices.length === 0
                        ? t('creditNotes.form.noOpenInvoices')
                        : t('creditNotes.form.selectInvoiceToApply')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {openInvoices.map((invoice: Invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - Balance: {formatCurrency(invoice.balanceDue)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.appliedToInvoiceId && (
                <p className="text-sm text-red-500">{t('creditNotes.form.applyInvoiceRequired')}</p>
              )}
              {selectedType === 'APPLY_TO_INVOICE' && openInvoices.length === 0 && (
                <p className="text-sm text-amber-600">
                  No other open invoices available for this customer.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Amount & Reason */}
      <Card>
        <CardHeader>
          <CardTitle>Amount & Reason</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Credit Amount *</Label>
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
            {selectedInvoice && (
              <p className="text-sm text-muted-foreground">
                Maximum: {formatCurrency(selectedInvoice.grandTotal)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              placeholder="Reason for issuing this credit note..."
              rows={4}
              {...form.register('reason')}
            />
            {form.formState.errors.reason && (
              <p className="text-sm text-red-500">{form.formState.errors.reason.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Credit Note'}
        </Button>
      </div>
    </form>
  );
}
