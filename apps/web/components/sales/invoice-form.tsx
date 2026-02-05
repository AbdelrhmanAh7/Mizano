'use client';

import { useEffect } from 'react';
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
import { useCustomers, Customer } from '@/lib/hooks/use-customers';
import { Invoice } from '@/lib/hooks/use-invoices';
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

const invoiceSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  reference: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  shippingCharge: z.string().optional(),
  lines: z.array(lineItemSchema).min(1, 'At least one line item is required'),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  invoice?: Invoice | null;
  customerId?: string;
  taxRates?: { id: string; name: string; rate: number }[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const paymentTermsOptions = [
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt', days: 0 },
  { value: 'NET_15', label: 'Net 15', days: 15 },
  { value: 'NET_30', label: 'Net 30', days: 30 },
  { value: 'NET_45', label: 'Net 45', days: 45 },
  { value: 'NET_60', label: 'Net 60', days: 60 },
];

export function InvoiceForm({
  invoice,
  customerId,
  taxRates = [],
  onSubmit,
  onCancel,
  isSubmitting,
}: InvoiceFormProps) {
  const isEditing = !!invoice;
  const { data: customersData } = useCustomers({ limit: 1000 });
  const customers = customersData?.data || [];

  // Default dates
  const today = new Date().toISOString().split('T')[0];
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 30);
  const dueDate = defaultDue.toISOString().split('T')[0];

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customerId: customerId || '',
      invoiceDate: today,
      dueDate: dueDate,
      reference: '',
      paymentTerms: 'NET_30',
      notes: '',
      terms: '',
      shippingCharge: '0',
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
    if (invoice) {
      form.reset({
        customerId: invoice.customerId,
        invoiceDate: invoice.date.split('T')[0],
        dueDate: invoice.dueDate.split('T')[0],
        reference: '',
        paymentTerms: 'NET_30',
        notes: invoice.notes || '',
        terms: invoice.terms || '',
        shippingCharge: invoice.shippingAmount || '0',
        lines: invoice.lines?.map((line) => ({
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
  }, [invoice, form]);

  const selectedCustomerId = form.watch('customerId');
  const selectedCustomer = customers.find((c: Customer) => c.id === selectedCustomerId);

  // Update due date when payment terms change
  const handlePaymentTermsChange = (value: string) => {
    form.setValue('paymentTerms', value);
    const term = paymentTermsOptions.find((t) => t.value === value);
    if (term) {
      const invoiceDate = new Date(form.watch('invoiceDate'));
      invoiceDate.setDate(invoiceDate.getDate() + term.days);
      form.setValue('dueDate', invoiceDate.toISOString().split('T')[0]);
    }
  };

  // Auto-fill payment terms from customer
  useEffect(() => {
    if (selectedCustomer?.paymentTerms && !isEditing) {
      // Customer paymentTerms is a number (days), convert to form value
      const days = selectedCustomer.paymentTerms;
      if (days === 0) {
        handlePaymentTermsChange('DUE_ON_RECEIPT');
      } else if (days === 15) {
        handlePaymentTermsChange('NET_15');
      } else if (days === 30) {
        handlePaymentTermsChange('NET_30');
      } else if (days === 45) {
        handlePaymentTermsChange('NET_45');
      } else if (days === 60) {
        handlePaymentTermsChange('NET_60');
      } else {
        // For custom terms, just set the due date based on days
        const invoiceDate = new Date(form.watch('invoiceDate'));
        invoiceDate.setDate(invoiceDate.getDate() + days);
        form.setValue('dueDate', invoiceDate.toISOString().split('T')[0]);
      }
    }
  }, [selectedCustomer]);

  const handleSubmit = (data: InvoiceFormData) => {
    // Calculate totals
    const totals = calculateLineTotals(data.lines, taxRates);
    const shipping = parseFloat(data.shippingCharge || '0') || 0;

    const submitData = {
      customerId: data.customerId,
      date: data.invoiceDate,
      dueDate: data.dueDate,
      notes: data.notes || null,
      terms: data.terms || null,
      subtotal: totals.subtotal.toFixed(2),
      discountAmount: totals.totalDiscount.toFixed(2),
      taxAmount: totals.totalTax.toFixed(2),
      shippingAmount: shipping.toFixed(2),
      grandTotal: (totals.grandTotal + shipping).toFixed(2),
      lines: data.lines.map((line) => ({
        itemId: line.itemId || null,
        description: line.description,
        quantity: line.quantity,
        rate: line.rate,
        discountPercent: line.discountPercent || '0',
        taxRateId: line.taxRateId || null,
        amount: line.amount,
      })),
    };

    onSubmit(submitData);
  };

  const lines = form.watch('lines');
  const totals = calculateLineTotals(lines, taxRates);
  const shipping = parseFloat(form.watch('shippingCharge') || '0') || 0;
  const grandTotal = totals.grandTotal + shipping;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
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
                <p className="text-sm text-red-500">
                  {form.formState.errors.customerId.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number</Label>
              <Input
                id="reference"
                placeholder="PO number or project reference"
                {...form.register('reference')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                {...form.register('invoiceDate')}
              />
              {form.formState.errors.invoiceDate && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.invoiceDate.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Select
                value={form.watch('paymentTerms') || ''}
                onValueChange={handlePaymentTermsChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment terms" />
                </SelectTrigger>
                <SelectContent>
                  {paymentTermsOptions.map((term) => (
                    <SelectItem key={term.value} value={term.value}>
                      {term.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input
                id="dueDate"
                type="date"
                {...form.register('dueDate')}
              />
              {form.formState.errors.dueDate && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.dueDate.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <LineItemsForm
        control={form.control}
        watch={form.watch}
        setValue={form.setValue}
        name="lines"
        taxRates={taxRates}
        currency={selectedCustomer?.currency || 'USD'}
        showTax={true}
        showDiscount={true}
      />

      {/* Shipping & Totals */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Charges & Totals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-4">
              <Label htmlFor="shippingCharge" className="text-right">
                Shipping & Handling
              </Label>
              <Input
                id="shippingCharge"
                type="number"
                step="0.01"
                min="0"
                className="w-32 text-right"
                placeholder="0.00"
                {...form.register('shippingCharge')}
              />
            </div>
            <div className="border-t pt-4 mt-2 w-64">
              <div className="flex justify-between text-lg font-semibold">
                <span>Grand Total</span>
                <span className="font-mono">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: selectedCustomer?.currency || 'USD',
                  }).format(grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
              placeholder="Payment terms, late fees, etc."
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
          {isSubmitting
            ? 'Saving...'
            : isEditing
            ? 'Update Invoice'
            : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
}
