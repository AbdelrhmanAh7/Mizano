'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAllOrganizationSettings, useUpdateGeneralSettings } from '@/lib/hooks/use-all-settings';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Building2, Save } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'SAR', label: 'SAR - Saudi Riyal' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'EGP', label: 'EGP - Egyptian Pound' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'INR', label: 'INR - Indian Rupee' },
];

const INDUSTRIES = [
  'Technology',
  'Retail',
  'Manufacturing',
  'Healthcare',
  'Financial Services',
  'Real Estate',
  'Construction',
  'Education',
  'Professional Services',
  'Food & Beverage',
  'Transportation',
  'Agriculture',
  'Other',
];

const schema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  email: z.string().email('Invalid email').or(z.literal('')).nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().url('Invalid URL').or(z.literal('')).nullable().optional(),
  taxRegistrationNumber: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  baseCurrency: z.string().min(1, 'Currency is required'),
});

type FormData = z.infer<typeof schema>;

export default function OrganizationSettingsPage() {
  const { data: settings, isLoading } = useAllOrganizationSettings();
  const updateGeneral = useUpdateGeneralSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      website: '',
      taxRegistrationNumber: '',
      industry: '',
      baseCurrency: 'USD',
    },
  });

  useEffect(() => {
    if (settings?.general) {
      form.reset({
        name: settings.general.name || '',
        email: settings.general.email || '',
        phone: settings.general.phone || '',
        address: settings.general.address || '',
        website: settings.general.website || '',
        taxRegistrationNumber: settings.general.taxRegistrationNumber || '',
        industry: settings.general.industry || '',
        baseCurrency: settings.general.baseCurrency || 'USD',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    updateGeneral.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Go back">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organization</h1>
          <p className="text-muted-foreground text-sm">Company information and general settings</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Information
            </CardTitle>
            <CardDescription>Basic information about your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name *</Label>
                <Input id="name" {...form.register('name')} placeholder="Acme Corp" />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register('email')}
                  placeholder="contact@acme.com"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...form.register('phone')} placeholder="+1 (555) 000-0000" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input id="website" {...form.register('website')} placeholder="https://acme.com" />
                {form.formState.errors.website && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.website.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                {...form.register('address')}
                placeholder="123 Business Street, Suite 100&#10;New York, NY 10001"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tax & Currency */}
        <Card>
          <CardHeader>
            <CardTitle>Tax & Currency</CardTitle>
            <CardDescription>Tax registration and base currency settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxRegistrationNumber">Tax Registration Number</Label>
                <Input
                  id="taxRegistrationNumber"
                  {...form.register('taxRegistrationNumber')}
                  placeholder="e.g., VAT123456789"
                />
              </div>

              <div className="space-y-2">
                <Label>Base Currency</Label>
                <Select
                  value={form.watch('baseCurrency')}
                  onValueChange={(v) => form.setValue('baseCurrency', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Industry</Label>
                <Select
                  value={form.watch('industry') || ''}
                  onValueChange={(v) => form.setValue('industry', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={updateGeneral.isPending || !form.formState.isDirty}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateGeneral.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
