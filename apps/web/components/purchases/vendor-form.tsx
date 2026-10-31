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

const addressLabels: AddressLabels = {
  street: 'Street Address',
  streetPlaceholder: 'Street address',
  country: 'Country',
  city: 'City',
  state: 'State/Province',
  statePlaceholder: 'State',
  postalCode: 'Zip/Postal Code',
  postalCodePlaceholder: 'Postal code',
};

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
      billingAddress: emptyAddress(),
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

      <AddressCard
        form={form}
        name="billingAddress"
        title="Billing Address"
        labels={addressLabels}
      />

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
