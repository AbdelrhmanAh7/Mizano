'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhoneInput } from '@/components/ui/phone-input';
import { CountrySelect } from '@/components/ui/country-select';
import { CitySelect } from '@/components/ui/city-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Customer } from '@/lib/hooks/use-customers';

const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  displayName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  currency: z.string().default('USD'),
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

  const addressOrUndefined = (addr?: z.infer<typeof addressSchema>) => {
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
    currency: data.currency || 'USD',
    taxId: optional(data.taxId),
    paymentTerms: optionalNumber(data.paymentTerms),
    notes: optional(data.notes),
    billingAddress: addressOrUndefined(data.billingAddress),
    shippingAddress: addressOrUndefined(data.shippingAddress),
  };
}

const currencies = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'EGP', label: 'EGP - Egyptian Pound' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SAR', label: 'SAR - Saudi Riyal' },
];

const paymentTermsOptions = [
  { value: 0, label: 'Due on Receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
];

export function CustomerForm({ customer, onSubmit, onCancel, isSubmitting }: CustomerFormProps) {
  const isEditing = !!customer;
  const t = useTranslations('sales');
  const tc = useTranslations('common');

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      displayName: '',
      email: '',
      phone: '',
      currency: 'USD',
      taxId: '',
      paymentTerms: 30,
      notes: '',
      billingAddress: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
      shippingAddress: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
    },
  });

  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name || '',
        displayName: customer.displayName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        currency: customer.currency || 'USD',
        taxId: customer.taxId || '',
        paymentTerms: customer.paymentTerms || 30,
        notes: customer.notes || '',
        billingAddress: {
          street: customer.billingStreet || '',
          city: customer.billingCity || '',
          state: customer.billingState || '',
          postalCode: customer.billingPostalCode || '',
          country: customer.billingCountry || '',
        },
        shippingAddress: {
          street: customer.shippingStreet || '',
          city: customer.shippingCity || '',
          state: customer.shippingState || '',
          postalCode: customer.shippingPostalCode || '',
          country: customer.shippingCountry || '',
        },
      });
    }
  }, [customer, form]);

  const handleSubmit = (data: CustomerFormData) => {
    const submitData = buildCustomerPayload(data);
    onSubmit(submitData);
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
          <CardTitle>{t('customers.form.basicInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('customers.form.name')} *</Label>
              <Input
                id="name"
                aria-label={t('customers.form.name')}
                placeholder={t('customers.form.namePlaceholder')}
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">{t('customers.form.displayName')}</Label>
              <Input
                id="displayName"
                aria-label={t('customers.form.displayName')}
                placeholder={t('customers.form.displayNamePlaceholder')}
                {...form.register('displayName')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('customers.form.email')}</Label>
              <Input
                id="email"
                type="email"
                aria-label={t('customers.form.email')}
                placeholder={t('customers.form.emailPlaceholder')}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('customers.form.phone')}</Label>
              <PhoneInput
                id="phone"
                aria-label={t('customers.form.phone')}
                value={form.watch('phone') || ''}
                onChange={(val) => form.setValue('phone', val)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">{t('customers.form.currency')}</Label>
              <Select
                value={form.watch('currency')}
                onValueChange={(value) => form.setValue('currency', value)}
              >
                <SelectTrigger id="currency" aria-label={t('customers.form.currency')}>
                  <SelectValue placeholder={t('customers.form.currencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentTerms">{t('customers.form.paymentTerms')}</Label>
              <Select
                value={String(form.watch('paymentTerms') || 30)}
                onValueChange={(value) => form.setValue('paymentTerms', parseInt(value))}
              >
                <SelectTrigger id="paymentTerms" aria-label={t('customers.form.paymentTerms')}>
                  <SelectValue placeholder={t('customers.form.paymentTermsPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsOptions.map((term) => (
                    <SelectItem key={term.value} value={String(term.value)}>
                      {term.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxId">{t('customers.form.taxId')}</Label>
              <Input
                id="taxId"
                aria-label={t('customers.form.taxId')}
                placeholder={t('customers.form.taxIdPlaceholder')}
                {...form.register('taxId')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('customers.form.notes')}</Label>
            <Textarea
              id="notes"
              aria-label={t('customers.form.notes')}
              placeholder={t('customers.form.notesPlaceholder')}
              {...form.register('notes')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Billing Address */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customers.form.billingAddress')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="billingStreet">{t('customers.form.streetAddress')}</Label>
            <Textarea
              id="billingStreet"
              aria-label={t('customers.form.billingStreet')}
              placeholder={t('customers.form.streetPlaceholder')}
              {...form.register('billingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billingCountry">{t('customers.form.country')}</Label>
              <CountrySelect
                id="billingCountry"
                aria-label={t('customers.form.billingCountry')}
                placeholder={t('customers.form.countryPlaceholder')}
                value={form.watch('billingAddress.country') || ''}
                onValueChange={(val) => {
                  form.setValue('billingAddress.country', val);
                  form.setValue('billingAddress.city', '');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingCity">{t('customers.form.city')}</Label>
              <CitySelect
                id="billingCity"
                aria-label={t('customers.form.billingCity')}
                placeholder={t('customers.form.cityPlaceholder')}
                value={form.watch('billingAddress.city') || ''}
                onValueChange={(val) => form.setValue('billingAddress.city', val)}
                country={form.watch('billingAddress.country') || ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billingState">{t('customers.form.state')}</Label>
              <Input
                id="billingState"
                aria-label={t('customers.form.billingState')}
                placeholder={t('customers.form.statePlaceholder')}
                {...form.register('billingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingPostalCode">{t('customers.form.postalCode')}</Label>
              <Input
                id="billingPostalCode"
                aria-label={t('customers.form.billingPostalCode')}
                placeholder={t('customers.form.postalCodePlaceholder')}
                {...form.register('billingAddress.postalCode')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shipping Address */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('customers.form.shippingAddress')}</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyBillingToShipping}
              aria-label={t('customers.form.copyFromBilling')}
            >
              {t('customers.form.copyFromBilling')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shippingStreet">{t('customers.form.streetAddress')}</Label>
            <Textarea
              id="shippingStreet"
              aria-label={t('customers.form.shippingStreet')}
              placeholder={t('customers.form.streetPlaceholder')}
              {...form.register('shippingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shippingCountry">{t('customers.form.country')}</Label>
              <CountrySelect
                id="shippingCountry"
                aria-label={t('customers.form.shippingCountry')}
                placeholder={t('customers.form.countryPlaceholder')}
                value={form.watch('shippingAddress.country') || ''}
                onValueChange={(val) => {
                  form.setValue('shippingAddress.country', val);
                  form.setValue('shippingAddress.city', '');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shippingCity">{t('customers.form.city')}</Label>
              <CitySelect
                id="shippingCity"
                aria-label={t('customers.form.shippingCity')}
                placeholder={t('customers.form.cityPlaceholder')}
                value={form.watch('shippingAddress.city') || ''}
                onValueChange={(val) => form.setValue('shippingAddress.city', val)}
                country={form.watch('shippingAddress.country') || ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shippingState">{t('customers.form.state')}</Label>
              <Input
                id="shippingState"
                aria-label={t('customers.form.shippingState')}
                placeholder={t('customers.form.statePlaceholder')}
                {...form.register('shippingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shippingPostalCode">{t('customers.form.postalCode')}</Label>
              <Input
                id="shippingPostalCode"
                aria-label={t('customers.form.shippingPostalCode')}
                placeholder={t('customers.form.postalCodePlaceholder')}
                {...form.register('shippingAddress.postalCode')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          aria-label={tc('buttons.cancel')}
        >
          {tc('buttons.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          aria-label={
            isSubmitting
              ? tc('loading.saving')
              : isEditing
                ? t('customers.form.updateCustomer')
                : t('customers.form.createCustomer')
          }
        >
          {isSubmitting
            ? tc('loading.saving')
            : isEditing
              ? t('customers.form.updateCustomer')
              : t('customers.form.createCustomer')}
        </Button>
      </div>
    </form>
  );
}
