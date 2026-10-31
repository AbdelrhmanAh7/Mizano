'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AddressCard,
  AddressLabels,
  AddressValues,
  addressFromParty,
  addressSchema,
  emptyAddress,
} from '@/components/shared/address-fields';
import { Customer } from '@/lib/hooks/use-customers';
import { useBaseCurrency } from '@/lib/hooks/use-organization';

const customerSchema = z.object({
  name: z.string().min(1, 'nameRequired'),
  displayName: z.string().optional(),
  email: z.string().email('emailInvalid').optional().or(z.literal('')),
  phone: z.string().optional(),
  // Empty until the org base currency is known; the API then defaults it too (audit B5).
  currency: z.string().optional(),
  taxId: z.string().optional(),
  paymentTerms: z.number().optional(),
  notes: z.string().optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerFormProps {
  customer?: Customer | null;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/**
 * Builds a customer API payload from form data.
 * Returns a DTO-compliant object with nested address structures.
 * Omits empty optional fields to satisfy strict schema validation.
 */
export function buildCustomerPayload(data: CustomerFormData): Record<string, unknown> {
  const optional = (v?: string): string | undefined =>
    v && v.trim() !== '' ? v.trim() : undefined;

  const optionalNumber = (v?: number): number | undefined =>
    v !== undefined && v !== null ? v : undefined;

  const addressOrUndefined = (addr?: AddressValues) => {
    if (!addr) return undefined;
    const street = optional(addr.street);
    const city = optional(addr.city);
    const state = optional(addr.state);
    const postalCode = optional(addr.postalCode);
    const country = optional(addr.country);
    if (!street && !city && !state && !postalCode && !country) return undefined;
    return { street, city, state, postalCode, country };
  };

  return {
    name: data.name,
    displayName: optional(data.displayName),
    email: optional(data.email),
    phone: optional(data.phone),
    currency: optional(data.currency),
    taxId: optional(data.taxId),
    paymentTerms: optionalNumber(data.paymentTerms),
    notes: optional(data.notes),
    billingAddress: addressOrUndefined(data.billingAddress),
    shippingAddress: addressOrUndefined(data.shippingAddress),
  };
}

// Labels are keys under sales.customers.form.currencies and common.paymentTerms.
const currencies = ['USD', 'EUR', 'GBP', 'EGP', 'AED', 'SAR'] as const;

/** The listed currencies plus the org base currency and the saved one, base currency first. */
export function currencyOptions(
  baseCurrency: string | undefined,
  current: string | undefined,
): string[] {
  const codes = [baseCurrency, ...currencies, current].filter((c): c is string => !!c);
  return Array.from(new Set(codes));
}

const paymentTermsOptions = [
  { value: 0, labelKey: 'dueOnReceipt' },
  { value: 15, labelKey: 'net15' },
  { value: 30, labelKey: 'net30' },
  { value: 45, labelKey: 'net45' },
  { value: 60, labelKey: 'net60' },
];

export function CustomerForm({ customer, onSubmit, onCancel, isSubmitting }: CustomerFormProps) {
  const isEditing = !!customer;
  const t = useTranslations('sales.customers.form');
  const tValidation = useTranslations('sales.customers.validation');
  const tTerms = useTranslations('common.paymentTerms');
  const fieldError = (message?: string) =>
    message ? (tValidation.has(message) ? tValidation(message) : message) : undefined;

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      displayName: '',
      email: '',
      phone: '',
      currency: '',
      taxId: '',
      paymentTerms: 30,
      notes: '',
      billingAddress: emptyAddress(),
      shippingAddress: emptyAddress(),
    },
  });

  // A new customer starts in the org base currency, never USD; a choice already made stays.
  const baseCurrency = useBaseCurrency();
  useEffect(() => {
    if (!isEditing && baseCurrency && !form.getValues('currency')) {
      form.setValue('currency', baseCurrency);
    }
  }, [isEditing, baseCurrency, form]);

  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name || '',
        displayName: customer.displayName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        currency: customer.currency || '',
        taxId: customer.taxId || '',
        paymentTerms: customer.paymentTerms ?? 30,
        notes: customer.notes || '',
        billingAddress: addressFromParty(customer, 'billing'),
        shippingAddress: addressFromParty(customer, 'shipping'),
      });
    }
  }, [customer, form]);

  const handleSubmit = (data: CustomerFormData) => {
    const submitData = buildCustomerPayload(data);
    onSubmit(submitData);
  };

  const addressLabels: AddressLabels = {
    street: t('street'),
    streetPlaceholder: t('streetPlaceholder'),
    country: t('country'),
    city: t('city'),
    state: t('state'),
    statePlaceholder: t('statePlaceholder'),
    postalCode: t('postalCode'),
    postalCodePlaceholder: t('postalCodePlaceholder'),
  };

  const copyBillingToShipping = () => {
    const billing = form.getValues('billingAddress');
    form.setValue('shippingAddress', billing);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('basicInformation')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {t('name')} <span className="text-destructive">*</span>
              </Label>
              <Input id="name" placeholder={t('namePlaceholder')} {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.name.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">{t('displayName')}</Label>
              <Input
                id="displayName"
                placeholder={t('displayNameHint')}
                {...form.register('displayName')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="customer@example.com"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">
                  {fieldError(form.formState.errors.email.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('phone')}</Label>
              <PhoneInput
                id="phone"
                value={form.watch('phone') || ''}
                onChange={(val) => form.setValue('phone', val)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">{t('currency')}</Label>
              <Select
                value={form.watch('currency')}
                onValueChange={(value) => form.setValue('currency', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('currencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions(baseCurrency, form.watch('currency')).map((code) => (
                    <SelectItem key={code} value={code}>
                      {t.has(`currencies.${code}`) ? t(`currencies.${code}`) : code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentTerms">{t('paymentTerms')}</Label>
              <Select
                value={String(form.watch('paymentTerms') ?? 30)}
                onValueChange={(value) => form.setValue('paymentTerms', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('paymentTermsPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsOptions.map((term) => (
                    <SelectItem key={term.value} value={String(term.value)}>
                      {tTerms(term.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxId">{t('taxId')}</Label>
              <Input id="taxId" placeholder={t('taxIdHint')} {...form.register('taxId')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('notes')}</Label>
            <Textarea
              id="notes"
              placeholder={t('notesPlaceholder')}
              {...form.register('notes')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <AddressCard
        form={form}
        name="billingAddress"
        title={t('billingAddress')}
        labels={addressLabels}
      />
      <AddressCard
        form={form}
        name="shippingAddress"
        title={t('shippingAddress')}
        labels={addressLabels}
        action={
          <Button type="button" variant="outline" size="sm" onClick={copyBillingToShipping}>
            {t('copyFromBilling')}
          </Button>
        }
      />

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : isEditing ? t('updateCustomer') : t('createCustomer')}
        </Button>
      </div>
    </form>
  );
}
