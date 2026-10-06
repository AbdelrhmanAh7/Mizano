'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useUnpaidBills, paymentModeOptions } from '@/lib/hooks/use-payments-made';
import { useBaseCurrencyQuery } from '@/lib/hooks/use-organization';
import { BillAmount } from '@/components/purchases/bill-amount';

const paymentMadeSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  date: z.date({ required_error: 'Date is required' }),
  amount: z.number().positive('Amount must be positive'),
  paymentMode: z.string().min(1, 'Payment mode is required'),
  paidFromAccountId: z.string().min(1, 'Account is required'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentMadeFormData = z.infer<typeof paymentMadeSchema>;

interface BillAllocation {
  billId: string;
  billNumber: string;
  date: string;
  dueDate: string;
  currencyCode: string | null;
  grandTotal: number;
  balanceDue: number;
  allocated: number;
  selected: boolean;
}

interface PaymentMadeFormProps {
  vendors: Array<{ id: string; name: string }>;
  bankAccounts: Array<{ id: string; name: string; type: string; linkedAccountId: string }>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  preselectedVendorId?: string;
  preselectedBillId?: string;
}

export function PaymentMadeForm({
  vendors,
  bankAccounts,
  onSubmit,
  onCancel,
  isSubmitting,
  preselectedVendorId,
  preselectedBillId,
}: PaymentMadeFormProps) {
  const [allocations, setAllocations] = useState<BillAllocation[]>([]);

  const form = useForm<PaymentMadeFormData>({
    resolver: zodResolver(paymentMadeSchema),
    defaultValues: {
      vendorId: preselectedVendorId || '',
      date: new Date(),
      amount: 0,
      paymentMode: 'BANK_TRANSFER',
      paidFromAccountId: '',
      reference: '',
      notes: '',
    },
  });

  const selectedVendorId = form.watch('vendorId');
  const paymentAmount = form.watch('amount');

  // Fetch unpaid bills for selected vendor
  const { data: billsData, isLoading: billsLoading } = useUnpaidBills(
    selectedVendorId || undefined,
  );

  // Payments are posted in the organization base currency, never the vendor's default currency.
  // A bill that carries its own currency keeps it.
  const currencyQuery = useBaseCurrencyQuery();

  // Update allocations when bills data changes
  useEffect(() => {
    if (billsData?.data) {
      const bills = billsData.data.map(
        (bill: {
          id: string;
          billNumber: string;
          date: string;
          dueDate: string;
          currencyCode?: string | null;
          grandTotal?: string;
          balanceDue?: string;
        }) => ({
          billId: bill.id,
          billNumber: bill.billNumber,
          date: bill.date,
          dueDate: bill.dueDate,
          currencyCode: bill.currencyCode ?? null,
          grandTotal: parseFloat(bill.grandTotal || '0'),
          balanceDue: parseFloat(bill.balanceDue || '0'),
          allocated: 0,
          selected: preselectedBillId === bill.id,
        }),
      );
      setAllocations(bills);

      // If preselected bill, set the amount
      if (preselectedBillId) {
        const preselectedBill = bills.find((b: BillAllocation) => b.billId === preselectedBillId);
        if (preselectedBill) {
          form.setValue('amount', preselectedBill.balanceDue);
          setAllocations((prev) =>
            prev.map((a) =>
              a.billId === preselectedBillId
                ? { ...a, allocated: preselectedBill.balanceDue, selected: true }
                : a,
            ),
          );
        }
      }
    }
  }, [billsData, preselectedBillId, form]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated, 0);
    const totalBalanceDue = allocations.reduce((sum, a) => sum + a.balanceDue, 0);
    const unallocated = paymentAmount - totalAllocated;
    return { totalAllocated, totalBalanceDue, unallocated };
  }, [allocations, paymentAmount]);

  // Toggle bill selection
  const toggleBillSelection = (billId: string) => {
    setAllocations((prev) =>
      prev.map((a) => {
        if (a.billId === billId) {
          const newSelected = !a.selected;
          return {
            ...a,
            selected: newSelected,
            allocated: newSelected ? a.balanceDue : 0,
          };
        }
        return a;
      }),
    );
  };

  // Update allocation amount
  const updateAllocation = (billId: string, amount: number) => {
    setAllocations((prev) =>
      prev.map((a) => {
        if (a.billId === billId) {
          const validAmount = Math.min(Math.max(0, amount), a.balanceDue);
          return {
            ...a,
            allocated: validAmount,
            selected: validAmount > 0,
          };
        }
        return a;
      }),
    );
  };

  // Auto-allocate payment amount across selected bills
  const autoAllocate = () => {
    let remaining = paymentAmount;
    setAllocations((prev) =>
      prev.map((a) => {
        if (remaining <= 0) return { ...a, allocated: 0, selected: false };
        const toAllocate = Math.min(remaining, a.balanceDue);
        remaining -= toAllocate;
        return {
          ...a,
          allocated: toAllocate,
          selected: toAllocate > 0,
        };
      }),
    );
  };

  // Clear all allocations
  const clearAllocations = () => {
    setAllocations((prev) => prev.map((a) => ({ ...a, allocated: 0, selected: false })));
  };

  const handleSubmit = (data: PaymentMadeFormData) => {
    // Money crosses the API as 2-dp decimal strings; compare in integer cents (no float drift).
    const toCents = (n: number): number => Math.round(n * 100);
    const centsToString = (c: number): string => (c / 100).toFixed(2);
    const selectedAllocations = allocations
      .filter((a) => toCents(a.allocated) > 0)
      .map((a) => ({ billId: a.billId, amount: centsToString(toCents(a.allocated)) }));

    const amountCents = toCents(data.amount);
    const allocatedCents = selectedAllocations.reduce(
      (sum, a) => sum + toCents(Number(a.amount)),
      0,
    );
    if (selectedAllocations.length === 0 || allocatedCents !== amountCents) {
      form.setError('amount', {
        message: `Allocated ${centsToString(allocatedCents)} must equal the payment amount ${centsToString(amountCents)}`,
      });
      return;
    }

    onSubmit({
      ...data,
      amount: centsToString(amountCents),
      date: format(data.date, 'yyyy-MM-dd'),
      allocations: selectedAllocations,
    });
  };

  // bankAccounts are already the correct accounts from the banking module

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendorId">Vendor *</Label>
              <Select
                value={form.watch('vendorId')}
                onValueChange={(value) => {
                  form.setValue('vendorId', value);
                  setAllocations([]);
                }}
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
              <Label htmlFor="date">Payment Date *</Label>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...form.register('amount', { valueAsNumber: true })}
              />
              {form.formState.errors.amount && (
                <p className="text-sm text-red-500">{form.formState.errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMode">Payment Mode *</Label>
              <Select
                value={form.watch('paymentMode')}
                onValueChange={(value) => form.setValue('paymentMode', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {paymentModeOptions.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.paymentMode && (
                <p className="text-sm text-red-500">{form.formState.errors.paymentMode.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paidFromAccountId">Paid From *</Label>
              <Select
                value={form.watch('paidFromAccountId')}
                onValueChange={(value) => form.setValue('paidFromAccountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.linkedAccountId}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.paidFromAccountId && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.paidFromAccountId.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                placeholder="Check number, transaction ID, etc."
                {...form.register('reference')}
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
          </div>
        </CardContent>
      </Card>

      {/* Bill Allocation */}
      {selectedVendorId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Allocate to Bills</CardTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoAllocate}
                  disabled={paymentAmount <= 0}
                >
                  Auto-Allocate
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearAllocations}>
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {billsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading bills...</div>
            ) : allocations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No unpaid bills found for this vendor
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Bill #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance Due</TableHead>
                      <TableHead className="text-right">Allocation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((allocation) => (
                      <TableRow key={allocation.billId}>
                        <TableCell>
                          <Checkbox
                            checked={allocation.selected}
                            onCheckedChange={() => toggleBillSelection(allocation.billId)}
                          />
                        </TableCell>
                        <TableCell className="font-mono">{allocation.billNumber}</TableCell>
                        <TableCell>{format(new Date(allocation.date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{format(new Date(allocation.dueDate), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right font-mono">
                          <BillAmount
                            amount={allocation.grandTotal}
                            currencyCode={allocation.currencyCode}
                            currencyQuery={currencyQuery}
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <BillAmount
                            amount={allocation.balanceDue}
                            currencyCode={allocation.currencyCode}
                            currencyQuery={currencyQuery}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={allocation.balanceDue}
                            value={allocation.allocated || ''}
                            onChange={(e) =>
                              updateAllocation(allocation.billId, parseFloat(e.target.value) || 0)
                            }
                            className="w-32 text-right ml-auto"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Allocation Summary */}
                <div className="mt-4 flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Payment Amount:</span>
                      <span className="font-mono font-medium">
                        <BillAmount amount={paymentAmount} currencyQuery={currencyQuery} />
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Allocated:</span>
                      <span className="font-mono font-medium">
                        <BillAmount amount={totals.totalAllocated} currencyQuery={currencyQuery} />
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span>Unallocated:</span>
                      <span
                        className={cn(
                          'font-mono font-medium',
                          totals.unallocated !== 0 && 'text-yellow-600',
                        )}
                      >
                        <BillAmount amount={totals.unallocated} currencyQuery={currencyQuery} />
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </div>
    </form>
  );
}
