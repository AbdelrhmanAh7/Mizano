'use client';

import { format } from 'date-fns';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Quote } from '@/lib/hooks/use-quotes';
import { toApiLines } from './line-items-form';
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

const quoteSchema = z.object({
  customerId: z.string().min(1, 'customerRequired'),
  quoteDate: z.string().min(1, 'dateRequired'),
  expiryDate: z.string().min(1, 'expiryDateRequired'),
  reference: z.string().optional(),
  subject: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  lines: z.array(salesLineSchema).min(1, 'lineItemRequired'),
});

type QuoteFormData = z.infer<typeof quoteSchema>;

interface QuoteFormProps extends SalesDocumentFormProps {
  quote?: Quote | null;
}

export function QuoteForm({
  quote,
  customerId,
  taxRates = NO_TAX_RATES,
  taxRatesStatus,
  onSubmit,
  onCancel,
  isSubmitting,
}: QuoteFormProps) {
  const isEditing = !!quote;
  const t = useTranslations('sales.quotes.form');
  const fieldError = useFieldError('sales.quotes.validation');

  // Default dates
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultExpiry = new Date();
  defaultExpiry.setDate(defaultExpiry.getDate() + 30);
  const expiryDate = format(defaultExpiry, 'yyyy-MM-dd');

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      customerId: customerId || '',
      quoteDate: today,
      expiryDate: expiryDate,
      reference: '',
      subject: '',
      notes: '',
      terms: '',
      lines: [blankSalesLine()],
    },
  });

  useEffect(() => {
    if (quote) {
      form.reset({
        customerId: quote.customerId,
        quoteDate: quote.date.split('T')[0],
        expiryDate: quote.expiryDate.split('T')[0],
        reference: quote.reference || '',
        subject: quote.subject || '',
        notes: quote.notes || '',
        terms: quote.terms || '',
        lines: toSalesFormLines(quote.lines, taxRates),
      });
    }
  }, [quote, form, taxRates]);

  const handleSubmit = (data: QuoteFormData) => {
    // Exactly the CreateQuoteDto shape: totals are computed by the server from the lines.
    onSubmit({
      customerId: data.customerId,
      date: data.quoteDate,
      expiryDate: data.expiryDate,
      notes: data.notes || undefined,
      terms: data.terms || undefined,
      lines: toApiLines(data.lines, taxRates),
    });
  };

  return (
    <SalesDocumentFrame
      form={form}
      namespace="sales.quotes"
      isEditing={isEditing}
      translateError={fieldError}
      taxRates={taxRates}
      taxRatesStatus={taxRatesStatus}
      // The quote's own currency, else the org base currency; never the customer's (B5).
      currency={quote?.currencyCode ?? null}
      onValidSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      submitLabel={isEditing ? t('updateQuote') : t('createQuote')}
      details={
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RequiredDateField
              form={form}
              name="quoteDate"
              label={t('date')}
              translate={fieldError}
            />
            <RequiredDateField
              form={form}
              name="expiryDate"
              label={t('expiryDate')}
              translate={fieldError}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{t('subject')}</Label>
            <Input
              id="subject"
              placeholder={t('subjectPlaceholder')}
              {...form.register('subject')}
            />
          </div>
        </>
      }
    />
  );
}
