'use client';

import { useEffect } from 'react';
import { useForm, Control, FieldValues, UseFormWatch, UseFormSetValue } from 'react-hook-form';
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
import { useCustomers, Customer } from '@/lib/hooks/use-customers';
import { Quote } from '@/lib/hooks/use-quotes';
import { LineItemsForm, calculateLineTotals } from './line-items-form';

const lineItemSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.string().min(1, 'Quantity is required'),
  rate: z.string().min(1, 'Rate is required'),
  discountPercent: z.string().optional(),
  taxRateId: z.string().optional(),
  amount: z.string(),
});

const quoteSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  quoteDate: z.string().min(1, 'Quote date is required'),
  expiryDate: z.string().min(1, 'Expiry date is required'),
  reference: z.string().optional(),
  subject: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  lines: z.array(lineItemSchema).min(1, 'At least one line item is required'),
});

type QuoteFormData = z.infer<typeof quoteSchema>;

interface QuoteFormProps {
  quote?: Quote | null;
  customerId?: string;
  taxRates?: { id: string; name: string; rate: number }[];
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function QuoteForm({
  quote,
  customerId,
  taxRates = [],
  onSubmit,
  onCancel,
  isSubmitting,
}: QuoteFormProps) {
  const isEditing = !!quote;
  const { data: customersData } = useCustomers({ limit: 1000 });
  const customers = customersData?.data || [];

  // Default dates
  const today = new Date().toISOString().split('T')[0];
  const defaultExpiry = new Date();
  defaultExpiry.setDate(defaultExpiry.getDate() + 30);
  const expiryDate = defaultExpiry.toISOString().split('T')[0];

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      customerId: customerId || '',
      quoteDate: today,
      expiryDate: expiryDate,
      reference: '',
      subject: '',
      notes: '',
      terms: '',
      lines: [
        {
          itemId: '',
          description: '',
          quantity: '1',
          rate: '0',
          discountPercent: '0',
          taxRateId: '',
          amount: '0',
        },
      ],
    },
  });

  useEffect(() => {
    if (quote) {
      form.reset({
        customerId: quote.customerId,
        quoteDate: quote.date.split('T')[0],
        expiryDate: quote.expiryDate.split('T')[0],
        reference: quote.reference || '',
        subject: quote.subject || '',
        notes: quote.notes || '',
        terms: quote.terms || '',
        lines: quote.lines?.map((line) => ({
          itemId: line.itemId || '',
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          discountPercent: line.discountPercent || '0',
          taxRateId: line.taxRateId || '',
          amount: line.amount,
        })) || [
          {
            itemId: '',
            description: '',
            quantity: '1',
            rate: '0',
            discountPercent: '0',
            taxRateId: '',
            amount: '0',
          },
        ],
      });
    }
  }, [quote, form]);

  const selectedCustomerId = form.watch('customerId');
  const selectedCustomer = customers.find((c: Customer) => c.id === selectedCustomerId);

  const handleSubmit = (data: QuoteFormData) => {
    // Calculate totals
    const totals = calculateLineTotals(data.lines, taxRates);

    const submitData = {
      ...data,
      subtotal: totals.subtotal.toFixed(2),
      discountAmount: totals.totalDiscount.toFixed(2),
      taxAmount: totals.totalTax.toFixed(2),
      grandTotal: totals.grandTotal.toFixed(2),
      lines: data.lines.map((line) => ({
        ...line,
        itemId: line.itemId || null,
        taxRateId: line.taxRateId || null,
      })),
    };

    onSubmit(submitData);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Quote Details */}
      <Card>
        <CardHeader>
          <CardTitle>Quote Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer *</Label>
              <Select
                value={form.watch('customerId')}
                onValueChange={(value) => form.setValue('customerId', value)}
                disabled={isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer: Customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.displayName || customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.customerId && (
                <p className="text-sm text-red-500">{form.formState.errors.customerId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number</Label>
              <Input
                id="reference"
                placeholder="PO-001 or project reference"
                {...form.register('reference')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quoteDate">Quote Date *</Label>
              <Input id="quoteDate" type="date" {...form.register('quoteDate')} />
              {form.formState.errors.quoteDate && (
                <p className="text-sm text-red-500">{form.formState.errors.quoteDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date *</Label>
              <Input id="expiryDate" type="date" {...form.register('expiryDate')} />
              {form.formState.errors.expiryDate && (
                <p className="text-sm text-red-500">{form.formState.errors.expiryDate.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Quote for web development project"
              {...form.register('subject')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <LineItemsForm
        control={form.control as unknown as Control<FieldValues>}
        watch={form.watch as unknown as UseFormWatch<FieldValues>}
        setValue={form.setValue as unknown as UseFormSetValue<FieldValues>}
        name="lines"
        taxRates={taxRates}
        currency={selectedCustomer?.currency || 'USD'}
        showTax={true}
        showDiscount={true}
      />

      {/* Notes & Terms */}
      <Card>
        <CardHeader>
          <CardTitle>Notes & Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Customer Notes</Label>
            <Textarea
              id="notes"
              placeholder="Notes visible to the customer"
              {...form.register('notes')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">Terms & Conditions</Label>
            <Textarea
              id="terms"
              placeholder="Payment terms, warranty, etc."
              {...form.register('terms')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Quote' : 'Create Quote'}
        </Button>
      </div>
    </form>
  );
}
