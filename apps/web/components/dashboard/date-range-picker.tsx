'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { type DateRange as RDPDateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  useDashboardFilters,
  type DatePreset,
} from '@/lib/stores/use-dashboard-filters';

const presets: { label: string; value: DatePreset }[] = [
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'Last Quarter', value: 'lastQuarter' },
  { label: 'This Year', value: 'thisYear' },
  { label: 'Last 12 Months', value: 'last12Months' },
];

export function DateRangePicker() {
  const { dateRange, preset, setDateRange, setPreset } = useDashboardFilters();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-normal min-w-[260px]',
            !dateRange && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="me-2 h-4 w-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                {format(dateRange.from, 'MMM d, yyyy')} -{' '}
                {format(dateRange.to, 'MMM d, yyyy')}
              </>
            ) : (
              format(dateRange.from, 'MMM d, yyyy')
            )
          ) : (
            <span>Pick a date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-e p-3 space-y-1 min-w-[150px]">
            <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
              Quick Select
            </p>
            {presets.map((p) => (
              <Button
                key={p.value}
                variant={preset === p.value ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => {
                  setPreset(p.value);
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="p-3">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range: RDPDateRange | undefined) => {
                if (range?.from && range?.to) {
                  setDateRange({ from: range.from, to: range.to });
                } else if (range?.from) {
                  setDateRange({ from: range.from, to: range.from });
                }
              }}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
