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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, itemTypeOptions, unitOptions } from '@/lib/hooks/use-items';

const itemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  sku: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['GOODS', 'SERVICE', 'DIGITAL']),
  unit: z.string().optional(),
  salesPrice: z.number().min(0, 'Sales price must be positive').optional(),
  purchasePrice: z.number().min(0, 'Purchase price must be positive').optional(),
  taxRateId: z.string().optional(),
  trackInventory: z.boolean().default(false),
  openingStock: z.number().min(0).optional(),
  reorderPoint: z.number().min(0).optional(),
  reorderQuantity: z.number().min(0).optional(),
  incomeAccountId: z.string().optional(),
  expenseAccountId: z.string().optional(),
  inventoryAccountId: z.string().optional(),
});

type ItemFormData = z.infer<typeof itemSchema>;

interface ItemFormProps {
  item?: Item | null;
  accounts: Array<{ id: string; name: string; code: string; type: string }>;
  taxRates?: Array<{ id: string; name: string; rate: number }>;
  onSubmit: (data: ItemFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ItemForm({
  item,
  accounts,
  taxRates = [],
  onSubmit,
  onCancel,
  isSubmitting,
}: ItemFormProps) {
  const isEditing = !!item;

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      sku: '',
      description: '',
      type: 'GOODS',
      unit: 'pcs',
      salesPrice: 0,
      purchasePrice: 0,
      taxRateId: '',
      trackInventory: true,
      openingStock: 0,
      reorderPoint: 10,
      reorderQuantity: 20,
      incomeAccountId: '',
      expenseAccountId: '',
      inventoryAccountId: '',
    },
  });

  const watchType = form.watch('type');
  const watchTrackInventory = form.watch('trackInventory');

  useEffect(() => {
    if (item) {
      form.reset({
        name: item.name || '',
        sku: item.sku || '',
        description: item.description || '',
        type: item.type || 'GOODS',
        unit: item.unit || 'pcs',
        salesPrice: item.salesPrice ? parseFloat(item.salesPrice) : 0,
        purchasePrice: item.purchasePrice ? parseFloat(item.purchasePrice) : 0,
        taxRateId: item.taxRateId || '',
        trackInventory: item.trackInventory ?? true,
        openingStock: item.stockLevel || 0,
        reorderPoint: item.reorderPoint || 10,
        reorderQuantity: item.reorderQuantity || 20,
        incomeAccountId: item.incomeAccountId || '',
        expenseAccountId: item.expenseAccountId || '',
        inventoryAccountId: item.inventoryAccountId || '',
      });
    }
  }, [item, form]);

  // Auto-disable inventory tracking for services
  useEffect(() => {
    if (watchType === 'SERVICE') {
      form.setValue('trackInventory', false);
    }
  }, [watchType, form]);

  const handleSubmit = (data: ItemFormData) => {
    onSubmit(data);
  };

  // Filter accounts by type
  const incomeAccounts = accounts.filter((a) => a.type === 'INCOME');
  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE');
  const assetAccounts = accounts.filter((a) => a.type === 'ASSET');

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
              <Label htmlFor="name">Item Name *</Label>
              <Input id="name" placeholder="Enter item name" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" placeholder="Stock Keeping Unit" {...form.register('sku')} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(value: 'GOODS' | 'SERVICE' | 'DIGITAL') =>
                  form.setValue('type', value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {itemTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select
                value={form.watch('unit') || 'pcs'}
                onValueChange={(value) => form.setValue('unit', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Item description"
              {...form.register('description')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salesPrice">Sales Price</Label>
              <Input
                id="salesPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...form.register('salesPrice', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Purchase Price</Label>
              <Input
                id="purchasePrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...form.register('purchasePrice', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxRateId">Tax Rate</Label>
              <Select
                value={form.watch('taxRateId') || ''}
                onValueChange={(value) => form.setValue('taxRateId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tax rate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No tax</SelectItem>
                  {taxRates.map((rate) => (
                    <SelectItem key={rate.id} value={rate.id}>
                      {rate.name} ({rate.rate}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory */}
      {watchType !== 'SERVICE' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Inventory</CardTitle>
              <div className="flex items-center gap-2">
                <Switch
                  checked={watchTrackInventory}
                  onCheckedChange={(checked) => form.setValue('trackInventory', checked)}
                />
                <Label>Track Inventory</Label>
              </div>
            </div>
          </CardHeader>
          {watchTrackInventory && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {!isEditing && (
                  <div className="space-y-2">
                    <Label htmlFor="openingStock">Opening Stock</Label>
                    <Input
                      id="openingStock"
                      type="number"
                      min="0"
                      placeholder="0"
                      {...form.register('openingStock', { valueAsNumber: true })}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reorderPoint">Reorder Point</Label>
                  <Input
                    id="reorderPoint"
                    type="number"
                    min="0"
                    placeholder="10"
                    {...form.register('reorderPoint', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Alert when stock falls below this level
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reorderQuantity">Reorder Quantity</Label>
                  <Input
                    id="reorderQuantity"
                    type="number"
                    min="0"
                    placeholder="20"
                    {...form.register('reorderQuantity', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Suggested quantity to reorder</p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Accounting */}
      <Card>
        <CardHeader>
          <CardTitle>Accounting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="incomeAccountId">Income Account</Label>
              <Select
                value={form.watch('incomeAccountId') || ''}
                onValueChange={(value) => form.setValue('incomeAccountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {incomeAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used when selling this item</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expenseAccountId">Expense Account</Label>
              <Select
                value={form.watch('expenseAccountId') || ''}
                onValueChange={(value) => form.setValue('expenseAccountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used when purchasing this item</p>
            </div>

            {watchTrackInventory && (
              <div className="space-y-2">
                <Label htmlFor="inventoryAccountId">Inventory Account</Label>
                <Select
                  value={form.watch('inventoryAccountId') || ''}
                  onValueChange={(value) => form.setValue('inventoryAccountId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Used for inventory valuation</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Item' : 'Create Item'}
        </Button>
      </div>
    </form>
  );
}
