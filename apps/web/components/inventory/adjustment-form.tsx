'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { reasonOptions, type CreateAdjustmentData } from '@/lib/hooks/use-adjustments';
import { cn } from '@/lib/utils';

const adjustmentSchema = z.object({
  date: z.date({ required_error: 'Date is required' }),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  itemId: z.string().min(1, 'Item is required'),
  type: z.enum(['INCREASE', 'DECREASE']),
  quantity: z
    .number({ invalid_type_error: 'Quantity is required' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(1_000_000, 'Quantity is too large'),
  reason: z.enum(['DAMAGED', 'STOLEN', 'STOCKTAKE', 'RETURNED', 'EXPIRED', 'OTHER']),
  accountId: z.string().min(1, 'Adjustment account is required'),
  notes: z.string().max(1000).optional(),
});

type AdjustmentFormData = z.infer<typeof adjustmentSchema>;

interface AdjustmentFormProps {
  items: Array<{ id: string; name: string; sku: string | null; currentStock: number }>;
  warehouses: Array<{ id: string; name: string; code: string }>;
  accounts: Array<{ id: string; name: string; code: string }>;
  onSubmit: (data: CreateAdjustmentData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}

function FieldError({ message }: { message?: string }): JSX.Element | null {
  return message ? <p className="text-sm text-red-500">{message}</p> : null;
}

export function AdjustmentForm({
  items,
  warehouses,
  accounts,
  onSubmit,
  onCancel,
  isSubmitting,
  errorMessage,
}: AdjustmentFormProps): JSX.Element {
  const form = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      date: new Date(),
      warehouseId: warehouses[0]?.id || '',
      itemId: '',
      type: 'DECREASE',
      quantity: 1,
      reason: 'STOCKTAKE',
      accountId: '',
      notes: '',
    },
  });
  const errors = form.formState.errors;
  const watchType = form.watch('type');
  const selectedItem = items.find((i) => i.id === form.watch('itemId'));
  const quantity = form.watch('quantity') || 0;

  const handleSubmit = (data: AdjustmentFormData): void => {
    const notes = data.notes?.trim();
    onSubmit({
      date: format(data.date, 'yyyy-MM-dd'),
      warehouseId: data.warehouseId,
      itemId: data.itemId,
      type: data.type,
      quantity: data.quantity,
      reason: data.reason,
      accountId: data.accountId,
      notes: notes ? notes : undefined,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Adjustment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
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
              <FieldError message={errors.date?.message} />
            </div>

            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={watchType}
                onValueChange={(value: 'INCREASE' | 'DECREASE') => form.setValue('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCREASE">Increase Stock</SelectItem>
                  <SelectItem value="DECREASE">Decrease Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason *</Label>
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
              <Label>Item *</Label>
              <Select
                value={form.watch('itemId')}
                onValueChange={(value) => form.setValue('itemId', value, { shouldValidate: true })}
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
              <FieldError message={errors.itemId?.message} />
            </div>

            <div className="space-y-2">
              <Label>Warehouse *</Label>
              <Select
                value={form.watch('warehouseId')}
                onValueChange={(value) =>
                  form.setValue('warehouseId', value, { shouldValidate: true })
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
              <FieldError message={errors.warehouseId?.message} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity (whole units) *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                {...form.register('quantity', { valueAsNumber: true })}
              />
              {selectedItem && (
                <p className="text-xs text-muted-foreground">
                  Current stock {selectedItem.currentStock} &rarr; new stock{' '}
                  {watchType === 'INCREASE'
                    ? selectedItem.currentStock + quantity
                    : selectedItem.currentStock - quantity}
                </p>
              )}
              <FieldError message={errors.quantity?.message} />
            </div>

            <div className="space-y-2">
              <Label>Adjustment Account *</Label>
              <Select
                value={form.watch('accountId')}
                onValueChange={(value) =>
                  form.setValue('accountId', value, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.accountId?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...form.register('notes')} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Posting...' : 'Post Adjustment'}
        </Button>
      </div>
    </form>
  );
}
