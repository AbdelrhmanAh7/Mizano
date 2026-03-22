'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { itemsApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';

interface ComponentRow {
  itemId: string;
  quantity: string;
}

interface CompositeItemFormValues {
  name: string;
  sku: string;
  sellingPrice: string;
  description: string;
  components: ComponentRow[];
}

interface CompositeItemFormProps {
  defaultValues?: Partial<CompositeItemFormValues>;
  onSubmit: (data: CompositeItemFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function CompositeItemForm({
  defaultValues,
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Save',
}: CompositeItemFormProps) {
  const { data: itemsData } = useQuery({
    queryKey: ['items', 'all-for-composite'],
    queryFn: async () => {
      const response = await itemsApi.getAll({ limit: 500 });
      return response.data;
    },
  });

  const items = itemsData?.data || [];

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CompositeItemFormValues>({
    defaultValues: {
      name: '',
      sku: '',
      sellingPrice: '',
      description: '',
      components: [{ itemId: '', quantity: '1' }],
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'components',
  });

  const addComponent = useCallback(() => {
    append({ itemId: '', quantity: '1' });
  }, [append]);

  // Ensure at least one component row
  useEffect(() => {
    if (fields.length === 0) {
      addComponent();
    }
  }, [fields.length, addComponent]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                {...register('name', { required: 'Name is required' })}
                placeholder="e.g. Desktop Computer Bundle"
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU *</Label>
              <Input
                id="sku"
                {...register('sku', { required: 'SKU is required' })}
                placeholder="e.g. COMP-001"
              />
              {errors.sku && <p className="text-sm text-red-500">{errors.sku.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellingPrice">Selling Price *</Label>
            <Input
              id="sellingPrice"
              type="number"
              step="0.01"
              {...register('sellingPrice', { required: 'Selling price is required' })}
              placeholder="0.00"
            />
            {errors.sellingPrice && (
              <p className="text-sm text-red-500">{errors.sellingPrice.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Optional description..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Components</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addComponent}>
              <Plus className="mr-2 h-4 w-4" />
              Add Component
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_120px_40px] gap-3 text-sm font-medium text-muted-foreground">
              <span>Item</span>
              <span>Quantity</span>
              <span />
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_120px_40px] gap-3 items-start">
                <Controller
                  control={control}
                  name={`components.${index}.itemId`}
                  rules={{ required: 'Item is required' }}
                  render={({ field: selectField }) => (
                    <Select value={selectField.value} onValueChange={selectField.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select item..." />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item: { id: string; name: string; sku: string | null }) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} {item.sku ? `(${item.sku})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  {...register(`components.${index}.quantity`, {
                    required: 'Required',
                    min: { value: 0.01, message: 'Min 0.01' },
                  })}
                  placeholder="1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
