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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Bill } from '@/lib/hooks/use-bills';
import { useVendors, Vendor } from '@/lib/hooks/use-vendors';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

const lineSchema = z.object({
  itemId: z.string().optional(),
  accountId: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.string().min(1, 'Quantity is required'),
  rate: z.string().min(1, 'Rate is required'),
  taxRate: z.string().default('0'),
});

const billSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  date: z.string().min(1, 'Date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().optional(),
  projectId: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
});

type BillFormData = z.infer<typeof billSchema>;

export interface BillFormDefaultValues {
  vendorId?: string;
  date?: string;
  dueDate?: string;
  notes?: string;
  projectId?: string;
  lines?: Array<{
    description: string;
    quantity: string;
    rate: string;
    taxRate?: string;
  }>;
}

interface BillFormProps {
  bill?: Bill | null;
  accounts?: Array<{ id: string; code: string; name: string; type: string }>;
  items?: Array<{ id: string; name: string; sku: string; costPrice: string }>;
  projects?: Array<{ id: string; name: string }>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  defaultVendorId?: string;
  /** Pre-fill form from AI document scan */
  scanDefaults?: BillFormDefaultValues;
}

const taxRates = [
  { value: '0', label: 'No Tax (0%)' },
  { value: '5', label: '5%' },
  { value: '10', label: '10%' },
  { value: '14', label: 'VAT 14%' },
  { value: '15', label: '15%' },
];

export function BillForm({
  bill,
  accounts = [],
  items = [],
  projects = [],
  onSubmit,
  onCancel,
  isSubmitting,
  defaultVendorId,
  scanDefaults,
}: BillFormProps) {
  const isEditing = !!bill;
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = vendorsData?.data || [];

  // Filter accounts
  const _expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE' || a.type === 'ASSET');

  const form = useForm<BillFormData>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      vendorId: scanDefaults?.vendorId || defaultVendorId || '',
      date: scanDefaults?.date || format(new Date(), 'yyyy-MM-dd'),
      dueDate: scanDefaults?.dueDate || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      notes: scanDefaults?.notes || '',
      projectId: scanDefaults?.projectId || '',
      lines: scanDefaults?.lines?.length
        ? scanDefaults.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            taxRate: l.taxRate || '0',
          }))
        : [{ description: '', quantity: '1', rate: '', taxRate: '0' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  useEffect(() => {
    if (bill) {
      form.reset({
        vendorId: bill.vendorId,
        date: bill.date.split('T')[0],
        dueDate: bill.dueDate.split('T')[0],
        notes: bill.notes || '',
        projectId: bill.projectId || '',
        lines: bill.lines?.map((line) => ({
          itemId: line.itemId || '',
          accountId: line.accountId || '',
          description: line.description,
          quantity: String(line.quantity),
          rate: String(line.rate),
          taxRate: String(line.taxRate || 0),
        })) || [{ description: '', quantity: '1', rate: '', taxRate: '0' }],
      });
    }
  }, [bill, form]);

  // Update due date when vendor changes
  const watchVendorId = form.watch('vendorId');
  const watchDate = form.watch('date');

  useEffect(() => {
    if (watchVendorId && watchDate) {
      const vendor = vendors.find((v: Vendor) => v.id === watchVendorId);
      if (vendor) {
        const billDate = new Date(watchDate);
        const dueDate = addDays(billDate, vendor.paymentTerms || 30);
        form.setValue('dueDate', format(dueDate, 'yyyy-MM-dd'));
      }
    }
  }, [watchVendorId, watchDate, vendors, form]);

  const handleSubmit = (data: BillFormData) => {
    const lines = data.lines.map((line) => ({
      itemId: line.itemId || null,
      accountId: line.accountId || null,
      description: line.description,
      quantity: parseFloat(line.quantity),
      rate: parseFloat(line.rate),
      taxRate: parseFloat(line.taxRate || '0'),
    }));

    const submitData = {
      vendorId: data.vendorId,
      date: data.date,
      dueDate: data.dueDate,
      notes: data.notes || null,
      projectId: data.projectId || null,
      lines,
    };
    onSubmit(submitData);
  };

  // Calculate totals
  const watchLines = form.watch('lines');
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    watchLines.forEach((line) => {
      const qty = parseFloat(line.quantity || '0');
      const rate = parseFloat(line.rate || '0');
      const lineAmount = qty * rate;
      const lineTax = lineAmount * (parseFloat(line.taxRate || '0') / 100);
      subtotal += lineAmount;
      taxAmount += lineTax;
    });

    return { subtotal, taxAmount, grandTotal: subtotal + taxAmount };
  };

  const totals = calculateTotals();

  const handleItemSelect = (index: number, itemId: string) => {
    if (itemId === 'none') {
      form.setValue(`lines.${index}.itemId`, '');
      return;
    }
    const item = items.find((i) => i.id === itemId);
    if (item) {
      form.setValue(`lines.${index}.itemId`, item.id);
      form.setValue(`lines.${index}.description`, item.name);
      form.setValue(`lines.${index}.rate`, item.costPrice);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Bill Info */}
      <Card>
        <CardHeader>
          <CardTitle>Bill Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="vendorId">Vendor *</Label>
              <Select
                value={form.watch('vendorId')}
                onValueChange={(value) => form.setValue('vendorId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor: Vendor) => (
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

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Bill Date *</Label>
              <Input id="date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
              )}
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input id="dueDate" type="date" {...form.register('dueDate')} />
              {form.formState.errors.dueDate && (
                <p className="text-sm text-red-500">{form.formState.errors.dueDate.message}</p>
              )}
            </div>
          </div>

          {/* Project */}
          {projects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="projectId">Project (Optional)</Label>
                <Select
                  value={form.watch('projectId') || ''}
                  onValueChange={(value) =>
                    form.setValue('projectId', value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Item/Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Qty</TableHead>
                <TableHead className="w-[120px]">Rate</TableHead>
                <TableHead className="w-[100px]">Tax</TableHead>
                <TableHead className="w-[120px] text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const qty = parseFloat(form.watch(`lines.${index}.quantity`) || '0');
                const rate = parseFloat(form.watch(`lines.${index}.rate`) || '0');
                const lineAmount = qty * rate;

                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Select
                        value={form.watch(`lines.${index}.itemId`) || 'none'}
                        onValueChange={(value) => handleItemSelect(index, value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Manual Entry</SelectItem>
                          {items.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`lines.${index}.description`)}
                        placeholder="Description"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`lines.${index}.quantity`)}
                        type="number"
                        step="0.01"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        {...form.register(`lines.${index}.rate`)}
                        type="number"
                        step="0.01"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={form.watch(`lines.${index}.taxRate`) || '0'}
                        onValueChange={(value) => form.setValue(`lines.${index}.taxRate`, value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {taxRates.map((rate) => (
                            <SelectItem key={rate.value} value={rate.value}>
                              {rate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right font-mono">${lineAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => remove(index)}
                          aria-label="Delete line item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => append({ description: '', quantity: '1', rate: '', taxRate: '0' })}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Line
          </Button>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-mono">${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax</span>
                <span className="font-mono">${totals.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total</span>
                <span className="font-mono">${totals.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea {...form.register('notes')} placeholder="Add notes or terms..." rows={3} />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Bill' : 'Create Bill'}
        </Button>
      </div>
    </form>
  );
}
