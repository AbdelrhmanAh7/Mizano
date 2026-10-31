'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AddressCard,
  AddressLabels,
  addressFromParty,
  addressSchema,
  emptyAddress,
} from '@/components/shared/address-fields';
import { Vendor } from '@/lib/hooks/use-vendors';
import { useBaseCurrency } from '@/lib/hooks/use-organization';
import { useLocale, useTranslations } from 'next-intl';

const vendorSchema = z.object({
  // Messages are keys of purchases.vendors.form.
  name: z.string().min(1, 'nameRequired'),
  displayName: z.string().optional(),
  email: z.string().email('invalidEmail').optional().or(z.literal('')),
  phone: z.string().optional(),
  currency: z.string(),
  taxId: z.string().optional(),
  paymentTerms: z.number().optional(),
  billingAddress: addressSchema.optional(),
});

type VendorFormData = z.infer<typeof vendorSchema>;

interface VendorFormProps {
  vendor?: Vendor | null;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/** Currencies offered for a vendor; names come from Intl in the page language. */
const CURRENCY_CODES = ['EGP', 'SAR', 'AED', 'USD', 'EUR', 'GBP'];

const paymentTermsOptions = [
  { value: 0, labelKey: 'dueOnReceipt' },
  { value: 15, labelKey: 'net15' },
  { value: 30, labelKey: 'net30' },
  { value: 45, labelKey: 'net45' },
  { value: 60, labelKey: 'net60' },
];

export function VendorForm({ vendor, onSubmit, onCancel, isSubmitting }: VendorFormProps) {
  const isEditing = !!vendor;
  const t = useTranslations('purchases.vendors.form');
  const tTerms = useTranslations('common.paymentTerms');
  const locale = useLocale();
  const currencyNames = new Intl.DisplayNames([locale], { type: 'currency' });
  const errorText = (message?: string): string | undefined =>
    message && t.has(message) ? t(message) : message;
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

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: '',
      displayName: '',
      email: '',
      phone: '',
      currency: '',
      taxId: '',
      paymentTerms: 30,
      billingAddress: emptyAddress(),
    },
  });

  // A new vendor starts in the org base currency, never USD; a choice already made stays.
  const baseCurrency = useBaseCurrency();
  useEffect(() => {
    if (!isEditing && baseCurrency && !form.getValues('currency')) {
      form.setValue('currency', baseCurrency);
    }
  }, [isEditing, baseCurrency, form]);

  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name || '',
        displayName: vendor.displayName || '',
        email: vendor.email || '',
        phone: vendor.phone || '',
        currency: vendor.currency || '',
        taxId: vendor.taxId || '',
        // 0 is "Due on Receipt", not "unset".
        paymentTerms: vendor.paymentTerms ?? 30,
        billingAddress: addressFromParty(vendor, 'billing'),
      });
    }
  }, [vendor, form]);

  const handleSubmit = (data: VendorFormData) => {
    // Flatten addresses for API
    const submitData = {
      name: data.name,
      displayName: data.displayName || null,
      email: data.email || null,
      phone: data.phone || null,
      currency: data.currency || baseCurrency,
      taxId: data.taxId || null,
      paymentTerms: data.paymentTerms ?? 0,
      billingStreet: data.billingAddress?.street || null,
      billingCity: data.billingAddress?.city || null,
      billingState: data.billingAddress?.state || null,
      billingPostalCode: data.billingAddress?.postalCode || null,
      billingCountry: data.billingAddress?.country || null,
    };
    onSubmit(submitData as Record<string, unknown>);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('name')} *</Label>
              <Input id="name" placeholder={t('namePlaceholder')} {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.name.message)}
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
                placeholder="vendor@example.com"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.email.message)}
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
                onValueChange={(value) => value && form.setValue('currency', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('currencyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {[baseCurrency, ...CURRENCY_CODES]
                    .filter((code, i, all): code is string => !!code && all.indexOf(code) === i)
                    .map((code) => (
                      <SelectItem key={code} value={code}>
                        {code} - {currencyNames.of(code)}
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
        </CardContent>
      </Card>

      <AddressCard
        form={form}
        name="billingAddress"
        title={t('billingAddress')}
        labels={addressLabels}
      />

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
