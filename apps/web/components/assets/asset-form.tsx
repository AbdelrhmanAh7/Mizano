'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const assetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  assetType: z.enum(['ELECTRONICS', 'FURNITURE', 'VEHICLES', 'MACHINERY', 'BUILDINGS', 'OTHER']),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  purchasePrice: z.string().min(1, 'Purchase price is required'),
  salvageValue: z.string().optional(),
  usefulLifeMonths: z.string().min(1, 'Useful life is required'),
  depreciationMethod: z.enum(['STRAIGHT_LINE', 'DECLINING_BALANCE']),
  location: z.string().optional(),
  serialNumber: z.string().optional(),
});

type AssetFormData = z.infer<typeof assetSchema>;

interface AssetFormProps {
  defaultValues?: Partial<AssetFormData>;
  onSubmit: (data: AssetFormData) => void;
  isLoading?: boolean;
  mode?: 'create' | 'edit';
}

export function AssetForm({ defaultValues, onSubmit, isLoading, mode = 'create' }: AssetFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      assetType: 'ELECTRONICS',
      depreciationMethod: 'STRAIGHT_LINE',
      salvageValue: '0',
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Asset Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Asset Name *</Label>
              <Input id="name" {...register('name')} placeholder="e.g., Dell Laptop" />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="assetType">Asset Type *</Label>
              <Select
                value={watch('assetType')}
                onValueChange={(v) => setValue('assetType', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ELECTRONICS">Electronics</SelectItem>
                  <SelectItem value="FURNITURE">Furniture</SelectItem>
                  <SelectItem value="VEHICLES">Vehicles</SelectItem>
                  <SelectItem value="MACHINERY">Machinery</SelectItem>
                  <SelectItem value="BUILDINGS">Buildings</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register('description')} rows={2} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial Number</Label>
              <Input id="serialNumber" {...register('serialNumber')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" {...register('location')} placeholder="e.g., Main Office" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financial Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Purchase Date *</Label>
              <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
              {errors.purchaseDate && <p className="text-sm text-red-500">{errors.purchaseDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Purchase Price *</Label>
              <Input id="purchasePrice" type="number" step="0.01" {...register('purchasePrice')} />
              {errors.purchasePrice && <p className="text-sm text-red-500">{errors.purchasePrice.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salvageValue">Salvage Value</Label>
              <Input id="salvageValue" type="number" step="0.01" {...register('salvageValue')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usefulLifeMonths">Useful Life (months) *</Label>
              <Input id="usefulLifeMonths" type="number" {...register('usefulLifeMonths')} />
              {errors.usefulLifeMonths && <p className="text-sm text-red-500">{errors.usefulLifeMonths.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="depreciationMethod">Depreciation Method *</Label>
              <Select
                value={watch('depreciationMethod')}
                onValueChange={(v) => setValue('depreciationMethod', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRAIGHT_LINE">Straight Line</SelectItem>
                  <SelectItem value="DECLINING_BALANCE">Declining Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : mode === 'create' ? 'Create Asset' : 'Update Asset'}
        </Button>
      </div>
    </form>
  );
}
