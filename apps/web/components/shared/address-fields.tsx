'use client';

import type { ReactNode } from 'react';
import { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CountrySelect } from '@/components/ui/country-select';
import { CitySelect } from '@/components/ui/city-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** A party's postal address as the customer and vendor forms edit it (all parts optional). */
export const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

export type AddressValues = z.infer<typeof addressSchema>;

type AddressKind = 'billing' | 'shipping';
type FlatAddressField = 'Street' | 'City' | 'State' | 'PostalCode' | 'Country';

/** A saved party's flat `billingStreet`, `shippingCity`, … columns. */
type FlatPartyAddress = Partial<Record<`${AddressKind}${FlatAddressField}`, string | null>>;

export function emptyAddress(): AddressValues {
  return { street: '', city: '', state: '', postalCode: '', country: '' };
}

/** The nested form address of a saved party's flat billing or shipping columns. */
export function addressFromParty(party: FlatPartyAddress, kind: AddressKind): AddressValues {
  return {
    street: party[`${kind}Street`] || '',
    city: party[`${kind}City`] || '',
    state: party[`${kind}State`] || '',
    postalCode: party[`${kind}PostalCode`] || '',
    country: party[`${kind}Country`] || '',
  };
}

/** Localized (or literal) copy for the address card. */
export interface AddressLabels {
  street: string;
  streetPlaceholder: string;
  country: string;
  city: string;
  state: string;
  statePlaceholder: string;
  postalCode: string;
  postalCodePlaceholder: string;
}

interface AddressCardProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  /** The form field holding the address; input ids are `billingStreet`, `shippingCity`, … */
  name: `${AddressKind}Address` & Path<T>;
  title: string;
  labels: AddressLabels;
  /** Header action, such as "copy from billing". */
  action?: ReactNode;
}

/** Street, country, city (filtered by country), state and postal code of one party address. */
export function AddressCard<T extends FieldValues>({
  form,
  name,
  title,
  labels,
  action,
}: AddressCardProps<T>): JSX.Element {
  const kind = name.replace('Address', '') as AddressKind;
  const path = (part: keyof AddressValues) => `${name}.${part}` as Path<T>;
  const value = (part: keyof AddressValues) => (form.watch(path(part)) as string | undefined) || '';
  const set = (part: keyof AddressValues, next: string) =>
    form.setValue(path(part), next as PathValue<T, Path<T>>);

  return (
    <Card>
      <CardHeader>
        {action ? (
          <div className="flex items-center justify-between">
            <CardTitle>{title}</CardTitle>
            {action}
          </div>
        ) : (
          <CardTitle>{title}</CardTitle>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${kind}Street`}>{labels.street}</Label>
          <Textarea
            id={`${kind}Street`}
            placeholder={labels.streetPlaceholder}
            {...form.register(path('street'))}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${kind}Country`}>{labels.country}</Label>
            <CountrySelect
              id={`${kind}Country`}
              value={value('country')}
              onValueChange={(val) => {
                set('country', val);
                set('city', '');
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${kind}City`}>{labels.city}</Label>
            <CitySelect
              id={`${kind}City`}
              value={value('city')}
              onValueChange={(val) => set('city', val)}
              country={value('country')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${kind}State`}>{labels.state}</Label>
            <Input
              id={`${kind}State`}
              placeholder={labels.statePlaceholder}
              {...form.register(path('state'))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${kind}PostalCode`}>{labels.postalCode}</Label>
            <Input
              id={`${kind}PostalCode`}
              placeholder={labels.postalCodePlaceholder}
              {...form.register(path('postalCode'))}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
