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
import { Vendor } from '@/lib/hooks/use-vendors';

const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const vendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required'),
  displayName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  currency: z.string().default('USD'),
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

export function VendorForm({ vendor, onSubmit, onCancel, isSubmitting }: VendorFormProps) {
  const isEditing = !!vendor;

  const form = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: '',
      displayName: '',
      email: '',
      phone: '',
      currency: 'USD',
      taxId: '',
      paymentTerms: 30,
      billingAddress: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
      },
    },
  });

  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name || '',
        displayName: vendor.displayName || '',
        email: vendor.email || '',
        phone: vendor.phone || '',
        currency: vendor.currency || 'USD',
        taxId: vendor.taxId || '',
        paymentTerms: vendor.paymentTerms || 30,
        billingAddress: {
          street: vendor.billingStreet || '',
          city: vendor.billingCity || '',
          state: vendor.billingState || '',
          postalCode: vendor.billingPostalCode || '',
          country: vendor.billingCountry || '',
        },
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
      currency: data.currency,
      taxId: data.taxId || null,
      paymentTerms: data.paymentTerms || 0,
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
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Vendor Name *</Label>
              <Input id="name" placeholder="Enter vendor name" {...form.register('name')} />
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
                placeholder="vendor@example.com"
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

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Vendor' : 'Create Vendor'}
        </Button>
      </div>
    </form>
  );
}
