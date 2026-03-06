'use client';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/hooks/use-vendor-credits';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

const lineSchema = z.object({
  itemId: z.string().optional(),
  accountId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0.01, 'Quantity is required'),
  rate: z.number().min(0, 'Rate is required'),
  taxRate: z.number().min(0).max(100).default(0),
});

const vendorCreditSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  billId: z.string().optional(),
  date: z.date({ required_error: 'Date is required' }),
  type: z.enum(['CREDIT', 'REFUND']),
  reason: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
});

type VendorCreditFormData = z.infer<typeof vendorCreditSchema>;

interface VendorCreditFormProps {
  vendors: Array<{ id: string; name: string; currency: string }>;
  accounts: Array<{ id: string; name: string; code: string; type: string }>;
  items: Array<{ id: string; name: string; sku: string | null; purchasePrice: string | null }>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  preselectedVendorId?: string;
}

export function VendorCreditForm({
  vendors,
  accounts,
  items,
  onSubmit,
  onCancel,
  isSubmitting,
  preselectedVendorId,
}: VendorCreditFormProps) {
  const form = useForm<VendorCreditFormData>({
    resolver: zodResolver(vendorCreditSchema),
    defaultValues: {
      vendorId: preselectedVendorId || '',
      billId: '',
      date: new Date(),
      type: 'CREDIT',
      reason: '',
      notes: '',
      lines: [
        {
          itemId: '',
          accountId: '',
          description: '',
          quantity: 1,
          rate: 0,
          taxRate: 0,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const selectedVendorId = form.watch('vendorId');
  const lines = form.watch('lines');

  // Get selected vendor's currency
  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);
  const currency = selectedVendor?.currency || 'USD';

  // Filter accounts to show expense/inventory accounts
  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE' || a.type === 'ASSET');

  // Calculate totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;

    lines.forEach((line) => {
      const lineAmount = (line.quantity || 0) * (line.rate || 0);
      const lineTax = lineAmount * ((line.taxRate || 0) / 100);
      subtotal += lineAmount;
      taxAmount += lineTax;
    });

    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
    };
  }, [lines]);

  // Auto-fill rate when item is selected
  const handleItemChange = (index: number, itemId: string) => {
    form.setValue(`lines.${index}.itemId`, itemId);
    const item = items.find((i) => i.id === itemId);
    if (item) {
      form.setValue(`lines.${index}.description`, item.name);
      if (item.purchasePrice) {
        form.setValue(`lines.${index}.rate`, parseFloat(item.purchasePrice));
      }
    }
  };

  const handleSubmit = (data: VendorCreditFormData) => {
    onSubmit({
      ...data,
      date: format(data.date, 'yyyy-MM-dd'),
      billId: data.billId || null,
    });
  };

  const addLine = () => {
    append({
      itemId: '',
      accountId: '',
      description: '',
      quantity: 1,
      rate: 0,
      taxRate: 0,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Credit Details */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendorId">Vendor *</Label>
              <Select
                value={form.watch('vendorId')}
                onValueChange={(value) => form.setValue('vendorId', value)}
                disabled={!!preselectedVendorId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.vendorId && (
                <p className="text-sm text-red-500">{form.formState.errors.vendorId.message}</p>
              )}
            </div>

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
                onValueChange={(value: 'CREDIT' | 'REFUND') => form.setValue('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CREDIT">Credit</SelectItem>
                  <SelectItem value="REFUND">Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              placeholder="Reason for credit/refund"
              {...form.register('reason')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes"
              {...form.register('notes')}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Item</TableHead>
                <TableHead className="w-[200px]">Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Qty</TableHead>
                <TableHead className="w-[120px]">Rate</TableHead>
                <TableHead className="w-[100px]">Tax %</TableHead>
                <TableHead className="w-[120px] text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const quantity = form.watch(`lines.${index}.quantity`) || 0;
                const rate = form.watch(`lines.${index}.rate`) || 0;
                const amount = quantity * rate;

                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Select
                        value={form.watch(`lines.${index}.itemId`) || ''}
                        onValueChange={(value) => handleItemChange(index, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={form.watch(`lines.${index}.accountId`) || ''}
                        onValueChange={(value) => form.setValue(`lines.${index}.accountId`, value)}
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
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Description"
                        {...form.register(`lines.${index}.description`)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        {...form.register(`lines.${index}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...form.register(`lines.${index}.rate`, {
                          valueAsNumber: true,
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        {...form.register(`lines.${index}.taxRate`, {
                          valueAsNumber: true,
                        })}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(amount, currency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fields.length > 1 && remove(index)}
                        disabled={fields.length === 1}
                        aria-label="Remove line item"
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

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span className="font-mono">{formatCurrency(totals.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax:</span>
                <span className="font-mono">{formatCurrency(totals.taxAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold border-t pt-2">
                <span>Total:</span>
                <span className="font-mono">{formatCurrency(totals.total, currency)}</span>
              </div>
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
          {isSubmitting ? 'Creating...' : 'Create Credit'}
        </Button>
      </div>
    </form>
  );
}
