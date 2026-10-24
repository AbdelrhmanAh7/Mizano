'use client';

import { useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { startOfMonth, endOfMonth, startOfYear, subMonths, subYears } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { CalendarIcon, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface ReportFiltersProps {
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  asOfDate?: Date;
  onAsOfDateChange?: (date: Date) => void;
  showDateRange?: boolean;
  showAsOfDate?: boolean;
  onExport?: () => void;
  isExporting?: boolean;
}

const presetOptions = [
  { value: 'this-month', labelKey: 'thisMonth' },
  { value: 'last-month', labelKey: 'lastMonth' },
  { value: 'this-quarter', labelKey: 'thisQuarter' },
  { value: 'last-quarter', labelKey: 'lastQuarter' },
  { value: 'this-year', labelKey: 'thisYear' },
  { value: 'last-year', labelKey: 'lastYear' },
  { value: 'custom', labelKey: 'custom' },
];

export function ReportFilters({
  dateRange,
  onDateRangeChange,
  asOfDate,
  onAsOfDateChange,
  showDateRange = true,
  showAsOfDate = false,
  onExport,
  isExporting,
}: ReportFiltersProps) {
  const t = useTranslations('reports');
  const formatter = useFormatter();
  const calendarLocale = useLocale() === 'ar' ? ar : enUS;
  const [preset, setPreset] = useState('this-month');

  const handlePresetChange = (value: string) => {
    setPreset(value);
    if (value === 'custom' || !onDateRangeChange) return;

    const today = new Date();
    let start: Date;
    let end: Date;

    switch (value) {
      case 'this-month':
        start = startOfMonth(today);
        end = endOfMonth(today);
        break;
      case 'last-month':
        start = startOfMonth(subMonths(today, 1));
        end = endOfMonth(subMonths(today, 1));
        break;
      case 'this-quarter':
        const quarterStart = Math.floor(today.getMonth() / 3) * 3;
        start = new Date(today.getFullYear(), quarterStart, 1);
        end = new Date(today.getFullYear(), quarterStart + 3, 0);
        break;
      case 'last-quarter':
        const lastQuarterStart = Math.floor(today.getMonth() / 3) * 3 - 3;
        start = new Date(today.getFullYear(), lastQuarterStart, 1);
        end = new Date(today.getFullYear(), lastQuarterStart + 3, 0);
        break;
      case 'this-year':
        start = startOfYear(today);
        end = today;
        break;
      case 'last-year':
        start = startOfYear(subYears(today, 1));
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }

    onDateRangeChange({ startDate: start, endDate: end });
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {showDateRange && (
        <>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('filters.selectPeriod')} />
            </SelectTrigger>
            <SelectContent>
              {presetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(`filters.${option.labelKey}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === 'custom' && dateRange && onDateRangeChange && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatter.dateTime(dateRange.startDate, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    locale={calendarLocale}
                    mode="single"
                    selected={dateRange.startDate}
                    onSelect={(date) =>
                      date && onDateRangeChange({ ...dateRange, startDate: date })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">{t('filters.to')}</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatter.dateTime(dateRange.endDate, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    locale={calendarLocale}
                    mode="single"
                    selected={dateRange.endDate}
                    onSelect={(date) => date && onDateRangeChange({ ...dateRange, endDate: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </>
      )}

      {showAsOfDate && asOfDate && onAsOfDateChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('filters.asOf')}</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[160px] justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatter.dateTime(asOfDate, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                locale={calendarLocale}
                mode="single"
                selected={asOfDate}
                onSelect={(date) => date && onAsOfDateChange(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {onExport && (
        <Button variant="outline" onClick={onExport} disabled={isExporting}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? t('filters.exporting') : t('actions.export')}
        </Button>
      )}
    </div>
  );
}
