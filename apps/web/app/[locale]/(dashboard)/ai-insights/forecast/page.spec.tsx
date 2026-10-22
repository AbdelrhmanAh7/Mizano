/**
 * Regression test for CashFlowForecastPage.
 *
 * Verifies that dates are formatted safely and do not throw "Invalid time value".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock('next/link', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

jest.mock('@/i18n/routing', () => {
  const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return { Link };
});

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

const mockUseCashFlowForecast = jest.fn();

jest.mock('@/lib/hooks/use-ai', () => ({
  useCashFlowForecast: (...args: unknown[]) => mockUseCashFlowForecast(...args),
  formatCurrency: (val: number) => `$${val.toLocaleString()}`,
}));

import CashFlowForecastPage from './page';

describe('CashFlowForecastPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders forecast chart data without throwing', () => {
    mockUseCashFlowForecast.mockReturnValue({
      data: {
        data: [
          {
            date: '2026-10-22',
            predictedInflow: 10000,
            predictedOutflow: 5000,
            predictedBalance: 50000,
            lowerBound: 45000,
            upperBound: 55000,
          },
        ],
      },
      isLoading: false,
    });

    expect(() => {
      render(<CashFlowForecastPage />);
    }).not.toThrow();

    expect(screen.getByText('title')).toBeInTheDocument();
  });

  it('handles invalid or empty date strings gracefully', () => {
    mockUseCashFlowForecast.mockReturnValue({
      data: {
        data: [
          {
            date: '',
            predictedInflow: 10000,
            predictedOutflow: 5000,
            predictedBalance: 50000,
            lowerBound: 45000,
            upperBound: 55000,
          },
        ],
      },
      isLoading: false,
    });

    expect(() => {
      render(<CashFlowForecastPage />);
    }).not.toThrow();
  });
});
