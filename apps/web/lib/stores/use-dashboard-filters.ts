'use client';

import { create } from 'zustand';

export type DatePreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'lastQuarter'
  | 'thisYear'
  | 'last12Months'
  | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}

interface DashboardFiltersState {
  dateRange: DateRange;
  preset: DatePreset;
  setDateRange: (range: DateRange) => void;
  setPreset: (preset: DatePreset) => void;
}

export function getPresetDates(preset: DatePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case 'thisMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: now,
      };
    case 'lastMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0),
      };
    case 'lastQuarter':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 3, 1),
        to: now,
      };
    case 'thisYear':
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: now,
      };
    case 'last12Months':
    default:
      return {
        from: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
        to: now,
      };
  }
}

export const useDashboardFilters = create<DashboardFiltersState>((set) => ({
  dateRange: getPresetDates('last12Months'),
  preset: 'last12Months',
  setDateRange: (range: DateRange) => set({ dateRange: range, preset: 'custom' }),
  setPreset: (preset: DatePreset) => set({ dateRange: getPresetDates(preset), preset }),
}));
