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
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  compareDecimals,
  isPositiveDecimal,
  normalizeDecimal,
  parseDecimal,
  subtractDecimals,
  sumDecimals,
} from '@/lib/decimal';
import { useUnpaidBills, paymentModeOptions } from '@/lib/hooks/use-payments-made';
import { useDateFnsLocale } from '@/lib/date-locale';
import { useMoneyFormatter } from '@/lib/hooks/use-money-formatter';
import { VendorCombobox } from '@/components/shared/party-combobox';

/** common.paymentModes key of each API payment mode. */
const PAYMENT_MODE_KEYS: Record<string, string> = {
  CASH: 'cash',
  CHEQUE: 'cheque',
  BANK_TRANSFER: 'bankTransfer',
  CREDIT_CARD: 'creditCard',
  OTHER: 'other',
};

// Messages are keys of purchases.payments.form.
const paymentMadeSchema = z.object({
  vendorId: z.string().min(1, 'vendorRequired'),
  date: z.date({ required_error: 'dateRequired' }),
  // A decimal string end to end, like the payment-received form (no float money, #83).
  amount: z.string().refine(isPositiveDecimal, 'amountPositive'),
  paymentMode: z.string().min(1, 'modeRequired'),
  /** Id of the bank register (BankAccount) paid from; its GL account is sent to the API. */
  paidFromAccountId: z.string().min(1, 'accountRequired'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentMadeFormData = z.infer<typeof paymentMadeSchema>;

interface BillAllocation {
  billId: string;
  billNumber: string;
  date: string;
  dueDate: string;
  /** The bill's own currency; empty means the organization base currency. */
  currencyCode: string | null;
  grandTotal: string;
  balanceDue: string;
  allocated: string;
  selected: boolean;
}

interface PaymentMadeFormProps {
  bankAccounts: Array<{ id: string; name: string; type: string; linkedAccountId: string }>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  preselectedVendorId?: string;
  preselectedBillId?: string;
}

export function PaymentMadeForm({
  bankAccounts,
  onSubmit,
  onCancel,
  isSubmitting,
  preselectedVendorId,
  preselectedBillId,
}: PaymentMadeFormProps) {
  const dateLocale = useDateFnsLocale();
  const t = useTranslations('purchases.payments.form');
  const tModes = useTranslations('common.paymentModes');
  // Bills and payments post in the organization base currency, never the vendor's default.
  const formatMoney = useMoneyFormatter();
  const [allocations, setAllocations] = useState<BillAllocation[]>([]);

  const form = useForm<PaymentMadeFormData>({
    resolver: zodResolver(paymentMadeSchema),
    defaultValues: {
      vendorId: preselectedVendorId || '',
      date: new Date(),
      amount: '',
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
          grandTotal: normalizeDecimal(bill.grandTotal),
          balanceDue: normalizeDecimal(bill.balanceDue),
          allocated: '0',
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
    const totalAllocated = sumDecimals(allocations.map((a) => a.allocated));
    const totalBalanceDue = sumDecimals(allocations.map((a) => a.balanceDue));
    const unallocated = subtractDecimals(paymentAmount, totalAllocated);
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
            allocated: newSelected ? a.balanceDue : '0',
          };
        }
        return a;
      }),
    );
  };

  // Update allocation amount: kept as typed while between zero and the bill's balance due.
  const updateAllocation = (billId: string, typed: string) => {
    setAllocations((prev) =>
      prev.map((a) => {
        if (a.billId === billId) {
          const parsed = parseDecimal(typed);
          const validAmount =
            parsed === null || compareDecimals(typed, '0') < 0
              ? '0'
              : compareDecimals(typed, a.balanceDue) > 0
                ? a.balanceDue
                : typed.trim();
          return {
            ...a,
            allocated: validAmount,
            selected: isPositiveDecimal(validAmount),
          };
        }
        return a;
      }),
    );
  };

  // Auto-allocate payment amount across selected bills
  const autoAllocate = () => {
    let remaining = normalizeDecimal(paymentAmount);
    setAllocations((prev) =>
      prev.map((a) => {
        if (!isPositiveDecimal(remaining)) return { ...a, allocated: '0', selected: false };
        const toAllocate = compareDecimals(remaining, a.balanceDue) < 0 ? remaining : a.balanceDue;
        remaining = subtractDecimals(remaining, toAllocate);
        return {
          ...a,
          allocated: toAllocate,
          selected: isPositiveDecimal(toAllocate),
        };
      }),
    );
  };

  // Clear all allocations
  const clearAllocations = () => {
    setAllocations((prev) => prev.map((a) => ({ ...a, allocated: '0', selected: false })));
  };

  const handleSubmit = (data: PaymentMadeFormData) => {
    // Money crosses the API as exact decimal strings (the API keeps 4 decimals); no float math.
    const selectedAllocations = allocations
      .filter((a) => isPositiveDecimal(a.allocated))
      .map((a) => ({ billId: a.billId, amount: normalizeDecimal(a.allocated) }));

    const amount = normalizeDecimal(data.amount);
    const allocated = sumDecimals(selectedAllocations.map((a) => a.amount));
    if (selectedAllocations.length === 0 || compareDecimals(allocated, amount) !== 0) {
      form.setError('amount', {
        message: t('allocationMismatch', {
          allocated: formatMoney(allocated),
          amount: formatMoney(amount),
        }),
      });
      return;
    }
    // The select holds the register id (two registers may share one GL account).
    const register = bankAccounts.find((a) => a.id === data.paidFromAccountId);

    onSubmit({
      ...data,
      paidFromAccountId: register?.linkedAccountId ?? '',
      amount,
      date: format(data.date, 'yyyy-MM-dd'),
      allocations: selectedAllocations,
    });
  };

  // Schema errors carry purchases.payments.form keys; the allocation check sets translated text.
  const errorText = (message?: string): string | undefined =>
    message && t.has(message) ? t(message) : message;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendorId">{t('vendor')} *</Label>
              {/* Server-searched picker: a plain list only held the first page of vendors. */}
              <VendorCombobox
                id="vendorId"
                value={form.watch('vendorId')}
                onValueChange={(value) => {
                  form.setValue('vendorId', value, { shouldValidate: true });
                  setAllocations([]);
                }}
                placeholder={t('vendorPlaceholder')}
                disabled={!!preselectedVendorId}
                isInvalid={!!form.formState.errors.vendorId}
              />
              {form.formState.errors.vendorId && (
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.vendorId.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">{t('date')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-start font-normal',
                      !form.watch('date') && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="me-2 h-4 w-4" />
                    {form.watch('date')
                      ? format(form.watch('date'), 'PPP', { locale: dateLocale })
                      : t('pickDate')}
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
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.date.message)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{t('amount')} *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                inputMode="decimal"
                {...form.register('amount')}
              />
              {form.formState.errors.amount && (
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.amount.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMode">{t('paymentMode')} *</Label>
              <Select
                value={form.watch('paymentMode')}
                onValueChange={(value) => form.setValue('paymentMode', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('modePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {paymentModeOptions.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {PAYMENT_MODE_KEYS[mode.value]
                        ? tModes(PAYMENT_MODE_KEYS[mode.value])
                        : mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.paymentMode && (
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.paymentMode.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paidFromAccountId">{t('paidFrom')} *</Label>
              <Select
                value={form.watch('paidFromAccountId')}
                onValueChange={(value) => form.setValue('paidFromAccountId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('accountPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.paidFromAccountId && (
                <p className="text-sm text-red-500">
                  {errorText(form.formState.errors.paidFromAccountId.message)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference">{t('reference')}</Label>
              <Input
                id="reference"
                placeholder={t('referencePlaceholder')}
                {...form.register('reference')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('notes')}</Label>
              <Textarea
                id="notes"
                placeholder={t('notesPlaceholder')}
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
              <CardTitle>{t('allocateTitle')}</CardTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoAllocate}
                  disabled={!isPositiveDecimal(paymentAmount)}
                >
                  {t('autoAllocate')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearAllocations}>
                  {t('clear')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {billsLoading ? (
              <div className="text-center py-8 text-muted-foreground">{t('loadingBills')}</div>
            ) : allocations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('noUnpaidBills')}</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>{t('billNumber')}</TableHead>
                      <TableHead>{t('billDate')}</TableHead>
                      <TableHead>{t('dueDate')}</TableHead>
                      <TableHead className="text-end">{t('total')}</TableHead>
                      <TableHead className="text-end">{t('balanceDue')}</TableHead>
                      <TableHead className="text-end">{t('allocation')}</TableHead>
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
                        <TableCell>
                          {format(new Date(allocation.date), 'PP', { locale: dateLocale })}
                        </TableCell>
                        <TableCell>
                          {format(new Date(allocation.dueDate), 'PP', { locale: dateLocale })}
                        </TableCell>
                        <TableCell className="text-end font-mono">
                          {formatMoney(allocation.grandTotal, allocation.currencyCode)}
                        </TableCell>
                        <TableCell className="text-end font-mono">
                          {formatMoney(allocation.balanceDue, allocation.currencyCode)}
                        </TableCell>
                        <TableCell className="text-end">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={allocation.balanceDue}
                            value={allocation.allocated === '0' ? '' : allocation.allocated}
                            onChange={(e) => updateAllocation(allocation.billId, e.target.value)}
                            className="w-32 text-end ms-auto"
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
                      <span>{t('paymentAmount')}</span>
                      <span className="font-mono font-medium">{formatMoney(paymentAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t('totalAllocated')}</span>
                      <span className="font-mono font-medium">
                        {formatMoney(totals.totalAllocated)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span>{t('unallocated')}</span>
                      <span
                        className={cn(
                          'font-mono font-medium',
                          compareDecimals(totals.unallocated, '0') !== 0 && 'text-yellow-600',
                        )}
                      >
                        {formatMoney(totals.unallocated)}
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
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('recording') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
