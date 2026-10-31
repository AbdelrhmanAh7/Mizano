'use client';

import { useState } from 'react';
import { startOfMonth, endOfMonth, startOfYear, subMonths, subYears } from 'date-fns';
import { useTranslations } from 'next-intl';
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
import { useCalendarLocale, useDateFormatter } from '@/lib/hooks/use-date-locale';

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

/** Period presets and their `reports.filters` message keys. */
const presetOptions = [
  { value: 'this-month', labelKey: 'thisMonth' },
  { value: 'last-month', labelKey: 'lastMonth' },
  { value: 'this-quarter', labelKey: 'thisQuarter' },
  { value: 'last-quarter', labelKey: 'lastQuarter' },
  { value: 'this-year', labelKey: 'thisYear' },
  { value: 'last-year', labelKey: 'lastYear' },
  { value: 'custom', labelKey: 'custom' },
];

/** A date button that opens the shared calendar, both in the page language and direction. */
function DateButton({
  date,
  onChange,
  className,
}: {
  date: Date;
  onChange: (date: Date) => void;
  className: string;
}) {
  const formatDate = useDateFormatter();
  const calendarLocale = useCalendarLocale();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={className}>
          <CalendarIcon className="me-2 h-4 w-4" />
          {formatDate(date)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(picked) => picked && onChange(picked)}
          {...calendarLocale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

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
              <DateButton
                date={dateRange.startDate}
                onChange={(startDate) => onDateRangeChange({ ...dateRange, startDate })}
                className="w-[140px] justify-start"
              />
              <span className="text-muted-foreground">{t('filters.to')}</span>
              <DateButton
                date={dateRange.endDate}
                onChange={(endDate) => onDateRangeChange({ ...dateRange, endDate })}
                className="w-[140px] justify-start"
              />
            </div>
          )}
        </>
      )}

      {showAsOfDate && asOfDate && onAsOfDateChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('filters.asOf')}</span>
          <DateButton
            date={asOfDate}
            onChange={onAsOfDateChange}
            className="w-[160px] justify-start"
          />
        </div>
      )}

      {onExport && (
        <Button variant="outline" onClick={onExport} disabled={isExporting}>
          <Download className="me-2 h-4 w-4" />
          {isExporting ? t('actions.exporting') : t('actions.export')}
        </Button>
      )}
    </div>
  );
}
