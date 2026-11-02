'use client';

import { format } from 'date-fns';
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
import { CustomerCombobox } from '@/components/shared/party-combobox';
import { useInvoices, Invoice } from '@/lib/hooks/use-invoices';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { creditNotesApi } from '@/lib/api';
import { CreditNoteType } from '@/lib/hooks/use-credit-notes';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';

const creditNoteSchema = z
  .object({
    customerId: z.string().min(1, 'customerRequired'),
    invoiceId: z.string().min(1, 'invoiceRequired'),
    date: z.string().min(1, 'dateRequired'),
    type: z.enum(['REFUND', 'APPLY_TO_INVOICE']),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,15}(\.\d{1,4})?$/, 'amountInvalid'),
    reason: z.string().trim().min(1, 'reasonRequired').max(500),
    appliedToInvoiceId: z.string().optional(),
    refundAccountId: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'REFUND' && !v.refundAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'refundAccountRequired',
        path: ['refundAccountId'],
      });
    }
    // No silent default: applying a credit needs an explicit target invoice.
    if (v.type === 'APPLY_TO_INVOICE' && !v.appliedToInvoiceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'applyInvoiceRequired',
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
  const form = useForm<CreditNoteFormData>({
    resolver: zodResolver(creditNoteSchema),
    defaultValues: {
      customerId: defaultCustomerId || '',
      invoiceId: defaultInvoiceId || '',
      date: format(new Date(), 'yyyy-MM-dd'),
      type: 'REFUND',
      amount: '',
      reason: '',
      appliedToInvoiceId: '',
      refundAccountId: '',
    },
  });

  const t = useTranslations('sales');
  const tForm = useTranslations('sales.creditNotes.form');
  /** Schema messages are keys of sales.creditNotes.form. */
  const errorText = (message?: string): string | undefined =>
    message && tForm.has(message) ? tForm(message) : message;
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

  // Open invoices to apply the credit to: every one of the customer's, from the server (B11),
  // including the original invoice (the API's default target) listed first. Excluding it made the
  // usual case, crediting the still-open invoice itself, impossible from the form.
  const { data: openInvoicesData } = useInvoices({
    customerId: selectedCustomerId || undefined,
    open: true,
    sortBy: 'dueDate',
    sortOrder: 'asc',
    limit: 500,
  });
  const openInvoices = [...(openInvoicesData?.data || [])].sort(
    (a: Invoice, b: Invoice) =>
      Number(b.id === selectedInvoiceId) - Number(a.id === selectedInvoiceId),
  );

  // Get selected invoice details
  const selectedInvoice = invoices.find((inv: Invoice) => inv.id === selectedInvoiceId);

  // Set max amount based on selected invoice
  useEffect(() => {
    if (selectedInvoice && !form.getValues('amount')) {
      form.setValue('amount', selectedInvoice.grandTotal);
    }
  }, [selectedInvoice, form]);

  // Invoice amounts in the invoice's own currency, else the org base currency (audit B5).
  const formatMoney = useMoneyFormatter();
  const formatCurrency = (amount: string | number) =>
    formatMoney(amount, selectedInvoice?.currencyCode);

  const handleSubmit = (data: CreditNoteFormData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Customer & Invoice Selection */}
      <Card>
        <CardHeader>
          <CardTitle>{tForm('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerId">
                {t('creditNotes.form.customer')} <span className="text-destructive">*</span>
              </Label>
              <CustomerCombobox
                id="customerId"
                value={form.watch('customerId')}
                onValueChange={(value) => {
                  form.setValue('customerId', value, {
                    shouldValidate: form.formState.isSubmitted,
                  });
                  form.setValue('invoiceId', '');
                  form.setValue('appliedToInvoiceId', '');
                }}
                placeholder={t('creditNotes.form.customerPlaceholder')}
                isInvalid={!!form.formState.errors.customerId}
              />
              {form.formState.errors.customerId && (
                <p className="text-sm text-destructive">
                  {errorText(form.formState.errors.customerId.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">{tForm('date')} *</Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-destructive">
                  {errorText(form.formState.errors.date.message)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceId">{tForm('originalInvoice')} *</Label>
            <Select
              value={form.watch('invoiceId')}
              onValueChange={(value) => form.setValue('invoiceId', value)}
              disabled={!selectedCustomerId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    selectedCustomerId ? tForm('selectInvoice') : tForm('selectCustomerFirst')
                  }
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
              <p className="text-sm text-destructive">
                {errorText(form.formState.errors.invoiceId.message)}
              </p>
            )}
          </div>

          {selectedInvoice && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{tForm('invoiceTotal')}</span>
                  <span className="ms-2 font-mono font-medium">
                    {formatCurrency(selectedInvoice.grandTotal)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{tForm('balanceDue')}</span>
                  <span className="ms-2 font-mono font-medium">
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
          <CardTitle>{tForm('creditType')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={form.watch('type')}
            onValueChange={(value) => form.setValue('type', value as CreditNoteType)}
            className="space-y-3"
          >
            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <RadioGroupItem value="REFUND" id="refund" />
              <div>
                <Label htmlFor="refund" className="font-medium cursor-pointer">
                  {t('creditNotes.form.refundLabel')}
                </Label>
                <p className="text-sm text-muted-foreground">{tForm('refundDescription')}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 border rounded-lg">
              <RadioGroupItem value="APPLY_TO_INVOICE" id="apply" />
              <div>
                <Label htmlFor="apply" className="font-medium cursor-pointer">
                  {tForm('applyToInvoice')}
                </Label>
                <p className="text-sm text-muted-foreground">{tForm('applyDescription')}</p>
              </div>
            </div>
          </RadioGroup>

          {selectedType === 'REFUND' && (
            <div className="space-y-2 pt-4">
              <Label htmlFor="refundAccountId">{tForm('refundPaidFrom')} *</Label>
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
                <p className="text-sm text-warning">{t('creditNotes.form.noRefundAccounts')}</p>
              )}
              {form.formState.errors.refundAccountId && (
                <p className="text-sm text-destructive">
                  {errorText(form.formState.errors.refundAccountId.message)}
                </p>
              )}
            </div>
          )}

          {selectedType === 'APPLY_TO_INVOICE' && (
            <div className="space-y-2 pt-4">
              <Label htmlFor="appliedToInvoiceId">{tForm('applyToInvoice')} *</Label>
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
                      {tForm('invoiceBalance', {
                        number: invoice.invoiceNumber,
                        amount: formatCurrency(invoice.balanceDue),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.appliedToInvoiceId && (
                <p className="text-sm text-destructive">
                  {t('creditNotes.form.applyInvoiceRequired')}
                </p>
              )}
              {selectedType === 'APPLY_TO_INVOICE' && openInvoices.length === 0 && (
                <p className="text-sm text-warning">{tForm('noOpenInvoicesForCustomer')}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Amount & Reason */}
      <Card>
        <CardHeader>
          <CardTitle>{tForm('amountReason')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">{tForm('creditAmount')} *</Label>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              {...form.register('amount')}
            />
            {form.formState.errors.amount && (
              <p className="text-sm text-destructive">
                {errorText(form.formState.errors.amount.message)}
              </p>
            )}
            {selectedInvoice && (
              <p className="text-sm text-muted-foreground">
                {tForm('maximum', { amount: formatCurrency(selectedInvoice.grandTotal) })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">{tForm('reason')} *</Label>
            <Textarea
              id="reason"
              placeholder={tForm('reasonPlaceholder')}
              rows={4}
              {...form.register('reason')}
            />
            {form.formState.errors.reason && (
              <p className="text-sm text-destructive">
                {errorText(form.formState.errors.reason.message)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {tForm('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? tForm('creating') : tForm('submit')}
        </Button>
      </div>
    </form>
  );
}
