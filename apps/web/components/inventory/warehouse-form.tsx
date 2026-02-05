'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Warehouse } from '@/lib/hooks/use-warehouses';

const warehouseSchema = z.object({
  name: z.string().min(1, 'Warehouse name is required'),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  isDefault: z.boolean().default(false),
});

type WarehouseFormData = z.infer<typeof warehouseSchema>;

interface WarehouseFormProps {
  warehouse?: Warehouse | null;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function WarehouseForm({
  warehouse,
  onSubmit,
  onCancel,
  isSubmitting,
}: WarehouseFormProps) {
  const isEditing = !!warehouse;

  const form = useForm<WarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      isDefault: false,
    },
  });

  useEffect(() => {
    if (warehouse) {
      form.reset({
        name: warehouse.name || '',
        code: warehouse.code || '',
        address: warehouse.address || '',
        city: warehouse.city || '',
        state: warehouse.state || '',
        postalCode: warehouse.postalCode || '',
        country: warehouse.country || '',
        isDefault: warehouse.isDefault || false,
      });
    }
  }, [warehouse, form]);

  const handleSubmit = (data: WarehouseFormData) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Warehouse Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Warehouse Name *</Label>
              <Input
                id="name"
                placeholder="Enter warehouse name"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="e.g., WH-001"
                {...form.register('code')}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.watch('isDefault')}
              onCheckedChange={(checked) => form.setValue('isDefault', checked)}
            />
            <Label>Set as default warehouse</Label>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Textarea
              id="address"
              placeholder="Street address"
              {...form.register('address')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="City"
                {...form.register('city')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                placeholder="State"
                {...form.register('state')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="postalCode">Zip/Postal Code</Label>
              <Input
                id="postalCode"
                placeholder="Postal code"
                {...form.register('postalCode')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="Country"
                {...form.register('country')}
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
          {isSubmitting
            ? 'Saving...'
            : isEditing
            ? 'Update Warehouse'
            : 'Create Warehouse'}
        </Button>
      </div>
    </form>
  );
}
