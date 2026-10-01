'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface MoneyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'type'
> {
  /** Current string value (e.g. "1234.56") */
  value: string;
  /** Called with the raw numeric string */
  onChange: (value: string) => void;
  /** Currency code for display (e.g. "SAR", "USD"). Shows as prefix. */
  currency?: string;
  /** Number of decimal places. Default: 2. */
  decimals?: number;
}

/**
 * Consistent currency/money input field.
 *
 * - Accepts only valid numeric input (digits, single decimal point)
 * - Shows currency prefix
 * - End-aligns the value (right in LTR, left in RTL) with tabular digits
 * - Stores value as string to avoid float precision issues
 *
 * Usage:
 *   <MoneyInput
 *     value={field.value}
 *     onChange={field.onChange}
 *     currency="SAR"
 *     placeholder="0.00"
 *   />
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  decimals = 2,
  className,
  ...props
}: MoneyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // Allow empty input
    if (raw === '') {
      onChange('');
      return;
    }

    // Allow only digits and a single decimal point
    const regex = decimals > 0 ? /^\d*\.?\d*$/ : /^\d*$/;
    if (!regex.test(raw)) return;

    // Limit decimal places
    if (decimals > 0 && raw.includes('.')) {
      const [, dec] = raw.split('.');
      if (dec && dec.length > decimals) return;
    }

    onChange(raw);
  };

  return (
    <div className="relative">
      {currency && (
        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {currency}
        </span>
      )}
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        className={cn('text-end tabular-nums', currency && 'ps-14', className)}
      />
    </div>
  );
}
