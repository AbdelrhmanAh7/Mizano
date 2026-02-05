'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Expense } from '@/lib/hooks/use-expenses';
import { useVendors } from '@/lib/hooks/use-vendors';
import { cn } from '@/lib/utils';

const expenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  accountId: z.string().min(1, 'Expense account is required'),
  vendorId: z.string().optional(),
  amount: z.string().min(1, 'Amount is required'),
  taxRate: z.string().optional(),
  taxInclusive: z.boolean().default(false),
  paidThroughAccountId: z.string().min(1, 'Paid through account is required'),
  description: z.string().optional(),
  reference: z.string().optional(),
  projectId: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
  expense?: Expense | null;
  accounts?: Array<{ id: string; code: string; name: string; type: string }>;
  projects?: Array<{ id: string; name: string }>;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  defaultVendorId?: string;
}

const taxRates = [
  { value: '0', label: 'No Tax (0%)' },
  { value: '5', label: '5%' },
  { value: '10', label: '10%' },
  { value: '14', label: 'VAT 14%' },
  { value: '15', label: '15%' },
];

export function ExpenseForm({
  expense,
  accounts = [],
  projects = [],
  onSubmit,
  onCancel,
  isSubmitting,
  defaultVendorId,
}: ExpenseFormProps) {
  const isEditing = !!expense;
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendors = vendorsData?.data || [];

  // Filter accounts by type
  const expenseAccounts = accounts.filter((a) => a.type === 'EXPENSE');
  const bankAccounts = accounts.filter((a) =>
    a.type === 'ASSET' && (a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash'))
  );

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      accountId: '',
      vendorId: defaultVendorId || '',
      amount: '',
      taxRate: '0',
      taxInclusive: false,
      paidThroughAccountId: '',
      description: '',
      reference: '',
      projectId: '',
    },
  });

  useEffect(() => {
    if (expense) {
      const taxRate = expense.taxAmount && parseFloat(expense.amount) > 0
        ? ((parseFloat(expense.taxAmount) / parseFloat(expense.amount)) * 100).toString()
        : '0';

      form.reset({
        date: expense.date.split('T')[0],
        accountId: expense.accountId,
        vendorId: expense.vendorId || '',
        amount: expense.amount,
        taxRate,
        taxInclusive: expense.taxInclusive,
        paidThroughAccountId: expense.paidThroughAccountId,
        description: expense.description || '',
        reference: expense.reference || '',
        projectId: expense.projectId || '',
      });
    }
  }, [expense, form]);

  const handleSubmit = (data: ExpenseFormData) => {
    const amount = parseFloat(data.amount);
    const taxRate = parseFloat(data.taxRate || '0');
    const taxAmount = data.taxInclusive
      ? (amount * taxRate / (100 + taxRate))
      : (amount * taxRate / 100);

    const submitData = {
      date: data.date,
      accountId: data.accountId,
      vendorId: data.vendorId || null,
      amount: amount,
      taxAmount: taxAmount,
      taxInclusive: data.taxInclusive,
      paidThroughAccountId: data.paidThroughAccountId,
      description: data.description || null,
      reference: data.reference || null,
      projectId: data.projectId || null,
    };
    onSubmit(submitData);
  };

  const watchAmount = form.watch('amount');
  const watchTaxRate = form.watch('taxRate');
  const watchTaxInclusive = form.watch('taxInclusive');

  const calculateTotal = () => {
    const amount = parseFloat(watchAmount || '0');
    const taxRate = parseFloat(watchTaxRate || '0');
    if (watchTaxInclusive) {
      return amount;
    }
    return amount + (amount * taxRate / 100);
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                {...form.register('date')}
              />
              {form.formState.errors.date && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.date.message}
                </p>
              )}
            </div>

            {/* Expense Account */}
            <div className="space-y-2">
              <Label htmlFor="accountId">Expense Account *</Label>
              <Select
                value={form.watch('accountId')}
                onValueChange={(value) => form.setValue('accountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select expense account" />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.accountId && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.accountId.message}
                </p>
              )}
            </div>

            {/* Vendor */}
            <div className="space-y-2">
              <Label htmlFor="vendorId">Vendor (Optional)</Label>
              <Select
                value={form.watch('vendorId') || ''}
                onValueChange={(value) => form.setValue('vendorId', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Vendor</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...form.register('amount')}
              />
              {form.formState.errors.amount && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.amount.message}
                </p>
              )}
            </div>

            {/* Tax Rate */}
            <div className="space-y-2">
              <Label htmlFor="taxRate">Tax Rate</Label>
              <Select
                value={form.watch('taxRate') || '0'}
                onValueChange={(value) => form.setValue('taxRate', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tax rate" />
                </SelectTrigger>
                <SelectContent>
                  {taxRates.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tax Inclusive */}
            <div className="space-y-2 flex items-end">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="taxInclusive"
                  checked={form.watch('taxInclusive')}
                  onCheckedChange={(checked) => form.setValue('taxInclusive', checked as boolean)}
                />
                <Label htmlFor="taxInclusive" className="font-normal">
                  Tax Inclusive
                </Label>
              </div>
            </div>

            {/* Total */}
            <div className="space-y-2">
              <Label>Total</Label>
              <div className="h-10 flex items-center px-3 rounded-md border bg-muted font-mono">
                ${calculateTotal().toFixed(2)}
              </div>
            </div>
          </div>

          {/* Paid Through */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paidThroughAccountId">Paid Through *</Label>
              <Select
                value={form.watch('paidThroughAccountId')}
                onValueChange={(value) => form.setValue('paidThroughAccountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank/cash account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.paidThroughAccountId && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.paidThroughAccountId.message}
                </p>
              )}
            </div>

            {/* Project */}
            {projects.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="projectId">Project (Optional)</Label>
                <Select
                  value={form.watch('projectId') || ''}
                  onValueChange={(value) => form.setValue('projectId', value === 'none' ? '' : value)}
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
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number</Label>
              <Input
                id="reference"
                placeholder="e.g., INV-001, Receipt #123"
                {...form.register('reference')}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe this expense..."
              {...form.register('description')}
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
            ? 'Update Expense'
            : 'Record Expense'}
        </Button>
      </div>
    </form>
  );
}
