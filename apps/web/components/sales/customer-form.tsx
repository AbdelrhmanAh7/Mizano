'use client';

import { useEffect, useMemo } from 'react';
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

type Translate = (key: 'nameRequired' | 'invalidEmail') => string;

const buildCustomerSchema = (t: Translate) =>
  z.object({
    name: z.string().min(1, t('nameRequired')),
    displayName: z.string().optional(),
    email: z.string().email(t('invalidEmail')).optional().or(z.literal('')),
    phone: z.string().optional(),
    currency: z.string().default('USD'),
    taxId: z.string().optional(),
    paymentTerms: z.number().optional(),
    notes: z.string().optional(),
    billingAddress: addressSchema.optional(),
    shippingAddress: addressSchema.optional(),
  });

type CustomerFormData = z.infer<ReturnType<typeof buildCustomerSchema>>;

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

const currencyCodes = ['USD', 'EUR', 'GBP', 'EGP', 'AED', 'SAR'];

const paymentTermsDays = [0, 15, 30, 45, 60];

export function CustomerForm({ customer, onSubmit, onCancel, isSubmitting }: CustomerFormProps) {
  const isEditing = !!customer;
  const t = useTranslations('sales.customers.form');
  const customerSchema = useMemo(() => buildCustomerSchema(t), [t]);

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
          <CardTitle>{t('basicInformation')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('name')} *</Label>
              <Input id="name" placeholder={t('namePlaceholder')} {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
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
                <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
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
                  <SelectValue placeholder={t('selectCurrency')} />
                </SelectTrigger>
                <SelectContent>
                  {currencyCodes.map((code) => (
                    <SelectItem key={code} value={code}>
                      {t(`currencies.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentTerms">{t('paymentTerms')}</Label>
              <Select
                value={String(form.watch('paymentTerms') || 30)}
                onValueChange={(value) => form.setValue('paymentTerms', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectPaymentTerms')} />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsDays.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days === 0 ? t('dueOnReceipt') : t('netDays', { days })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxId">{t('taxId')}</Label>
              <Input id="taxId" placeholder={t('taxIdPlaceholder')} {...form.register('taxId')} />
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

      {/* Billing Address */}
      <Card>
        <CardHeader>
          <CardTitle>{t('billingAddress')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="billingStreet">{t('streetAddress')}</Label>
            <Textarea
              id="billingStreet"
              placeholder={t('streetPlaceholder')}
              {...form.register('billingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billingCountry">{t('country')}</Label>
              <CountrySelect
                id="billingCountry"
                value={form.watch('billingAddress.country') || ''}
                onValueChange={(val) => {
                  form.setValue('billingAddress.country', val);
                  form.setValue('billingAddress.city', '');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingCity">{t('city')}</Label>
              <CitySelect
                id="billingCity"
                value={form.watch('billingAddress.city') || ''}
                onValueChange={(val) => form.setValue('billingAddress.city', val)}
                country={form.watch('billingAddress.country') || ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billingState">{t('state')}</Label>
              <Input
                id="billingState"
                placeholder={t('statePlaceholder')}
                {...form.register('billingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingPostalCode">{t('postalCode')}</Label>
              <Input
                id="billingPostalCode"
                placeholder={t('postalCodePlaceholder')}
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
            <CardTitle>{t('shippingAddress')}</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={copyBillingToShipping}>
              {t('copyFromBilling')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shippingStreet">{t('streetAddress')}</Label>
            <Textarea
              id="shippingStreet"
              placeholder={t('streetPlaceholder')}
              {...form.register('shippingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shippingCountry">{t('country')}</Label>
              <CountrySelect
                id="shippingCountry"
                value={form.watch('shippingAddress.country') || ''}
                onValueChange={(val) => {
                  form.setValue('shippingAddress.country', val);
                  form.setValue('shippingAddress.city', '');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shippingCity">{t('city')}</Label>
              <CitySelect
                id="shippingCity"
                value={form.watch('shippingAddress.city') || ''}
                onValueChange={(val) => form.setValue('shippingAddress.city', val)}
                country={form.watch('shippingAddress.country') || ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shippingState">{t('state')}</Label>
              <Input
                id="shippingState"
                placeholder={t('statePlaceholder')}
                {...form.register('shippingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shippingPostalCode">{t('postalCode')}</Label>
              <Input
                id="shippingPostalCode"
                placeholder={t('postalCodePlaceholder')}
                {...form.register('shippingAddress.postalCode')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : isEditing ? t('update') : t('create')}
        </Button>
      </div>
    </form>
  );
}
