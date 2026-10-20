'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
type AddressFormData = z.infer<typeof addressSchema>;

// Empty inputs become null so an edit can clear a field.
const addressPayload = (address?: AddressFormData) => ({
  street: address?.street || null,
  city: address?.city || null,
  state: address?.state || null,
  postalCode: address?.postalCode || null,
  country: address?.country || null,
});

/**
 * Body for POST/PATCH /customers. The API DTO takes nested billingAddress/shippingAddress
 * objects and rejects unknown keys, so flat billingStreet/... fields would be a 400 (#215).
 */
export function buildCustomerPayload(data: CustomerFormData): Record<string, unknown> {
  return {
    name: data.name,
    displayName: data.displayName || null,
    email: data.email || null,
    phone: data.phone || null,
    currency: data.currency,
    taxId: data.taxId || null,
    paymentTerms: data.paymentTerms || 0,
    notes: data.notes || null,
    billingAddress: addressPayload(data.billingAddress),
    shippingAddress: addressPayload(data.shippingAddress),
  };
}

interface CustomerFormProps {
  customer?: Customer | null;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
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
    onSubmit(buildCustomerPayload(data));
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
          <CardTitle>{t('customers.form.basicInfo') || 'Basic Information'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{(t('customers.form.name') || 'Customer Name') + ' *'}</Label>
              <Input
                id="name"
                placeholder={t('customers.form.namePlaceholder') || 'Enter customer name'}
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">
                {t('customers.form.displayName') || 'Display Name'}
              </Label>
              <Input
                id="displayName"
                placeholder={
                  t('customers.form.displayNamePlaceholder') || 'How to display on documents'
                }
                {...form.register('displayName')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('customers.form.email') || 'Email'}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('customers.form.emailPlaceholder') || 'customer@example.com'}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('customers.form.phone') || 'Phone'}</Label>
              <PhoneInput
                id="phone"
                value={form.watch('phone') || ''}
                onChange={(val) => form.setValue('phone', val)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">{t('customers.form.currency') || 'Currency'}</Label>
              <Select
                value={form.watch('currency')}
                onValueChange={(value) => form.setValue('currency', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
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
              <Label htmlFor="paymentTerms">
                {t('customers.form.paymentTerms') || 'Payment Terms'}
              </Label>
              <Select
                value={String(form.watch('paymentTerms') || 30)}
                onValueChange={(value) => form.setValue('paymentTerms', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment terms" />
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
              <Label htmlFor="taxId">{t('customers.form.taxId') || 'Tax ID'}</Label>
              <Input
                id="taxId"
                placeholder={t('customers.form.taxIdPlaceholder') || 'Tax ID / VAT Number'}
                {...form.register('taxId')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('customers.form.notes') || 'Notes'}</Label>
            <Textarea
              id="notes"
              aria-label="Notes"
              placeholder={
                t('customers.form.notesPlaceholder') || 'Internal notes about this customer'
              }
              {...form.register('notes')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Billing Address */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customers.form.billingAddress') || 'Billing Address'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="billingStreet">
              {t('customers.form.billingStreet') || 'Billing Street Address'}
            </Label>
            <Textarea
              id="billingStreet"
              aria-label="Billing Street"
              data-testid="billing-street"
              placeholder={t('customers.form.billingStreetPlaceholder') || 'Street address'}
              {...form.register('billingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billingCountry">
                {t('customers.form.billingCountry') || 'Billing Country'}
              </Label>
              <CountrySelect
                id="billingCountry"
                aria-label="Billing Country"
                value={form.watch('billingAddress.country') || ''}
                onValueChange={(val) => {
                  form.setValue('billingAddress.country', val);
                  form.setValue('billingAddress.city', '');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingCity">
                {t('customers.form.billingCity') || 'Billing City'}
              </Label>
              <CitySelect
                id="billingCity"
                aria-label="Billing City"
                value={form.watch('billingAddress.city') || ''}
                onValueChange={(val) => form.setValue('billingAddress.city', val)}
                country={form.watch('billingAddress.country') || ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billingState">
                {t('customers.form.billingState') || 'Billing State/Province'}
              </Label>
              <Input
                id="billingState"
                aria-label="Billing State"
                placeholder="State"
                {...form.register('billingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingPostalCode">
                {t('customers.form.billingPostalCode') || 'Billing Zip/Postal Code'}
              </Label>
              <Input
                id="billingPostalCode"
                aria-label="Billing Postal Code"
                placeholder="Postal code"
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
            <CardTitle>{t('customers.form.shippingAddress') || 'Shipping Address'}</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={copyBillingToShipping}>
              {t('customers.form.copyBillingToShipping') || 'Copy from Billing'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shippingStreet">
              {t('customers.form.shippingStreet') || 'Shipping Street Address'}
            </Label>
            <Textarea
              id="shippingStreet"
              aria-label="Shipping Street"
              data-testid="shipping-street"
              placeholder={t('customers.form.shippingStreetPlaceholder') || 'Street address'}
              {...form.register('shippingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shippingCountry">
                {t('customers.form.shippingCountry') || 'Shipping Country'}
              </Label>
              <CountrySelect
                id="shippingCountry"
                aria-label="Shipping Country"
                value={form.watch('shippingAddress.country') || ''}
                onValueChange={(val) => {
                  form.setValue('shippingAddress.country', val);
                  form.setValue('shippingAddress.city', '');
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shippingCity">
                {t('customers.form.shippingCity') || 'Shipping City'}
              </Label>
              <CitySelect
                id="shippingCity"
                aria-label="Shipping City"
                value={form.watch('shippingAddress.city') || ''}
                onValueChange={(val) => form.setValue('shippingAddress.city', val)}
                country={form.watch('shippingAddress.country') || ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shippingState">
                {t('customers.form.shippingState') || 'Shipping State/Province'}
              </Label>
              <Input
                id="shippingState"
                aria-label="Shipping State"
                placeholder="State"
                {...form.register('shippingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shippingPostalCode">
                {t('customers.form.shippingPostalCode') || 'Shipping Zip/Postal Code'}
              </Label>
              <Input
                id="shippingPostalCode"
                aria-label="Shipping Postal Code"
                placeholder="Postal code"
                {...form.register('shippingAddress.postalCode')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('customers.form.cancel') || 'Cancel'}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? t('customers.form.saving') || 'Saving...'
            : isEditing
              ? t('customers.form.updateCustomer') || 'Update Customer'
              : t('customers.form.createCustomer') || 'Create Customer'}
        </Button>
      </div>
    </form>
  );
}
