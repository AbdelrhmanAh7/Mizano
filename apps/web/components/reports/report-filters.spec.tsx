import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { endOfMonth, startOfMonth, startOfYear } from 'date-fns';
import enReports from '@/messages/en/reports.json';
import arReports from '@/messages/ar/reports.json';
import { ReportFilters } from './report-filters';

let mockLocale: 'en' | 'ar' = 'ar';

// Real en/ar messages; ReportFilters itself and the Calendar are not mocked.
jest.mock('next-intl', () => {
  const messages = {
    en: jest.requireActual('@/messages/en/reports.json'),
    ar: jest.requireActual('@/messages/ar/reports.json'),
  };
  return {
    useLocale: () => mockLocale,
    useTranslations: (namespace: string) => (key: string) => {
      const message = key
        .split('.')
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
          namespace === 'reports' ? messages[mockLocale] : undefined,
        );
      return String(message ?? key);
    },
  };
});

const AS_OF = new Date(2026, 9, 31);

describe('ReportFilters', () => {
  it('renders its labels, dates and calendar in Arabic, right-to-left', () => {
    mockLocale = 'ar';
    const { container } = render(
      <ReportFilters
        showDateRange={false}
        showAsOfDate
        asOfDate={AS_OF}
        onAsOfDateChange={jest.fn()}
        onExport={jest.fn()}
      />,
    );
    expect(screen.getByText('حتى تاريخ:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تصدير' })).toBeInTheDocument();

    // Arabic month name, Western digits.
    fireEvent.click(screen.getByRole('button', { name: '31 أكتوبر 2026' }));
    expect(screen.getByText('أكتوبر 2026')).toBeInTheDocument();
    expect(document.querySelector('[dir="rtl"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/As of|Export|Oct/);
  });

  it('keeps English pages in English and en/ar filter keys in parity', () => {
    mockLocale = 'en';
    render(
      <ReportFilters
        showDateRange={false}
        showAsOfDate
        asOfDate={AS_OF}
        onAsOfDateChange={jest.fn()}
        onExport={jest.fn()}
        isExporting
      />,
    );
    expect(screen.getByText('As of:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oct 31, 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled();

    expect(Object.keys(arReports.filters).sort()).toEqual(Object.keys(enReports.filters).sort());
    expect(Object.keys(arReports.actions).sort()).toEqual(Object.keys(enReports.actions).sort());
  });
  // Manual QA: the profit & loss page starts year-to-date, but the selector always said "This
  // Month" because the filter kept its own preset state. It now shows the page's real preset.
  describe('period preset follows the page range', () => {
    beforeEach(() => {
      mockLocale = 'en';
    });

    it('shows "This Month" for the current month', () => {
      const today = new Date();
      render(
        <ReportFilters
          dateRange={{ startDate: startOfMonth(today), endDate: endOfMonth(today) }}
          onDateRangeChange={jest.fn()}
        />,
      );
      expect(screen.getByRole('combobox')).toHaveTextContent('This Month');
    });

    it('shows "This Year" for a year-to-date range', () => {
      const today = new Date();
      render(
        <ReportFilters
          dateRange={{ startDate: startOfYear(today), endDate: today }}
          onDateRangeChange={jest.fn()}
        />,
      );
      expect(screen.getByRole('combobox')).toHaveTextContent('This Year');
    });

    it('shows "Custom" with the dates for a range that matches no preset', () => {
      render(
        <ReportFilters
          dateRange={{ startDate: new Date(2025, 0, 1), endDate: new Date(2025, 5, 15) }}
          onDateRangeChange={jest.fn()}
        />,
      );
      expect(screen.getByRole('combobox')).toHaveTextContent('Custom');
      expect(screen.getByText('to')).toBeInTheDocument();
    });
  });
});
