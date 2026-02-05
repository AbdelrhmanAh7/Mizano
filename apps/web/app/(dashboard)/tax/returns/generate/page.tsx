'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  subMonths,
  subQuarters,
} from 'date-fns';
import { ArrowLeft, CalendarIcon, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useGenerateVATReturn } from '@/lib/hooks/use-tax';

type PeriodType = 'monthly' | 'quarterly' | 'custom';

const today = new Date();

const presetPeriods = {
  monthly: [
    {
      label: format(subMonths(today, 1), 'MMMM yyyy'),
      start: startOfMonth(subMonths(today, 1)),
      end: endOfMonth(subMonths(today, 1)),
    },
    {
      label: format(subMonths(today, 2), 'MMMM yyyy'),
      start: startOfMonth(subMonths(today, 2)),
      end: endOfMonth(subMonths(today, 2)),
    },
    {
      label: format(subMonths(today, 3), 'MMMM yyyy'),
      start: startOfMonth(subMonths(today, 3)),
      end: endOfMonth(subMonths(today, 3)),
    },
  ],
  quarterly: [
    {
      label: `Q${Math.ceil((subQuarters(today, 1).getMonth() + 1) / 3)} ${subQuarters(today, 1).getFullYear()}`,
      start: startOfQuarter(subQuarters(today, 1)),
      end: endOfQuarter(subQuarters(today, 1)),
    },
    {
      label: `Q${Math.ceil((subQuarters(today, 2).getMonth() + 1) / 3)} ${subQuarters(today, 2).getFullYear()}`,
      start: startOfQuarter(subQuarters(today, 2)),
      end: endOfQuarter(subQuarters(today, 2)),
    },
  ],
};

export default function GenerateVATReturnPage() {
  const router = useRouter();
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const generateVATReturn = useGenerateVATReturn();

  const handlePresetSelect = (index: number) => {
    setSelectedPreset(index);
    const preset = periodType === 'monthly'
      ? presetPeriods.monthly[index]
      : presetPeriods.quarterly[index];
    setStartDate(preset.start);
    setEndDate(preset.end);
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) return;

    try {
      const result = await generateVATReturn.mutateAsync({
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      });
      router.push(`/tax/returns/${result.id}`);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const presets = periodType === 'monthly'
    ? presetPeriods.monthly
    : presetPeriods.quarterly;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/tax/returns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate VAT Return</h1>
          <p className="text-muted-foreground">
            Select a period to generate your VAT return
          </p>
        </div>
      </div>

      {/* Period Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Period</CardTitle>
          <CardDescription>
            Choose the reporting period for this VAT return
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Period Type */}
          <div className="space-y-2">
            <Label>Period Type</Label>
            <Select
              value={periodType}
              onValueChange={(value: PeriodType) => {
                setPeriodType(value);
                setSelectedPreset(null);
                if (value !== 'custom') {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preset Periods */}
          {periodType !== 'custom' && (
            <div className="space-y-2">
              <Label>Select Period</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {presets.map((preset, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant={selectedPreset === index ? 'default' : 'outline'}
                    className="h-auto py-4 flex flex-col"
                    onClick={() => handlePresetSelect(index)}
                  >
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-xs opacity-70 mt-1">
                      {format(preset.start, 'MMM d')} - {format(preset.end, 'MMM d, yyyy')}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Date Range */}
          {periodType === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !startDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !endDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => startDate ? date < startDate : false}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Selected Period Summary */}
          {startDate && endDate && (
            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    VAT Return for {format(startDate, 'MMMM d')} - {format(endDate, 'MMMM d, yyyy')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This will calculate VAT from all invoices, bills, and expenses in this period.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="rounded-lg bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">What will be included:</p>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  <li>Output VAT from sent and paid invoices</li>
                  <li>Input VAT from received bills and expenses</li>
                  <li>Adjustments from credit notes</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={!startDate || !endDate || generateVATReturn.isPending}
        >
          {generateVATReturn.isPending ? 'Generating...' : 'Generate VAT Return'}
        </Button>
      </div>
    </div>
  );
}
