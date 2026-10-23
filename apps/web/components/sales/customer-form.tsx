'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('sales.customers.form');
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
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Customer Name *</Label>
              <Input id="name" placeholder="Enter customer name" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="How to display on documents"
                {...form.register('displayName')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="phone">Phone</Label>
              <PhoneInput
                id="phone"
                value={form.watch('phone') || ''}
                onChange={(val) => form.setValue('phone', val)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
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
              <Label htmlFor="paymentTerms">Payment Terms</Label>
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
              <Label htmlFor="taxId">Tax ID</Label>
              <Input id="taxId" placeholder="Tax ID / VAT Number" {...form.register('taxId')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes about this customer"
              {...form.register('notes')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Billing Address */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="billingStreet">Street Address</Label>
            <Textarea
              id="billingStreet"
              placeholder="Street address"
              {...form.register('billingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billingCountry">Country</Label>
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
              <Label htmlFor="billingCity">City</Label>
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
              <Label htmlFor="billingState">State/Province</Label>
              <Input
                id="billingState"
                placeholder="State"
                {...form.register('billingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingPostalCode">Zip/Postal Code</Label>
              <Input
                id="billingPostalCode"
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
            <CardTitle>Shipping Address</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={copyBillingToShipping}>
              Copy from Billing
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shippingStreet">Street Address</Label>
            <Textarea
              id="shippingStreet"
              placeholder="Street address"
              {...form.register('shippingAddress.street')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shippingCountry">Country</Label>
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
              <Label htmlFor="shippingCity">City</Label>
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
              <Label htmlFor="shippingState">State/Province</Label>
              <Input
                id="shippingState"
                placeholder="State"
                {...form.register('shippingAddress.state')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shippingPostalCode">Zip/Postal Code</Label>
              <Input
                id="shippingPostalCode"
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
          {tc('buttons.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          aria-label={
            isSubmitting ? tc('loading.saving') : isEditing ? t('submitUpdate') : t('submitCreate')
          }
        >
          {isSubmitting ? tc('loading.saving') : isEditing ? t('submitUpdate') : t('submitCreate')}
        </Button>
      </div>
    </form>
  );
}
