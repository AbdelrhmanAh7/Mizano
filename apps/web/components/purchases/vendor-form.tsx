'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AddressCard,
  AddressLabels,
  addressFromParty,
  addressSchema,
  emptyAddress,
} from '@/components/shared/address-fields';
import { PartyDetailsFields } from '@/components/shared/party-details-fields';
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

export function VendorForm({ vendor, onSubmit, onCancel, isSubmitting }: VendorFormProps) {
  const isEditing = !!vendor;
  const t = useTranslations('purchases.vendors.form');
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
  const currencies = [baseCurrency, ...CURRENCY_CODES]
    .filter((code, i, all): code is string => !!code && all.indexOf(code) === i)
    .map((code) => ({ code, label: `${code} - ${currencyNames.of(code)}` }));

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
          <PartyDetailsFields
            form={form}
            namespace="purchases.vendors.form"
            currencies={currencies}
            emailPlaceholder="vendor@example.com"
            errorText={errorText}
          />
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
