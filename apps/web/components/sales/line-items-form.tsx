'use client';

import { useDocumentMoney } from '@/lib/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { computeTotals } from '@/lib/money';
import { Item, useActiveItems } from '@/lib/hooks/use-items';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Control,
  FieldValues,
  useFieldArray,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';

export interface LineItem {
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discountPercent?: string;
  taxRateId?: string;
  /**
   * The line's tax percent when it has no matching tax-rate option (e.g. an item whose tax
   * percent is not a configured rate). Used instead of silently submitting 0.
   */
  taxPercent?: string;
  amount: string;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
}

export interface ApiDocumentLine {
  itemId?: string;
  description: string;
  quantity: string;
  rate: string;
  discount: string;
  taxRate: string;
}

/** Maps form lines to the exact line shape the sales DTOs accept (percent strings, no totals). */
export function toApiLines(lines: LineItem[], taxRates: TaxRate[]): ApiDocumentLine[] {
  return lines.map((line) => {
    const selected = line.taxRateId ? taxRates.find((t) => t.id === line.taxRateId) : undefined;
    return {
      itemId: line.itemId || undefined,
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      discount: line.discountPercent || '0',
      taxRate: selected ? Number(selected.rate).toFixed(2) : percentToFixed(line.taxPercent),
    };
  });
}

function percentToFixed(percent: string | undefined): string {
  const value = Number(percent);
  return percent && Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

/**
 * The tax fields a line gets for a stored/item percent: the matching option id when one exists,
 * otherwise the percent itself is kept so it is never dropped to 0.
 */
export function taxFieldsForPercent(
  percent: string | null | undefined,
  taxRates: TaxRate[],
): { taxRateId: string; taxPercent?: string } {
  const taxRateId = taxRateIdForPercent(percent ?? undefined, taxRates);
  if (taxRateId) return { taxRateId };
  const value = Number(percent);
  if (percent && Number.isFinite(value) && value > 0) {
    return { taxRateId: '', taxPercent: value.toFixed(2) };
  }
  return { taxRateId: '' };
}

/** Finds the tax rate option matching a stored line percent (server stores percent, not an id). */
export function taxRateIdForPercent(percent: string | undefined, taxRates: TaxRate[]): string {
  if (percent === undefined || percent === null || percent === '') return '';
  const value = Number(percent);
  if (!Number.isFinite(value)) return '';
  return taxRates.find((t) => Number(t.rate) === value)?.id ?? '';
}

interface LineItemsFormProps {
  control: Control<FieldValues>;
  watch: UseFormWatch<FieldValues>;
  setValue: UseFormSetValue<FieldValues>;
  name: string;
  taxRates?: TaxRate[];
  taxRatesStatus?: { isLoading: boolean; isError: boolean };
  /** Document currency; omitted means the organization base currency. */
  currency?: string | null;
  showTax?: boolean;
  showDiscount?: boolean;
}

/**
 * Calculate line amount based on quantity, rate, and discount
 */
export function calculateLineAmount(
  quantity: string | number,
  rate: string | number,
  discountPercent?: string | number,
): string {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) || 0 : quantity;
  const unitRate = typeof rate === 'string' ? parseFloat(rate) || 0 : rate;
  const discount =
    typeof discountPercent === 'string' ? parseFloat(discountPercent) || 0 : discountPercent || 0;

  const amount = qty * unitRate * (1 - discount / 100);
  return amount.toFixed(2);
}

/**
 * Calculate totals for all line items
 */
export function calculateLineTotals(
  lines: LineItem[],
  taxRates?: TaxRate[],
): {
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
} {
  // Per-line rounding to 2 dp (half up) exactly like the server's computeDocumentTotals, so the
  // preview equals the stored totals. Exact integer arithmetic via lib/money (no float drift).
  const percentFor = (line: LineItem): string => {
    const option = line.taxRateId ? taxRates?.find((t) => t.id === line.taxRateId) : undefined;
    return String(option ? option.rate : line.taxPercent || '0');
  };
  const gross = computeTotals(
    lines.map((l) => ({ quantity: l.quantity, rate: l.rate, discountPercent: '0' })),
  );
  const net = computeTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      rate: l.rate,
      discountPercent: l.discountPercent || '0',
      taxRate: percentFor(l),
    })),
  );
  const subtotal = Number(gross.subtotal);
  const totalDiscount = Number(gross.subtotal) - Number(net.subtotal);
  const totalTax = Number(net.taxAmount);
  return {
    subtotal,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    totalTax,
    grandTotal: Number(net.grandTotal),
  };
}

export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function LineItemsForm({
  control,
  watch,
  setValue,
  name,
  taxRates = [],
  taxRatesStatus,
  currency,
  showTax = true,
  showDiscount = true,
}: LineItemsFormProps) {
  const t = useTranslations('sales');
  const money = useDocumentMoney();
  const fmt = (amount: number) => money(amount, currency);
  const { data: items = [] } = useActiveItems();

  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  const lines = watch(name) || [];
  const totals = calculateLineTotals(lines, taxRates);

  const handleItemSelect = (index: number, itemId: string) => {
    if (itemId === '__custom__') {
      setValue(`${name}.${index}.itemId`, '');
      return;
    }
    const item = items.find((i: Item) => i.id === itemId);
    if (item) {
      setValue(`${name}.${index}.itemId`, itemId);
      setValue(`${name}.${index}.description`, item.description || item.name);
      setValue(`${name}.${index}.rate`, item.sellingPrice);
      // item.taxRate is a percent, not an option id: map it, or keep the percent itself.
      const taxFields = taxFieldsForPercent(item.taxRate, taxRates);
      setValue(`${name}.${index}.taxRateId`, taxFields.taxRateId);
      setValue(`${name}.${index}.taxPercent`, taxFields.taxPercent ?? '');
      // Recalculate amount
      const qty = watch(`${name}.${index}.quantity`) || '1';
      const discount = watch(`${name}.${index}.discountPercent`) || '0';
      const amount = calculateLineAmount(qty, item.sellingPrice, discount);
      setValue(`${name}.${index}.amount`, amount);
    }
  };

  const handleQuantityChange = (index: number, value: string) => {
    setValue(`${name}.${index}.quantity`, value);
    const rate = watch(`${name}.${index}.rate`) || '0';
    const discount = watch(`${name}.${index}.discountPercent`) || '0';
    const amount = calculateLineAmount(value, rate, discount);
    setValue(`${name}.${index}.amount`, amount);
  };

  const handleRateChange = (index: number, value: string) => {
    setValue(`${name}.${index}.rate`, value);
    const qty = watch(`${name}.${index}.quantity`) || '0';
    const discount = watch(`${name}.${index}.discountPercent`) || '0';
    const amount = calculateLineAmount(qty, value, discount);
    setValue(`${name}.${index}.amount`, amount);
  };

  const handleDiscountChange = (index: number, value: string) => {
    setValue(`${name}.${index}.discountPercent`, value);
    const qty = watch(`${name}.${index}.quantity`) || '0';
    const rate = watch(`${name}.${index}.rate`) || '0';
    const amount = calculateLineAmount(qty, rate, value);
    setValue(`${name}.${index}.amount`, amount);
  };

  const addLine = () => {
    append({
      itemId: '',
      description: '',
      quantity: '1',
      rate: '0',
      discountPercent: '0',
      taxRateId: '',
      taxPercent: '',
      amount: '0',
    });
  };

  const removeLine = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  // Calculate column span based on visible columns
  const baseColumns = 4; // Item/Description, Qty, Rate, Amount
  const extraColumns = (showDiscount ? 1 : 0) + (showTax ? 1 : 0) + 1; // +1 for actions
  const _totalColumns = baseColumns + extraColumns;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Line Items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" />
            Add Line
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {taxRatesStatus?.isError && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {t('lineItems.taxLoadFailed')}
          </p>
        )}
        {taxRatesStatus?.isLoading && (
          <p className="mb-3 text-sm text-muted-foreground">{t('lineItems.taxLoading')}</p>
        )}
        {/* Table Header */}
        <div
          className="grid gap-2 mb-2 text-sm font-medium text-muted-foreground"
          style={{
            gridTemplateColumns: `3fr 1fr 1fr ${showDiscount ? '1fr ' : ''}${showTax ? '1.5fr ' : ''}1fr 0.5fr`,
          }}
        >
          <div>Item / Description</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Rate</div>
          {showDiscount && <div className="text-right">Disc %</div>}
          {showTax && <div>Tax</div>}
          <div className="text-right">Amount</div>
          <div></div>
        </div>

        {/* Lines */}
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-2 items-center"
              style={{
                gridTemplateColumns: `3fr 1fr 1fr ${showDiscount ? '1fr ' : ''}${showTax ? '1.5fr ' : ''}1fr 0.5fr`,
              }}
            >
              {/* Item/Description */}
              <div className="space-y-1">
                <Select
                  value={watch(`${name}.${index}.itemId`) || '__custom__'}
                  onValueChange={(value) => handleItemSelect(index, value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select item (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">Custom item</SelectItem>
                    {items.map((item: Item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} - {money(item.sellingPrice, currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Description"
                  className="h-9"
                  value={watch(`${name}.${index}.description`) || ''}
                  onChange={(e) => setValue(`${name}.${index}.description`, e.target.value)}
                />
              </div>

              {/* Quantity */}
              <Input
                type="number"
                step="0.01"
                min="0"
                className="text-right h-9"
                placeholder="1"
                value={watch(`${name}.${index}.quantity`) || ''}
                onChange={(e) => handleQuantityChange(index, e.target.value)}
              />

              {/* Rate */}
              <Input
                type="number"
                step="0.01"
                min="0"
                className="text-right h-9"
                placeholder="0.00"
                value={watch(`${name}.${index}.rate`) || ''}
                onChange={(e) => handleRateChange(index, e.target.value)}
              />

              {/* Discount */}
              {showDiscount && (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="text-right h-9"
                  placeholder="0"
                  value={watch(`${name}.${index}.discountPercent`) || ''}
                  onChange={(e) => handleDiscountChange(index, e.target.value)}
                />
              )}

              {/* Tax */}
              {showTax && (
                <Select
                  disabled={taxRatesStatus?.isLoading || taxRatesStatus?.isError}
                  value={watch(`${name}.${index}.taxRateId`) || '__none__'}
                  onValueChange={(value) => {
                    setValue(`${name}.${index}.taxRateId`, value === '__none__' ? '' : value);
                    // An explicit choice replaces any percent carried over from the item.
                    setValue(`${name}.${index}.taxPercent`, '');
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="No tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No tax</SelectItem>
                    {taxRates.map((tax) => (
                      <SelectItem key={tax.id} value={tax.id}>
                        {tax.name} ({tax.rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Amount */}
              <div className="text-right font-mono text-sm font-medium h-9 flex items-center justify-end">
                {money(watch(`${name}.${index}.amount`) || '0', currency)}
              </div>

              {/* Actions */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeLine(index)}
                disabled={fields.length <= 1}
                className="h-9 w-9"
                aria-label="Remove line item"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
              </Button>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t mt-4 pt-4 space-y-2">
          <div className="flex justify-end gap-8 text-sm">
            <span className="text-muted-foreground">Subtotal:</span>
            <span className="font-mono w-24 text-right">{fmt(totals.subtotal)}</span>
          </div>
          {showDiscount && totals.totalDiscount > 0 && (
            <div className="flex justify-end gap-8 text-sm">
              <span className="text-muted-foreground">Discount:</span>
              <span className="font-mono w-24 text-right text-red-600">
                -{fmt(totals.totalDiscount)}
              </span>
            </div>
          )}
          {showTax && totals.totalTax > 0 && (
            <div className="flex justify-end gap-8 text-sm">
              <span className="text-muted-foreground">Tax:</span>
              <span className="font-mono w-24 text-right">{fmt(totals.totalTax)}</span>
            </div>
          )}
          <div className="flex justify-end gap-8 text-base font-semibold border-t pt-2">
            <span>Total:</span>
            <span className="font-mono w-24 text-right">{fmt(totals.grandTotal)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
