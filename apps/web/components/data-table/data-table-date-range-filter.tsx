'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  endOfMonth,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
} from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import { useState } from 'react';
import { type DateRange as RDPDateRange } from 'react-day-picker';

export interface DateRangeValue {
  from: Date;
  to: Date;
}

interface DataTableDateRangeFilterProps {
  value?: DateRangeValue;
  onChange: (range: DateRangeValue | undefined) => void;
  placeholder?: string;
  /** Disable dates after this. Defaults to today. */
  maxDate?: Date;
  /** Show presets sidebar. Default: true. */
  showPresets?: boolean;
}

interface Preset {
  label: string;
  range: () => DateRangeValue;
}

const presets: Preset[] = [
  {
    label: 'Today',
    range: () => {
      const today = new Date();
      return { from: today, to: today };
    },
  },
  {
    label: 'Last 7 days',
    range: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: 'Last 30 days',
    range: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: 'This month',
    range: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    label: 'Last month',
    range: () => {
      const last = subMonths(new Date(), 1);
      return { from: startOfMonth(last), to: endOfMonth(last) };
    },
  },
  {
    label: 'This quarter',
    range: () => ({ from: startOfQuarter(new Date()), to: new Date() }),
  },
  {
    label: 'Last quarter',
    range: () => {
      const last = subQuarters(new Date(), 1);
      return {
        from: startOfQuarter(last),
        to: endOfMonth(subMonths(startOfQuarter(new Date()), 1)),
      };
    },
  },
  {
    label: 'This year',
    range: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
];

export function DataTableDateRangeFilter({
  value,
  onChange,
  placeholder = 'Date range',
  maxDate,
  showPresets = true,
}: DataTableDateRangeFilterProps) {
  const [open, setOpen] = useState(false);

  const handlePreset = (preset: Preset) => {
    onChange(preset.range());
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 border-dashed justify-start text-left font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="me-2 h-4 w-4" />
          {value ? (
            <span className="flex items-center gap-1">
              {format(value.from, 'MMM d, yyyy')} – {format(value.to, 'MMM d, yyyy')}
              <X
                className="ms-1 h-3 w-3 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              />
            </span>
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {showPresets && (
            <div className="border-e p-3 space-y-1 min-w-[140px]">
              <p className="text-xs font-medium text-muted-foreground mb-2 px-2">Quick Select</p>
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <div className="p-3">
            <Calendar
              mode="range"
              selected={value ? { from: value.from, to: value.to } : undefined}
              onSelect={(range: RDPDateRange | undefined) => {
                if (range?.from && range?.to) {
                  onChange({ from: range.from, to: range.to });
                } else if (range?.from) {
                  // User picked first date, waiting for second
                  onChange({ from: range.from, to: range.from });
                }
              }}
              numberOfMonths={2}
              disabled={maxDate ? { after: maxDate } : { after: new Date() }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
