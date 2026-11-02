'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Control,
  FieldValues,
  get,
  Path,
  UseFormReturn,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomerCombobox } from '@/components/shared/party-combobox';
import { LineErrors, LineItem, LineItemsForm, taxFieldsForPercent } from './line-items-form';

/**
 * The shared core of the invoice and quote forms: line schema, saved-line mapping and the frame
 * (customer and reference, lines editor, notes and terms, actions). Each form adds its own dates
 * and extra cards through slots; copy comes from the form's own `sales.<document>` namespace.
 */

export const salesLineSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1, 'descriptionRequired'),
  quantity: z.string().min(1, 'quantityRequired'),
  rate: z.string().min(1, 'rateRequired'),
  discountPercent: z.string().optional(),
  taxRateId: z.string().optional(),
  taxPercent: z.string().optional(),
  amount: z.string(),
});

export interface TaxRateOption {
  id: string;
  name: string;
  rate: number;
}

export const NO_TAX_RATES: TaxRateOption[] = [];

/** Props both document forms take besides the document itself. */
export interface SalesDocumentFormProps {
  customerId?: string;
  taxRates?: TaxRateOption[];
  /** State of the tax-rate lookup; a failed lookup blocks saving. */
  taxRatesStatus?: { isLoading: boolean; isError: boolean };
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/** The fields the frame reads; each document form's values extend these. */
interface SalesDocumentValues {
  customerId: string;
  reference?: string;
  notes?: string;
  terms?: string;
  lines: LineItem[];
}

interface SavedSalesLine {
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discountPercent?: string;
  discount?: string;
  taxRate?: string;
  taxRateId?: string;
  amount: string;
}

/** A new, empty line (one is always shown). */
export function blankSalesLine(): LineItem {
  return {
    itemId: '',
    description: '',
    quantity: '1',
    rate: '0',
    discountPercent: '0',
    taxRateId: '',
    amount: '0',
  };
}

/** Saved document lines as form lines; a stored percent maps back to its tax-rate option. */
export function toSalesFormLines(
  lines: SavedSalesLine[] | undefined,
  taxRates: TaxRateOption[],
): LineItem[] {
  return (
    lines?.map((line) => ({
      itemId: line.itemId || '',
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      discountPercent: line.discountPercent || line.discount || '0',
      ...(line.taxRateId
        ? { taxRateId: line.taxRateId }
        : taxFieldsForPercent(line.taxRate, taxRates)),
      amount: line.amount,
    })) || [blankSalesLine()]
  );
}

/** Translates a validation key from `namespace`; unknown messages pass through unchanged. */
export function useFieldError(namespace: string) {
  const t = useTranslations(namespace);
  return (message?: string) => (message ? (t.has(message) ? t(message) : message) : undefined);
}

type TranslateError = (message?: string) => string | undefined;

/** A required date input with its label and translated error; the input id is the field name. */
export function RequiredDateField<T extends FieldValues>({
  form,
  name,
  label,
  translate,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  translate: TranslateError;
}) {
  const error: { message?: string } | undefined = get(form.formState.errors, name);
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Input id={name} type="date" {...form.register(name)} />
      {error && <p className="text-sm text-destructive">{translate(error.message)}</p>}
    </div>
  );
}

interface SalesDocumentFrameProps<T extends SalesDocumentValues> {
  form: UseFormReturn<T>;
  /** `sales.invoices` or `sales.quotes`: the frame reads its `.form` copy. */
  namespace: string;
  isEditing: boolean;
  translateError: TranslateError;
  taxRates: TaxRateOption[];
  taxRatesStatus?: { isLoading: boolean; isError: boolean };
  /** The document's own currency; null means the org base currency, never the customer's (B5). */
  currency: string | null;
  referenceMaxLength?: number;
  /** Date (and other) fields under the customer and reference row. */
  details: ReactNode;
  /** Cards between the lines and the notes, such as charges and totals. */
  afterLines?: ReactNode;
  onValidSubmit: (data: T) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitLabel: string;
}

export function SalesDocumentFrame<T extends SalesDocumentValues>({
  form: typedForm,
  namespace,
  isEditing,
  translateError,
  taxRates,
  taxRatesStatus,
  currency,
  referenceMaxLength,
  details,
  afterLines,
  onValidSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: SalesDocumentFrameProps<T>) {
  const t = useTranslations(`${namespace}.form`);
  // The frame only touches the shared fields; the generic is for the caller's typing.
  const form = typedForm as unknown as UseFormReturn<SalesDocumentValues>;
  const customerError = form.formState.errors.customerId;

  const handleValid = (data: SalesDocumentValues) => {
    // Never save lines against a tax lookup that failed or has not finished.
    if (taxRatesStatus?.isError || taxRatesStatus?.isLoading) return;
    onValidSubmit(data as T);
  };

  return (
    <form onSubmit={form.handleSubmit(handleValid)} className="space-y-6">
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
              <CustomerCombobox
                id="customerId"
                value={form.watch('customerId')}
                onValueChange={(value) =>
                  form.setValue('customerId', value, { shouldValidate: form.formState.isSubmitted })
                }
                placeholder={t('customerPlaceholder')}
                disabled={isEditing}
                isInvalid={!!customerError}
              />
              {customerError && (
                <p className="text-sm text-destructive">{translateError(customerError.message)}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">{t('reference')}</Label>
              <Input
                id="reference"
                maxLength={referenceMaxLength}
                placeholder={t('referencePlaceholder')}
                {...form.register('reference')}
              />
            </div>
          </div>

          {details}
        </CardContent>
      </Card>

      <LineItemsForm
        control={form.control as unknown as Control<FieldValues>}
        watch={form.watch as unknown as UseFormWatch<FieldValues>}
        setValue={form.setValue as unknown as UseFormSetValue<FieldValues>}
        name="lines"
        taxRates={taxRates}
        taxRatesStatus={taxRatesStatus}
        currency={currency}
        showTax={true}
        showDiscount={true}
      />
      <LineErrors errors={form.formState.errors.lines} translate={translateError} />

      {afterLines}

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

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
