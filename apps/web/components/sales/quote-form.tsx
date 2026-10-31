'use client';

import { format } from 'date-fns';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, Control, FieldValues, UseFormWatch, UseFormSetValue } from 'react-hook-form';
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
import { useCustomers, Customer } from '@/lib/hooks/use-customers';
import { Quote } from '@/lib/hooks/use-quotes';
import { LineErrors, LineItemsForm, taxFieldsForPercent, toApiLines } from './line-items-form';

const lineItemSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1, 'descriptionRequired'),
  quantity: z.string().min(1, 'quantityRequired'),
  rate: z.string().min(1, 'rateRequired'),
  discountPercent: z.string().optional(),
  taxRateId: z.string().optional(),
  taxPercent: z.string().optional(),
  amount: z.string(),
});

const quoteSchema = z.object({
  customerId: z.string().min(1, 'customerRequired'),
  quoteDate: z.string().min(1, 'dateRequired'),
  expiryDate: z.string().min(1, 'expiryDateRequired'),
  reference: z.string().optional(),
  subject: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  lines: z.array(lineItemSchema).min(1, 'lineItemRequired'),
});

type QuoteFormData = z.infer<typeof quoteSchema>;

const NO_TAX_RATES: { id: string; name: string; rate: number }[] = [];

interface QuoteFormProps {
  quote?: Quote | null;
  customerId?: string;
  taxRates?: { id: string; name: string; rate: number }[];
  /** State of the tax-rate lookup; a failed lookup blocks saving. */
  taxRatesStatus?: { isLoading: boolean; isError: boolean };
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
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
  const tValidation = useTranslations('sales.quotes.validation');
  const fieldError = (message?: string) =>
    message ? (tValidation.has(message) ? tValidation(message) : message) : undefined;
  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data || [];

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
      lines: [
        {
          itemId: '',
          description: '',
          quantity: '1',
          rate: '0',
          discountPercent: '0',
          taxRateId: '',
          amount: '0',
        },
      ],
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
        lines: quote.lines?.map((line) => ({
          itemId: line.itemId || '',
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          discountPercent: line.discountPercent || line.discount || '0',
          ...(line.taxRateId
            ? { taxRateId: line.taxRateId }
            : taxFieldsForPercent(line.taxRate, taxRates)),
          amount: line.amount,
        })) || [
          {
            itemId: '',
            description: '',
            quantity: '1',
            rate: '0',
            discountPercent: '0',
            taxRateId: '',
            amount: '0',
          },
        ],
      });
    }
  }, [quote, form, taxRates]);

  const handleSubmit = (data: QuoteFormData) => {
    // Never save lines against a tax lookup that failed or has not finished.
    if (taxRatesStatus?.isError || taxRatesStatus?.isLoading) return;
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
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Quote Details */}
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
                onValueChange={(value) => form.setValue('customerId', value)}
                disabled={isEditing}
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
              <Label htmlFor="reference">{t('reference')}</Label>
              <Input
                id="reference"
                placeholder={t('referencePlaceholder')}
                {...form.register('reference')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quoteDate">
                {t('date')} <span className="text-destructive">*</span>
              </Label>
              <Input id="quoteDate" type="date" {...form.register('quoteDate')} />
              {form.formState.errors.quoteDate && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.quoteDate.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiryDate">
                {t('expiryDate')} <span className="text-destructive">*</span>
              </Label>
              <Input id="expiryDate" type="date" {...form.register('expiryDate')} />
              {form.formState.errors.expiryDate && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.expiryDate.message)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{t('subject')}</Label>
            <Input
              id="subject"
              placeholder={t('subjectPlaceholder')}
              {...form.register('subject')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <LineItemsForm
        control={form.control as unknown as Control<FieldValues>}
        watch={form.watch as unknown as UseFormWatch<FieldValues>}
        setValue={form.setValue as unknown as UseFormSetValue<FieldValues>}
        name="lines"
        taxRates={taxRates}
        taxRatesStatus={taxRatesStatus}
        // The quote's own currency, else the org base currency; never the customer's (B5).
        currency={quote?.currencyCode ?? null}
        showTax={true}
        showDiscount={true}
      />
      <LineErrors errors={form.formState.errors.lines} translate={fieldError} />

      {/* Notes & Terms */}
      <Card>
        <CardHeader>
          <CardTitle>{t('notesAndTerms')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">{t('customerNotes')}</Label>
            <Textarea
              id="notes"
              placeholder={t('customerNotesPlaceholder')}
              {...form.register('notes')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">{t('terms')}</Label>
            <Textarea
              id="terms"
              placeholder={t('termsPlaceholder')}
              {...form.register('terms')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : isEditing ? t('updateQuote') : t('createQuote')}
        </Button>
      </div>
    </form>
  );
}
