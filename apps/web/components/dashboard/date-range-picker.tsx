'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { type DateRange as RDPDateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDashboardFilters, type DatePreset } from '@/lib/stores/use-dashboard-filters';
import { useDateFnsLocale } from '@/lib/date-locale';
import { useTranslations } from 'next-intl';

const presets: { label: string; value: DatePreset }[] = [
  { label: 'thisMonth', value: 'thisMonth' },
  { label: 'lastMonth', value: 'lastMonth' },
  { label: 'lastQuarter', value: 'lastQuarter' },
  { label: 'thisYear', value: 'thisYear' },
  { label: 'last12Months', value: 'last12Months' },
];

export function DateRangePicker() {
  const { dateRange, preset, setDateRange, setPreset } = useDashboardFilters();
  const [open, setOpen] = useState(false);
  const t = useTranslations('common.dateRange');
  const locale = useDateFnsLocale();
  const show = (date: Date) => format(date, 'PP', { locale });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-start font-normal min-w-[260px]',
            !dateRange && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="me-2 h-4 w-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                {show(dateRange.from)} - {show(dateRange.to)}
              </>
            ) : (
              show(dateRange.from)
            )
          ) : (
            <span>{t('pickRange')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-e p-3 space-y-1 min-w-[150px]">
            <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
              {t('quickSelect')}
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
                {t(p.label)}
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
