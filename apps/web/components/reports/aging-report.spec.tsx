import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AgingReport } from '@/lib/hooks/use-reports';
import enReports from '@/messages/en/reports.json';
import arReports from '@/messages/ar/reports.json';
import { AgingReportPage } from './aging-report';

let mockLocale: 'en' | 'ar' = 'en';

// Real en/ar messages, so the assertions read what a user sees.
jest.mock('next-intl', () => {
  const messages = {
    en: jest.requireActual('@/messages/en/reports.json'),
    ar: jest.requireActual('@/messages/ar/reports.json'),
  };
  return {
    useLocale: () => mockLocale,
    useTranslations:
      (namespace: string) => (key: string, values?: Record<string, string | number>) => {
        const path = `${key}`.split('.');
        const message = path.reduce<unknown>(
          (node, part) =>
            node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
          namespace === 'reports' ? messages[mockLocale] : undefined,
        );
        return String(message ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
          String(values?.[name] ?? ''),
        );
      },
  };
});
jest.mock('@/components/reports/report-filters', () => ({ ReportFilters: () => null }));
jest.mock('@/lib/hooks/use-money-formatter', () => ({
  useMoneyFormatter: () => (value: number) => `EGP ${value}`,
}));

const mockQuery = (data: AgingReport) => ({
  data,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
});
let mockAr: AgingReport;
let mockAp: AgingReport;
jest.mock('@/lib/hooks/use-reports', () => ({
  useARAgingReport: () => mockQuery(mockAr),
  useAPAgingReport: () => mockQuery(mockAp),
  getAgingBucketColor: () => '',
}));

const empty: AgingReport = {
  buckets: [],
  total: 0,
  grossTotal: 0,
  unappliedCredits: 0,
  totalCount: 0,
  asOfDate: '2026-10-31',
};

function keysOf(o: unknown, prefix = ''): string[] {
  if (!o || typeof o !== 'object') return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    keysOf(v, prefix ? `${prefix}.${k}` : k),
  );
}

const payableWithOneBill = (): AgingReport => ({
  ...empty,
  total: 150,
  totalCount: 1,
  buckets: [
    {
      range: '1-30',
      amount: 150,
      count: 1,
      items: [
        {
          id: 'b1',
          number: 'BILL-001',
          date: '2026-09-01',
          dueDate: '2026-10-01',
          counterpartyName: 'Delta Supplies',
          amount: 200,
          balanceDue: 150,
          daysOverdue: 30,
        },
      ],
    },
  ],
});

describe('AgingReportPage (one page for AR and AP aging)', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('receivables: an empty report hides the summary behind one message', () => {
    mockAr = empty;
    render(<AgingReportPage side="receivable" />);
    expect(screen.getByText('No accounts receivable aging data available.')).toBeTruthy();
    expect(screen.queryByText('Aging Summary')).toBeNull();
  });

  it('payables: keeps the summary when empty and lists a bucket’s bills with vendor links', () => {
    mockAp = empty;
    const { unmount } = render(<AgingReportPage side="payable" />);
    expect(screen.getByText('Total Payable')).toBeTruthy();
    expect(screen.getByText('No outstanding payables found.')).toBeTruthy();
    unmount();

    mockAp = payableWithOneBill();
    render(<AgingReportPage side="payable" />);
    fireEvent.click(screen.getByText('1-30 Days'));
    expect(screen.getByText('1-30 Days Bills')).toBeTruthy();
    expect(screen.getByText('Vendor')).toBeTruthy();
    expect(screen.getByText('Days Overdue')).toBeTruthy();
    expect(screen.getByText('BILL-001').closest('a')?.getAttribute('href')).toBe(
      '/purchases/bills/b1',
    );
  });

  it('shows no English on the Arabic page and keeps en/ar keys in parity', () => {
    mockLocale = 'ar';
    mockAp = payableWithOneBill();
    const { container } = render(<AgingReportPage side="payable" />);
    fireEvent.click(screen.getByText('1-30 يوم'));
    expect(screen.getByText('فواتير الموردين 1-30 يوم')).toBeTruthy();
    expect(screen.getByText('أيام التأخير')).toBeTruthy();
    const english = Array.from(container.querySelectorAll('h1, h2, h3, th, p, span, div, button'))
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent?.trim() ?? '')
      .filter((text) => /[A-Za-z]{3,}/.test(text) && !/^(BILL-001|Delta Supplies|EGP)/.test(text));
    expect(english).toEqual([]);

    for (const ns of ['arAging', 'apAging', 'aging'] as const) {
      expect(keysOf(arReports[ns]).sort()).toEqual(keysOf(enReports[ns]).sort());
    }
  });
});
