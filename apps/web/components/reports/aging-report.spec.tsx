import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AgingReport } from '@/lib/hooks/use-reports';
import { AgingReportPage } from './aging-report';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
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
  getAgingBucketLabel: (range: string) => `bucket ${range}`,
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

describe('AgingReportPage (one page for AR and AP aging)', () => {
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

    mockAp = {
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
    };
    render(<AgingReportPage side="payable" />);
    fireEvent.click(screen.getByText('bucket 1-30'));
    expect(screen.getByText('bucket 1-30 Bills')).toBeTruthy();
    expect(screen.getByText('Vendor')).toBeTruthy();
    expect(screen.getByText('BILL-001').closest('a')?.getAttribute('href')).toBe(
      '/purchases/bills/b1',
    );
  });
});
