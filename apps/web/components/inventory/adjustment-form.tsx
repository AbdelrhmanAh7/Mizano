'use client';

import { useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { reasonOptions } from '@/lib/hooks/use-adjustments';

const lineSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  quantityAdjusted: z.number().min(1, 'Quantity must be at least 1'),
});

const adjustmentSchema = z.object({
  date: z.date({ required_error: 'Date is required' }),
  type: z.enum(['INCREASE', 'DECREASE']),
  reason: z.enum(['STOCKTAKE', 'DAMAGE', 'THEFT', 'RETURN', 'OTHER']),
  description: z.string().optional(),
  reference: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
});

type AdjustmentFormData = z.infer<typeof adjustmentSchema>;

interface AdjustmentFormProps {
  items: Array<{ id: string; name: string; sku: string | null; stockLevel: number }>;
  warehouses: Array<{ id: string; name: string; code: string }>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function AdjustmentForm({
  items,
  warehouses,
  onSubmit,
  onCancel,
  isSubmitting,
}: AdjustmentFormProps) {
  const form = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      date: new Date(),
      type: 'DECREASE',
      reason: 'STOCKTAKE',
      description: '',
      reference: '',
      lines: [
        {
          itemId: '',
          warehouseId: warehouses[0]?.id || '',
          quantityAdjusted: 1,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const watchType = form.watch('type');

  // Calculate total adjustment
  const watchedLines = form.watch('lines');
  const totalAdjustment = useMemo(() => {
    return watchedLines.reduce((sum, line) => sum + (line.quantityAdjusted || 0), 0);
  }, [watchedLines]);

  const handleSubmit = (data: AdjustmentFormData) => {
    onSubmit({
      ...data,
      date: format(data.date, 'yyyy-MM-dd'),
    });
  };

  const addLine = () => {
    append({
      itemId: '',
      warehouseId: warehouses[0]?.id || '',
      quantityAdjusted: 1,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Adjustment Details */}
      <Card>
        <CardHeader>
          <CardTitle>Adjustment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !form.watch('date') && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch('date') ? format(form.watch('date'), 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch('date')}
                    onSelect={(date) => date && form.setValue('date', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(value: 'INCREASE' | 'DECREASE') => form.setValue('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCREASE">
                    <span className="text-green-600">Increase Stock</span>
                  </SelectItem>
                  <SelectItem value="DECREASE">
                    <span className="text-red-600">Decrease Stock</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Select
                value={form.watch('reason')}
                onValueChange={(value: AdjustmentFormData['reason']) =>
                  form.setValue('reason', value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {reasonOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                placeholder="Reference number"
                {...form.register('reference')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Reason for adjustment"
                {...form.register('description')}
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Items to Adjust</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Item</TableHead>
                <TableHead className="w-[200px]">Warehouse</TableHead>
                <TableHead className="w-[100px]">Current Stock</TableHead>
                <TableHead className="w-[120px]">Adjustment</TableHead>
                <TableHead className="w-[100px]">New Stock</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const selectedItemId = form.watch(`lines.${index}.itemId`);
                const selectedItem = items.find((i) => i.id === selectedItemId);
                const currentStock = selectedItem?.stockLevel || 0;
                const adjustment = form.watch(`lines.${index}.quantityAdjusted`) || 0;
                const newStock =
                  watchType === 'INCREASE' ? currentStock + adjustment : currentStock - adjustment;

                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Select
                        value={form.watch(`lines.${index}.itemId`) || ''}
                        onValueChange={(value) => form.setValue(`lines.${index}.itemId`, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} {item.sku && `(${item.sku})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={form.watch(`lines.${index}.warehouseId`) || ''}
                        onValueChange={(value) =>
                          form.setValue(`lines.${index}.warehouseId`, value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.map((wh) => (
                            <SelectItem key={wh.id} value={wh.id}>
                              {wh.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {selectedItemId ? currentStock : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            'text-sm',
                            watchType === 'INCREASE' ? 'text-green-600' : 'text-red-600',
                          )}
                        >
                          {watchType === 'INCREASE' ? '+' : '-'}
                        </span>
                        <Input
                          type="number"
                          min="1"
                          className="w-20"
                          {...form.register(`lines.${index}.quantityAdjusted`, {
                            valueAsNumber: true,
                          })}
                        />
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-center font-mono font-medium',
                        newStock < 0 && 'text-red-600',
                      )}
                    >
                      {selectedItemId ? newStock : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fields.length > 1 && remove(index)}
                        disabled={fields.length === 1}
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {form.formState.errors.lines && (
            <p className="text-sm text-red-500 mt-2">{form.formState.errors.lines.message}</p>
          )}

          {/* Summary */}
          <div className="mt-4 flex justify-end">
            <div className="text-sm">
              <span className="text-muted-foreground">Total Adjustment: </span>
              <span
                className={cn(
                  'font-mono font-medium',
                  watchType === 'INCREASE' ? 'text-green-600' : 'text-red-600',
                )}
              >
                {watchType === 'INCREASE' ? '+' : '-'}
                {totalAdjustment} units
              </span>
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
          {isSubmitting ? 'Creating...' : 'Create Adjustment'}
        </Button>
      </div>
    </form>
  );
}
