'use client';

import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useCreateBOM, useUpdateBOM, BOM } from '@/lib/hooks/use-manufacturing';
import { useItems } from '@/lib/hooks/use-items';

interface BOMItem {
  id: string;
  name: string;
  code: string;
}

const componentSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
});

const bomSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  outputItemId: z.string().min(1, 'Output item is required'),
  outputQuantity: z.number().min(1, 'Output quantity must be at least 1'),
  components: z.array(componentSchema).min(1, 'At least one component is required'),
  operationsCost: z.number().min(0, 'Operations cost cannot be negative'),
  isActive: z.boolean().default(true),
});

type BOMFormData = z.infer<typeof bomSchema>;

interface BOMFormProps {
  bom?: BOM;
}

export function BOMForm({ bom }: BOMFormProps) {
  const router = useRouter();
  const createBOM = useCreateBOM();
  const updateBOM = useUpdateBOM();

  const { data: itemsData, isLoading: itemsLoading } = useItems({ type: 'GOODS' });
  const items: BOMItem[] = itemsData?.data || [];

  const form = useForm<BOMFormData>({
    resolver: zodResolver(bomSchema),
    defaultValues: bom
      ? {
          name: bom.name,
          outputItemId: bom.outputItemId,
          outputQuantity: bom.outputQuantity,
          components: bom.components.map((c) => ({
            itemId: c.itemId,
            quantity: c.quantity,
          })),
          operationsCost:
            typeof bom.operationsCost === 'string'
              ? parseFloat(bom.operationsCost)
              : bom.operationsCost,
          isActive: bom.isActive,
        }
      : {
          name: '',
          outputItemId: '',
          outputQuantity: 1,
          components: [{ itemId: '', quantity: 1 }],
          operationsCost: 0,
          isActive: true,
        },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'components',
  });

  const handleSubmit = async (data: BOMFormData) => {
    try {
      if (bom) {
        await updateBOM.mutateAsync({ id: bom.id, data: data as unknown as Partial<BOM> });
      } else {
        await createBOM.mutateAsync(data as unknown as Partial<BOM>);
      }
      router.push('/manufacturing/bom');
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isPending = createBOM.isPending || updateBOM.isPending;

  // Filter out selected output item from components
  const outputItemId = form.watch('outputItemId');
  const availableItems = items.filter((item) => item.id !== outputItemId);

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>BOM Details</CardTitle>
          <CardDescription>Define the bill of materials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">BOM Name *</Label>
              <Input id="name" placeholder="Wooden Chair Assembly" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Output Item (Finished Product) *</Label>
              <Select
                value={form.watch('outputItemId') || ''}
                onValueChange={(value) => form.setValue('outputItemId', value)}
                disabled={itemsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select output item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.code} - {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.outputItemId && (
                <p className="text-sm text-red-500">{form.formState.errors.outputItemId.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="outputQuantity">Output Quantity *</Label>
              <Input
                id="outputQuantity"
                type="number"
                min="1"
                step="1"
                placeholder="1"
                {...form.register('outputQuantity', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">Quantity produced per production run</p>
              {form.formState.errors.outputQuantity && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.outputQuantity.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="operationsCost">Operations Cost</Label>
              <Input
                id="operationsCost"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                {...form.register('operationsCost', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Labor and overhead cost per production run
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={form.watch('isActive')}
              onCheckedChange={(checked) => form.setValue('isActive', checked)}
            />
            <Label htmlFor="isActive">Active</Label>
          </div>
        </CardContent>
      </Card>

      {/* Components */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Components (Raw Materials)</CardTitle>
              <CardDescription>Add the items required to produce this product</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ itemId: '', quantity: 1 })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Component
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No components added. Click "Add Component" to start.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3 text-sm font-medium text-muted-foreground">
                <div className="col-span-7">Item</div>
                <div className="col-span-3">Quantity</div>
                <div className="col-span-2"></div>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-7">
                    <Select
                      value={form.watch(`components.${index}.itemId`) || ''}
                      onValueChange={(value) => form.setValue(`components.${index}.itemId`, value)}
                      disabled={itemsLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.code} - {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="1"
                      {...form.register(`components.${index}.quantity`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label="Remove component"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {form.formState.errors.components && (
            <p className="text-sm text-red-500 mt-2">{form.formState.errors.components.message}</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : bom ? 'Update BOM' : 'Create BOM'}
        </Button>
      </div>
    </form>
  );
}
