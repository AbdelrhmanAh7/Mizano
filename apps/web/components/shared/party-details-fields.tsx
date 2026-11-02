'use client';

import { useTranslations } from 'next-intl';
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Payment terms in days; labels are keys of common.paymentTerms. 0 is "Due on Receipt". */
const PAYMENT_TERMS = [
  { value: 0, labelKey: 'dueOnReceipt' },
  { value: 15, labelKey: 'net15' },
  { value: 30, labelKey: 'net30' },
  { value: 45, labelKey: 'net45' },
  { value: 60, labelKey: 'net60' },
];

type PartyField =
  | 'name'
  | 'displayName'
  | 'email'
  | 'phone'
  | 'currency'
  | 'paymentTerms'
  | 'taxId';

interface PartyDetailsFieldsProps<T extends FieldValues> {
  /** A customer or vendor form with the fields above (`paymentTerms` in days). */
  form: UseFormReturn<T>;
  /** Form namespace with the field labels, placeholders and hints, e.g. `purchases.vendors.form`. */
  namespace: string;
  /** Currency choices, labelled in the page language. */
  currencies: { code: string; label: string }[];
  emailPlaceholder: string;
  /** Translates a schema error key; unknown messages pass through. */
  errorText: (message?: string) => string | undefined;
}

/**
 * The detail rows shared by the customer and vendor forms: name and display name, email and
 * phone, currency, payment terms and tax id.
 */
export function PartyDetailsFields<T extends FieldValues>({
  form,
  namespace,
  currencies,
  emailPlaceholder,
  errorText,
}: PartyDetailsFieldsProps<T>): JSX.Element {
  const t = useTranslations(namespace);
  const tTerms = useTranslations('common.paymentTerms');
  const path = (field: PartyField) => field as Path<T>;
  const set = (field: PartyField, value: string | number) =>
    form.setValue(path(field), value as PathValue<T, Path<T>>);
  const errorOf = (field: PartyField) =>
    errorText(form.getFieldState(path(field), form.formState).error?.message);
  const nameError = errorOf('name');
  const emailError = errorOf('email');

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            {t('name')} <span className="text-destructive">*</span>
          </Label>
          <Input id="name" placeholder={t('namePlaceholder')} {...form.register(path('name'))} />
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">{t('displayName')}</Label>
          <Input
            id="displayName"
            placeholder={t('displayNameHint')}
            {...form.register(path('displayName'))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder={emailPlaceholder}
            {...form.register(path('email'))}
          />
          {emailError && <p className="text-sm text-destructive">{emailError}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <PhoneInput
            id="phone"
            value={(form.watch(path('phone')) as string | undefined) || ''}
            onChange={(val) => set('phone', val)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="currency">{t('currency')}</Label>
          {/* Radix Select emits '' for a value missing from its options: ignore it. */}
          <Select
            value={form.watch(path('currency')) as string | undefined}
            onValueChange={(value) => value && set('currency', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('currencyPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {currencies.map(({ code, label }) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paymentTerms">{t('paymentTerms')}</Label>
          <Select
            value={String((form.watch(path('paymentTerms')) as number | undefined) ?? 30)}
            onValueChange={(value) => value && set('paymentTerms', parseInt(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('paymentTermsPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS.map((term) => (
                <SelectItem key={term.value} value={String(term.value)}>
                  {tTerms(term.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxId">{t('taxId')}</Label>
          <Input id="taxId" placeholder={t('taxIdHint')} {...form.register(path('taxId'))} />
        </div>
      </div>
    </>
  );
}
