'use client';

import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomer } from '@/lib/hooks/use-customers';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { Invoice } from '@/lib/hooks/use-invoices';
import { calculateLineTotals, toApiLines } from './line-items-form';
import {
  blankSalesLine,
  NO_TAX_RATES,
  RequiredDateField,
  SalesDocumentFormProps,
  SalesDocumentFrame,
  salesLineSchema,
  toSalesFormLines,
  useFieldError,
} from './sales-document-form';

const invoiceSchema = z.object({
  customerId: z.string().min(1, 'customerRequired'),
  invoiceDate: z.string().min(1, 'dateRequired'),
  dueDate: z.string().min(1, 'dueDateRequired'),
  reference: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  shippingCharge: z.string().optional(),
  lines: z.array(salesLineSchema).min(1, 'lineItemRequired'),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps extends SalesDocumentFormProps {
  invoice?: Invoice | null;
}

// Labels are keys under common.paymentTerms.
const paymentTermsOptions = [
  { value: 'DUE_ON_RECEIPT', labelKey: 'dueOnReceipt', days: 0 },
  { value: 'NET_15', labelKey: 'net15', days: 15 },
  { value: 'NET_30', labelKey: 'net30', days: 30 },
  { value: 'NET_45', labelKey: 'net45', days: 45 },
  { value: 'NET_60', labelKey: 'net60', days: 60 },
];

/**
 * The payment-terms option a saved invoice was issued on, derived from its two dates (the terms
 * are not stored separately), or '' when the due date was set by hand to another number of days.
 */
export function paymentTermsFor(date: string, dueDate: string): string {
  const days = differenceInCalendarDays(parseISO(dueDate), parseISO(date));
  return paymentTermsOptions.find((term) => term.days === days)?.value ?? '';
}

export function InvoiceForm({
  invoice,
  customerId,
  taxRates = NO_TAX_RATES,
  taxRatesStatus,
  onSubmit,
  onCancel,
  isSubmitting,
}: InvoiceFormProps) {
  const isEditing = !!invoice;
  const t = useTranslations('sales.invoices.form');
  const tTerms = useTranslations('common.paymentTerms');
  const fieldError = useFieldError('sales.invoices.validation');
  // The server posts invoices in their own currency, else the org base currency: preview in the
  // same, never the customer's default (audit B5, review-lessons §11).
  const formatMoney = useMoneyFormatter();
  const documentCurrencyCode = invoice?.currencyCode ?? null;

  // Default dates
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 30);
  const dueDate = format(defaultDue, 'yyyy-MM-dd');

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customerId: customerId || '',
      invoiceDate: today,
      dueDate: dueDate,
      reference: '',
      paymentTerms: 'NET_30',
      notes: '',
      terms: '',
      shippingCharge: '0',
      lines: [blankSalesLine()],
    },
  });

  useEffect(() => {
    if (invoice) {
      form.reset({
        customerId: invoice.customerId,
        invoiceDate: invoice.date.split('T')[0],
        dueDate: invoice.dueDate.split('T')[0],
        reference: invoice.reference || '',
        paymentTerms: paymentTermsFor(invoice.date.split('T')[0], invoice.dueDate.split('T')[0]),
        notes: invoice.notes || '',
        terms: invoice.terms || '',
        shippingCharge: invoice.shippingAmount || '0',
        lines: toSalesFormLines(invoice.lines, taxRates),
      });
    }
  }, [invoice, form, taxRates]);

  // Fetched by id, so any customer works, not only the first page (audit B11).
  const selectedCustomerId = form.watch('customerId');
  const { data: selectedCustomer } = useCustomer(selectedCustomerId || undefined);

  // Update due date when payment terms change
  const handlePaymentTermsChange = (value: string) => {
    form.setValue('paymentTerms', value);
    const term = paymentTermsOptions.find((t) => t.value === value);
    if (term) {
      const invoiceDate = parseISO(form.watch('invoiceDate'));
      invoiceDate.setDate(invoiceDate.getDate() + term.days);
      form.setValue('dueDate', format(invoiceDate, 'yyyy-MM-dd'));
    }
  };

  // Auto-fill payment terms from customer
  useEffect(() => {
    // 0 days is "due on receipt", not "no terms".
    if (selectedCustomer && selectedCustomer.paymentTerms != null && !isEditing) {
      // Customer paymentTerms is a number (days), convert to form value
      const days = selectedCustomer.paymentTerms;
      if (days === 0) {
        handlePaymentTermsChange('DUE_ON_RECEIPT');
      } else if (days === 15) {
        handlePaymentTermsChange('NET_15');
      } else if (days === 30) {
        handlePaymentTermsChange('NET_30');
      } else if (days === 45) {
        handlePaymentTermsChange('NET_45');
      } else if (days === 60) {
        handlePaymentTermsChange('NET_60');
      } else {
        // For custom terms, just set the due date based on days
        const invoiceDate = parseISO(form.watch('invoiceDate'));
        invoiceDate.setDate(invoiceDate.getDate() + days);
        form.setValue('dueDate', format(invoiceDate, 'yyyy-MM-dd'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer]);

  const handleSubmit = (data: InvoiceFormData) => {
    // Exactly the CreateInvoiceDto shape: totals are computed by the server from the lines.
    onSubmit({
      customerId: data.customerId,
      date: data.invoiceDate,
      dueDate: data.dueDate,
      // Null clears a reference removed while editing; the API trims and stores '' as none.
      reference: data.reference?.trim() || (isEditing ? null : undefined),
      notes: data.notes || undefined,
      terms: data.terms || undefined,
      shippingAmount: data.shippingCharge?.trim() || '0',
      lines: toApiLines(data.lines, taxRates),
    });
  };

  const lines = form.watch('lines');
  const totals = calculateLineTotals(lines, taxRates);
  const shipping = parseFloat(form.watch('shippingCharge') || '0') || 0;
  const grandTotal = totals.grandTotal + shipping;

  return (
    <SalesDocumentFrame
      form={form}
      namespace="sales.invoices"
      isEditing={isEditing}
      translateError={fieldError}
      taxRates={taxRates}
      taxRatesStatus={taxRatesStatus}
      currency={documentCurrencyCode}
      referenceMaxLength={100}
      onValidSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      submitLabel={isEditing ? t('updateInvoice') : t('createInvoice')}
      details={
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RequiredDateField
            form={form}
            name="invoiceDate"
            label={t('date')}
            translate={fieldError}
          />

          <div className="space-y-2">
            <Label htmlFor="paymentTerms">{t('paymentTerms')}</Label>
            <Select
              value={form.watch('paymentTerms') || ''}
              onValueChange={handlePaymentTermsChange}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('paymentTermsPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {paymentTermsOptions.map((term) => (
                  <SelectItem key={term.value} value={term.value}>
                    {tTerms(term.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <RequiredDateField
            form={form}
            name="dueDate"
            label={t('dueDate')}
            translate={fieldError}
          />
        </div>
      }
      afterLines={
        <Card>
          <CardHeader>
            <CardTitle>{t('chargesAndTotals')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-4">
                <Label htmlFor="shippingCharge" className="text-end">
                  {t('shippingAndHandling')}
                </Label>
                <Input
                  id="shippingCharge"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-32 text-end"
                  placeholder="0.00"
                  {...form.register('shippingCharge')}
                />
              </div>
              <div className="border-t pt-4 mt-2 w-64">
                <div className="flex justify-between text-lg font-semibold">
                  <span>{t('grandTotal')}</span>
                  <span className="font-mono">{formatMoney(grandTotal, documentCurrencyCode)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      }
    />
  );
}
