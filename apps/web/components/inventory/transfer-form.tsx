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

const lineSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
});

const transferSchema = z
  .object({
    date: z.date({ required_error: 'Date is required' }),
    sourceWarehouseId: z.string().min(1, 'Source warehouse is required'),
    destinationWarehouseId: z.string().min(1, 'Destination warehouse is required'),
    reason: z.string().optional(),
    reference: z.string().optional(),
    lines: z.array(lineSchema).min(1, 'At least one item is required'),
  })
  .refine((data) => data.sourceWarehouseId !== data.destinationWarehouseId, {
    message: 'Source and destination warehouses must be different',
    path: ['destinationWarehouseId'],
  });

type TransferFormData = z.infer<typeof transferSchema>;

interface TransferFormProps {
  items: Array<{ id: string; name: string; sku: string | null; stockLevel: number }>;
  warehouses: Array<{ id: string; name: string; code: string }>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function TransferForm({
  items,
  warehouses,
  onSubmit,
  onCancel,
  isSubmitting,
}: TransferFormProps) {
  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      date: new Date(),
      sourceWarehouseId: '',
      destinationWarehouseId: '',
      reason: '',
      reference: '',
      lines: [
        {
          itemId: '',
          quantity: 1,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const watchSourceWarehouse = form.watch('sourceWarehouseId');

  // Calculate total items being transferred
  const watchedLines = form.watch('lines');
  const totalQuantity = useMemo(() => {
    return watchedLines.reduce((sum, line) => sum + (line.quantity || 0), 0);
  }, [watchedLines]);

  const handleSubmit = (data: TransferFormData) => {
    onSubmit({
      ...data,
      date: format(data.date, 'yyyy-MM-dd'),
    });
  };

  const addLine = () => {
    append({
      itemId: '',
      quantity: 1,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Transfer Details */}
      <Card>
        <CardHeader>
          <CardTitle>Transfer Details</CardTitle>
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
              <Label htmlFor="sourceWarehouseId">From Warehouse *</Label>
              <Select
                value={form.watch('sourceWarehouseId') || ''}
                onValueChange={(value) => form.setValue('sourceWarehouseId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.sourceWarehouseId && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.sourceWarehouseId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="destinationWarehouseId">To Warehouse *</Label>
              <Select
                value={form.watch('destinationWarehouseId') || ''}
                onValueChange={(value) => form.setValue('destinationWarehouseId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((wh) => wh.id !== watchSourceWarehouse)
                    .map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.name} ({wh.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {form.formState.errors.destinationWarehouseId && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.destinationWarehouseId.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                placeholder="Transfer reference"
                {...form.register('reference')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                placeholder="Reason for transfer"
                {...form.register('reason')}
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
            <CardTitle>Items to Transfer</CardTitle>
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
                <TableHead className="w-[350px]">Item</TableHead>
                <TableHead className="w-[120px]">Available Stock</TableHead>
                <TableHead className="w-[150px]">Quantity to Transfer</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const selectedItemId = form.watch(`lines.${index}.itemId`);
                const selectedItem = items.find((i) => i.id === selectedItemId);
                const availableStock = selectedItem?.stockLevel || 0;
                const transferQty = form.watch(`lines.${index}.quantity`) || 0;

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
                    <TableCell className="text-center font-mono">
                      {selectedItemId ? availableStock : '-'}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        max={availableStock}
                        className={cn('w-24', transferQty > availableStock && 'border-red-500')}
                        {...form.register(`lines.${index}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                      {transferQty > availableStock && selectedItemId && (
                        <p className="text-xs text-red-500 mt-1">Exceeds available stock</p>
                      )}
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
              <span className="text-muted-foreground">Total Items: </span>
              <span className="font-mono font-medium">{totalQuantity} units</span>
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
          {isSubmitting ? 'Creating...' : 'Create Transfer'}
        </Button>
      </div>
    </form>
  );
}
